// Phase 7 sales lifecycle service.
//
// Header documents are tenant/branch scoped, numbered per company, linked to a
// CUSTOMER FinanceParty, and carry integer-cent totals. Free text is checked
// against DLP before persistence. Events and audit metadata contain IDs and
// classification only. Invoice creation delegates all tax arithmetic to the
// finance ledger and accepts only VERIFIED statutory VAT rate IDs.

import { db, getTenantContext } from './tenant.js'
import { emitEvent } from './events.js'
import { recordAudit, recordRequestAudit } from './audit.js'
import { HttpError } from './util.js'
import { inspectText, findingTypes } from '../../shared/src/dlp.js'
import { createInvoice, issueInvoice, resolveVerifiedRate, toInvoiceDto } from './finance.js'
import * as sharedEvents from '../../shared/src/events.js'
import { DEFAULT_COMPANY_ID } from '../../shared/src/constants.js'

const MAX_LIST = 200

// ------------------------------------------------------------- small helpers

function tenantId() {
  const ctx = getTenantContext() || {}
  return ctx.companyId || DEFAULT_COMPANY_ID
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

function principalOf(actor) {
  const ctx = getTenantContext() || {}
  return {
    userId: actor?.userId ?? ctx.actorId ?? null,
    companyId: actor?.companyId || ctx.companyId || DEFAULT_COMPANY_ID,
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

async function salesEvent(type, data, options = {}) {
  const eventType = sharedEvents[type] || type
  return emitEvent(eventType, data, { aggregateType: 'Sales', ...options })
}

function assertDlpSafe(value) {
  if (value === null || value === undefined || value === '') return
  const findings = inspectText(String(value))
  if (!findings.length) return
  const error = new HttpError(422, `Contains restricted data (${findingTypes(findings).join(', ')})`)
  error.types = findingTypes(findings)
  throw error
}

/** Tenant + optional branch scope. Branch scope allows organisation-wide rows. */
export function salesTenantWhere(companyId, branchId) {
  const scope = { companyId: companyId || tenantId() }
  if (branchId) {
    return {
      ...scope,
      OR: [{ branchId: null }, { branchId }],
    }
  }
  return scope
}

/**
 * Sales totals are computed from integer cents only. Fractional quantities are
 * rounded once, at line level; no floating-point tax rate enters these rows.
 */
export function calculateSalesLine({ qty, unitPriceCents } = {}) {
  const quantity = Number(qty)
  const price = Number(unitPriceCents)
  if (!Number.isFinite(quantity) || quantity <= 0) throw new HttpError(400, 'Quantity must be greater than zero')
  if (!Number.isSafeInteger(price) || price <= 0) throw new HttpError(400, 'Unit price must be a positive integer number of cents')
  const cents = Math.round(quantity * price)
  if (!Number.isSafeInteger(cents) || cents <= 0) throw new HttpError(400, 'Invalid line amount')
  return { netCents: cents, taxCents: 0, grossCents: cents }
}

export function calculateSalesTotals(lines) {
  if (!Array.isArray(lines) || lines.length === 0) throw new HttpError(400, 'At least one line is required')
  const totals = lines.reduce((acc, line) => {
    const calculation = line.netCents !== undefined
      ? {
        netCents: Number(line.netCents),
        taxCents: Number(line.taxCents || 0),
        grossCents: Number(line.grossCents ?? line.netCents),
      }
      : calculateSalesLine(line)
    if (![calculation.netCents, calculation.taxCents, calculation.grossCents].every(Number.isSafeInteger)) {
      throw new HttpError(400, 'Invalid line amount')
    }
    acc.subtotalCents += calculation.netCents
    acc.taxCents += calculation.taxCents
    acc.totalCents += calculation.grossCents
    return acc
  }, { subtotalCents: 0, taxCents: 0, totalCents: 0 })
  if (!Object.values(totals).every(Number.isSafeInteger)) throw new HttpError(400, 'Invalid document total')
  return totals
}

const TRANSITIONS = Object.freeze({
  quote: {
    DRAFT: ['SENT', 'ACCEPTED', 'CONVERTED', 'CANCELLED'],
    SENT: ['ACCEPTED', 'REJECTED', 'EXPIRED', 'CONVERTED', 'CANCELLED'],
    ACCEPTED: ['CONVERTED', 'CANCELLED'],
    REJECTED: [],
    CONVERTED: [],
    EXPIRED: [],
    CANCELLED: [],
  },
  order: {
    DRAFT: ['CONFIRMED', 'CANCELLED'],
    CONFIRMED: ['FULFILLED', 'CANCELLED'],
    FULFILLED: [],
    CANCELLED: [],
  },
  delivery: {
    DRAFT: ['ISSUED', 'CANCELLED'],
    ISSUED: ['IN_TRANSIT', 'DELIVERED', 'CANCELLED'],
    IN_TRANSIT: ['DELIVERED'],
    DELIVERED: [],
    CANCELLED: [],
  },
  return: {
    DRAFT: ['APPROVED', 'REJECTED', 'CANCELLED'],
    APPROVED: ['RECEIVED', 'REJECTED'],
    RECEIVED: [],
    REJECTED: [],
    CANCELLED: [],
  },
})

/** Pure state-machine guard shared by services and contract tests. */
export function assertDocumentTransition(type, from, to) {
  const allowed = TRANSITIONS[type]?.[from] || []
  if (!allowed.includes(to)) {
    throw new HttpError(409, `Cannot change ${type} from ${from} to ${to}`)
  }
  return true
}

export function assertInvoiceEligibility(order) {
  if (!order) throw new HttpError(404, 'Sales order not found')
  if (order.status !== 'CONFIRMED') {
    throw new HttpError(409, 'Only a confirmed sales order can be invoiced')
  }
  if (order.financeInvoiceId) {
    throw new HttpError(409, 'A finance invoice already exists for this order')
  }
  return true
}

/** Reject any UNVERIFIED, non-VAT or unknown rate before it reaches finance. */
export function assertVerifiedSalesRate(rate) {
  if (!rate) throw new HttpError(404, 'Statutory rate not found')
  if (rate.kind !== 'VAT') throw new HttpError(409, 'Only VAT statutory rates may be used')
  if (rate.status !== 'VERIFIED') throw new HttpError(409, 'Only VERIFIED statutory rates may be used')
  return rate
}

export async function resolveSalesInvoiceRate(companyId, onDate, rateId) {
  if (!rateId) return null
  const rate = await resolveVerifiedRate(companyId, onDate, rateId)
  return assertVerifiedSalesRate(rate)
}

/** Quote -> order projection. No rate value or money float is copied. */
export function quoteToOrderInput(quote, onDate = isoDay(new Date())) {
  if (!quote) throw new HttpError(404, 'Sales quote not found')
  return {
    partyId: quote.partyId,
    quoteId: quote.id,
    orderDate: onDate,
    requestedDate: quote.validUntil || null,
    currency: quote.currency,
    taxRateId: quote.taxRateId || null,
    notes: quote.notes || null,
    branchId: quote.branchId || null,
    classification: quote.classification,
    lines: (quote.lines || []).map((line) => ({
      description: line.description,
      qty: line.qty,
      unitPriceCents: line.unitPriceCents,
    })),
  }
}

export function deliveryFromOrderInput(order, deliveryDate = isoDay(new Date())) {
  if (!order) throw new HttpError(404, 'Sales order not found')
  if (!['CONFIRMED', 'FULFILLED'].includes(order.status)) {
    throw new HttpError(409, 'Delivery notes require a confirmed sales order')
  }
  return {
    orderId: order.id,
    partyId: order.partyId,
    deliveryDate,
    currency: order.currency,
    notes: order.notes || null,
    branchId: order.branchId || null,
    classification: order.classification,
    lines: (order.lines || []).map((line) => ({
      description: line.description,
      qty: line.qty,
      unitPriceCents: line.unitPriceCents,
    })),
  }
}

export function returnFromDeliveryInput(delivery, returnDate = isoDay(new Date())) {
  if (!delivery) throw new HttpError(404, 'Delivery note not found')
  return {
    deliveryNoteId: delivery.id,
    orderId: delivery.orderId || null,
    partyId: delivery.partyId,
    returnDate,
    currency: delivery.currency,
    classification: delivery.classification,
    lines: (delivery.lines || []).map((line) => ({
      description: line.description,
      qty: line.qty,
      unitPriceCents: line.unitPriceCents,
    })),
  }
}

// ------------------------------------------------------------------- DTOs

function lineDto(line) {
  return {
    id: line.id ?? null,
    description: line.description,
    qty: line.qty,
    unitPriceCents: line.unitPriceCents,
    netCents: line.netCents,
    taxCents: line.taxCents,
    grossCents: line.grossCents,
    position: line.position ?? null,
  }
}

/** DTOs intentionally omit companyId; clients never learn tenant internals. */
export function toQuoteDto(row, lines) {
  if (!row) return null
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    partyId: row.partyId,
    quoteDate: row.quoteDate,
    validUntil: row.validUntil ?? null,
    currency: row.currency,
    taxRateId: row.taxRateId ?? null,
    subtotalCents: row.subtotalCents,
    taxCents: row.taxCents,
    totalCents: row.totalCents,
    notes: row.notes ?? null,
    classification: row.classification,
    createdById: row.createdById ?? null,
    lines: (lines || row.lines || []).map(lineDto),
    createdAt: row.createdAt ?? null,
    updatedAt: row.updatedAt ?? null,
  }
}

export function toOrderDto(row, lines) {
  if (!row) return null
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    partyId: row.partyId,
    quoteId: row.quoteId ?? null,
    orderDate: row.orderDate,
    requestedDate: row.requestedDate ?? null,
    currency: row.currency,
    taxRateId: row.taxRateId ?? null,
    subtotalCents: row.subtotalCents,
    taxCents: row.taxCents,
    totalCents: row.totalCents,
    notes: row.notes ?? null,
    classification: row.classification,
    financeInvoiceId: row.financeInvoiceId ?? null,
    createdById: row.createdById ?? null,
    lines: (lines || row.lines || []).map(lineDto),
    createdAt: row.createdAt ?? null,
    updatedAt: row.updatedAt ?? null,
  }
}

export function toDeliveryDto(row, lines) {
  if (!row) return null
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    partyId: row.partyId,
    orderId: row.orderId ?? null,
    deliveryDate: row.deliveryDate,
    currency: row.currency,
    subtotalCents: row.subtotalCents,
    taxCents: row.taxCents,
    totalCents: row.totalCents,
    notes: row.notes ?? null,
    classification: row.classification,
    issuedAt: row.issuedAt ?? null,
    deliveredAt: row.deliveredAt ?? null,
    createdById: row.createdById ?? null,
    lines: (lines || row.lines || []).map(lineDto),
    createdAt: row.createdAt ?? null,
    updatedAt: row.updatedAt ?? null,
  }
}

export function toReturnDto(row, lines) {
  if (!row) return null
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    partyId: row.partyId,
    orderId: row.orderId ?? null,
    deliveryNoteId: row.deliveryNoteId ?? null,
    returnDate: row.returnDate,
    reason: row.reason ?? null,
    currency: row.currency,
    subtotalCents: row.subtotalCents,
    taxCents: row.taxCents,
    totalCents: row.totalCents,
    classification: row.classification,
    approvedAt: row.approvedAt ?? null,
    receivedAt: row.receivedAt ?? null,
    createdById: row.createdById ?? null,
    lines: (lines || row.lines || []).map(lineDto),
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
    const existing = await db[model].findFirst({
      where: { companyId, number: candidate },
      select: { id: true },
    })
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
    where: { ...salesTenantWhere(principal.companyId, principal.branchId), id },
  })
  if (!row) throw new HttpError(404, `${label} not found`)
  return row
}

function dateFieldFor(kind) {
  return {
    quote: 'quoteDate',
    order: 'orderDate',
    delivery: 'deliveryDate',
    return: 'returnDate',
  }[kind]
}

async function listDocuments(model, kind, query = {}, actor = null) {
  const principal = principalOf(actor)
  const dateField = dateFieldFor(kind)
  const dateFilter = query.from || query.to
    ? {
      [dateField]: {
        ...(query.from ? { gte: query.from } : {}),
        ...(query.to ? { lte: query.to } : {}),
      },
    }
    : {}
  return db[model].findMany({
    where: {
      ...salesTenantWhere(principal.companyId, principal.branchId),
      ...(query.status ? { status: query.status } : {}),
      ...(query.partyId ? { partyId: query.partyId } : {}),
      ...(query.orderId ? { orderId: query.orderId } : {}),
      ...(query.deliveryNoteId ? { deliveryNoteId: query.deliveryNoteId } : {}),
      ...dateFilter,
    },
    orderBy: [{ number: 'desc' }],
    take: limitOf(query.limit),
  })
}

async function linesOf(model, parentKey, parentId, companyId) {
  return db[model].findMany({
    where: { companyId, [parentKey]: parentId },
    orderBy: [{ position: 'asc' }, { id: 'asc' }],
  })
}

function normalizeLines(lines, context) {
  if (!Array.isArray(lines) || lines.length === 0) throw new HttpError(400, 'At least one line is required')
  return lines.map((line, position) => {
    assertDlpSafe(line.description)
    return {
      companyId: context.companyId,
      branchId: context.branchId || null,
      ...(context.parentId == null ? {} : { [context.parentKey]: context.parentId }),
      description: line.description,
      qty: Number(line.qty),
      unitPriceCents: Number(line.unitPriceCents),
      ...calculateSalesLine(line),
      position,
    }
  })
}

async function resolveCustomer(companyId, partyId) {
  const party = await db.financeParty.findFirst({
    where: { id: partyId, companyId, type: 'CUSTOMER' },
    select: { id: true },
  })
  if (!party) throw new HttpError(404, 'CUSTOMER party not found')
  return party.id
}

/** Only existence/kind is checked here; VERIFIED enforcement happens at issue. */
async function resolveRateReference(companyId, rateId) {
  if (!rateId) return null
  const rate = await db.statutoryRate.findFirst({
    where: { id: rateId, companyId, kind: 'VAT' },
    select: { id: true },
  })
  if (!rate) throw new HttpError(404, 'VAT statutory rate not found')
  return rate.id
}

// ------------------------------------------------------------------ quotes

export async function listQuotes(query = {}, actor = null) {
  const rows = await listDocuments('salesQuote', 'quote', query, actor)
  return rows.map((row) => toQuoteDto(row))
}

export async function getQuote(id, actor = null) {
  const row = await findRecord('salesQuote', id, 'Sales quote', actor)
  return toQuoteDto(row, await linesOf('salesQuoteLine', 'quoteId', row.id, row.companyId))
}

export async function createQuote(input, actor = null) {
  const principal = principalOf(actor)
  assertDlpSafe(input.notes)
  await resolveCustomer(principal.companyId, input.partyId)
  await resolveRateReference(principal.companyId, input.taxRateId)
  const lines = normalizeLines(input.lines, {
    companyId: principal.companyId,
    branchId: input.branchId,
    parentKey: 'quoteId',
    parentId: null,
  })
  const totals = calculateSalesTotals(lines)
  const row = await createWithNumber('salesQuote', 'QUO', (number) => ({
    companyId: principal.companyId,
    branchId: input.branchId || null,
    number,
    status: 'DRAFT',
    partyId: input.partyId,
    quoteDate: isoDay(input.quoteDate),
    validUntil: input.validUntil ? isoDay(input.validUntil) : null,
    currency: input.currency || 'KES',
    taxRateId: input.taxRateId || null,
    ...totals,
    notes: input.notes || null,
    classification: input.classification || 'INTERNAL',
    createdById: principal.userId,
    lines: { create: lines },
  }), principal.companyId)

  await auditMutation(actor, 'sales.quote.created', 'SalesQuote', row.id, {
    quoteId: row.id,
    classification: row.classification,
  })
  await salesEvent('SalesQuoteCreated', {
    entityType: 'SALES_QUOTE',
    entityId: row.id,
    quoteId: row.id,
    classification: row.classification,
  }, { aggregateId: row.id })
  return toQuoteDto(row, lines)
}

export async function updateQuote(id, input, actor = null) {
  const existing = await findRecord('salesQuote', id, 'Sales quote', actor)
  if (existing.status !== 'DRAFT') throw new HttpError(409, 'Only draft quotes can be updated')
  const principal = principalOf(actor)
  assertDlpSafe(input.notes)
  if (input.partyId) await resolveCustomer(principal.companyId, input.partyId)
  if (input.taxRateId) await resolveRateReference(principal.companyId, input.taxRateId)

  let lines = await linesOf('salesQuoteLine', 'quoteId', existing.id, existing.companyId)
  const update = {
    ...(input.partyId ? { partyId: input.partyId } : {}),
    ...(input.quoteDate ? { quoteDate: isoDay(input.quoteDate) } : {}),
    ...(input.validUntil !== undefined ? { validUntil: input.validUntil ? isoDay(input.validUntil) : null } : {}),
    ...(input.currency ? { currency: input.currency } : {}),
    ...(input.taxRateId !== undefined ? { taxRateId: input.taxRateId || null } : {}),
    ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
    ...(input.classification ? { classification: input.classification } : {}),
    ...(input.branchId !== undefined ? { branchId: input.branchId || null } : {}),
  }
  if (input.lines) {
    lines = normalizeLines(input.lines, {
      companyId: existing.companyId,
      branchId: input.branchId ?? existing.branchId,
      parentKey: 'quoteId',
      parentId: existing.id,
    })
    update.lines = { deleteMany: { where: { companyId: existing.companyId } }, create: lines }
    Object.assign(update, calculateSalesTotals(lines))
  }
  const row = await db.salesQuote.update({ where: { id: existing.id }, data: update })
  await auditMutation(actor, 'sales.quote.updated', 'SalesQuote', row.id, {
    quoteId: row.id,
    classification: row.classification,
  })
  return toQuoteDto(row, lines)
}

export async function convertQuoteToOrder(id, actor = null) {
  const quote = await findRecord('salesQuote', id, 'Sales quote', actor)
  assertDocumentTransition('quote', quote.status, 'CONVERTED')
  const lines = await linesOf('salesQuoteLine', 'quoteId', quote.id, quote.companyId)
  const input = quoteToOrderInput(quote)
  const principal = principalOf(actor)
  const normalized = normalizeLines(lines, {
    companyId: quote.companyId,
    branchId: input.branchId,
    parentKey: 'orderId',
    parentId: null,
  })
  const totals = calculateSalesTotals(normalized)
  const order = await createWithNumber('salesOrder', 'ORD', (number) => ({
    companyId: quote.companyId,
    branchId: quote.branchId,
    number,
    status: 'DRAFT',
    partyId: quote.partyId,
    quoteId: quote.id,
    orderDate: input.orderDate,
    requestedDate: input.requestedDate,
    currency: quote.currency,
    taxRateId: quote.taxRateId,
    ...totals,
    notes: quote.notes,
    classification: quote.classification,
    financeInvoiceId: null,
    createdById: principal.userId,
    lines: { create: normalized },
  }), quote.companyId)
  await db.salesQuote.update({ where: { id: quote.id }, data: { status: 'CONVERTED' } })

  await auditMutation(actor, 'sales.quote.converted', 'SalesQuote', quote.id, {
    quoteId: quote.id,
    orderId: order.id,
    classification: quote.classification,
  })
  await auditMutation(actor, 'sales.order.created', 'SalesOrder', order.id, {
    orderId: order.id,
    quoteId: quote.id,
    classification: order.classification,
  })
  return { quote: toQuoteDto({ ...quote, status: 'CONVERTED' }, lines), order: toOrderDto(order, normalized) }
}

// ------------------------------------------------------------------- orders

export async function listOrders(query = {}, actor = null) {
  const rows = await listDocuments('salesOrder', 'order', query, actor)
  return rows.map((row) => toOrderDto(row))
}

export async function getOrder(id, actor = null) {
  const row = await findRecord('salesOrder', id, 'Sales order', actor)
  return toOrderDto(row, await linesOf('salesOrderLine', 'orderId', row.id, row.companyId))
}

async function buildOrderInput(input, principal) {
  let base = input
  if (input.quoteId) {
    const quote = await findRecord('salesQuote', input.quoteId, 'Sales quote', {
      userId: principal.userId,
      companyId: principal.companyId,
      branchId: principal.branchId,
    })
    const projected = quoteToOrderInput(quote, input.orderDate)
    base = {
      ...projected,
      ...input,
      lines: input.lines?.length ? input.lines : projected.lines,
    }
  }
  await resolveCustomer(principal.companyId, base.partyId)
  await resolveRateReference(principal.companyId, base.taxRateId)
  assertDlpSafe(base.notes)
  const lines = normalizeLines(base.lines, {
    companyId: principal.companyId,
    branchId: base.branchId,
    parentKey: 'orderId',
    parentId: null,
  })
  return { base, lines, totals: calculateSalesTotals(lines) }
}

export async function createOrder(input, actor = null) {
  const principal = principalOf(actor)
  const { base, lines, totals } = await buildOrderInput(input, principal)
  const row = await createWithNumber('salesOrder', 'ORD', (number) => ({
    companyId: principal.companyId,
    branchId: base.branchId || null,
    number,
    status: 'DRAFT',
    partyId: base.partyId,
    quoteId: base.quoteId || null,
    orderDate: isoDay(base.orderDate),
    requestedDate: base.requestedDate ? isoDay(base.requestedDate) : null,
    currency: base.currency || 'KES',
    taxRateId: base.taxRateId || null,
    ...totals,
    notes: base.notes || null,
    classification: base.classification || 'INTERNAL',
    financeInvoiceId: null,
    createdById: principal.userId,
    lines: { create: lines },
  }), principal.companyId)
  await auditMutation(actor, 'sales.order.created', 'SalesOrder', row.id, {
    orderId: row.id,
    ...(row.quoteId ? { quoteId: row.quoteId } : {}),
    classification: row.classification,
  })
  return toOrderDto(row, lines)
}

export async function updateOrder(id, input, actor = null) {
  const existing = await findRecord('salesOrder', id, 'Sales order', actor)
  if (existing.status !== 'DRAFT') throw new HttpError(409, 'Only draft orders can be updated')
  const principal = principalOf(actor)
  if (input.partyId) await resolveCustomer(principal.companyId, input.partyId)
  if (input.taxRateId) await resolveRateReference(principal.companyId, input.taxRateId)
  assertDlpSafe(input.notes)

  let lines = await linesOf('salesOrderLine', 'orderId', existing.id, existing.companyId)
  const update = {
    ...(input.partyId ? { partyId: input.partyId } : {}),
    ...(input.requestedDate !== undefined ? { requestedDate: input.requestedDate ? isoDay(input.requestedDate) : null } : {}),
    ...(input.currency ? { currency: input.currency } : {}),
    ...(input.taxRateId !== undefined ? { taxRateId: input.taxRateId || null } : {}),
    ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
    ...(input.classification ? { classification: input.classification } : {}),
    ...(input.branchId !== undefined ? { branchId: input.branchId || null } : {}),
  }
  if (input.lines) {
    lines = normalizeLines(input.lines, {
      companyId: existing.companyId,
      branchId: input.branchId ?? existing.branchId,
      parentKey: 'orderId',
      parentId: existing.id,
    })
    update.lines = { deleteMany: { where: { companyId: existing.companyId } }, create: lines }
    Object.assign(update, calculateSalesTotals(lines))
  }
  const row = await db.salesOrder.update({ where: { id: existing.id }, data: update })
  await auditMutation(actor, 'sales.order.updated', 'SalesOrder', row.id, {
    orderId: row.id,
    classification: row.classification,
  })
  return toOrderDto(row, lines)
}

export async function confirmOrder(id, actor = null) {
  const existing = await findRecord('salesOrder', id, 'Sales order', actor)
  assertDocumentTransition('order', existing.status, 'CONFIRMED')
  const row = await db.salesOrder.update({ where: { id: existing.id }, data: { status: 'CONFIRMED' } })
  await auditMutation(actor, 'sales.order.confirmed', 'SalesOrder', row.id, {
    orderId: row.id,
    ...(row.quoteId ? { quoteId: row.quoteId } : {}),
    classification: row.classification,
  })
  await salesEvent('SalesOrderConfirmed', {
    entityType: 'SALES_ORDER',
    entityId: row.id,
    orderId: row.id,
    ...(row.quoteId ? { quoteId: row.quoteId } : {}),
    classification: row.classification,
  }, { aggregateId: row.id })
  return toOrderDto(row, await linesOf('salesOrderLine', 'orderId', row.id, row.companyId))
}

// ------------------------------------------------------------ delivery notes

export async function listDeliveryNotes(query = {}, actor = null) {
  const rows = await listDocuments('deliveryNote', 'delivery', query, actor)
  return rows.map((row) => toDeliveryDto(row))
}

export async function getDeliveryNote(id, actor = null) {
  const row = await findRecord('deliveryNote', id, 'Delivery note', actor)
  return toDeliveryDto(row, await linesOf('deliveryNoteLine', 'deliveryNoteId', row.id, row.companyId))
}

async function buildDeliveryInput(input, principal) {
  let base = input
  if (input.orderId) {
    const order = await findRecord('salesOrder', input.orderId, 'Sales order', {
      userId: principal.userId,
      companyId: principal.companyId,
      branchId: principal.branchId,
    })
    const projected = deliveryFromOrderInput(order, input.deliveryDate)
    base = {
      ...projected,
      ...input,
      lines: input.lines?.length ? input.lines : projected.lines,
      partyId: input.partyId || projected.partyId,
      currency: input.currency || projected.currency,
    }
  }
  await resolveCustomer(principal.companyId, base.partyId)
  assertDlpSafe(base.notes)
  const lines = normalizeLines(base.lines, {
    companyId: principal.companyId,
    branchId: base.branchId,
    parentKey: 'deliveryNoteId',
    parentId: null,
  })
  return { base, lines, totals: calculateSalesTotals(lines) }
}

export async function createDeliveryNote(input, actor = null) {
  const principal = principalOf(actor)
  const { base, lines, totals } = await buildDeliveryInput(input, principal)
  const row = await createWithNumber('deliveryNote', 'DN', (number) => ({
    companyId: principal.companyId,
    branchId: base.branchId || null,
    number,
    status: 'DRAFT',
    partyId: base.partyId,
    orderId: base.orderId || null,
    deliveryDate: isoDay(base.deliveryDate),
    currency: base.currency || 'KES',
    ...totals,
    notes: base.notes || null,
    classification: base.classification || 'INTERNAL',
    issuedAt: null,
    deliveredAt: null,
    createdById: principal.userId,
    lines: { create: lines },
  }), principal.companyId)
  await auditMutation(actor, 'sales.delivery.created', 'DeliveryNote', row.id, {
    deliveryNoteId: row.id,
    ...(row.orderId ? { orderId: row.orderId } : {}),
    classification: row.classification,
  })
  return toDeliveryDto(row, lines)
}

export async function updateDeliveryNote(id, input, actor = null) {
  const existing = await findRecord('deliveryNote', id, 'Delivery note', actor)
  if (existing.status !== 'DRAFT') throw new HttpError(409, 'Only draft delivery notes can be updated')
  const principal = principalOf(actor)
  if (input.partyId) await resolveCustomer(principal.companyId, input.partyId)
  assertDlpSafe(input.notes)

  let lines = await linesOf('deliveryNoteLine', 'deliveryNoteId', existing.id, existing.companyId)
  const update = {
    ...(input.partyId ? { partyId: input.partyId } : {}),
    ...(input.deliveryDate ? { deliveryDate: isoDay(input.deliveryDate) } : {}),
    ...(input.currency ? { currency: input.currency } : {}),
    ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
    ...(input.classification ? { classification: input.classification } : {}),
    ...(input.branchId !== undefined ? { branchId: input.branchId || null } : {}),
  }
  if (input.lines) {
    lines = normalizeLines(input.lines, {
      companyId: existing.companyId,
      branchId: input.branchId ?? existing.branchId,
      parentKey: 'deliveryNoteId',
      parentId: existing.id,
    })
    update.lines = { deleteMany: { where: { companyId: existing.companyId } }, create: lines }
    Object.assign(update, calculateSalesTotals(lines))
  }
  const row = await db.deliveryNote.update({ where: { id: existing.id }, data: update })
  await auditMutation(actor, 'sales.delivery.updated', 'DeliveryNote', row.id, {
    deliveryNoteId: row.id,
    classification: row.classification,
  })
  return toDeliveryDto(row, lines)
}

export async function issueDeliveryNote(id, actor = null) {
  const existing = await findRecord('deliveryNote', id, 'Delivery note', actor)
  assertDocumentTransition('delivery', existing.status, 'ISSUED')
  const row = await db.deliveryNote.update({
    where: { id: existing.id },
    data: { status: 'ISSUED', issuedAt: new Date() },
  })
  await auditMutation(actor, 'sales.delivery.issued', 'DeliveryNote', row.id, {
    deliveryNoteId: row.id,
    ...(row.orderId ? { orderId: row.orderId } : {}),
    classification: row.classification,
  })
  await salesEvent('DeliveryNoteIssued', {
    entityType: 'DELIVERY_NOTE',
    entityId: row.id,
    deliveryNoteId: row.id,
    ...(row.orderId ? { orderId: row.orderId } : {}),
    classification: row.classification,
  }, { aggregateId: row.id })
  return toDeliveryDto(row, await linesOf('deliveryNoteLine', 'deliveryNoteId', row.id, row.companyId))
}

export async function deliverDeliveryNote(id, actor = null) {
  const existing = await findRecord('deliveryNote', id, 'Delivery note', actor)
  const target = 'DELIVERED'
  assertDocumentTransition('delivery', existing.status, target)
  const row = await db.deliveryNote.update({
    where: { id: existing.id },
    data: { status: target, deliveredAt: new Date() },
  })
  await auditMutation(actor, 'sales.delivery.delivered', 'DeliveryNote', row.id, {
    deliveryNoteId: row.id,
    classification: row.classification,
  })
  return toDeliveryDto(row, await linesOf('deliveryNoteLine', 'deliveryNoteId', row.id, row.companyId))
}

// -------------------------------------------------------------- sales returns

export async function listReturns(query = {}, actor = null) {
  const rows = await listDocuments('salesReturn', 'return', query, actor)
  return rows.map((row) => toReturnDto(row))
}

export async function getReturn(id, actor = null) {
  const row = await findRecord('salesReturn', id, 'Sales return', actor)
  return toReturnDto(row, await linesOf('salesReturnLine', 'returnId', row.id, row.companyId))
}

async function buildReturnInput(input, principal) {
  let base = input
  if (input.deliveryNoteId) {
    const delivery = await findRecord('deliveryNote', input.deliveryNoteId, 'Delivery note', {
      userId: principal.userId,
      companyId: principal.companyId,
      branchId: principal.branchId,
    })
    const projected = returnFromDeliveryInput(delivery, input.returnDate)
    base = {
      ...projected,
      ...input,
      lines: input.lines?.length ? input.lines : projected.lines,
      partyId: input.partyId || projected.partyId,
      currency: input.currency || projected.currency,
    }
  } else if (input.orderId) {
    const order = await findRecord('salesOrder', input.orderId, 'Sales order', {
      userId: principal.userId,
      companyId: principal.companyId,
      branchId: principal.branchId,
    })
    base = {
      ...base,
      lines: input.lines?.length ? input.lines : (order.lines || []).map((line) => ({
        description: line.description,
        qty: line.qty,
        unitPriceCents: line.unitPriceCents,
      })),
      partyId: input.partyId || order.partyId,
      currency: input.currency || order.currency,
      branchId: input.branchId || order.branchId,
      classification: input.classification || order.classification,
    }
  }
  await resolveCustomer(principal.companyId, base.partyId)
  assertDlpSafe(base.reason)
  let sourceLines = base.lines
  if (input.orderId && (!sourceLines || sourceLines.length === 0)) {
    sourceLines = await linesOf('salesOrderLine', 'orderId', input.orderId, principal.companyId)
  }
  const lines = normalizeLines(sourceLines, {
    companyId: principal.companyId,
    branchId: base.branchId,
    parentKey: 'returnId',
    parentId: null,
  })
  return { base, lines, totals: calculateSalesTotals(lines) }
}

export async function createReturn(input, actor = null) {
  const principal = principalOf(actor)
  const { base, lines, totals } = await buildReturnInput(input, principal)
  const row = await createWithNumber('salesReturn', 'RET', (number) => ({
    companyId: principal.companyId,
    branchId: base.branchId || null,
    number,
    status: 'DRAFT',
    partyId: base.partyId,
    orderId: base.orderId || null,
    deliveryNoteId: base.deliveryNoteId || null,
    returnDate: isoDay(base.returnDate),
    reason: base.reason || null,
    currency: base.currency || 'KES',
    ...totals,
    classification: base.classification || 'INTERNAL',
    approvedAt: null,
    receivedAt: null,
    createdById: principal.userId,
    lines: { create: lines },
  }), principal.companyId)
  await auditMutation(actor, 'sales.return.created', 'SalesReturn', row.id, {
    returnId: row.id,
    ...(row.orderId ? { orderId: row.orderId } : {}),
    ...(row.deliveryNoteId ? { deliveryNoteId: row.deliveryNoteId } : {}),
    classification: row.classification,
  })
  return toReturnDto(row, lines)
}

export async function updateReturn(id, input, actor = null) {
  const existing = await findRecord('salesReturn', id, 'Sales return', actor)
  if (existing.status !== 'DRAFT') throw new HttpError(409, 'Only draft returns can be updated')
  assertDlpSafe(input.reason)

  let lines = await linesOf('salesReturnLine', 'returnId', existing.id, existing.companyId)
  const update = {
    ...(input.reason !== undefined ? { reason: input.reason || null } : {}),
    ...(input.currency ? { currency: input.currency } : {}),
    ...(input.classification ? { classification: input.classification } : {}),
    ...(input.branchId !== undefined ? { branchId: input.branchId || null } : {}),
  }
  if (input.lines) {
    lines = normalizeLines(input.lines, {
      companyId: existing.companyId,
      branchId: input.branchId ?? existing.branchId,
      parentKey: 'returnId',
      parentId: existing.id,
    })
    update.lines = { deleteMany: { where: { companyId: existing.companyId } }, create: lines }
    Object.assign(update, calculateSalesTotals(lines))
  }
  const row = await db.salesReturn.update({ where: { id: existing.id }, data: update })
  await auditMutation(actor, 'sales.return.updated', 'SalesReturn', row.id, {
    returnId: row.id,
    classification: row.classification,
  })
  return toReturnDto(row, lines)
}

export async function approveReturn(id, actor = null) {
  const existing = await findRecord('salesReturn', id, 'Sales return', actor)
  assertDocumentTransition('return', existing.status, 'APPROVED')
  const row = await db.salesReturn.update({
    where: { id: existing.id },
    data: { status: 'APPROVED', approvedAt: new Date() },
  })
  await auditMutation(actor, 'sales.return.approved', 'SalesReturn', row.id, {
    returnId: row.id,
    ...(row.orderId ? { orderId: row.orderId } : {}),
    ...(row.deliveryNoteId ? { deliveryNoteId: row.deliveryNoteId } : {}),
    classification: row.classification,
  })
  await salesEvent('SalesReturnApproved', {
    entityType: 'SALES_RETURN',
    entityId: row.id,
    returnId: row.id,
    ...(row.deliveryNoteId ? { deliveryNoteId: row.deliveryNoteId } : {}),
    ...(row.orderId ? { orderId: row.orderId } : {}),
    classification: row.classification,
  }, { aggregateId: row.id })
  return toReturnDto(row, await linesOf('salesReturnLine', 'returnId', row.id, row.companyId))
}

export async function receiveReturn(id, actor = null) {
  const existing = await findRecord('salesReturn', id, 'Sales return', actor)
  assertDocumentTransition('return', existing.status, 'RECEIVED')
  const row = await db.salesReturn.update({
    where: { id: existing.id },
    data: { status: 'RECEIVED', receivedAt: new Date() },
  })
  await auditMutation(actor, 'sales.return.received', 'SalesReturn', row.id, {
    returnId: row.id,
    classification: row.classification,
  })
  return toReturnDto(row, await linesOf('salesReturnLine', 'returnId', row.id, row.companyId))
}

// -------------------------------------------------------- invoice from order

/**
 * Creates and issues a finance sales invoice from a confirmed order.
 * A supplied taxRateId is resolved through finance's verified-rate guard before
 * any write. If omitted, no rate is injected here: finance.issueInvoice applies
 * its own effective VERIFIED-rate rule and rejects when none is available.
 */
export async function createInvoiceFromOrder(orderId, input = {}, actor = null) {
  const order = await findRecord('salesOrder', orderId, 'Sales order', actor)
  assertInvoiceEligibility(order)
  const lines = await linesOf('salesOrderLine', 'orderId', order.id, order.companyId)
  if (!lines.length) throw new HttpError(409, 'Sales order has no lines')

  const issueDate = isoDay(input.issueDate || new Date())
  const rateId = input.taxRateId || order.taxRateId || null
  const rate = await resolveSalesInvoiceRate(order.companyId, issueDate, rateId)

  const invoice = await createInvoice({
    direction: 'SALES',
    type: 'INVOICE',
    partyId: order.partyId,
    issueDate,
    dueDate: input.dueDate ? isoDay(input.dueDate) : null,
    currency: order.currency,
    taxInclusive: false,
    taxRateId: rate?.id || undefined,
    lines: lines.map((line) => ({
      description: line.description,
      qty: line.qty,
      unitPriceCents: line.unitPriceCents,
    })),
    notes: input.notes || order.notes || null,
    classification: order.classification,
    branchId: order.branchId,
  }, actor)

  const issued = await issueInvoice(invoice.id, rate ? { taxRateId: rate.id } : {}, actor)
  await db.salesOrder.update({
    where: { id: order.id },
    data: { financeInvoiceId: issued.id },
  })

  await auditMutation(actor, 'sales.invoice.created', 'SalesOrder', order.id, {
    orderId: order.id,
    invoiceId: issued.id,
    classification: order.classification,
  })
  await salesEvent('SalesInvoiceCreated', {
    entityType: 'FINANCE_INVOICE',
    entityId: issued.id,
    invoiceId: issued.id,
    orderId: order.id,
    classification: order.classification,
  }, { aggregateId: issued.id })

  return { invoice: toInvoiceDto(issued), orderId: order.id }
}
