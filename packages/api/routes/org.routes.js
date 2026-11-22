// Organisation directory: branches and departments.

import { Router } from 'express'
import { DEFAULT_COMPANY_ID } from '../../shared/src/constants.js'
import { db } from '../lib/tenant.js'
import { requireAuth } from '../lib/auth.js'
import { requirePermission } from '../lib/authorize.js'
import { createBranchSchema, createDepartmentSchema } from '../lib/validation.js'
import { recordRequestAudit } from '../lib/audit.js'
import { emitEvent } from '../lib/events.js'

export const orgRouter = Router()

orgRouter.use(requireAuth)

function company(req) {
  return req.auth.companyId || DEFAULT_COMPANY_ID
}

orgRouter.get('/branches', requirePermission('org.branch.read'), async (req, res) => {
  const branches = await db.branch.findMany({
    where: { companyId: company(req) },
    orderBy: { name: 'asc' },
    select: { id: true, code: true, name: true, type: true, city: true, address: true, isActive: true },
  })
  return res.json({ branches })
})

orgRouter.post('/branches', requirePermission('org.branch.write'), async (req, res) => {
  const body = createBranchSchema.parse(req.body)
  const companyId = company(req)
  const existing = await db.branch.findFirst({ where: { companyId, code: body.code } })
  if (existing) return res.status(409).json({ error: 'A branch with this code already exists' })
  const branch = await db.branch.create({
    data: {
      companyId,
      code: body.code,
      name: body.name,
      type: body.type,
      city: body.city || null,
      address: body.address || null,
    },
  })
  await emitEvent('BranchCreated', { branchId: branch.id, code: branch.code, name: branch.name }, { branchId: branch.id })
  await recordRequestAudit(req, {
    companyId,
    action: 'BRANCH_CREATED',
    resourceType: 'Branch',
    resourceId: branch.id,
    metadata: { code: branch.code, name: branch.name },
  })
  return res.status(201).json({ branch })
})

orgRouter.get('/departments', requirePermission('org.department.read'), async (req, res) => {
  const departments = await db.department.findMany({
    where: { companyId: company(req) },
    orderBy: { name: 'asc' },
    select: { id: true, code: true, name: true, internalAddress: true },
  })
  return res.json({ departments })
})

orgRouter.post('/departments', requirePermission('org.department.write'), async (req, res) => {
  const body = createDepartmentSchema.parse(req.body)
  const companyId = company(req)
  const existing = await db.department.findFirst({ where: { companyId, code: body.code } })
  if (existing) return res.status(409).json({ error: 'A department with this code already exists' })
  const department = await db.department.create({
    data: {
      companyId,
      code: body.code,
      name: body.name,
      internalAddress: body.internalAddress || `${body.code}@internal`,
    },
  })
  await emitEvent('DepartmentCreated', {
    departmentId: department.id,
    code: department.code,
    name: department.name,
  })
  await recordRequestAudit(req, {
    companyId,
    action: 'DEPARTMENT_CREATED',
    resourceType: 'Department',
    resourceId: department.id,
    metadata: { code: department.code, name: department.name },
  })
  return res.status(201).json({ department })
})
