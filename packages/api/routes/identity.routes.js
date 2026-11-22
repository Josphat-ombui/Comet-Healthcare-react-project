// Identity administration: users, roles, permissions, and group membership.

import crypto from 'node:crypto'
import { Router } from 'express'
import { DEFAULT_COMPANY_ID } from '../../shared/src/constants.js'
import { db } from '../lib/tenant.js'
import { requireAuth, hashPassword, toPublicUser, createResetToken } from '../lib/auth.js'
import { requirePermission } from '../lib/authorize.js'
import { createUserSchema, updateUserSchema, assignRoleSchema } from '../lib/validation.js'
import { recordRequestAudit } from '../lib/audit.js'
import { emitEvent } from '../lib/events.js'
import { sendMail } from '../lib/mailer.js'
import { config } from '../lib/config.js'

export const identityRouter = Router()

identityRouter.use(requireAuth)

function company(req) {
  return req.auth.companyId || DEFAULT_COMPANY_ID
}

async function rolesFor(userId, companyId) {
  const assignments = await db.userRole.findMany({
    where: { companyId, userId },
    select: { role: { select: { code: true, name: true } } },
  })
  return assignments.map((a) => a.role)
}

function isOrgWide(req) {
  const roles = req.auth.roles || []
  return roles.includes('ADMIN') || roles.includes('COMPLIANCE')
}

function visibleUserWhere(req) {
  const where = { companyId: company(req) }
  if (!isOrgWide(req) && req.auth.branchIds?.length) {
    where.branchId = { in: req.auth.branchIds }
  }
  return where
}

function canSeeUser(req, user) {
  return isOrgWide(req) || !user.branchId || (req.auth.branchIds || []).includes(user.branchId)
}

identityRouter.get('/users', requirePermission('identity.user.read'), async (req, res) => {
  const users = await db.user.findMany({
    where: visibleUserWhere(req),
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    take: 500,
    select: {
      id: true, companyId: true, email: true, firstName: true, lastName: true, phone: true,
      role: true, status: true, branchId: true, departmentId: true, mfaEnabled: true,
      lastLoginAt: true, createdAt: true,
    },
  })
  return res.json({ users })
})

identityRouter.get('/users/:id', requirePermission('identity.user.read'), async (req, res) => {
  const user = await db.user.findFirst({ where: { id: req.params.id, companyId: company(req) } })
  if (!user) return res.status(404).json({ error: 'User not found' })
  if (!canSeeUser(req, user)) return res.status(403).json({ error: 'You cannot access users from another branch' })
  const roles = await rolesFor(user.id, user.companyId)
  return res.json({ user: { ...toPublicUser(user), status: user.status, branchId: user.branchId, departmentId: user.departmentId, mfaEnabled: user.mfaEnabled }, roles })
})

identityRouter.post('/users', requirePermission('identity.user.write'), async (req, res) => {
  const body = createUserSchema.parse(req.body)
  const companyId = company(req)
  const email = body.email.toLowerCase()
  const existing = await db.user.findFirst({ where: { companyId, email } })
  if (existing) return res.status(409).json({ error: 'A user with this email already exists' })

  // Invited users receive a reset link over external email; internal staff
  // communication remains in the platform (Phase 4).
  const placeholderHash = await hashPassword(crypto.randomUUID())
  const user = await db.user.create({
    data: {
      companyId,
      email,
      passwordHash: placeholderHash,
      firstName: body.firstName,
      lastName: body.lastName,
      phone: body.phone || null,
      role: body.role,
      branchId: body.branchId || null,
      departmentId: body.departmentId || null,
      locale: body.locale,
      status: 'INVITED',
    },
  })
  const { raw, hash, expiresAt } = createResetToken()
  await db.user.update({ where: { id: user.id }, data: { resetTokenHash: hash, resetTokenExp: expiresAt } })
  await emitEvent('UserCreated', { userId: user.id, email: user.email, branchId: user.branchId || null })
  await recordRequestAudit(req, {
    companyId,
    action: 'USER_INVITED',
    resourceType: 'User',
    resourceId: user.id,
    metadata: { role: user.role, branchId: user.branchId },
  })
  await sendMail({
    to: email,
    subject: 'You are invited to Comet Healthcare',
    text: `Hi ${user.firstName},\n\nAn account has been created for you. Set your password here (valid for ${Math.round(config.resetTokenTtlSeconds / 3600)} hours):\n\n${config.appUrl}/reset-password?token=${raw}\n`,
  })
  return res.status(201).json({ user: toPublicUser(user), status: 'INVITED' })
})

identityRouter.patch('/users/:id', requirePermission('identity.user.write'), async (req, res) => {
  const body = updateUserSchema.parse(req.body)
  const companyId = company(req)
  const existing = await db.user.findFirst({ where: { id: req.params.id, companyId } })
  if (!existing) return res.status(404).json({ error: 'User not found' })
  if (body.email && body.email.toLowerCase() !== existing.email) {
    const clash = await db.user.findFirst({ where: { companyId, email: body.email.toLowerCase() } })
    if (clash) return res.status(409).json({ error: 'A user with this email already exists' })
  }
  const user = await db.user.update({
    where: { id: existing.id },
    data: {
      ...(body.email ? { email: body.email.toLowerCase() } : {}),
      ...(body.firstName ? { firstName: body.firstName } : {}),
      ...(body.lastName ? { lastName: body.lastName } : {}),
      ...(body.phone !== undefined ? { phone: body.phone || null } : {}),
      ...(body.role ? { role: body.role } : {}),
      ...(body.status ? { status: body.status } : {}),
      ...(body.branchId !== undefined ? { branchId: body.branchId || null } : {}),
      ...(body.departmentId !== undefined ? { departmentId: body.departmentId || null } : {}),
    },
  })
  if (body.status === 'DISABLED') {
    await db.session.updateMany({ where: { companyId, userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } })
    await emitEvent('UserDisabled', { userId: user.id, reason: 'administrative' })
  }
  await recordRequestAudit(req, {
    companyId,
    action: 'USER_UPDATED',
    resourceType: 'User',
    resourceId: user.id,
    metadata: body,
  })
  return res.json({ user: { ...toPublicUser(user), status: user.status, branchId: user.branchId } })
})

identityRouter.post('/users/:id/disable', requirePermission('identity.user.disable'), async (req, res) => {
  const companyId = company(req)
  const user = await db.user.findFirst({ where: { id: req.params.id, companyId } })
  if (!user) return res.status(404).json({ error: 'User not found' })
  await db.user.update({ where: { id: user.id }, data: { status: 'DISABLED' } })
  await db.session.updateMany({ where: { companyId, userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } })
  await emitEvent('UserDisabled', { userId: user.id, reason: 'administrative' })
  await recordRequestAudit(req, {
    companyId,
    action: 'USER_DISABLED',
    resourceType: 'User',
    resourceId: user.id,
  })
  return res.json({ message: 'User disabled and sessions revoked.' })
})

identityRouter.post('/users/:id/roles', requirePermission('identity.role.write'), async (req, res) => {
  const body = assignRoleSchema.parse(req.body)
  const companyId = company(req)
  const user = await db.user.findFirst({ where: { id: req.params.id, companyId } })
  const role = await db.accessRole.findFirst({ where: { companyId, code: body.roleCode } })
  if (!user || !role) return res.status(404).json({ error: 'User or role not found' })
  let assignment = await db.userRole.findFirst({
    where: {
      companyId,
      userId: user.id,
      roleId: role.id,
      scopeBranchId: body.scopeBranchId || null,
      scopeDepartmentId: null,
    },
  })
  if (!assignment) {
    assignment = await db.userRole.create({
      data: {
        companyId,
        userId: user.id,
        roleId: role.id,
        scopeBranchId: body.scopeBranchId || null,
        grantedBy: req.auth.userId,
      },
    })
  }
  await emitEvent('RoleAssigned', { userId: user.id, roleId: role.id, roleCode: role.code })
  await recordRequestAudit(req, {
    companyId,
    action: 'ROLE_ASSIGNED',
    resourceType: 'User',
    resourceId: user.id,
    metadata: { roleCode: role.code },
  })
  return res.status(201).json({ assignment: { id: assignment.id, roleCode: role.code } })
})

identityRouter.get('/roles', requirePermission('identity.role.read'), async (req, res) => {
  const roles = await db.accessRole.findMany({
    where: { companyId: company(req) },
    orderBy: { code: 'asc' },
    include: { permissions: { include: { permission: true } } },
  })
  return res.json({
    roles: roles.map((role) => ({
      id: role.id,
      code: role.code,
      name: role.name,
      isSystem: role.isSystem,
      permissions: role.permissions.map((p) => p.permission.code),
    })),
  })
})

identityRouter.get('/permissions', requirePermission('identity.role.read'), async (req, res) => {
  const permissions = await db.permission.findMany({
    where: { companyId: company(req) },
    orderBy: { code: 'asc' },
    select: { id: true, code: true, description: true },
  })
  return res.json({ permissions })
})
