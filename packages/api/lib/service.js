// Phase 10 service lifecycle service.
//
// Contracts, tickets, work orders, visits and part usage are tenant/branch
// scoped and numbered per company. Customers are FinanceParty CUSTOMER rows;
// money is stored as integer cents. SLA targets are commercial hour counts —
// never statutory or tax rates — and SLA state is derived from persisted
// timestamps so it can be recomputed on every read.
//
// Stock movement is delegated to the Phase 8 inventory ledger. A business
// stock conflict is recorded as a manual-issue requirement instead of failing
// the service record; DLP and validation failures always fail closed. Invoice
// creation delegates all tax arithmetic to finance and accepts only VERIFIED
// VAT rates.
//
// Audit metadata and domain events contain IDs and classification only.

import { db, getTenantContext } from './tenant.js'
import { emitEvent } from './events.js'
import { recordAudit, recordRequestAudit } from './audit.js'
import { HttpError } from './util.js'
import { issueStock } from './inventory.js'
import {
  createInvoice, issueInvoice, resolveVerifiedRate, toInvoiceDto,
} from './finance.js'

const MAX_LIST = 200
const QTY_PRECISION = 1000
const SLA_AT_RISK_FRACTION = 0.25

// Documented commercial defaults for direct-customer tickets with no contract.
// These are operational targets, not statutory or regulatory rates.
export const DEFAULT_RESPONSE_SLA_HOURS = 4
export const DEFAULT_RESOLUTION_SLA_HOURS = 48

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

function isoDay(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now())
  if (Number.isNaN(date.getTime())) throw new HttpError(400, 'Invalid date')
  return date.toISOString().slice(0, 10)
}

function isoInstant(value, label = 'Timestamp') {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) throw new HttpError(400, `Invalid ${label}`)
  return date.toISOString()
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

async function serviceEvent(type, data, options = {}) {
  return emitEvent(type, data, { aggregateType: 'Service', ...options })
}

function assertSafeIntegerCents(value, label = 'Amount') {
  const cents = Number(value)
  if (!Number.isSafeInteger(cents) || cents < 0) {
    throw new HttpError(400, `${label} must be a non-negative integer number of cents`)
  }
  return cents
}

function hoursFrom(value, label = 'SLA target') {
  const hours = Number(value)
  if (!Number.isSafeInteger(hours) || hours <= 0) {
    throw new HttpError(400, `${label} must be a positive whole number of hours`)
  }
  return hours
}

/** Tenant + optional branch scope. Branch scope allows organisation-wide rows. */
export function serviceTenantWhere(companyId, branchId) {
  const scope = { companyId: companyId || tenantId() }
  if (branchId) return { ...scope, OR: [{ branchId: null }, { branchId }] }
  return scope
}

/**
 * Line value in whole cents. Fractional quantities are scaled to thousandths
 * and rounded once using integer arithmetic; no fractional cent is persisted.
 */
export function calculateServiceLine({ qty, unitPriceCents } = {}) {
  const quantity = Number(qty)
  if (!Number.isFinite(quantity) || quantity <= 0) throw new HttpError(400, 'Quantity must be greater than zero')
  const price = assertSafeIntegerCents(unitPriceCents, 'Unit price')
  const milliQty = BigInt(Math.round(quantity * QTY_PRECISION))
  const cents = Number((milliQty * BigInt(price) + 500n) / 1000n)
  if (!Number.isSafeInteger(cents) || cents <= 0) throw new HttpError(400, 'Invalid line amount')
  return { qty: quantity, unitPriceCents: price, totalCents: cents }
}

/** Sum of line totals in safe integer cents. */
export function calculateServiceTotals(lines) {
  if (!Array.isArray(lines)) throw new HttpError(400, 'Lines must be an array')
  const totalCents = lines.reduce((sum, line) => {
    const value = line.totalCents !== undefined
      ? assertSafeIntegerCents(line.totalCents, 'Line total')
      : calculateServiceLine(line).totalCents
    return sum + value
  }, 0)
  if (!Number.isSafeInteger(totalCents)) throw new HttpError(400, 'Invalid document total')
  return { totalCents }
}

/** Labour + parts in safe integer cents. */
export function calculateWorkOrderTotals(lines = [], partUsages = []) {
  const labour = calculateServiceTotals(lines)
  const parts = calculateServiceTotals(partUsages)
  const totalCents = labour.totalCents + parts.totalCents
  if (!Number.isSafeInteger(totalCents)) throw new HttpError(400, 'Invalid work order total')
  return { labourCents: labour.totalCents, partsCents: parts.totalCents, totalCents }
}

/**
 * Due dates are persisted on ticket creation so a later contract change cannot
 * retroactively rewrite a ticket's SLA. Hours are whole commercial targets.
 */
export function calculateSlaDueDates({
  openedAt,
  responseSlaHours = DEFAULT_RESPONSE_SLA_HOURS,
  resolutionSlaHours = DEFAULT_RESOLUTION_SLA_HOURS,
} = {}) {
  const opened = new Date(isoInstant(openedAt, 'openedAt'))
  const responseHours = hoursFrom(responseSlaHours, 'Response SLA')
  const resolutionHours = hoursFrom(resolutionSlaHours, 'Resolution SLA')
  const add = (hours) => new Date(opened.getTime() + hours * 60 * 60 * 1000).toISOString()
  return {
    openedAt: opened.toISOString(),
    responseSlaHours: responseHours,
    resolutionSlaHours: resolutionHours,
    responseDueAt: add(responseHours),
    resolutionDueAt: add(resolutionHours),
  }
}

/**
 * SLA state derived from persisted timestamps only. States are PENDING,
 * AT_RISK, MET and BREACHED. `atRisk` uses the last quarter of the target
 * window; MET/BREACHED compares completion with the persisted due date.
 */
export function calculateSlaState(ticket = {}, now = new Date()) {
  if (!ticket) throw new HttpError(404, 'Service ticket not found')
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime()
  if (!Number.isFinite(nowMs)) throw new HttpError(400, 'Invalid current time')

  const component = (dueAt, completedAt, openedAt) => {
    if (!dueAt) return { dueAt: null, completedAt: completedAt || null, state: 'PENDING', breached: false }
    const due = new Date(dueAt).getTime()
    const done = completedAt ? new Date(completedAt).getTime() : null
    if (!Number.isFinite(due)) throw new HttpError(409, 'Ticket has an invalid SLA due date')
    if (done !== null && Number.isFinite(done)) {
      const state = done <= due ? 'MET' : 'BREACHED'
      return { dueAt, completedAt: completedAt, state, breached: state === 'BREACHED' }
    }
    const windowMs = Number.isFinite(new Date(openedAt).getTime())
      ? Math.max(0, due - new Date(openedAt).getTime())
      : 0
    const remainingMs = due - nowMs
    let state = 'PENDING'
    if (remainingMs <= 0) state = 'BREACHED'
    else if (windowMs > 0 && remainingMs <= windowMs * SLA_AT_RISK_FRACTION) state = 'AT_RISK'
    return { dueAt, completedAt: null, state, breached: state === 'BREACHED' }
  }

  const response = component(ticket.responseDueAt, ticket.respondedAt, ticket.openedAt)
  const resolution = component(ticket.resolutionDueAt, ticket.resolvedAt, ticket.openedAt)
  return {
    response,
    resolution,
    breached: response.breached || resolution.breached,
  }
}

const TRANSITIONS = Object.freeze({
  contract: {
    DRAFT: ['ACTIVE', 'CANCELLED'],
    ACTIVE: ['SUSPENDED', 'EXPIRED', 'CANCELLED'],
    SUSPENDED: ['ACTIVE', 'EXPIRED', 'CANCELLED'],
    EXPIRED: [],
    CANCELLED: [],
  },
  ticket: {
    OPEN: ['ASSIGNED', 'IN_PROGRESS', 'CANCELLED'],
    ASSIGNED: ['IN_PROGRESS', 'WAITING', 'CANCELLED'],
    IN_PROGRESS: ['WAITING', 'RESOLVED', 'CANCELLED'],
    WAITING: ['IN_PROGRESS', 'RESOLVED', 'CANCELLED'],
    RESOLVED: ['CLOSED', 'IN_PROGRESS'],
    CLOSED: [],
    CANCELLED: [],
  },
  workOrder: {
    DRAFT: ['SCHEDULED', 'IN_PROGRESS', 'CANCELLED'],
    SCHEDULED: ['IN_PROGRESS', 'CANCELLED'],
    IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
    COMPLETED: [],
    CANCELLED: [],
  },
  visit: {
    PLANNED: ['IN_PROGRESS', 'CANCELLED'],
    IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
    COMPLETED: [],
    CANCELLED: [],
  },
})

/** Pure state-machine guard shared by services and contract tests. */
export function assertServiceTransition(type, from, to) {
  const allowed = TRANSITIONS[type]?.[from] || []
  if (!allowed.includes(to)) {
    throw new HttpError(409, `Cannot change ${type} from ${from} to ${to}`)
  }
  return true
}

/** Customers must be FinanceParty CUSTOMER rows in the same tenant. */
export function assertServiceCustomer(party) {
  if (!party) throw new HttpError(404, 'CUSTOMER party not found')
  if (party.type !== 'CUSTOMER') throw new HttpError(409, 'Service customer must be a CUSTOMER party')
  return party
}

/** Pure item guard so lifecycle rules are testable without a database. */
export function assertServiceItemActive(item) {
  if (!item) throw new HttpError(404, 'Inventory item not found')
  if (!item.isActive) throw new HttpError(409, 'Inventory item is inactive')
  return item
}

/** Extra defence in front of finance: service only accepts VERIFIED VAT. */
export function assertVerifiedServiceRate(rate) {
  if (!rate) throw new HttpError(409, 'A verified VAT rate is required')
  if (rate.kind !== 'VAT' || rate.status !== 'VERIFIED') {
    throw new HttpError(409, 'Only VERIFIED VAT rates may be used for service invoices')
  }
  return rate
}

/** Stock errors that are business conflicts, not validation or DLP failures. */
function isStockBusinessConflict(error) {
  return error instanceof HttpError && [404, 409].includes(error.status)
}

// ------------------------------------------------------------------- DTOs

function contractLineDto(line) {
  return {
    id: line.id ?? null,
    itemId: line.itemId ?? null,
    itemCode: line.item?.code ?? null,
    description: line.description,
    coverageQty: line.coverageQty,
    unitPriceCents: line.unitPriceCents,
    position: line.position ?? 0,
    classification: line.classification,
  }
}

function workOrderLineDto(line) {
  return {
    id: line.id ?? null,
    itemId: line.itemId ?? null,
    itemCode: line.item?.code ?? null,
    description: line.description,
    qty: line.qty,
    unitPriceCents: line.unitPriceCents,
    totalCents: line.totalCents,
    position: line.position ?? 0,
    classification: line.classification,
  }
}

export function toContractDto(row, lines = []) {
  if (!row) return null
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    customerId: row.customerId,
    startDate: row.startDate,
    endDate: row.endDate ?? null,
    currency: row.currency,
    monthlyFeeCents: row.monthlyFeeCents,
    responseSlaHours: row.responseSlaHours,
    resolutionSlaHours: row.resolutionSlaHours,
    notes: row.notes ?? null,
    classification: row.classification,
    activatedAt: row.activatedAt ?? null,
    suspendedAt: row.suspendedAt ?? null,
    cancelledAt: row.cancelledAt ?? null,
    lines: (lines || row.lines || []).map(contractLineDto),
    createdAt: row.createdAt ?? null,
    updatedAt: row.updatedAt ?? null,
  }
}

export function toTicketDto(row, now = new Date()) {
  if (!row) return null
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    priority: row.priority,
    contractId: row.contractId ?? null,
    customerId: row.customerId,
    subject: row.subject,
    description: row.description ?? null,
    openedAt: row.openedAt,
    responseDueAt: row.responseDueAt,
    resolutionDueAt: row.resolutionDueAt,
    assignedToId: row.assignedToId ?? null,
    assignedAt: row.assignedAt ?? null,
    respondedAt: row.respondedAt ?? null,
    resolvedAt: row.resolvedAt ?? null,
    resolutionNotes: row.resolutionNotes ?? null,
    closedAt: row.closedAt ?? null,
    cancelledAt: row.cancelledAt ?? null,
    sla: calculateSlaState(row, now),
    classification: row.classification,
    createdAt: row.createdAt ?? null,
    updatedAt: row.updatedAt ?? null,
  }
}

export function toWorkOrderDto(row, lines = [], partUsages = []) {
  if (!row) return null
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    ticketId: row.ticketId,
    technicianId: row.technicianId ?? null,
    summary: row.summary,
    labourCents: row.labourCents,
    partsCents: row.partsCents,
    totalCents: row.totalCents,
    currency: row.currency,
    scheduledAt: row.scheduledAt ?? null,
    startedAt: row.startedAt ?? null,
    completedAt: row.completedAt ?? null,
    cancelledAt: row.cancelledAt ?? null,
    notes: row.notes ?? null,
    classification: row.classification,
    financeInvoiceId: row.financeInvoiceId ?? null,
    lines: (lines || row.lines || []).map(workOrderLineDto),
    partUsages: (partUsages || row.partUsages || []).map(toPartUsageDto),
    createdAt: row.createdAt ?? null,
    updatedAt: row.updatedAt ?? null,
  }
}

export function toVisitDto(row) {
  if (!row) return null
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    workOrderId: row.workOrderId,
    ticketId: row.ticketId ?? null,
    technicianId: row.technicianId ?? null,
    plannedAt: row.plannedAt,
    checkInAt: row.checkInAt ?? null,
    checkOutAt: row.checkOutAt ?? null,
    completedAt: row.completedAt ?? null,
    cancelledAt: row.cancelledAt ?? null,
    notes: row.notes ?? null,
    classification: row.classification,
    createdAt: row.createdAt ?? null,
    updatedAt: row.updatedAt ?? null,
  }
}

export function toPartUsageDto(row) {
  if (!row) return null
  return {
    id: row.id,
    workOrderId: row.workOrderId,
    ticketId: row.ticketId ?? null,
    itemId: row.itemId,
    warehouseId: row.warehouseId ?? null,
    batchId: row.batchId ?? null,
    qty: row.qty,
    unitCostCents: row.unitCostCents,
    unitPriceCents: row.unitPriceCents,
    totalCents: row.totalCents,
    inventoryIssued: row.inventoryIssued,
    manualIssueRequired: row.manualIssueRequired,
    issuedMovementId: row.issuedMovementId ?? null,
    notes: row.notes ?? null,
    classification: row.classification,
    createdAt: row.createdAt ?? null,
    updatedAt: row.updatedAt ?? null,
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

async function createWithNumber(model, prefix, buildData, companyId, attempts = 5) {
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
    where: { ...serviceTenantWhere(principal.companyId, principal.branchId), id },
  })
  if (!row) throw new HttpError(404, `${label} not found`)
  return row
}

const LINE_INCLUDE = { item: true }

async function linesOf(model, parentKey, parentId, companyId, include = LINE_INCLUDE) {
  return db[model].findMany({
    where: { companyId, [parentKey]: parentId },
    include,
    orderBy: [{ position: 'asc' }, { id: 'asc' }],
  })
}

async function resolveCustomer(companyId, customerId) {
  if (!customerId) return null
  const party = await db.financeParty.findFirst({
    where: { id: customerId, companyId, type: 'CUSTOMER' },
    select: { id: true, type: true },
  })
  return assertServiceCustomer(party)?.id || null
}

async function resolveUser(companyId, userId) {
  if (!userId) return null
  const user = await db.user.findFirst({ where: { id: userId, companyId }, select: { id: true } })
  if (!user) throw new HttpError(404, 'User not found')
  return user.id
}

async function resolveItem(companyId, itemId) {
  if (!itemId) return null
  const item = await db.inventoryItem.findFirst({ where: { id: itemId, companyId } })
  return assertServiceItemActive(item)
}

async function resolveWarehouse(companyId, warehouseId) {
  if (warehouseId) {
    const warehouse = await db.warehouse.findFirst({ where: { id: warehouseId, companyId } })
    if (!warehouse) throw new HttpError(404, 'Warehouse not found')
    if (!warehouse.isActive) throw new HttpError(409, 'Warehouse is inactive')
    return warehouse
  }
  const fallback = await db.warehouse.findFirst({
    where: { companyId, isActive: true },
    orderBy: [{ code: 'asc' }],
  })
  if (!fallback) throw new HttpError(409, 'No active warehouse is configured for this tenant')
  return fallback
}

async function resolveBatch(companyId, itemId, batchId) {
  if (!batchId) return null
  const batch = await db.inventoryBatch.findFirst({ where: { id: batchId, companyId, itemId } })
  if (!batch) throw new HttpError(404, 'Inventory batch not found')
  if (batch.status !== 'RELEASED') throw new HttpError(409, 'Only RELEASED batches may be used for service parts')
  return batch
}

function dateFilterFor(field, query = {}) {
  if (!query.from && !query.to) return {}
  return {
    [field]: {
      ...(query.from ? { gte: query.from } : {}),
      ...(query.to ? { lte: query.to } : {}),
    },
  }
}

function listWhere(principal, query = {}, extra = {}) {
  return {
    ...serviceTenantWhere(principal.companyId, principal.branchId),
    ...(query.status ? { status: query.status } : {}),
    ...extra,
  }
}

async function workOrderView(workOrder) {
  const lines = await linesOf('workOrderLine', 'workOrderId', workOrder.id, workOrder.companyId)
  const parts = await linesOf('servicePartUsage', 'workOrderId', workOrder.id, workOrder.companyId)
  return toWorkOrderDto(workOrder, lines, parts)
}

async function recalculateWorkOrder(workOrder) {
  const lines = await linesOf('workOrderLine', 'workOrderId', workOrder.id, workOrder.companyId)
  const parts = await linesOf('servicePartUsage', 'workOrderId', workOrder.id, workOrder.companyId)
  const totals = calculateWorkOrderTotals(lines, parts)
  const updated = await db.workOrder.update({
    where: { id: workOrder.id },
    data: { ...totals, updatedAt: new Date() },
  })
  return workOrderView(updated)
}

// ----------------------------------------------------------------- contracts

export async function listContracts(query = {}, actor = null) {
  const principal = principalOf(actor)
  const rows = await db.serviceContract.findMany({
    where: listWhere(principal, query, {
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...dateFilterFor('startDate', query),
    }),
    orderBy: [{ number: 'desc' }],
    take: limitOf(query.limit),
  })
  return rows.map((row) => toContractDto(row))
}

export async function getContract(id, actor = null) {
  const row = await findRecord('serviceContract', id, 'Service contract', actor)
  return toContractDto(row, await linesOf('serviceContractLine', 'contractId', row.id, row.companyId))
}

export async function createContract(input, actor = null) {
  const principal = principalOf(actor)
  const customerId = await resolveCustomer(principal.companyId, input.customerId)
  if (!customerId) throw new HttpError(404, 'CUSTOMER party not found')
  const branchId = input.branchId || null
  if (branchId) await findRecord('branch', branchId, 'Branch', actor)

  const lines = []
  for (const line of input.lines) {
    // eslint-disable-next-line no-await-in-loop
    const itemId = await resolveItem(principal.companyId, line.itemId)
    const calculated = calculateServiceLine({ qty: line.coverageQty, unitPriceCents: line.unitPriceCents })
    lines.push({
      companyId: principal.companyId,
      branchId,
      itemId,
      description: line.description,
      coverageQty: calculated.qty,
      unitPriceCents: calculated.unitPriceCents,
      position: lines.length,
      classification: input.classification || 'INTERNAL',
      createdById: principal.userId,
    })
  }

  const row = await createWithNumber('serviceContract', 'SVC', (number) => ({
    companyId: principal.companyId,
    branchId,
    number,
    status: 'DRAFT',
    customerId,
    startDate: isoDay(input.startDate),
    endDate: input.endDate ? isoDay(input.endDate) : null,
    currency: input.currency || 'KES',
    monthlyFeeCents: assertSafeIntegerCents(input.monthlyFeeCents ?? 0, 'Monthly fee'),
    responseSlaHours: hoursFrom(input.responseSlaHours, 'Response SLA'),
    resolutionSlaHours: hoursFrom(input.resolutionSlaHours, 'Resolution SLA'),
    notes: input.notes || null,
    classification: input.classification || 'INTERNAL',
    createdById: principal.userId,
    lines: { create: lines },
  }), principal.companyId)

  await auditMutation(actor, 'service.contract.created', 'ServiceContract', row.id, {
    contractId: row.id,
    classification: row.classification,
  })
  return toContractDto(row, await linesOf('serviceContractLine', 'contractId', row.id, row.companyId))
}

async function transitionContract(id, action, nextStatus, actor) {
  const row = await findRecord('serviceContract', id, 'Service contract', actor)
  assertServiceTransition('contract', row.status, nextStatus)
  const stamped = {
    ...(nextStatus === 'ACTIVE' ? { activatedAt: new Date(), suspendedAt: null } : {}),
    ...(nextStatus === 'SUSPENDED' ? { suspendedAt: new Date() } : {}),
    ...(nextStatus === 'EXPIRED' ? { suspendedAt: null } : {}),
    ...(nextStatus === 'CANCELLED' ? { cancelledAt: new Date() } : {}),
  }
  const updated = await db.serviceContract.update({
    where: { id: row.id },
    data: { status: nextStatus, ...stamped, updatedAt: new Date() },
  })
  await auditMutation(actor, `service.contract.${action}`, 'ServiceContract', row.id, {
    contractId: row.id,
    classification: row.classification,
  })
  if (nextStatus === 'ACTIVE') {
    await serviceEvent('ServiceContractActivated', {
      entityType: 'SERVICE_CONTRACT',
      entityId: row.id,
      contractId: row.id,
      customerId: row.customerId,
      classification: row.classification,
    }, { aggregateId: row.id })
  }
  return toContractDto(updated, await linesOf('serviceContractLine', 'contractId', row.id, row.companyId))
}

export function activateContract(id, actor = null) {
  return transitionContract(id, 'activated', 'ACTIVE', actor)
}

export function suspendContract(id, actor = null) {
  return transitionContract(id, 'suspended', 'SUSPENDED', actor)
}

export function cancelContract(id, actor = null) {
  return transitionContract(id, 'cancelled', 'CANCELLED', actor)
}

// ------------------------------------------------------------------- tickets

export async function listTickets(query = {}, actor = null) {
  const principal = principalOf(actor)
  const rows = await db.serviceTicket.findMany({
    where: listWhere(principal, query, {
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.contractId ? { contractId: query.contractId } : {}),
      ...(query.assigneeId ? { assignedToId: query.assigneeId } : {}),
    }),
    orderBy: [{ number: 'desc' }],
    take: limitOf(query.limit),
  })
  return rows.map((row) => toTicketDto(row))
}

export async function getTicket(id, actor = null) {
  const row = await findRecord('serviceTicket', id, 'Service ticket', actor)
  return toTicketDto(row)
}

/** Resolve the customer and SLA targets for a new ticket. */
export async function resolveTicketContext(input, actor = null) {
  const principal = principalOf(actor)
  let contract = null
  if (input.contractId) {
    contract = await findRecord('serviceContract', input.contractId, 'Service contract', actor)
    if (contract.status !== 'ACTIVE') throw new HttpError(409, 'Tickets require an ACTIVE service contract')
  }
  const customerId = await resolveCustomer(principal.companyId, input.customerId || contract?.customerId)
  if (!customerId) throw new HttpError(404, 'CUSTOMER party not found')
  if (contract && contract.customerId !== customerId) {
    throw new HttpError(409, 'Ticket customer does not match the contract customer')
  }
  const openedAt = input.openedAt ? isoInstant(input.openedAt, 'openedAt') : new Date().toISOString()
  const due = calculateSlaDueDates({
    openedAt,
    responseSlaHours: contract?.responseSlaHours || DEFAULT_RESPONSE_SLA_HOURS,
    resolutionSlaHours: contract?.resolutionSlaHours || DEFAULT_RESOLUTION_SLA_HOURS,
  })
  return { contract, customerId, ...due }
}

export async function createTicket(input, actor = null) {
  const principal = principalOf(actor)
  const context = await resolveTicketContext(input, actor)
  const branchId = input.branchId || context.contract?.branchId || null
  if (branchId) await findRecord('branch', branchId, 'Branch', actor)

  const row = await createWithNumber('serviceTicket', 'TKT', (number) => ({
    companyId: principal.companyId,
    branchId,
    number,
    status: 'OPEN',
    priority: input.priority || 'MEDIUM',
    contractId: context.contract?.id || null,
    customerId: context.customerId,
    subject: input.subject,
    description: input.description || null,
    openedAt: context.openedAt,
    responseDueAt: context.responseDueAt,
    resolutionDueAt: context.resolutionDueAt,
    classification: input.classification || 'INTERNAL',
    createdById: principal.userId,
  }), principal.companyId)

  await auditMutation(actor, 'service.ticket.created', 'ServiceTicket', row.id, {
    ticketId: row.id,
    ...(row.contractId ? { contractId: row.contractId } : {}),
    classification: row.classification,
  })
  await serviceEvent('ServiceTicketOpened', {
    entityType: 'SERVICE_TICKET',
    entityId: row.id,
    ticketId: row.id,
    ...(row.contractId ? { contractId: row.contractId } : {}),
    customerId: row.customerId,
    classification: row.classification,
  }, { aggregateId: row.id })
  return toTicketDto(row)
}

async function transitionTicket(id, action, nextStatus, actor, extraData = {}) {
  const row = await findRecord('serviceTicket', id, 'Service ticket', actor)
  assertServiceTransition('ticket', row.status, nextStatus)
  const stamped = {
    ...(nextStatus === 'IN_PROGRESS' ? { respondedAt: row.respondedAt || new Date() } : {}),
    ...(nextStatus === 'RESOLVED' ? { resolvedAt: new Date() } : {}),
    ...(nextStatus === 'CLOSED' ? { closedAt: new Date() } : {}),
    ...(nextStatus === 'CANCELLED' ? { cancelledAt: new Date() } : {}),
  }
  const updated = await db.serviceTicket.update({
    where: { id: row.id },
    data: { status: nextStatus, ...stamped, ...extraData, updatedAt: new Date() },
  })
  await auditMutation(actor, `service.ticket.${action}`, 'ServiceTicket', row.id, {
    ticketId: row.id,
    classification: row.classification,
  })
  return toTicketDto(updated)
}

export async function assignTicket(id, input, actor = null) {
  const principal = principalOf(actor)
  const assigneeId = await resolveUser(principal.companyId, input.assigneeId)
  const updated = await transitionTicket(id, 'assigned', 'ASSIGNED', actor, {
    assignedToId: assigneeId,
    assignedAt: new Date(),
  })
  const row = await findRecord('serviceTicket', id, 'Service ticket', actor)
  await serviceEvent('ServiceTicketAssigned', {
    entityType: 'SERVICE_TICKET',
    entityId: row.id,
    ticketId: row.id,
    assigneeId,
    classification: row.classification,
  }, { aggregateId: row.id })
  return updated
}

export function startTicket(id, actor = null) {
  return transitionTicket(id, 'started', 'IN_PROGRESS', actor)
}

export function waitForTicket(id, actor = null) {
  return transitionTicket(id, 'waiting', 'WAITING', actor)
}

export async function resolveTicket(id, input = {}, actor = null) {
  const updated = await transitionTicket(id, 'resolved', 'RESOLVED', actor, {
    ...(input.resolutionNotes ? { resolutionNotes: input.resolutionNotes } : {}),
  })
  const row = await findRecord('serviceTicket', id, 'Service ticket', actor)
  const workOrder = await db.workOrder.findFirst({
    where: { companyId: row.companyId, ticketId: row.id },
    select: { id: true },
    orderBy: [{ createdAt: 'desc' }],
  })
  await serviceEvent('ServiceTicketResolved', {
    entityType: 'SERVICE_TICKET',
    entityId: row.id,
    ticketId: row.id,
    ...(workOrder ? { workOrderId: workOrder.id } : {}),
    classification: row.classification,
  }, { aggregateId: row.id })
  return updated
}

export function closeTicket(id, actor = null) {
  return transitionTicket(id, 'closed', 'CLOSED', actor)
}

export function cancelTicket(id, actor = null) {
  return transitionTicket(id, 'cancelled', 'CANCELLED', actor)
}

// ---------------------------------------------------------------- work orders

export async function listWorkOrders(query = {}, actor = null) {
  const principal = principalOf(actor)
  const rows = await db.workOrder.findMany({
    where: listWhere(principal, query, {
      ...(query.ticketId ? { ticketId: query.ticketId } : {}),
      ...(query.technicianId ? { technicianId: query.technicianId } : {}),
    }),
    orderBy: [{ number: 'desc' }],
    take: limitOf(query.limit),
  })
  return rows.map((row) => toWorkOrderDto(row))
}

export async function getWorkOrder(id, actor = null) {
  const row = await findRecord('workOrder', id, 'Work order', actor)
  return workOrderView(row)
}

export async function createWorkOrder(input, actor = null) {
  const principal = principalOf(actor)
  const ticket = await findRecord('serviceTicket', input.ticketId, 'Service ticket', actor)
  if (['RESOLVED', 'CLOSED', 'CANCELLED'].includes(ticket.status)) {
    throw new HttpError(409, 'Work orders require an open service ticket')
  }
  const technicianId = await resolveUser(principal.companyId, input.technicianId)
  const branchId = input.branchId || ticket.branchId || null
  if (branchId) await findRecord('branch', branchId, 'Branch', actor)

  const lines = []
  for (const line of input.lines || []) {
    // eslint-disable-next-line no-await-in-loop
    const itemId = await resolveItem(principal.companyId, line.itemId)
    const calculated = calculateServiceLine({ qty: line.qty, unitPriceCents: line.unitPriceCents })
    lines.push({
      companyId: principal.companyId,
      branchId,
      itemId,
      description: line.description,
      qty: calculated.qty,
      unitPriceCents: calculated.unitPriceCents,
      totalCents: calculated.totalCents,
      position: lines.length,
      classification: input.classification || 'INTERNAL',
      createdById: principal.userId,
    })
  }
  const totals = calculateWorkOrderTotals(lines, [])

  const row = await createWithNumber('workOrder', 'WO', (number) => ({
    companyId: principal.companyId,
    branchId,
    number,
    status: 'DRAFT',
    ticketId: ticket.id,
    technicianId,
    summary: input.summary,
    currency: 'KES',
    ...totals,
    scheduledAt: input.scheduledAt ? isoInstant(input.scheduledAt, 'scheduledAt') : null,
    notes: input.notes || null,
    classification: input.classification || 'INTERNAL',
    createdById: principal.userId,
    lines: { create: lines },
  }), principal.companyId)

  await auditMutation(actor, 'service.workorder.created', 'WorkOrder', row.id, {
    workOrderId: row.id,
    ticketId: ticket.id,
    classification: row.classification,
  })
  return workOrderView(row)
}

export async function scheduleWorkOrder(id, input, actor = null) {
  const principal = principalOf(actor)
  const row = await findRecord('workOrder', id, 'Work order', actor)
  assertServiceTransition('workOrder', row.status, 'SCHEDULED')
  const technicianId = input.technicianId === undefined
    ? row.technicianId
    : await resolveUser(principal.companyId, input.technicianId)
  const updated = await db.workOrder.update({
    where: { id: row.id },
    data: {
      status: 'SCHEDULED',
      scheduledAt: isoInstant(input.scheduledAt, 'scheduledAt'),
      technicianId,
      updatedAt: new Date(),
    },
  })
  await auditMutation(actor, 'service.workorder.scheduled', 'WorkOrder', row.id, {
    workOrderId: row.id,
    ticketId: row.ticketId,
    classification: row.classification,
  })
  return workOrderView(updated)
}

export async function startWorkOrder(id, actor = null) {
  const row = await findRecord('workOrder', id, 'Work order', actor)
  assertServiceTransition('workOrder', row.status, 'IN_PROGRESS')
  const updated = await db.workOrder.update({
    where: { id: row.id },
    data: { status: 'IN_PROGRESS', startedAt: row.startedAt || new Date(), updatedAt: new Date() },
  })
  await auditMutation(actor, 'service.workorder.started', 'WorkOrder', row.id, {
    workOrderId: row.id,
    ticketId: row.ticketId,
    classification: row.classification,
  })
  return workOrderView(updated)
}

export async function completeWorkOrder(id, input = {}, actor = null) {
  const row = await findRecord('workOrder', id, 'Work order', actor)
  assertServiceTransition('workOrder', row.status, 'COMPLETED')
  const updated = await db.workOrder.update({
    where: { id: row.id },
    data: {
      status: 'COMPLETED',
      completedAt: new Date(),
      ...(input.notes ? { notes: input.notes } : {}),
      updatedAt: new Date(),
    },
  })
  await recalculateWorkOrder(row)
  await auditMutation(actor, 'service.workorder.completed', 'WorkOrder', row.id, {
    workOrderId: row.id,
    ticketId: row.ticketId,
    classification: row.classification,
  })
  await serviceEvent('WorkOrderCompleted', {
    entityType: 'WORK_ORDER',
    entityId: row.id,
    workOrderId: row.id,
    ticketId: row.ticketId,
    classification: row.classification,
  }, { aggregateId: row.id })
  return workOrderView(updated)
}

export async function cancelWorkOrder(id, actor = null) {
  const row = await findRecord('workOrder', id, 'Work order', actor)
  assertServiceTransition('workOrder', row.status, 'CANCELLED')
  const updated = await db.workOrder.update({
    where: { id: row.id },
    data: { status: 'CANCELLED', cancelledAt: new Date(), updatedAt: new Date() },
  })
  await auditMutation(actor, 'service.workorder.cancelled', 'WorkOrder', row.id, {
    workOrderId: row.id,
    ticketId: row.ticketId,
    classification: row.classification,
  })
  return workOrderView(updated)
}

/**
 * Optional sales invoice for a COMPLETED work order. All tax arithmetic stays
 * in finance. A supplied rate must resolve to an effective VERIFIED VAT rate;
 * when omitted, finance's own verified-rate guard selects the effective rate.
 */
export async function createWorkOrderInvoice(id, input = {}, actor = null) {
  const principal = principalOf(actor)
  const workOrder = await findRecord('workOrder', id, 'Work order', actor)
  if (workOrder.status !== 'COMPLETED') throw new HttpError(409, 'Only a COMPLETED work order can be invoiced')
  if (workOrder.financeInvoiceId) throw new HttpError(409, 'This work order already has an invoice')
  const ticket = await findRecord('serviceTicket', workOrder.ticketId, 'Service ticket', actor)
  const issueDate = isoDay(input.issueDate)
  let verifiedRate = null
  if (input.taxRateId) {
    verifiedRate = assertVerifiedServiceRate(
      await resolveVerifiedRate(principal.companyId, issueDate, input.taxRateId),
    )
  }

  const lines = await linesOf('workOrderLine', 'workOrderId', workOrder.id, workOrder.companyId)
  const parts = await linesOf('servicePartUsage', 'workOrderId', workOrder.id, workOrder.companyId)
  const invoiceLines = [
    ...lines.map((line) => ({
      description: line.description,
      qty: line.qty,
      unitPriceCents: line.unitPriceCents,
    })),
    ...parts.map((part) => ({
      description: `Part: ${part.itemId}`,
      qty: part.qty,
      unitPriceCents: part.unitPriceCents,
    })),
  ]
  if (invoiceLines.length === 0) throw new HttpError(422, 'A completed work order has no billable lines')

  const invoice = await createInvoice({
    direction: 'SALES',
    type: 'INVOICE',
    partyId: ticket.customerId,
    issueDate,
    dueDate: input.dueDate ? isoDay(input.dueDate) : null,
    currency: workOrder.currency || 'KES',
    taxRateId: verifiedRate?.id || null,
    taxInclusive: false,
    branchId: workOrder.branchId,
    notes: input.notes || null,
    classification: workOrder.classification,
    businessDocumentId: workOrder.id,
    lines: invoiceLines,
  }, actor)
  const issued = await issueInvoice(invoice.id, {
    ...(verifiedRate ? { taxRateId: verifiedRate.id } : {}),
  }, actor)
  await db.workOrder.update({
    where: { id: workOrder.id },
    data: { financeInvoiceId: invoice.id, updatedAt: new Date() },
  })
  await auditMutation(actor, 'service.workorder.invoiced', 'WorkOrder', workOrder.id, {
    workOrderId: workOrder.id,
    invoiceId: invoice.id,
    ticketId: ticket.id,
    classification: workOrder.classification,
  })
  return { invoice: issued?.invoice || toInvoiceDto(invoice), workOrder: await workOrderView(
    await findRecord('workOrder', workOrder.id, 'Work order', actor),
  ) }
}

// -------------------------------------------------------------------- visits

export async function listVisits(query = {}, actor = null) {
  const principal = principalOf(actor)
  const rows = await db.serviceVisit.findMany({
    where: listWhere(principal, query, {
      ...(query.workOrderId ? { workOrderId: query.workOrderId } : {}),
      ...(query.technicianId ? { technicianId: query.technicianId } : {}),
    }),
    orderBy: [{ plannedAt: 'desc' }, { number: 'desc' }],
    take: limitOf(query.limit),
  })
  return rows.map(toVisitDto)
}

export async function getVisit(id, actor = null) {
  const row = await findRecord('serviceVisit', id, 'Service visit', actor)
  return toVisitDto(row)
}

export async function createVisit(input, actor = null) {
  const principal = principalOf(actor)
  const workOrder = await findRecord('workOrder', input.workOrderId, 'Work order', actor)
  if (['COMPLETED', 'CANCELLED'].includes(workOrder.status)) {
    throw new HttpError(409, 'Visits require an open work order')
  }
  const technicianId = await resolveUser(principal.companyId, input.technicianId || workOrder.technicianId)
  const branchId = input.branchId || workOrder.branchId || null
  if (branchId) await findRecord('branch', branchId, 'Branch', actor)

  const row = await createWithNumber('serviceVisit', 'VIS', (number) => ({
    companyId: principal.companyId,
    branchId,
    number,
    status: 'PLANNED',
    workOrderId: workOrder.id,
    ticketId: workOrder.ticketId,
    technicianId,
    plannedAt: isoInstant(input.plannedAt, 'plannedAt'),
    notes: input.notes || null,
    classification: input.classification || 'INTERNAL',
    createdById: principal.userId,
  }), principal.companyId)

  await auditMutation(actor, 'service.visit.created', 'ServiceVisit', row.id, {
    visitId: row.id,
    workOrderId: workOrder.id,
    ticketId: workOrder.ticketId,
    classification: row.classification,
  })
  return toVisitDto(row)
}

export async function checkInVisit(id, actor = null) {
  const row = await findRecord('serviceVisit', id, 'Service visit', actor)
  assertServiceTransition('visit', row.status, 'IN_PROGRESS')
  const updated = await db.serviceVisit.update({
    where: { id: row.id },
    data: { status: 'IN_PROGRESS', checkInAt: new Date(), updatedAt: new Date() },
  })
  await auditMutation(actor, 'service.visit.checked_in', 'ServiceVisit', row.id, {
    visitId: row.id,
    workOrderId: row.workOrderId,
    classification: row.classification,
  })
  return toVisitDto(updated)
}

export async function checkOutVisit(id, input = {}, actor = null) {
  const row = await findRecord('serviceVisit', id, 'Service visit', actor)
  assertServiceTransition('visit', row.status, 'COMPLETED')
  const updated = await db.serviceVisit.update({
    where: { id: row.id },
    data: {
      status: 'COMPLETED',
      checkOutAt: new Date(),
      completedAt: new Date(),
      ...(input.notes ? { notes: input.notes } : {}),
      updatedAt: new Date(),
    },
  })
  await auditMutation(actor, 'service.visit.completed', 'ServiceVisit', row.id, {
    visitId: row.id,
    workOrderId: row.workOrderId,
    ticketId: row.ticketId,
    classification: row.classification,
  })
  await serviceEvent('ServiceVisitCompleted', {
    entityType: 'SERVICE_VISIT',
    entityId: row.id,
    visitId: row.id,
    workOrderId: row.workOrderId,
    classification: row.classification,
  }, { aggregateId: row.id })
  return toVisitDto(updated)
}

export async function cancelVisit(id, actor = null) {
  const row = await findRecord('serviceVisit', id, 'Service visit', actor)
  assertServiceTransition('visit', row.status, 'CANCELLED')
  const updated = await db.serviceVisit.update({
    where: { id: row.id },
    data: { status: 'CANCELLED', cancelledAt: new Date(), updatedAt: new Date() },
  })
  await auditMutation(actor, 'service.visit.cancelled', 'ServiceVisit', row.id, {
    visitId: row.id,
    workOrderId: row.workOrderId,
    classification: row.classification,
  })
  return toVisitDto(updated)
}

// --------------------------------------------------------------- part usage

export async function listPartUsages(query = {}, actor = null) {
  const principal = principalOf(actor)
  const rows = await db.servicePartUsage.findMany({
    where: {
      ...serviceTenantWhere(principal.companyId, principal.branchId),
      ...(query.workOrderId ? { workOrderId: query.workOrderId } : {}),
      ...(query.itemId ? { itemId: query.itemId } : {}),
      ...(query.inventoryIssued === undefined ? {} : { inventoryIssued: query.inventoryIssued }),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limitOf(query.limit),
  })
  return rows.map(toPartUsageDto)
}

export async function getPartUsage(id, actor = null) {
  const row = await findRecord('servicePartUsage', id, 'Service part usage', actor)
  return toPartUsageDto(row)
}

export async function createPartUsage(input, actor = null) {
  const principal = principalOf(actor)
  const workOrder = await findRecord('workOrder', input.workOrderId, 'Work order', actor)
  if (!['DRAFT', 'SCHEDULED', 'IN_PROGRESS'].includes(workOrder.status)) {
    throw new HttpError(409, 'Parts can only be recorded on an open work order')
  }
  const item = await resolveItem(principal.companyId, input.itemId)
  const warehouse = await resolveWarehouse(principal.companyId, input.warehouseId)
  const batch = await resolveBatch(principal.companyId, item.id, input.batchId)
  const branchId = input.branchId || workOrder.branchId || null
  const unitPriceCents = input.unitPriceCents ?? input.unitCostCents
  const calculated = calculateServiceLine({ qty: input.qty, unitPriceCents })

  let inventoryIssued = false
  let issuedMovementId = null
  try {
    // eslint-disable-next-line no-await-in-loop
    const result = await issueStock({
      itemId: item.id,
      warehouseId: warehouse.id,
      batchId: batch?.id || null,
      quantity: calculated.qty,
      unitCostCents: input.unitCostCents,
      movementDate: isoDay(new Date()),
      branchId,
      classification: input.classification || 'INTERNAL',
      referenceType: 'SERVICE_PART_USAGE',
      referenceId: workOrder.id,
      notes: null,
      movementType: 'ISSUE',
    }, actor)
    inventoryIssued = true
    issuedMovementId = result?.movement?.id || null
  } catch (error) {
    if (!isStockBusinessConflict(error)) throw error
    // Insufficient stock or an unusable location is a business conflict: keep
    // the service record and flag the manual issue. DLP errors are not caught.
  }

  const row = await db.servicePartUsage.create({
    data: {
      companyId: principal.companyId,
      branchId,
      workOrderId: workOrder.id,
      ticketId: workOrder.ticketId,
      itemId: item.id,
      warehouseId: warehouse.id,
      batchId: batch?.id || null,
      qty: calculated.qty,
      unitCostCents: assertSafeIntegerCents(input.unitCostCents, 'Unit cost'),
      unitPriceCents: calculated.unitPriceCents,
      totalCents: calculated.totalCents,
      inventoryIssued,
      manualIssueRequired: !inventoryIssued,
      issuedMovementId,
      notes: input.notes || null,
      classification: input.classification || 'INTERNAL',
      createdById: principal.userId,
    },
  })
  await recalculateWorkOrder(workOrder)
  await auditMutation(actor, 'service.part_usage.created', 'ServicePartUsage', row.id, {
    partUsageId: row.id,
    workOrderId: workOrder.id,
    ticketId: workOrder.ticketId,
    inventoryIssued,
    classification: row.classification,
  })
  return toPartUsageDto(row)
}
