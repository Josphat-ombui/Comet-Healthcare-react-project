// Phase 9 procurement lifecycle service.
//
// Header documents are tenant/branch scoped, numbered per company, linked to
// existing FinanceParty SUPPLIER rows, and carry integer-cent totals. Lines
// reference InventoryItem and an optional Warehouse. Goods receipts and
// supplier returns are the only places that move stock, and they delegate to
// the Phase 8 inventory ledger. Three-way matching is a read-only comparison:
// it never posts finance journals, payments or invoice mutations.
//
// Audit metadata and domain events contain IDs and classification only.

import { db, getTenantContext } from './tenant.js'
import { emitEvent } from './events.js'
import { recordAudit, recordRequestAudit } from './audit.js'
import { HttpError } from './util.js'
import { config } from './config.js'
import { issueStock, receiveStock, roundCountedQuantity, roundQuantity } from './inventory.js'
import { DEFAULT_COMPANY_ID } from '../../shared/src/constants.js'

const MAX_LIST = 200
const QTY_PRECISION = 1000

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

async function procurementEvent(type, data, options = {}) {
  return emitEvent(type, data, { aggregateType: 'Procurement', ...options })
}

function assertSafeIntegerCents(value, label = 'Amount') {
  const cents = Number(value)
  if (!Number.isSafeInteger(cents) || cents < 0) {
    throw new HttpError(400, `${label} must be a non-negative integer number of cents`)
  }
  return cents
}

function assertPositiveCents(value, label = 'Unit cost') {
  const cents = Number(value)
  if (!Number.isSafeInteger(cents) || cents <= 0) {
    throw new HttpError(400, `${label} must be a positive integer number of cents`)
  }
  return cents
}

/** Tenant + optional branch scope. Branch scope allows organisation-wide rows. */
export function procurementTenantWhere(companyId, branchId) {
  const scope = { companyId: companyId || tenantId() }
  if (branchId) return { ...scope, OR: [{ branchId: null }, { branchId }] }
  return scope
}

/**
 * Line value in whole cents. The fractional quantity is scaled to thousandths
 * and rounded once using integer arithmetic; no fractional cent is persisted.
 */
export function calculateProcurementLine({ qty, unitCostCents } = {}) {
  const quantity = roundQuantity(qty)
  const price = assertPositiveCents(unitCostCents)
  const milliQty = BigInt(Math.round(quantity * QTY_PRECISION))
  const cents = Number((milliQty * BigInt(price) + 500n) / 1000n)
  if (!Number.isSafeInteger(cents) || cents <= 0) throw new HttpError(400, 'Invalid line amount')
  return { qty: quantity, unitCostCents: price, totalCents: cents }
}

export function calculateProcurementTotals(lines) {
  if (!Array.isArray(lines) || lines.length === 0) throw new HttpError(400, 'At least one line is required')
  const totalCents = lines.reduce((sum, line) => {
    const value = line.totalCents !== undefined
      ? assertSafeIntegerCents(line.totalCents)
      : calculateProcurementLine(line).totalCents
    return sum + value
  }, 0)
  if (!Number.isSafeInteger(totalCents)) throw new HttpError(400, 'Invalid document total')
  return { totalCents }
}

const TRANSITIONS = Object.freeze({
  requisition: {
    DRAFT: ['SUBMITTED', 'CANCELLED'],
    SUBMITTED: ['APPROVED', 'REJECTED', 'CANCELLED'],
    APPROVED: ['CONVERTED', 'CANCELLED'],
    REJECTED: [],
    CONVERTED: [],
    CANCELLED: [],
  },
  order: {
    DRAFT: ['APPROVED', 'CANCELLED'],
    APPROVED: ['SENT', 'CANCELLED'],
    SENT: ['PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'],
    PARTIALLY_RECEIVED: ['PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'],
    RECEIVED: [],
    CANCELLED: [],
  },
  receipt: {
    DRAFT: ['RECEIVED', 'CANCELLED'],
    RECEIVED: ['INSPECTED', 'REJECTED'],
    INSPECTED: [],
    REJECTED: [],
    CANCELLED: [],
  },
  return: {
    DRAFT: ['APPROVED', 'REJECTED', 'CANCELLED'],
    APPROVED: ['SENT', 'RECEIVED', 'CANCELLED'],
    SENT: ['RECEIVED', 'CANCELLED'],
    RECEIVED: [],
    REJECTED: [],
    CANCELLED: [],
  },
  match: {
    PENDING: ['MATCHED', 'DISCREPANCY'],
    MATCHED: ['APPROVED', 'REJECTED'],
    DISCREPANCY: ['APPROVED', 'REJECTED'],
    APPROVED: [],
    REJECTED: [],
  },
})

/** Pure state-machine guard shared by services and contract tests. */
export function assertProcurementTransition(type, from, to) {
  const allowed = TRANSITIONS[type]?.[from] || []
  if (!allowed.includes(to)) {
    throw new HttpError(409, `Cannot change ${type} from ${from} to ${to}`)
  }
  return true
}

/** Requisition -> order projection. No tolerance or tax value is copied. */
export function requisitionToOrderInput(requisition, supplierId, orderDate = isoDay(new Date())) {
  if (!requisition) throw new HttpError(404, 'Purchase requisition not found')
  if (requisition.status !== 'APPROVED') {
    throw new HttpError(409, 'Only an approved requisition can be converted')
  }
  return {
    supplierId: requisition.supplierId || supplierId,
    requisitionId: requisition.id,
    orderDate,
    expectedDate: requisition.requiredDate || null,
    currency: requisition.currency,
    notes: requisition.notes || null,
    branchId: requisition.branchId || null,
    classification: requisition.classification,
    lines: (requisition.lines || []).map((line) => ({
      itemId: line.itemId,
      warehouseId: line.warehouseId || null,
      description: line.description,
      qty: line.qty,
      unitCostCents: line.unitCostCents,
    })),
  }
}

/**
 * Ordered/received quantity projection. A line is open until its received
 * quantity reaches the ordered quantity; the header follows its lines.
 */
export function calculateReceiptProgress(lines, receipts = []) {
  const orderLines = Array.isArray(lines) ? lines : []
  const receivedByLine = new Map()
  for (const receipt of receipts) {
    for (const line of receipt.lines || []) {
      const key = line.orderLineId
      if (!key) continue
      receivedByLine.set(key, (receivedByLine.get(key) || 0) + Number(line.qty || 0))
    }
  }
  const progressed = orderLines.map((line) => {
    const receivedQty = roundCountedQuantity(Number(line.receivedQty ?? receivedByLine.get(line.id) ?? 0))
    const orderedQty = roundQuantity(line.qty)
    return {
      id: line.id,
      qty: orderedQty,
      receivedQty,
      remainingQty: Math.max(0, Math.round((orderedQty - receivedQty) * QTY_PRECISION) / QTY_PRECISION),
      lineStatus: receivedQty >= orderedQty ? 'RECEIVED' : 'PARTIALLY_RECEIVED',
    }
  })
  const fullyReceived = progressed.length > 0 && progressed.every((line) => line.lineStatus === 'RECEIVED')
  return {
    lines: progressed,
    status: fullyReceived ? 'RECEIVED' : 'PARTIALLY_RECEIVED',
  }
}

/**
 * Cent-exact three-way comparison. `expectedCents` is the value of received
 * quantity at ordered unit cost. Tolerance is a business setting only; it is
 * never derived from a statutory rate and never used to compute tax.
 */
export function calculateThreeWayMatch({ orderLines = [], receiptLines = [], invoiceTotalCents = null, toleranceBps = 0 } = {}) {
  const orderLineMap = new Map(orderLines.map((line) => [line.id, line]))
  let expectedCents = 0
  let receiptActualCents = 0
  let receivedQuantity = 0
  let orderedQuantity = 0

  for (const line of receiptLines) {
    const orderLine = orderLineMap.get(line.orderLineId)
    if (!orderLine) throw new HttpError(409, 'Receipt line does not belong to the purchase order')
    const qty = roundQuantity(line.qty)
    expectedCents += calculateProcurementLine({ qty, unitCostCents: orderLine.unitCostCents }).totalCents
    receiptActualCents += assertSafeIntegerCents(line.totalCents, 'Receipt line total')
    receivedQuantity += qty
  }
  for (const line of orderLines) orderedQuantity += roundQuantity(line.qty)

  const invoice = invoiceTotalCents === null || invoiceTotalCents === undefined
    ? null
    : assertSafeIntegerCents(invoiceTotalCents, 'Invoice total')
  const priceVarianceCents = receiptActualCents - expectedCents
  const invoiceVarianceCents = invoice === null ? null : invoice - expectedCents
  const allowedCents = Number((BigInt(expectedCents) * BigInt(Math.max(0, Number(toleranceBps) || 0))) / 10000n)
  const withinReceipt = Math.abs(priceVarianceCents) <= allowedCents
  const withinInvoice = invoiceVarianceCents === null || Math.abs(invoiceVarianceCents) <= allowedCents
  const status = withinReceipt && withinInvoice ? 'MATCHED' : 'DISCREPANCY'

  return {
    expectedCents,
    receiptActualCents,
    invoiceTotalCents: invoice,
    priceVarianceCents,
    invoiceVarianceCents,
    quantityVarianceQty: Math.round((receivedQuantity - orderedQuantity) * QTY_PRECISION) / QTY_PRECISION,
    toleranceBps: Math.max(0, Number(toleranceBps) || 0),
    status,
  }
}

export function assertReleasedBatch(batch) {
  if (!batch) return null
  if (batch.status !== 'RELEASED') {
    throw new HttpError(409, 'Only RELEASED batches may be consumed by procurement')
  }
  return batch
}

/** Pure item guard so lifecycle rules are testable without a database. */
export function assertProcurementItemActive(item) {
  if (!item) throw new HttpError(404, 'Inventory item not found')
  if (!item.isActive) throw new HttpError(409, 'Inventory item is inactive')
  return item
}

// ------------------------------------------------------------------- DTOs

function lineDto(line) {
  return {
    id: line.id ?? null,
    itemId: line.itemId,
    itemCode: line.item?.code ?? null,
    warehouseId: line.warehouseId ?? null,
    warehouseCode: line.warehouse?.code ?? null,
    batchId: line.batchId ?? null,
    description: line.description ?? null,
    qty: line.qty,
    unitCostCents: line.unitCostCents,
    totalCents: line.totalCents,
    receivedQty: line.receivedQty ?? null,
    orderLineId: line.orderLineId ?? null,
    receiptLineId: line.receiptLineId ?? null,
    position: line.position ?? 0,
    classification: line.classification,
  }
}

export function toRequisitionDto(row, lines = []) {
  if (!row) return null
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    requisitionDate: row.requisitionDate,
    requiredDate: row.requiredDate ?? null,
    supplierId: row.supplierId ?? null,
    currency: row.currency,
    totalCents: row.totalCents,
    notes: row.notes ?? null,
    classification: row.classification,
    lines: (lines || row.lines || []).map(lineDto),
    createdAt: row.createdAt ?? null,
    updatedAt: row.updatedAt ?? null,
  }
}

export function toOrderDto(row, lines = []) {
  if (!row) return null
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    orderDate: row.orderDate,
    expectedDate: row.expectedDate ?? null,
    supplierId: row.supplierId,
    requisitionId: row.requisitionId ?? null,
    financeInvoiceId: row.financeInvoiceId ?? null,
    currency: row.currency,
    totalCents: row.totalCents,
    notes: row.notes ?? null,
    classification: row.classification,
    lines: (lines || row.lines || []).map(lineDto),
    createdAt: row.createdAt ?? null,
    updatedAt: row.updatedAt ?? null,
  }
}

export function toReceiptDto(row, lines = []) {
  if (!row) return null
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    receiptDate: row.receiptDate,
    orderId: row.orderId,
    supplierId: row.supplierId,
    financeInvoiceId: row.financeInvoiceId ?? null,
    currency: row.currency,
    totalCents: row.totalCents,
    notes: row.notes ?? null,
    classification: row.classification,
    lines: (lines || row.lines || []).map(lineDto),
    createdAt: row.createdAt ?? null,
    updatedAt: row.updatedAt ?? null,
  }
}

export function toReturnDto(row, lines = []) {
  if (!row) return null
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    returnDate: row.returnDate,
    orderId: row.orderId,
    receiptId: row.receiptId ?? null,
    supplierId: row.supplierId,
    reason: row.reason ?? null,
    currency: row.currency,
    totalCents: row.totalCents,
    classification: row.classification,
    lines: (lines || row.lines || []).map(lineDto),
    createdAt: row.createdAt ?? null,
    updatedAt: row.updatedAt ?? null,
  }
}

export function toMatchDto(row) {
  if (!row) return null
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    orderId: row.orderId,
    receiptId: row.receiptId ?? null,
    supplierId: row.supplierId,
    financeInvoiceId: row.financeInvoiceId ?? null,
    poTotalCents: row.poTotalCents,
    receiptTotalCents: row.receiptTotalCents,
    invoiceTotalCents: row.invoiceTotalCents ?? null,
    priceVarianceCents: row.priceVarianceCents,
    invoiceVarianceCents: row.invoiceVarianceCents ?? null,
    quantityVarianceQty: row.quantityVarianceQty,
    toleranceBps: row.toleranceBps,
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
    where: { ...procurementTenantWhere(principal.companyId, principal.branchId), id },
  })
  if (!row) throw new HttpError(404, `${label} not found`)
  return row
}

const LINE_INCLUDE = { item: true, warehouse: true }
const RECEIPT_LINE_INCLUDE = { item: true, warehouse: true, batch: true }

async function linesOf(model, parentKey, parentId, companyId, include = LINE_INCLUDE) {
  return db[model].findMany({
    where: { companyId, [parentKey]: parentId },
    include,
    orderBy: [{ position: 'asc' }, { id: 'asc' }],
  })
}

function normalizeLines(lines, context) {
  if (!Array.isArray(lines) || lines.length === 0) throw new HttpError(400, 'At least one line is required')
  return lines.map((line, position) => {
    const calculated = calculateProcurementLine({ qty: line.qty, unitCostCents: line.unitCostCents })
    return {
      companyId: context.companyId,
      branchId: context.branchId || null,
      ...(context.parentKey ? { [context.parentKey]: context.parentId } : {}),
      itemId: line.itemId,
      warehouseId: line.warehouseId || null,
      description: line.description || 'Procurement line',
      qty: calculated.qty,
      unitCostCents: calculated.unitCostCents,
      totalCents: calculated.totalCents,
      position: Number.isInteger(line.position) ? line.position : position,
      classification: context.classification || 'INTERNAL',
      createdById: context.userId || null,
    }
  })
}

async function resolveSupplier(companyId, supplierId) {
  if (!supplierId) return null
  const party = await db.financeParty.findFirst({
    where: { id: supplierId, companyId, type: 'SUPPLIER' },
    select: { id: true },
  })
  if (!party) throw new HttpError(404, 'SUPPLIER party not found')
  return party.id
}

async function resolveInvoice(companyId, invoiceId) {
  if (!invoiceId) return null
  const invoice = await db.financeInvoice.findFirst({
    where: { id: invoiceId, companyId },
    select: { id: true, totalCents: true },
  })
  if (!invoice) throw new HttpError(404, 'Finance invoice not found')
  return invoice
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
  return assertReleasedBatch(batch)
}

async function assertActiveItem(companyId, itemId) {
  const item = await db.inventoryItem.findFirst({ where: { id: itemId, companyId } })
  return assertProcurementItemActive(item)
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
    ...procurementTenantWhere(principal.companyId, principal.branchId),
    ...(query.status ? { status: query.status } : {}),
    ...extra,
  }
}

// ------------------------------------------------------------- requisitions

export async function listRequisitions(query = {}, actor = null) {
  const principal = principalOf(actor)
  const rows = await db.purchaseRequisition.findMany({
    where: listWhere(principal, query, {
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      ...dateFilterFor('requisitionDate', query),
    }),
    orderBy: [{ number: 'desc' }],
    take: limitOf(query.limit),
  })
  return rows.map((row) => toRequisitionDto(row))
}

export async function getRequisition(id, actor = null) {
  const row = await findRecord('purchaseRequisition', id, 'Purchase requisition', actor)
  return toRequisitionDto(row, await linesOf('purchaseRequisitionLine', 'requisitionId', row.id, row.companyId))
}

export async function createRequisition(input, actor = null) {
  const principal = principalOf(actor)
  const supplierId = await resolveSupplier(principal.companyId, input.supplierId)
  const lines = normalizeLines(input.lines, {
    companyId: principal.companyId,
    branchId: input.branchId,
    userId: principal.userId,
    classification: input.classification,
  })
  const totals = calculateProcurementTotals(lines)
  const row = await createWithNumber('purchaseRequisition', 'REQ', (number) => ({
    companyId: principal.companyId,
    branchId: input.branchId || null,
    number,
    status: 'DRAFT',
    requisitionDate: isoDay(input.requisitionDate),
    requiredDate: input.requiredDate ? isoDay(input.requiredDate) : null,
    supplierId,
    currency: input.currency || 'KES',
    ...totals,
    notes: input.notes || null,
    classification: input.classification || 'INTERNAL',
    createdById: principal.userId,
    lines: { create: lines },
  }), principal.companyId)

  await auditMutation(actor, 'procurement.requisition.created', 'PurchaseRequisition', row.id, {
    requisitionId: row.id,
    classification: row.classification,
  })
  return toRequisitionDto(row, await linesOf('purchaseRequisitionLine', 'requisitionId', row.id, row.companyId))
}

async function transitionRequisition(id, action, nextStatus, actor) {
  const row = await findRecord('purchaseRequisition', id, 'Purchase requisition', actor)
  assertProcurementTransition('requisition', row.status, nextStatus)
  const updated = await db.purchaseRequisition.update({
    where: { id: row.id },
    data: {
      status: nextStatus,
      ...(nextStatus === 'SUBMITTED' ? { submittedAt: new Date() } : {}),
      ...(nextStatus === 'APPROVED' ? { approvedAt: new Date(), approvedById: principalOf(actor).userId } : {}),
      updatedAt: new Date(),
    },
  })
  await auditMutation(actor, `procurement.requisition.${action}`, 'PurchaseRequisition', row.id, {
    requisitionId: row.id,
    classification: row.classification,
  })
  if (nextStatus === 'APPROVED') {
    await procurementEvent('PurchaseRequisitionApproved', {
      entityType: 'PURCHASE_REQUISITION',
      entityId: row.id,
      requisitionId: row.id,
      classification: row.classification,
    }, { aggregateId: row.id })
  }
  return toRequisitionDto(updated, await linesOf('purchaseRequisitionLine', 'requisitionId', row.id, row.companyId))
}

export function submitRequisition(id, actor = null) {
  return transitionRequisition(id, 'submitted', 'SUBMITTED', actor)
}

export function approveRequisition(id, actor = null) {
  return transitionRequisition(id, 'approved', 'APPROVED', actor)
}

export async function convertRequisition(id, input = {}, actor = null) {
  const principal = principalOf(actor)
  const row = await findRecord('purchaseRequisition', id, 'Purchase requisition', actor)
  const orderInput = requisitionToOrderInput({
    ...row,
    lines: await linesOf('purchaseRequisitionLine', 'requisitionId', row.id, row.companyId),
  }, input.supplierId, input.orderDate ? isoDay(input.orderDate) : isoDay(new Date()))
  const supplierId = await resolveSupplier(principal.companyId, orderInput.supplierId)
  if (!supplierId) throw new HttpError(422, 'The requisition must have a supplier before conversion')
  const lines = normalizeLines(orderInput.lines, {
    companyId: principal.companyId,
    branchId: orderInput.branchId,
    userId: principal.userId,
    classification: orderInput.classification,
  })
  const totals = calculateProcurementTotals(lines)
  const order = await createWithNumber('purchaseOrder', 'PO', (number) => ({
    companyId: principal.companyId,
    branchId: orderInput.branchId || null,
    number,
    status: 'DRAFT',
    requisitionId: row.id,
    supplierId,
    orderDate: orderInput.orderDate,
    expectedDate: orderInput.expectedDate,
    currency: orderInput.currency || 'KES',
    ...totals,
    notes: input.notes || orderInput.notes || null,
    classification: row.classification,
    createdById: principal.userId,
    lines: { create: lines },
  }), principal.companyId)

  assertProcurementTransition('requisition', row.status, 'CONVERTED')
  await db.purchaseRequisition.update({
    where: { id: row.id },
    data: { status: 'CONVERTED', updatedAt: new Date() },
  })
  await auditMutation(actor, 'procurement.requisition.converted', 'PurchaseOrder', order.id, {
    orderId: order.id,
    requisitionId: row.id,
    classification: row.classification,
  })
  return {
    order: toOrderDto(order, await linesOf('purchaseOrderLine', 'orderId', order.id, order.companyId)),
    requisition: toRequisitionDto(row, await linesOf('purchaseRequisitionLine', 'requisitionId', row.id, row.companyId)),
  }
}

// -------------------------------------------------------------------- orders

export async function listOrders(query = {}, actor = null) {
  const principal = principalOf(actor)
  const rows = await db.purchaseOrder.findMany({
    where: listWhere(principal, query, {
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      ...(query.requisitionId ? { requisitionId: query.requisitionId } : {}),
      ...dateFilterFor('orderDate', query),
    }),
    orderBy: [{ number: 'desc' }],
    take: limitOf(query.limit),
    include: { lines: { orderBy: [{ position: 'asc' }, { id: 'asc' }] } },
  })
  return rows.map((row) => toOrderDto(row))
}

export async function getOrder(id, actor = null) {
  const row = await findRecord('purchaseOrder', id, 'Purchase order', actor)
  return toOrderDto(row, await linesOf('purchaseOrderLine', 'orderId', row.id, row.companyId))
}

export async function createOrder(input, actor = null) {
  const principal = principalOf(actor)
  let source = null
  let orderInput = input
  if (input.requisitionId) {
    const requisition = await findRecord('purchaseRequisition', input.requisitionId, 'Purchase requisition', actor)
    source = await linesOf('purchaseRequisitionLine', 'requisitionId', requisition.id, requisition.companyId)
    orderInput = requisitionToOrderInput({ ...requisition, lines: source }, input.supplierId, isoDay(input.orderDate))
  }
  const supplierId = await resolveSupplier(principal.companyId, orderInput.supplierId)
  if (!supplierId) throw new HttpError(422, 'A SUPPLIER party is required')
  await resolveInvoice(principal.companyId, orderInput.financeInvoiceId)
  const lines = normalizeLines(orderInput.lines, {
    companyId: principal.companyId,
    branchId: input.branchId || orderInput.branchId,
    userId: principal.userId,
    classification: input.classification || orderInput.classification,
  })
  const totals = calculateProcurementTotals(lines)
  const row = await createWithNumber('purchaseOrder', 'PO', (number) => ({
    companyId: principal.companyId,
    branchId: input.branchId || orderInput.branchId || null,
    number,
    status: 'DRAFT',
    requisitionId: source ? orderInput.requisitionId : null,
    supplierId,
    orderDate: isoDay(orderInput.orderDate),
    expectedDate: orderInput.expectedDate ? isoDay(orderInput.expectedDate) : null,
    currency: orderInput.currency || 'KES',
    ...totals,
    notes: orderInput.notes || null,
    classification: input.classification || orderInput.classification || 'INTERNAL',
    financeInvoiceId: orderInput.financeInvoiceId || null,
    createdById: principal.userId,
    lines: { create: lines },
  }), principal.companyId)

  await auditMutation(actor, 'procurement.order.created', 'PurchaseOrder', row.id, {
    orderId: row.id,
    ...(row.requisitionId ? { requisitionId: row.requisitionId } : {}),
    classification: row.classification,
  })
  return toOrderDto(row, await linesOf('purchaseOrderLine', 'orderId', row.id, row.companyId))
}

export async function approveOrder(id, actor = null) {
  const row = await findRecord('purchaseOrder', id, 'Purchase order', actor)
  assertProcurementTransition('order', row.status, 'APPROVED')
  const updated = await db.purchaseOrder.update({
    where: { id: row.id },
    data: { status: 'APPROVED', approvedAt: new Date(), approvedById: principalOf(actor).userId, updatedAt: new Date() },
  })
  await auditMutation(actor, 'procurement.order.approved', 'PurchaseOrder', row.id, {
    orderId: row.id,
    ...(row.requisitionId ? { requisitionId: row.requisitionId } : {}),
    classification: row.classification,
  })
  await procurementEvent('PurchaseOrderApproved', {
    entityType: 'PURCHASE_ORDER',
    entityId: row.id,
    orderId: row.id,
    ...(row.requisitionId ? { requisitionId: row.requisitionId } : {}),
    classification: row.classification,
  }, { aggregateId: row.id })
  return toOrderDto(updated, await linesOf('purchaseOrderLine', 'orderId', row.id, row.companyId))
}

export async function sendOrder(id, actor = null) {
  const row = await findRecord('purchaseOrder', id, 'Purchase order', actor)
  assertProcurementTransition('order', row.status, 'SENT')
  const updated = await db.purchaseOrder.update({
    where: { id: row.id },
    data: { status: 'SENT', sentAt: new Date(), updatedAt: new Date() },
  })
  await auditMutation(actor, 'procurement.order.sent', 'PurchaseOrder', row.id, {
    orderId: row.id,
    classification: row.classification,
  })
  return toOrderDto(updated, await linesOf('purchaseOrderLine', 'orderId', row.id, row.companyId))
}

// ------------------------------------------------------------------ receipts

export async function listReceipts(query = {}, actor = null) {
  const principal = principalOf(actor)
  const rows = await db.goodsReceipt.findMany({
    where: listWhere(principal, query, {
      ...(query.orderId ? { orderId: query.orderId } : {}),
      ...dateFilterFor('receiptDate', query),
    }),
    orderBy: [{ number: 'desc' }],
    take: limitOf(query.limit),
    include: { lines: { orderBy: [{ position: 'asc' }, { id: 'asc' }] } },
  })
  return rows.map((row) => toReceiptDto(row))
}

export async function getReceipt(id, actor = null) {
  const row = await findRecord('goodsReceipt', id, 'Goods receipt', actor)
  return toReceiptDto(row, await linesOf('goodsReceiptLine', 'receiptId', row.id, row.companyId, RECEIPT_LINE_INCLUDE))
}

export async function createGoodsReceipt(input, actor = null) {
  const principal = principalOf(actor)
  const order = await findRecord('purchaseOrder', input.orderId, 'Purchase order', actor)
  if (!['SENT', 'PARTIALLY_RECEIVED'].includes(order.status)) {
    throw new HttpError(409, 'Goods may only be received against a sent or partially received order')
  }
  await resolveInvoice(principal.companyId, input.financeInvoiceId)
  const orderLines = await linesOf('purchaseOrderLine', 'orderId', order.id, order.companyId)

  const prepared = []
  for (const line of input.lines) {
    // eslint-disable-next-line no-await-in-loop
    const orderLine = orderLines.find((candidate) => candidate.id === line.orderLineId)
    if (!orderLine) throw new HttpError(404, 'Purchase order line not found')
    const calculated = calculateProcurementLine({
      qty: line.qty,
      unitCostCents: line.unitCostCents ?? orderLine.unitCostCents,
    })
    const nextReceived = roundQuantity(Number(orderLine.receivedQty || 0) + calculated.qty)
    if (nextReceived > roundQuantity(orderLine.qty)) throw new HttpError(409, 'Cannot receive more than the ordered quantity')
    // eslint-disable-next-line no-await-in-loop
    await assertActiveItem(principal.companyId, orderLine.itemId)
    // eslint-disable-next-line no-await-in-loop
    await resolveWarehouse(principal.companyId, line.warehouseId || orderLine.warehouseId)
    // eslint-disable-next-line no-await-in-loop
    await resolveBatch(principal.companyId, orderLine.itemId, line.batchId)
    prepared.push({
      orderLine,
      qty: calculated.qty,
      unitCostCents: calculated.unitCostCents,
      totalCents: calculated.totalCents,
      warehouseId: line.warehouseId || orderLine.warehouseId || null,
      batchId: line.batchId || null,
      position: Number.isInteger(line.position) ? line.position : prepared.length,
    })
  }
  const totals = calculateProcurementTotals(prepared)
  const receipt = await createWithNumber('goodsReceipt', 'GRN', (number) => ({
    companyId: principal.companyId,
    branchId: input.branchId || order.branchId || null,
    number,
    status: 'RECEIVED',
    orderId: order.id,
    supplierId: order.supplierId,
    receiptDate: isoDay(input.receiptDate),
    currency: order.currency,
    ...totals,
    notes: input.notes || null,
    classification: input.classification || order.classification,
    financeInvoiceId: input.financeInvoiceId || null,
    receivedAt: new Date(),
    createdById: principal.userId,
    lines: {
      create: prepared.map((line) => ({
        companyId: principal.companyId,
        branchId: input.branchId || order.branchId || null,
        orderLineId: line.orderLine.id,
        itemId: line.orderLine.itemId,
        warehouseId: line.warehouseId,
        batchId: line.batchId,
        description: line.orderLine.description,
        qty: line.qty,
        unitCostCents: line.unitCostCents,
        totalCents: line.totalCents,
        position: line.position,
        classification: input.classification || order.classification,
        createdById: principal.userId,
      })),
    },
  }), principal.companyId)

  for (const line of prepared) {
    // eslint-disable-next-line no-await-in-loop
    await receiveStock({
      itemId: line.orderLine.itemId,
      warehouseId: line.warehouseId,
      batchId: line.batchId,
      quantity: line.qty,
      unitCostCents: line.unitCostCents,
      movementDate: receipt.receiptDate,
      branchId: receipt.branchId,
      classification: receipt.classification,
      referenceType: 'GOODS_RECEIPT',
      referenceId: receipt.id,
      notes: null,
      movementType: 'RECEIPT',
    }, actor)
    // eslint-disable-next-line no-await-in-loop
    const current = await db.purchaseOrderLine.findFirst({ where: { id: line.orderLine.id, companyId: principal.companyId } })
    // eslint-disable-next-line no-await-in-loop
    await db.purchaseOrderLine.update({
      where: { id: line.orderLine.id },
      data: { receivedQty: roundQuantity(Number(current?.receivedQty || 0) + line.qty), updatedAt: new Date() },
    })
  }

  const updatedLines = await linesOf('purchaseOrderLine', 'orderId', order.id, order.companyId)
  const progress = calculateReceiptProgress(updatedLines)
  const updatedOrder = await db.purchaseOrder.update({
    where: { id: order.id },
    data: { status: progress.status, updatedAt: new Date() },
  })

  await auditMutation(actor, 'procurement.receipt.received', 'GoodsReceipt', receipt.id, {
    receiptId: receipt.id,
    orderId: order.id,
    classification: receipt.classification,
  })
  await procurementEvent('GoodsReceiptReceived', {
    entityType: 'GOODS_RECEIPT',
    entityId: receipt.id,
    receiptId: receipt.id,
    orderId: order.id,
    classification: receipt.classification,
  }, { aggregateId: receipt.id })

  return {
    receipt: toReceiptDto(receipt, await linesOf('goodsReceiptLine', 'receiptId', receipt.id, receipt.companyId, RECEIPT_LINE_INCLUDE)),
    order: toOrderDto(updatedOrder, updatedLines),
  }
}

export async function inspectGoodsReceipt(id, input = {}, actor = null) {
  const row = await findRecord('goodsReceipt', id, 'Goods receipt', actor)
  const nextStatus = input.decision === 'REJECT' ? 'REJECTED' : 'INSPECTED'
  assertProcurementTransition('receipt', row.status, nextStatus)
  const updated = await db.goodsReceipt.update({
    where: { id: row.id },
    data: { status: nextStatus, inspectedAt: new Date(), updatedAt: new Date() },
  })
  await auditMutation(actor, `procurement.receipt.${nextStatus.toLowerCase()}`, 'GoodsReceipt', row.id, {
    receiptId: row.id,
    orderId: row.orderId,
    classification: row.classification,
  })
  return toReceiptDto(updated, await linesOf('goodsReceiptLine', 'receiptId', row.id, row.companyId, RECEIPT_LINE_INCLUDE))
}

// ------------------------------------------------------------------- returns

export async function listReturns(query = {}, actor = null) {
  const principal = principalOf(actor)
  const rows = await db.supplierReturn.findMany({
    where: listWhere(principal, query, {
      ...(query.orderId ? { orderId: query.orderId } : {}),
      ...(query.receiptId ? { receiptId: query.receiptId } : {}),
      ...dateFilterFor('returnDate', query),
    }),
    orderBy: [{ number: 'desc' }],
    take: limitOf(query.limit),
  })
  return rows.map((row) => toReturnDto(row))
}

export async function getReturn(id, actor = null) {
  const row = await findRecord('supplierReturn', id, 'Supplier return', actor)
  return toReturnDto(row, await linesOf('supplierReturnLine', 'returnId', row.id, row.companyId, RECEIPT_LINE_INCLUDE))
}

export async function createSupplierReturn(input, actor = null) {
  const principal = principalOf(actor)
  let receipt = null
  if (input.receiptId) receipt = await findRecord('goodsReceipt', input.receiptId, 'Goods receipt', actor)
  const order = await findRecord('purchaseOrder', input.orderId, 'Purchase order', actor)
  const supplierId = await resolveSupplier(principal.companyId, input.supplierId || receipt?.supplierId || order.supplierId)
  if (!supplierId) throw new HttpError(422, 'A SUPPLIER party is required')

  const prepared = []
  for (const line of input.lines) {
    // eslint-disable-next-line no-await-in-loop
    await assertActiveItem(principal.companyId, line.itemId)
    const calculated = calculateProcurementLine({ qty: line.qty, unitCostCents: line.unitCostCents })
    prepared.push({
      itemId: line.itemId,
      warehouseId: line.warehouseId || null,
      batchId: line.batchId || null,
      receiptLineId: line.receiptLineId || null,
      description: line.description || 'Supplier return line',
      qty: calculated.qty,
      unitCostCents: calculated.unitCostCents,
      totalCents: calculated.totalCents,
      position: Number.isInteger(line.position) ? line.position : prepared.length,
    })
  }
  const totals = calculateProcurementTotals(prepared)
  const row = await createWithNumber('supplierReturn', 'RET', (number) => ({
    companyId: principal.companyId,
    branchId: input.branchId || receipt?.branchId || order.branchId || null,
    number,
    status: 'DRAFT',
    orderId: order.id,
    receiptId: receipt?.id || null,
    supplierId,
    returnDate: isoDay(input.returnDate),
    reason: input.reason || null,
    currency: input.currency || order.currency,
    ...totals,
    classification: input.classification || order.classification,
    createdById: principal.userId,
    lines: { create: prepared.map((line) => ({
      companyId: principal.companyId,
      branchId: input.branchId || receipt?.branchId || order.branchId || null,
      itemId: line.itemId,
      warehouseId: line.warehouseId,
      batchId: line.batchId,
      receiptLineId: line.receiptLineId,
      description: line.description,
      qty: line.qty,
      unitCostCents: line.unitCostCents,
      totalCents: line.totalCents,
      position: line.position,
      classification: input.classification || order.classification,
      createdById: principal.userId,
    })) },
  }), principal.companyId)

  await auditMutation(actor, 'procurement.return.created', 'SupplierReturn', row.id, {
    returnId: row.id,
    orderId: row.orderId,
    ...(row.receiptId ? { receiptId: row.receiptId } : {}),
    classification: row.classification,
  })
  return toReturnDto(row, await linesOf('supplierReturnLine', 'returnId', row.id, row.companyId, RECEIPT_LINE_INCLUDE))
}

export async function approveSupplierReturn(id, actor = null) {
  const principal = principalOf(actor)
  const row = await findRecord('supplierReturn', id, 'Supplier return', actor)
  assertProcurementTransition('return', row.status, 'APPROVED')
  const lines = await linesOf('supplierReturnLine', 'returnId', row.id, row.companyId, RECEIPT_LINE_INCLUDE)

  for (const line of lines) {
    // eslint-disable-next-line no-await-in-loop
    const receiptLine = line.receiptLineId
      ? await db.goodsReceiptLine.findFirst({ where: { id: line.receiptLineId, companyId: principal.companyId } })
      : null
    const warehouseId = line.warehouseId || receiptLine?.warehouseId
    const batchId = line.batchId || receiptLine?.batchId || null
    // eslint-disable-next-line no-await-in-loop
    await resolveWarehouse(principal.companyId, warehouseId)
    // eslint-disable-next-line no-await-in-loop
    await resolveBatch(principal.companyId, line.itemId, batchId)
    // eslint-disable-next-line no-await-in-loop
    await issueStock({
      itemId: line.itemId,
      warehouseId,
      batchId,
      quantity: line.qty,
      branchId: row.branchId,
      classification: row.classification,
      movementDate: row.returnDate,
      referenceType: 'SUPPLIER_RETURN',
      referenceId: row.id,
      notes: null,
      movementType: 'RETURN_OUT',
    }, actor)
  }

  const updated = await db.supplierReturn.update({
    where: { id: row.id },
    data: { status: 'APPROVED', approvedAt: new Date(), approvedById: principal.userId, updatedAt: new Date() },
  })
  await auditMutation(actor, 'procurement.return.approved', 'SupplierReturn', row.id, {
    returnId: row.id,
    orderId: row.orderId,
    ...(row.receiptId ? { receiptId: row.receiptId } : {}),
    classification: row.classification,
  })
  await procurementEvent('SupplierReturnApproved', {
    entityType: 'SUPPLIER_RETURN',
    entityId: row.id,
    returnId: row.id,
    ...(row.receiptId ? { receiptId: row.receiptId } : {}),
    orderId: row.orderId,
    classification: row.classification,
  }, { aggregateId: row.id })
  return toReturnDto(updated, lines)
}

// ------------------------------------------------------------------- matches

export async function listMatches(query = {}, actor = null) {
  const principal = principalOf(actor)
  const rows = await db.threeWayMatch.findMany({
    where: listWhere(principal, query, query.orderId ? { orderId: query.orderId } : {}),
    orderBy: [{ number: 'desc' }],
    take: limitOf(query.limit),
  })
  return rows.map(toMatchDto)
}

export async function getMatch(id, actor = null) {
  const row = await findRecord('threeWayMatch', id, 'Three-way match', actor)
  return toMatchDto(row)
}

export async function createThreeWayMatch(input, actor = null) {
  const principal = principalOf(actor)
  const order = await findRecord('purchaseOrder', input.orderId, 'Purchase order', actor)
  const orderLines = await linesOf('purchaseOrderLine', 'orderId', order.id, order.companyId)
  let receipt = null
  let receiptLines = []
  if (input.receiptId) {
    receipt = await findRecord('goodsReceipt', input.receiptId, 'Goods receipt', actor)
    if (receipt.orderId !== order.id) throw new HttpError(409, 'Goods receipt belongs to a different purchase order')
    receiptLines = await linesOf('goodsReceiptLine', 'receiptId', receipt.id, receipt.companyId, RECEIPT_LINE_INCLUDE)
  }
  const invoice = await resolveInvoice(principal.companyId, input.financeInvoiceId)
  const calculation = calculateThreeWayMatch({
    orderLines,
    receiptLines,
    invoiceTotalCents: invoice?.totalCents ?? null,
    toleranceBps: config.procurement.matchToleranceBps,
  })
  const row = await createWithNumber('threeWayMatch', 'MCH', (number) => ({
    companyId: principal.companyId,
    branchId: input.branchId || order.branchId || null,
    number,
    status: calculation.status,
    orderId: order.id,
    receiptId: receipt?.id || null,
    supplierId: order.supplierId,
    financeInvoiceId: invoice?.id || null,
    poTotalCents: calculation.expectedCents,
    receiptTotalCents: calculation.receiptActualCents,
    invoiceTotalCents: calculation.invoiceTotalCents,
    priceVarianceCents: calculation.priceVarianceCents,
    invoiceVarianceCents: calculation.invoiceVarianceCents,
    quantityVarianceQty: calculation.quantityVarianceQty,
    toleranceBps: calculation.toleranceBps,
    notes: input.notes || null,
    classification: input.classification || order.classification,
    createdById: principal.userId,
  }), principal.companyId)

  await auditMutation(actor, 'procurement.match.created', 'ThreeWayMatch', row.id, {
    matchId: row.id,
    orderId: row.id === order.id ? row.id : order.id,
    ...(row.receiptId ? { receiptId: row.receiptId } : {}),
    classification: row.classification,
  })
  if (calculation.status === 'DISCREPANCY') {
    await procurementEvent('ThreeWayMatchFlagged', {
      entityType: 'THREE_WAY_MATCH',
      entityId: row.id,
      matchId: row.id,
      orderId: order.id,
      ...(receipt ? { receiptId: receipt.id } : {}),
      classification: row.classification,
    }, { aggregateId: row.id })
  }
  return toMatchDto(row)
}

export async function approveThreeWayMatch(id, actor = null) {
  const principal = principalOf(actor)
  const row = await findRecord('threeWayMatch', id, 'Three-way match', actor)
  assertProcurementTransition('match', row.status, 'APPROVED')
  const updated = await db.threeWayMatch.update({
    where: { id: row.id },
    data: { status: 'APPROVED', approvedAt: new Date(), approvedById: principal.userId, updatedAt: new Date() },
  })
  await auditMutation(actor, 'procurement.match.approved', 'ThreeWayMatch', row.id, {
    matchId: row.id,
    orderId: row.orderId,
    ...(row.receiptId ? { receiptId: row.receiptId } : {}),
    classification: row.classification,
  })
  return toMatchDto(updated)
}

export async function receiveDraftGoodsReceipt(id, actor = null) {
  const row = await findRecord('goodsReceipt', id, 'Goods receipt', actor)
  if (row.status !== 'DRAFT') throw new HttpError(409, 'Only a draft goods receipt can be received')
  const lines = await linesOf('goodsReceiptLine', 'receiptId', row.id, row.companyId, RECEIPT_LINE_INCLUDE)
  if (lines.length === 0) throw new HttpError(409, 'Draft goods receipt has no lines')
  for (const line of lines) {
    // eslint-disable-next-line no-await-in-loop
    await resolveWarehouse(row.companyId, line.warehouseId)
    // eslint-disable-next-line no-await-in-loop
    await resolveBatch(row.companyId, line.itemId, line.batchId)
    // eslint-disable-next-line no-await-in-loop
    await receiveStock({
      itemId: line.itemId,
      warehouseId: line.warehouseId,
      batchId: line.batchId,
      quantity: line.qty,
      unitCostCents: line.unitCostCents,
      movementDate: row.receiptDate,
      branchId: row.branchId,
      classification: row.classification,
      referenceType: 'GOODS_RECEIPT',
      referenceId: row.id,
      notes: null,
      movementType: 'RECEIPT',
    }, actor)
  }
  const updated = await db.goodsReceipt.update({
    where: { id: row.id },
    data: { status: 'RECEIVED', receivedAt: new Date(), updatedAt: new Date() },
  })
  await auditMutation(actor, 'procurement.receipt.received', 'GoodsReceipt', row.id, {
    receiptId: row.id,
    orderId: row.orderId,
    classification: row.classification,
  })
  await procurementEvent('GoodsReceiptReceived', {
    entityType: 'GOODS_RECEIPT',
    entityId: row.id,
    receiptId: row.id,
    orderId: row.orderId,
    classification: row.classification,
  }, { aggregateId: row.id })
  return toReceiptDto(updated, lines)
}
