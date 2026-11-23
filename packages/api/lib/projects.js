// Phase 12 projects lifecycle service.
//
// Projects, membership, tasks, milestones, time and budget links are
// tenant/branch scoped and use the Prisma proxy `db` from lib/tenant.js. Money
// stays in integer cents; hours are numeric and rounded once, half-up, to two
// decimals at this boundary. Finance owns budget usage arithmetic and invoice
// tax arithmetic — this module keeps opaque references and calls finance
// helpers instead of recomputing or fabricating values.
//
// Audit metadata and domain events contain opaque IDs and classification only.

import { db, getTenantContext } from './tenant.js'
import { emitEvent } from './events.js'
import { recordAudit, recordRequestAudit } from './audit.js'
import { HttpError } from './util.js'
import {
  getBudgetUsage, resolveVerifiedRate, createInvoice, issueInvoice,
} from './finance.js'

const MAX_LIST = 200
const HOUR_SCALE = 100n

// ------------------------------------------------------------- small helpers

function tenantId() {
  const ctx = getTenantContext() || {}
  return ctx.companyId || 'cmp_comet'
}

function limitOf(value, fallback = 50) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.min(Math.floor(parsed), MAX_LIST)
}

function isoInstant(value, label = 'Timestamp') {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) throw new HttpError(400, `Invalid ${label}`)
  return date.toISOString()
}

function dayInstant(value, label = 'Date') {
  return new Date(`${isoDay(value, label)}T00:00:00.000Z`)
}

export function isoDay(value, label = 'Date') {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new HttpError(400, `Invalid ${label}`)
  }
  const date = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new HttpError(400, `Invalid ${label}`)
  }
  return value
}

function principalOf(actor) {
  const ctx = getTenantContext() || {}
  return {
    userId: actor?.userId ?? ctx.actorId ?? null,
    companyId: actor?.companyId || ctx.companyId || 'cmp_comet',
    branchId: actor?.branchId ?? ctx.branchId ?? null,
    correlationId: actor?.correlationId || ctx.correlationId || null,
  }
}

async function auditMutation(actor, action, resourceType, resourceId, metadata = {}) {
  const principal = principalOf(actor)
  const input = {
    actorId: principal.userId,
    action,
    resourceType,
    resourceId: String(resourceId),
    metadata,
    correlationId: principal.correlationId,
  }
  if (actor?.req) return recordRequestAudit(actor.req, input)
  return recordAudit(input)
}

async function projectEvent(type, data, options = {}) {
  return emitEvent(type, data, { aggregateType: 'Project', ...options })
}

function assertSafeIntegerCents(value, label = 'Amount') {
  const cents = Number(value)
  if (!Number.isSafeInteger(cents) || cents < 0) {
    throw new HttpError(400, `${label} must be a non-negative integer number of cents`)
  }
  return cents
}

/** Tenant + optional branch scope. Branch scope allows organisation-wide rows. */
export function projectTenantWhere(companyId, branchId) {
  const scope = { companyId: companyId || tenantId() }
  if (branchId) return { ...scope, OR: [{ branchId: null }, { branchId }] }
  return scope
}

// ------------------------------------------------------------- hours/amounts

/** Parse a decimal hour value into exact hundredths, rounding half-up once. */
function hoursToHundredths(value, label = 'Hours') {
  const text = typeof value === 'number' ? String(value) : String(value ?? '').trim()
  if (!/^\d+(?:\.\d+)?$/.test(text)) throw new HttpError(400, `${label} must be a positive number`)
  const [whole, fraction = ''] = text.split('.')
  const digits = `${fraction}000`
  const hundredths = BigInt(whole) * HOUR_SCALE
    + BigInt(digits.slice(0, 2))
    + (digits[2] >= '5' ? 1n : 0n)
  if (hundredths <= 0n) throw new HttpError(400, `${label} must be greater than zero`)
  return hundredths
}

/** Round once to two decimals. Callers must store this exact value. */
export function roundHours(value) {
  const hundredths = hoursToHundredths(value)
  const rounded = Number(hundredths) / 100
  if (!Number.isFinite(rounded)) throw new HttpError(400, 'Hours value is too large')
  return rounded
}

/**
 * Pure integer-cent time amount. `hourlyRateCents` is a rate in cents per hour;
 * the rounded two-decimal hours are the only multiplier, and rounding happens
 * once at the cent boundary.
 */
export function calculateTimeAmountCents({ hours, hourlyRateCents, billable = true }) {
  if (!billable) return 0
  const rate = assertSafeIntegerCents(hourlyRateCents, 'Hourly rate')
  const hundredths = hoursToHundredths(hours)
  const cents = Number((hundredths * BigInt(rate) + 50n) / 100n)
  if (!Number.isSafeInteger(cents)) throw new HttpError(400, 'Time amount exceeds safe integer cents')
  return cents
}

// ------------------------------------------------------------------- DTOs

function isoOrNullDto(value) {
  return value ? isoInstant(value) : null
}

export function toProjectDto(row) {
  if (!row) return null
  return {
    id: row.id,
    number: row.number,
    name: row.name,
    description: row.description ?? null,
    status: row.status,
    customerId: row.customerId ?? null,
    salesOrderId: row.salesOrderId ?? null,
    financeInvoiceId: row.financeInvoiceId ?? null,
    budgetCents: row.budgetCents,
    currency: row.currency,
    plannedStart: isoOrNullDto(row.plannedStart),
    plannedEnd: isoOrNullDto(row.plannedEnd),
    startedAt: isoOrNullDto(row.startedAt),
    completedAt: isoOrNullDto(row.completedAt),
    cancelledAt: isoOrNullDto(row.cancelledAt),
    classification: row.classification,
    createdAt: isoOrNullDto(row.createdAt),
    updatedAt: isoOrNullDto(row.updatedAt),
  }
}

export function toMemberDto(row) {
  if (!row) return null
  return {
    id: row.id,
    projectId: row.projectId,
    userId: row.userId,
    role: row.role,
    joinedAt: isoOrNullDto(row.joinedAt),
    leftAt: isoOrNullDto(row.leftAt),
    classification: row.classification,
  }
}

export function toMilestoneDto(row) {
  if (!row) return null
  return {
    id: row.id,
    projectId: row.projectId,
    number: row.number,
    name: row.name,
    description: row.description ?? null,
    status: row.status,
    dueAt: isoOrNullDto(row.dueAt),
    metAt: isoOrNullDto(row.metAt),
    missedAt: isoOrNullDto(row.missedAt),
    classification: row.classification,
  }
}

export function toTaskDto(row) {
  if (!row) return null
  return {
    id: row.id,
    projectId: row.projectId,
    number: row.number,
    title: row.title,
    description: row.description ?? null,
    status: row.status,
    assigneeId: row.assigneeId ?? null,
    milestoneId: row.milestoneId ?? null,
    dueAt: isoOrNullDto(row.dueAt),
    startedAt: isoOrNullDto(row.startedAt),
    completedAt: isoOrNullDto(row.completedAt),
    cancelledAt: isoOrNullDto(row.cancelledAt),
    position: row.position,
    classification: row.classification,
  }
}

export function toTimeEntryDto(row) {
  if (!row) return null
  return {
    id: row.id,
    projectId: row.projectId,
    taskId: row.taskId ?? null,
    memberId: row.memberId ?? null,
    userId: row.userId,
    number: row.number,
    workDate: row.workDate,
    hours: row.hours,
    billable: row.billable,
    hourlyRateCents: row.hourlyRateCents,
    amountCents: row.amountCents,
    status: row.status,
    approvedById: row.approvedById ?? null,
    approvedAt: isoOrNullDto(row.approvedAt),
    rejectedAt: isoOrNullDto(row.rejectedAt),
    billedAt: isoOrNullDto(row.billedAt),
    financeInvoiceId: row.financeInvoiceId ?? null,
    classification: row.classification,
  }
}

export function toBudgetLinkDto(row) {
  if (!row) return null
  return {
    id: row.id,
    projectId: row.projectId,
    budgetId: row.budgetId,
    classification: row.classification,
  }
}

/**
 * Normalise finance budget usage without inventing values. `usage` is copied
 * from `getBudgetUsage`; when finance cannot supply it the metadata is explicit
 * and no totals or line items are substituted.
 */
export function toBudgetUsageDto({ budgetId, usage, unavailable = null }) {
  return {
    budgetId,
    usage: usage ? {
      lines: Array.isArray(usage.lines) ? usage.lines : [],
      totals: usage.totals || null,
    } : null,
    unavailable: usage ? null : (unavailable || {
      code: 'FINANCE_UNAVAILABLE',
      reason: 'Budget usage is unavailable',
    }),
  }
}

// ------------------------------------------------------------ data helpers

function isNumberConflict(error) {
  if (error?.code !== 'P2002') return false
  const target = error?.meta?.target
  if (!target) return true
  return (Array.isArray(target) ? target : [target]).some((part) => String(part).includes('number'))
}

async function nextNumber(model, prefix, companyId) {
  const year = new Date().getUTCFullYear()
  const pattern = `${prefix}-${year}-`
  const count = await db[model].count({ where: { companyId, number: { startsWith: pattern } } })
  for (let offset = 0; offset < 1000; offset += 1) {
    const candidate = `${pattern}${String(count + 1 + offset).padStart(4, '0')}`
    // eslint-disable-next-line no-await-in-loop
    const existing = await db[model].findFirst({ where: { companyId, number: candidate }, select: { id: true } })
    if (!existing) return candidate
  }
  throw new HttpError(409, 'Unable to allocate a document number')
}

async function createWithNumber(model, prefix, buildData, companyId, attempts = 5, requestedNumber = null) {
  if (requestedNumber) {
    const existing = await db[model].findFirst({
      where: { companyId, number: requestedNumber },
      select: { id: true },
    })
    if (existing) throw new HttpError(409, 'Number is already in use')
    try {
      return await db[model].create({ data: buildData(requestedNumber) })
    } catch (error) {
      if (isNumberConflict(error)) throw new HttpError(409, 'Number is already in use')
      throw error
    }
  }
  let lastError
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop
    const number = await nextNumber(model, prefix, companyId)
    try {
      // eslint-disable-next-line no-await-in-loop
      return await db[model].create({ data: buildData(number) })
    } catch (error) {
      if (!isNumberConflict(error)) throw error
      lastError = error
    }
  }
  throw lastError || new HttpError(409, 'Unable to allocate a document number')
}

async function findRecord(model, id, label, actor = null) {
  const principal = principalOf(actor)
  const row = await db[model].findFirst({
    where: { ...projectTenantWhere(principal.companyId, principal.branchId), id },
  })
  if (!row) throw new HttpError(404, `${label} not found`)
  return row
}

function listWhere(principal, query = {}, extra = {}) {
  return {
    ...projectTenantWhere(principal.companyId, principal.branchId),
    ...(query.status ? { status: query.status } : {}),
    ...extra,
  }
}

async function resolveBranch(companyId, branchId) {
  if (!branchId) return null
  const branch = await db.branch.findFirst({ where: { id: branchId, companyId }, select: { id: true } })
  if (!branch) throw new HttpError(404, 'Branch not found')
  return branch.id
}

async function resolveCustomer(companyId, customerId) {
  if (!customerId) return null
  const party = await db.financeParty.findFirst({
    where: { id: customerId, companyId, type: 'CUSTOMER' },
    select: { id: true },
  })
  if (!party) throw new HttpError(404, 'Customer not found')
  return party.id
}

async function resolveSalesOrder(companyId, salesOrderId) {
  if (!salesOrderId) return null
  const order = await db.salesOrder.findFirst({ where: { id: salesOrderId, companyId }, select: { id: true } })
  if (!order) throw new HttpError(404, 'Sales order not found')
  return order.id
}

async function resolveUser(companyId, userId) {
  const user = await db.user.findFirst({ where: { id: userId, companyId }, select: { id: true } })
  if (!user) throw new HttpError(404, 'User not found')
  return user.id
}

async function resolveBudget(companyId, budgetId) {
  const budget = await db.financeBudget.findFirst({ where: { id: budgetId, companyId }, select: { id: true, status: true } })
  if (!budget) throw new HttpError(404, 'Budget not found')
  if (budget.status !== 'APPROVED') throw new HttpError(409, 'Only an APPROVED finance budget can be linked')
  return budget.id
}

function validateDateRange(start, end) {
  if (start && end && new Date(`${end}T00:00:00.000Z`) < new Date(`${start}T00:00:00.000Z`)) {
    throw new HttpError(400, 'Planned end must not precede planned start')
  }
}

async function findChild(model, id, projectId, principal, label) {
  const row = await db[model].findFirst({
    where: { ...projectTenantWhere(principal.companyId, principal.branchId), id, projectId },
  })
  if (!row) throw new HttpError(404, `${label} not found`)
  return row
}

// ----------------------------------------------------------------- projects

export async function listProjects(query = {}, actor = null) {
  const principal = principalOf(actor)
  const rows = await db.project.findMany({
    where: listWhere(principal, query, {
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
    }),
    orderBy: [{ number: 'desc' }],
    take: limitOf(query.limit),
  })
  return rows.map(toProjectDto)
}

export async function getProject(id, actor = null) {
  return toProjectDto(await findRecord('project', id, 'Project', actor))
}

export async function createProject(input, actor = null) {
  const principal = principalOf(actor)
  validateDateRange(input.plannedStart, input.plannedEnd)
  const branchId = await resolveBranch(principal.companyId, input.branchId)
  const customerId = await resolveCustomer(principal.companyId, input.customerId)
  const salesOrderId = await resolveSalesOrder(principal.companyId, input.salesOrderId)
  const row = await createWithNumber('project', 'PRJ', (number) => ({
    companyId: principal.companyId,
    branchId,
    number,
    name: input.name,
    description: input.description || null,
    status: 'PLANNED',
    customerId,
    salesOrderId,
    budgetCents: assertSafeIntegerCents(input.budgetCents ?? 0, 'Budget'),
    currency: input.currency || 'KES',
    plannedStart: input.plannedStart ? dayInstant(input.plannedStart, 'Planned start') : null,
    plannedEnd: input.plannedEnd ? dayInstant(input.plannedEnd, 'Planned end') : null,
    classification: input.classification || 'INTERNAL',
    createdById: principal.userId,
  }), principal.companyId, 5, input.number)
  await auditMutation(actor, 'projects.project.created', 'Project', row.id, {
    projectId: row.id,
    classification: row.classification,
  })
  await projectEvent('ProjectCreated', {
    entityType: 'PROJECT',
    entityId: row.id,
    projectId: row.id,
    classification: row.classification,
  }, { aggregateId: row.id, branchId: row.branchId })
  return toProjectDto(row)
}

export async function updateProject(id, input, actor = null) {
  const existing = await findRecord('project', id, 'Project', actor)
  const principal = principalOf(actor)
  const plannedStart = Object.hasOwn(input, 'plannedStart') ? input.plannedStart : isoDayOrNull(existing.plannedStart)
  const plannedEnd = Object.hasOwn(input, 'plannedEnd') ? input.plannedEnd : isoDayOrNull(existing.plannedEnd)
  validateDateRange(plannedStart, plannedEnd)
  const data = { updatedAt: new Date() }
  const direct = ['number', 'name', 'description', 'budgetCents', 'currency', 'classification']
  for (const key of direct) {
    if (Object.hasOwn(input, key)) data[key] = input[key]
  }
  if (Object.hasOwn(input, 'branchId')) data.branchId = await resolveBranch(principal.companyId, input.branchId)
  if (Object.hasOwn(input, 'customerId')) data.customerId = await resolveCustomer(principal.companyId, input.customerId)
  if (Object.hasOwn(input, 'salesOrderId')) data.salesOrderId = await resolveSalesOrder(principal.companyId, input.salesOrderId)
  if (Object.hasOwn(input, 'plannedStart')) data.plannedStart = plannedStart ? dayInstant(plannedStart, 'Planned start') : null
  if (Object.hasOwn(input, 'plannedEnd')) data.plannedEnd = plannedEnd ? dayInstant(plannedEnd, 'Planned end') : null
  if (Object.hasOwn(input, 'budgetCents')) data.budgetCents = assertSafeIntegerCents(input.budgetCents, 'Budget')
  let row
  try {
    row = await db.project.update({ where: { id: existing.id }, data })
  } catch (error) {
    if (Object.hasOwn(input, 'number') && isNumberConflict(error)) {
      throw new HttpError(409, 'Number is already in use')
    }
    throw error
  }
  await auditMutation(actor, 'projects.project.updated', 'Project', row.id, {
    projectId: row.id,
    classification: row.classification,
  })
  return toProjectDto(row)
}

function isoDayOrNull(value) {
  return value ? isoInstant(value).slice(0, 10) : null
}

const PROJECT_TRANSITIONS = Object.freeze({
  PLANNED: ['ACTIVE', 'ON_HOLD', 'CANCELLED'],
  ACTIVE: ['ON_HOLD', 'COMPLETED', 'CANCELLED'],
  ON_HOLD: ['ACTIVE', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
})

/** Pure lifecycle guard shared with contract tests. */
export function assertProjectTransition(from, to) {
  if (!PROJECT_TRANSITIONS[from]?.includes(to)) {
    throw new HttpError(409, `Cannot change project from ${from} to ${to}`)
  }
  return true
}

export async function transitionProject(id, status, actor = null) {
  const row = await findRecord('project', id, 'Project', actor)
  assertProjectTransition(row.status, status)
  const stamped = {
    ...(status === 'ACTIVE' && row.status === 'PLANNED' ? { startedAt: new Date() } : {}),
    ...(status === 'COMPLETED' ? { completedAt: new Date() } : {}),
    ...(status === 'CANCELLED' ? { cancelledAt: new Date() } : {}),
  }
  const updated = await db.project.update({
    where: { id: row.id },
    data: { status, ...stamped, updatedAt: new Date() },
  })
  await auditMutation(actor, `projects.project.${status.toLowerCase()}`, 'Project', row.id, {
    projectId: row.id,
    classification: row.classification,
  })
  return toProjectDto(updated)
}

// ------------------------------------------------------------------ members

export async function listMembers(projectId, actor = null) {
  const principal = principalOf(actor)
  const rows = await db.projectMember.findMany({
    where: { ...projectTenantWhere(principal.companyId, principal.branchId), projectId },
    orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
    take: MAX_LIST,
  })
  return rows.map(toMemberDto)
}

export async function getMember(projectId, memberId, actor = null) {
  const principal = principalOf(actor)
  return toMemberDto(await findChild('projectMember', memberId, projectId, principal, 'Project member'))
}

export async function createMember(projectId, input, actor = null) {
  const principal = principalOf(actor)
  await findRecord('project', projectId, 'Project', actor)
  await resolveUser(principal.companyId, input.userId)
  const branchId = await resolveBranch(principal.companyId, input.branchId)
  try {
    const row = await db.projectMember.create({
      data: {
        companyId: principal.companyId,
        branchId,
        projectId,
        userId: input.userId,
        role: input.role || 'MEMBER',
        classification: input.classification || 'INTERNAL',
        createdById: principal.userId,
      },
    })
    await auditMutation(actor, 'projects.member.created', 'ProjectMember', row.id, {
      memberId: row.id,
      projectId,
      classification: row.classification,
    })
    return toMemberDto(row)
  } catch (error) {
    if (error?.code === 'P2002') throw new HttpError(409, 'User is already a member of this project')
    throw error
  }
}

export async function updateMember(projectId, memberId, input, actor = null) {
  const principal = principalOf(actor)
  const existing = await findChild('projectMember', memberId, projectId, principal, 'Project member')
  const data = { updatedAt: new Date() }
  for (const key of ['role', 'classification']) {
    if (Object.hasOwn(input, key)) data[key] = input[key]
  }
  if (Object.hasOwn(input, 'leftAt')) {
    data.leftAt = input.leftAt ? dayInstant(input.leftAt, 'Left at') : null
  }
  const row = await db.projectMember.update({ where: { id: existing.id }, data })
  await auditMutation(actor, 'projects.member.updated', 'ProjectMember', row.id, {
    memberId: row.id,
    projectId,
    classification: row.classification,
  })
  return toMemberDto(row)
}

// ---------------------------------------------------------------- milestones

export async function listMilestones(projectId, query = {}, actor = null) {
  const principal = principalOf(actor)
  const rows = await db.milestone.findMany({
    where: {
      ...projectTenantWhere(principal.companyId, principal.branchId),
      projectId,
      ...(query.status ? { status: query.status } : {}),
    },
    orderBy: [{ number: 'asc' }],
    take: limitOf(query.limit),
  })
  return rows.map(toMilestoneDto)
}

export async function getMilestone(projectId, id, actor = null) {
  const principal = principalOf(actor)
  return toMilestoneDto(await findChild('milestone', id, projectId, principal, 'Milestone'))
}

export async function createMilestone(projectId, input, actor = null) {
  const principal = principalOf(actor)
  await findRecord('project', projectId, 'Project', actor)
  const branchId = await resolveBranch(principal.companyId, input.branchId)
  const row = await createWithNumber('milestone', 'MS', (number) => ({
    companyId: principal.companyId,
    branchId,
    projectId,
    number,
    name: input.name,
    description: input.description || null,
    status: 'PLANNED',
    dueAt: input.dueAt ? dayInstant(input.dueAt, 'Due date') : null,
    classification: input.classification || 'INTERNAL',
    createdById: principal.userId,
  }), principal.companyId, 5, input.number)
  await auditMutation(actor, 'projects.milestone.created', 'Milestone', row.id, {
    milestoneId: row.id,
    projectId,
    classification: row.classification,
  })
  return toMilestoneDto(row)
}

const MILESTONE_TRANSITIONS = Object.freeze({
  PLANNED: ['IN_PROGRESS', 'MET', 'MISSED'],
  IN_PROGRESS: ['MET', 'MISSED'],
  MET: [],
  MISSED: [],
})

export function assertMilestoneTransition(from, to) {
  if (!MILESTONE_TRANSITIONS[from]?.includes(to)) {
    throw new HttpError(409, `Cannot change milestone from ${from} to ${to}`)
  }
  return true
}

export async function transitionMilestone(projectId, id, status, actor = null) {
  const principal = principalOf(actor)
  const row = await findChild('milestone', id, projectId, principal, 'Milestone')
  assertMilestoneTransition(row.status, status)
  const stamped = {
    ...(status === 'MET' ? { metAt: new Date() } : {}),
    ...(status === 'MISSED' ? { missedAt: new Date() } : {}),
  }
  const updated = await db.milestone.update({
    where: { id: row.id },
    data: { status, ...stamped, updatedAt: new Date() },
  })
  await auditMutation(actor, `projects.milestone.${status.toLowerCase()}`, 'Milestone', row.id, {
    milestoneId: row.id,
    projectId,
    classification: row.classification,
  })
  if (status === 'MET') {
    await projectEvent('MilestoneMet', {
      entityType: 'MILESTONE',
      entityId: row.id,
      milestoneId: row.id,
      projectId,
      classification: row.classification,
    }, { aggregateId: row.id, branchId: row.branchId })
  }
  return toMilestoneDto(updated)
}

// -------------------------------------------------------------------- tasks

export async function listTasks(projectId, query = {}, actor = null) {
  const principal = principalOf(actor)
  const rows = await db.projectTask.findMany({
    where: {
      ...projectTenantWhere(principal.companyId, principal.branchId),
      projectId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.assigneeId ? { assigneeId: query.assigneeId } : {}),
      ...(query.milestoneId ? { milestoneId: query.milestoneId } : {}),
    },
    orderBy: [{ position: 'asc' }, { number: 'asc' }],
    take: limitOf(query.limit),
  })
  return rows.map(toTaskDto)
}

export async function getTask(projectId, id, actor = null) {
  const principal = principalOf(actor)
  return toTaskDto(await findChild('projectTask', id, projectId, principal, 'Task'))
}

async function resolveTaskLinks(principal, projectId, input, existing = null) {
  const branchId = Object.hasOwn(input, 'branchId')
    ? await resolveBranch(principal.companyId, input.branchId)
    : (existing?.branchId ?? null)
  let assigneeId = existing?.assigneeId ?? null
  if (Object.hasOwn(input, 'assigneeId')) {
    assigneeId = input.assigneeId ? await resolveUser(principal.companyId, input.assigneeId) : null
  }
  let milestoneId = existing?.milestoneId ?? null
  if (Object.hasOwn(input, 'milestoneId') && input.milestoneId) {
    const milestone = await findChild('milestone', input.milestoneId, projectId, principal, 'Milestone')
    milestoneId = milestone.id
  } else if (Object.hasOwn(input, 'milestoneId')) {
    milestoneId = null
  }
  return { branchId, assigneeId, milestoneId }
}

export async function createTask(projectId, input, actor = null) {
  const principal = principalOf(actor)
  await findRecord('project', projectId, 'Project', actor)
  const links = await resolveTaskLinks(principal, projectId, input)
  const row = await createWithNumber('projectTask', 'TASK', (number) => ({
    companyId: principal.companyId,
    branchId: links.branchId,
    projectId,
    number,
    title: input.title,
    description: input.description || null,
    status: 'TODO',
    assigneeId: links.assigneeId,
    milestoneId: links.milestoneId,
    dueAt: input.dueAt ? dayInstant(input.dueAt, 'Due date') : null,
    position: input.position ?? 0,
    classification: input.classification || 'INTERNAL',
    createdById: principal.userId,
  }), principal.companyId, 5, input.number)
  await auditMutation(actor, 'projects.task.created', 'ProjectTask', row.id, {
    taskId: row.id,
    projectId,
    classification: row.classification,
  })
  return toTaskDto(row)
}

export async function updateTask(projectId, id, input, actor = null) {
  const principal = principalOf(actor)
  const existing = await findChild('projectTask', id, projectId, principal, 'Task')
  const links = await resolveTaskLinks(principal, projectId, input, existing)
  const data = { updatedAt: new Date(), branchId: links.branchId, assigneeId: links.assigneeId, milestoneId: links.milestoneId }
  for (const key of ['title', 'description', 'position', 'classification']) {
    if (Object.hasOwn(input, key)) data[key] = input[key]
  }
  if (Object.hasOwn(input, 'dueAt')) data.dueAt = input.dueAt ? dayInstant(input.dueAt, 'Due date') : null
  const row = await db.projectTask.update({ where: { id: existing.id }, data })
  await auditMutation(actor, 'projects.task.updated', 'ProjectTask', row.id, {
    taskId: row.id,
    projectId,
    classification: row.classification,
  })
  return toTaskDto(row)
}

const TASK_TRANSITIONS = Object.freeze({
  TODO: ['IN_PROGRESS', 'BLOCKED', 'CANCELLED'],
  IN_PROGRESS: ['BLOCKED', 'DONE', 'CANCELLED'],
  BLOCKED: ['IN_PROGRESS', 'CANCELLED'],
  DONE: [],
  CANCELLED: [],
})

export function assertTaskTransition(from, to) {
  if (!TASK_TRANSITIONS[from]?.includes(to)) {
    throw new HttpError(409, `Cannot change task from ${from} to ${to}`)
  }
  return true
}

export async function transitionTask(projectId, id, status, actor = null) {
  const principal = principalOf(actor)
  const row = await findChild('projectTask', id, projectId, principal, 'Task')
  assertTaskTransition(row.status, status)
  const stamped = {
    ...(status === 'IN_PROGRESS' && !row.startedAt ? { startedAt: new Date() } : {}),
    ...(status === 'DONE' ? { completedAt: new Date() } : {}),
    ...(status === 'CANCELLED' ? { cancelledAt: new Date() } : {}),
  }
  const updated = await db.projectTask.update({
    where: { id: row.id },
    data: { status, ...stamped, updatedAt: new Date() },
  })
  await auditMutation(actor, `projects.task.${status.toLowerCase()}`, 'ProjectTask', row.id, {
    taskId: row.id,
    projectId,
    classification: row.classification,
  })
  if (status === 'DONE') {
    await projectEvent('ProjectTaskCompleted', {
      entityType: 'PROJECT_TASK',
      entityId: row.id,
      taskId: row.id,
      projectId,
      classification: row.classification,
    }, { aggregateId: row.id, branchId: row.branchId })
  }
  return toTaskDto(updated)
}

// --------------------------------------------------------------- time entries

export async function listTimeEntries(projectId, query = {}, actor = null) {
  const principal = principalOf(actor)
  const rows = await db.timeEntry.findMany({
    where: {
      ...projectTenantWhere(principal.companyId, principal.branchId),
      projectId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.from || query.to ? {
        workDate: {
          ...(query.from ? { gte: isoDay(query.from, 'From date') } : {}),
          ...(query.to ? { lte: isoDay(query.to, 'To date') } : {}),
        },
      } : {}),
    },
    orderBy: [{ workDate: 'desc' }, { number: 'desc' }],
    take: limitOf(query.limit),
  })
  return rows.map(toTimeEntryDto)
}

export async function getTimeEntry(projectId, id, actor = null) {
  const principal = principalOf(actor)
  return toTimeEntryDto(await findChild('timeEntry', id, projectId, principal, 'Time entry'))
}

export async function createTimeEntry(projectId, input, actor = null) {
  const principal = principalOf(actor)
  if (!principal.userId) throw new HttpError(400, 'An authenticated user is required to record time')
  const project = await findRecord('project', projectId, 'Project', actor)
  if (project.status === 'COMPLETED' || project.status === 'CANCELLED') {
    throw new HttpError(409, 'Time cannot be recorded on a closed project')
  }
  const branchId = await resolveBranch(principal.companyId, input.branchId)
  let taskId = null
  if (input.taskId) {
    const task = await findChild('projectTask', input.taskId, projectId, principal, 'Task')
    taskId = task.id
  }
  let memberId = null
  if (input.memberId) {
    const member = await findChild('projectMember', input.memberId, projectId, principal, 'Project member')
    memberId = member.id
  }
  const hours = roundHours(input.hours)
  const amountCents = calculateTimeAmountCents({
    hours,
    hourlyRateCents: input.hourlyRateCents ?? 0,
    billable: input.billable,
  })
  const row = await createWithNumber('timeEntry', 'TIME', (number) => ({
    companyId: principal.companyId,
    branchId,
    projectId,
    taskId,
    memberId,
    userId: principal.userId,
    number,
    workDate: isoDay(input.workDate, 'Work date'),
    hours,
    billable: input.billable ?? false,
    hourlyRateCents: assertSafeIntegerCents(input.hourlyRateCents ?? 0, 'Hourly rate'),
    amountCents,
    status: 'DRAFT',
    classification: input.classification || 'INTERNAL',
    createdById: principal.userId,
  }), principal.companyId, 5, input.number)
  await auditMutation(actor, 'projects.time.created', 'TimeEntry', row.id, {
    timeEntryId: row.id,
    projectId,
    classification: row.classification,
  })
  return toTimeEntryDto(row)
}

export function assertTimeDecision(from, decision) {
  if (from !== 'DRAFT' || !['APPROVE', 'REJECT'].includes(decision)) {
    throw new HttpError(409, `Cannot ${String(decision).toLowerCase()} time from ${from}`)
  }
  return true
}

export async function decideTimeEntry(projectId, id, input, actor = null) {
  const principal = principalOf(actor)
  const row = await findChild('timeEntry', id, projectId, principal, 'Time entry')
  assertTimeDecision(row.status, input.decision)
  const approved = input.decision === 'APPROVE'
  const updated = await db.timeEntry.update({
    where: { id: row.id },
    data: {
      status: approved ? 'APPROVED' : 'REJECTED',
      approvedById: approved ? principal.userId : null,
      approvedAt: approved ? new Date() : null,
      rejectedAt: approved ? null : new Date(),
      updatedAt: new Date(),
    },
  })
  await auditMutation(actor, `projects.time.${input.decision.toLowerCase()}`, 'TimeEntry', row.id, {
    timeEntryId: row.id,
    projectId,
    classification: row.classification,
  })
  if (approved) {
    await projectEvent('TimeEntryApproved', {
      entityType: 'TIME_ENTRY',
      entityId: row.id,
      timeEntryId: row.id,
      projectId,
      classification: row.classification,
    }, { aggregateId: row.id, branchId: row.branchId })
  }
  return toTimeEntryDto(updated)
}

/** Narrow the finance invoice response to an authenticated API summary. */
export function toInvoiceSummary(dto) {
  if (!dto) return null
  return {
    id: dto.id,
    number: dto.number,
    status: dto.status,
    totalCents: dto.totalCents,
    currency: dto.currency,
    issuedAt: dto.issuedAt ?? null,
  }
}

export async function invoiceTimeEntry(projectId, id, input, actor = null) {
  const principal = principalOf(actor)
  const entry = await findChild('timeEntry', id, projectId, principal, 'Time entry')
  const project = await findRecord('project', projectId, 'Project', actor)
  if (entry.status !== 'APPROVED') throw new HttpError(409, 'Only APPROVED time entries can be invoiced')
  if (!entry.billable || entry.amountCents <= 0) {
    throw new HttpError(409, 'Only billable time with a positive amount can be invoiced')
  }
  if (!project.customerId) throw new HttpError(409, 'A customer is required before time can be invoiced')

  const issueDate = isoDay(input.issueDate || new Date().toISOString().slice(0, 10), 'Issue date')
  if (input.dueDate && input.dueDate < issueDate) throw new HttpError(400, 'Due date must not precede issue date')

  // Resolve the VERIFIED rate before any invoice write. createInvoice stores the
  // rate on lines; issueInvoice resolves it again and performs all tax math.
  const rate = await resolveVerifiedRate(principal.companyId, issueDate, input.taxRateId || undefined)
  const created = await createInvoice({
    direction: 'SALES',
    type: 'INVOICE',
    partyId: project.customerId,
    branchId: entry.branchId || project.branchId,
    issueDate,
    dueDate: input.dueDate || null,
    currency: project.currency,
    taxInclusive: false,
    taxRateId: rate.id,
    description: input.description,
    lines: [{
      description: input.description,
      qty: 1,
      unitPriceCents: entry.amountCents,
    }],
    notes: null,
    classification: entry.classification,
  }, actor)
  const issued = await issueInvoice(created.id, { taxRateId: rate.id }, actor)
  const updated = await db.timeEntry.update({
    where: { id: entry.id },
    data: {
      status: 'BILLED',
      financeInvoiceId: issued.id,
      billedAt: new Date(),
      updatedAt: new Date(),
    },
  })
  await auditMutation(actor, 'projects.time.billed', 'TimeEntry', entry.id, {
    timeEntryId: entry.id,
    projectId,
    invoiceId: issued.id,
    classification: entry.classification,
  })
  return { timeEntry: toTimeEntryDto(updated), invoice: toInvoiceSummary(issued) }
}

// -------------------------------------------------------------- budget links

/**
 * Load usage only through finance's helper. A failure yields explicit
 * unavailable metadata and no estimated or zeroed amounts.
 */
export async function loadBudgetUsageForLinks(links, options = {}) {
  const usageLoader = options.usageLoader || getBudgetUsage
  const results = []
  for (const link of links || []) {
    // eslint-disable-next-line no-await-in-loop
    results.push(await loadOneBudgetUsage(link, usageLoader))
  }
  return results
}

async function loadOneBudgetUsage(link, usageLoader) {
  try {
    const usage = await usageLoader(link.budgetId)
    return toBudgetUsageDto({ budgetId: link.budgetId, usage })
  } catch (error) {
    const code = error?.status === 404 ? 'BUDGET_NOT_FOUND'
      : (error?.status === 409 ? 'FINANCE_CONFLICT' : 'FINANCE_UNAVAILABLE')
    return toBudgetUsageDto({
      budgetId: link.budgetId,
      usage: null,
      unavailable: {
        code,
        reason: error?.status === 404
          ? 'The linked finance budget was not found'
          : 'Finance could not supply budget usage',
      },
    })
  }
}

export async function getProjectBudgetUsage(id, actor = null, options = {}) {
  const principal = principalOf(actor)
  const project = await findRecord('project', id, 'Project', actor)
  const links = await db.projectBudgetLink.findMany({
    where: { ...projectTenantWhere(principal.companyId, principal.branchId), projectId: project.id },
    orderBy: [{ budgetId: 'asc' }],
    take: MAX_LIST,
  })
  const budgets = await loadBudgetUsageForLinks(links, options)
  return {
    projectId: project.id,
    projectBudgetCents: project.budgetCents,
    links: links.map(toBudgetLinkDto),
    budgets,
  }
}

export async function linkBudget(projectId, input, actor = null) {
  const principal = principalOf(actor)
  await findRecord('project', projectId, 'Project', actor)
  const budgetId = await resolveBudget(principal.companyId, input.budgetId)
  try {
    const row = await db.projectBudgetLink.create({
      data: {
        companyId: principal.companyId,
        projectId,
        budgetId,
        classification: 'INTERNAL',
        createdById: principal.userId,
      },
    })
    await auditMutation(actor, 'projects.budget.linked', 'ProjectBudgetLink', row.id, {
      budgetLinkId: row.id,
      projectId,
      budgetId,
      classification: row.classification,
    })
    return toBudgetLinkDto(row)
  } catch (error) {
    if (error?.code === 'P2002') throw new HttpError(409, 'Budget is already linked to this project')
    throw error
  }
}
