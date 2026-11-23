// Phase 8 inventory lifecycle service.
//
// Stock balances are valued with a weighted-average unit cost in integer cents.
// Quantities are floats but are rounded to three decimals once at this boundary;
// every value stored in a *Cents column is a safe integer. Receipts blend the
// existing balance value with the receipt value, issues and outgoing transfers
// relieve stock at the current average, and count approvals post the balancing
// COUNT_GAIN/COUNT_LOSS movements. All tables use the tenant-scoped Prisma proxy,
// all writes are audited with ID-only metadata, and events never carry a
// quantity, cost, total, batch number in free text or a note.

import { db, getTenantContext } from './tenant.js'
import { emitEvent } from './events.js'
import { recordAudit, recordRequestAudit } from './audit.js'
import { HttpError } from './util.js'
import { inspectText, findingTypes } from '../../shared/src/dlp.js'
import * as sharedEvents from '../../shared/src/events.js'
import { DEFAULT_COMPANY_ID } from '../../shared/src/constants.js'

const MAX_LIST = 200
const QTY_PRECISION = 1000
const MAX_QTY = 1_000_000
const EPSILON = 1e-9

// ------------------------------------------------------------- small helpers

function tenantId() {
  const ctx = getTenantContext() || {}
  return ctx.companyId || DEFAULT_COMPANY_ID
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

async function inventoryEvent(type, data, options = {}) {
  const eventType = sharedEvents[type] || type
  return emitEvent(eventType, data, { aggregateType: 'Inventory', ...options })
}

function assertDlpSafe(value) {
  if (value === null || value === undefined || value === '') return
  const findings = inspectText(String(value))
  if (!findings.length) return
  const error = new HttpError(422, `Contains restricted data (${findingTypes(findings).join(', ')})`)
  error.types = findingTypes(findings)
  throw error
}

/** Tenant + optional branch scope. Organisation-wide rows remain visible. */
export function inventoryTenantWhere(companyId, branchId) {
  const scope = { companyId: companyId || tenantId() }
  if (branchId) {
    return {
      ...scope,
      OR: [{ branchId: null }, { branchId }],
    }
  }
  return scope
}

// ------------------------------------------------------- quantity + cent math

function roundToPrecision(value, { positive = true, label = 'Quantity' } = {}) {
  const number = Number(value)
  if (!Number.isFinite(number) || (positive ? number <= 0 : number < 0)) {
    throw new HttpError(400, positive ? `${label} must be greater than zero` : `${label} cannot be negative`)
  }
  const rounded = Math.round(number * QTY_PRECISION) / QTY_PRECISION
  if (!Number.isFinite(rounded) || (positive ? rounded <= 0 : rounded < 0) || rounded > MAX_QTY) {
    throw new HttpError(400, `Invalid ${label.toLowerCase()}`)
  }
  return rounded
}

/** Positive movement/line quantity, rounded to three decimals. */
export function roundQuantity(value) {
  return roundToPrecision(value, { positive: true, label: 'Quantity' })
}

/** Non-negative balance/counted quantity, rounded to three decimals. */
export function roundCountedQuantity(value) {
  return roundToPrecision(value, { positive: false, label: 'Quantity' })
}

function assertCents(value, { positive = false, label = 'Unit cost' } = {}) {
  const cents = Number(value ?? 0)
  if (!Number.isSafeInteger(cents) || (positive ? cents <= 0 : cents < 0)) {
    throw new HttpError(400, positive
      ? `${label} must be a positive integer number of cents`
      : `${label} must be a non-negative integer number of cents`)
  }
  return cents
}

/** Value of a movement in whole cents. No float ever enters a *Cents column. */
export function calculateMovementValue(quantity, unitCostCents) {
  const qty = roundQuantity(quantity)
  const cost = assertCents(unitCostCents)
  const cents = Math.round(qty * cost)
  if (!Number.isSafeInteger(cents)) throw new HttpError(400, 'Invalid movement value')
  return cents
}

/**
 * Weighted-average valuation. The existing balance's recorded total value is
 * blended with the receipt value; the resulting average is rounded once to
 * whole cents and the balance value is rebuilt from that average. This keeps
 * every persisted monetary column an integer while avoiding drift across
 * successive fractional receipts.
 */
export function calculateWeightedAverage(existing = {}, receipt = {}, options = {}) {
  const existingQty = roundCountedQuantity(existing.quantity ?? 0)
  const receiptQty = roundQuantity(receipt.quantity)
  const existingCost = assertCents(existing.unitCostCents ?? 0)
  const receiptCost = options.allowZeroCost
    ? assertCents(receipt.unitCostCents)
    : assertCents(receipt.unitCostCents, { positive: true })
  const existingValue = existing.totalValueCents === undefined || existing.totalValueCents === null
    ? Math.round(existingQty * existingCost)
    : assertCents(existing.totalValueCents)
  const receiptValue = calculateMovementValue(receiptQty, receiptCost)
  const quantity = roundCountedQuantity(existingQty + receiptQty)
  const blendedCost = Math.round((existingValue + receiptValue) / quantity)
  const unitCostCents = assertCents(blendedCost)
  return {
    quantity,
    unitCostCents,
    totalValueCents: Math.round(quantity * unitCostCents),
    receiptValueCents: receiptValue,
  }
}

/** Receipt effect on a balance; the movement uses the receipt's own cost. */
export function applyReceipt(balance, receipt, options = {}) {
  const result = calculateWeightedAverage({
    quantity: balance?.quantity ?? 0,
    unitCostCents: balance?.unitCostCents ?? 0,
    totalValueCents: balance?.totalValueCents,
  }, receipt, options)
  return {
    quantity: result.quantity,
    unitCostCents: result.unitCostCents,
    totalValueCents: result.totalValueCents,
    movementValueCents: result.receiptValueCents,
  }
}

/** Issue effect on a balance; the movement uses the existing average cost. */
export function applyIssue(balance, issue) {
  const available = roundCountedQuantity(balance?.quantity ?? 0)
  const quantity = roundQuantity(issue.quantity)
  if (quantity > available + EPSILON) throw new HttpError(409, 'Insufficient stock')
  const unitCostCents = assertCents(balance?.unitCostCents ?? 0)
  const remaining = roundCountedQuantity(available - quantity)
  return {
    quantity: remaining,
    unitCostCents,
    totalValueCents: Math.round(remaining * unitCostCents),
    movementValueCents: calculateMovementValue(quantity, unitCostCents),
  }
}

/** Adjustment effect; IN may supply a new unit cost, OUT uses the average. */
export function applyAdjustment(balance, adjustment) {
  const direction = adjustment.direction
  if (direction === 'IN') {
    const unitCostCents = adjustment.unitCostCents === undefined || adjustment.unitCostCents === null
      ? assertCents(balance?.unitCostCents ?? 0)
      : assertCents(adjustment.unitCostCents)
    return {
      ...applyReceipt(balance, { quantity: adjustment.quantity, unitCostCents }, { allowZeroCost: true }),
      movementType: 'ADJUSTMENT_IN',
    }
  }
  if (direction === 'OUT') return { ...applyIssue(balance, adjustment), movementType: 'ADJUSTMENT_OUT' }
  throw new HttpError(400, 'Adjustment direction must be IN or OUT')
}

/** Only RELEASED batches may leave stock. QUARANTINE fails closed. */
export function assertBatchIssuable(batch) {
  if (!batch) return true
  if (batch.status === 'RELEASED') return true
  throw new HttpError(409, `Batch is ${batch.status} and cannot be issued`)
}

export function assertBatchRequired(item, batchId) {
  if (item?.trackBatches && !batchId) throw new HttpError(400, 'A batch is required for this item')
  return true
}

// ------------------------------------------------------- state machines / alerts

export const TRANSFER_TRANSITIONS = Object.freeze({
  DRAFT: ['IN_TRANSIT', 'CANCELLED'],
  IN_TRANSIT: ['RECEIVED'],
  RECEIVED: [],
  CANCELLED: [],
})

export const COUNT_TRANSITIONS = Object.freeze({
  DRAFT: ['COUNTING', 'CANCELLED'],
  COUNTING: ['APPROVED', 'CANCELLED'],
  APPROVED: [],
  CANCELLED: [],
})

export function assertTransferTransition(from, to) {
  if (!TRANSFER_TRANSITIONS[from]?.includes(to)) {
    throw new HttpError(409, `Cannot change stock transfer from ${from} to ${to}`)
  }
  return true
}

export function assertCountTransition(from, to) {
  if (!COUNT_TRANSITIONS[from]?.includes(to)) {
    throw new HttpError(409, `Cannot change stock count from ${from} to ${to}`)
  }
  return true
}

/** Outgoing transfer leg: relieve the source at its weighted-average cost. */
export function calculateTransferIssue(balance, line) {
  return applyIssue(balance, { quantity: line.quantity })
}

/** Incoming transfer leg: value at the cost captured when the source issued. */
export function calculateTransferReceipt(line) {
  const quantity = roundQuantity(line.quantity)
  const unitCostCents = assertCents(line.unitCostCents ?? 0)
  return {
    quantity,
    unitCostCents,
    totalValueCents: Math.round(quantity * unitCostCents),
  }
}

/** Signed count variance and its whole-cent value. */
export function calculateCountVariance(line) {
  const expectedQty = roundCountedQuantity(line.expectedQty ?? 0)
  const countedQty = roundCountedQuantity(line.countedQty ?? 0)
  const varianceQty = Math.round((countedQty - expectedQty) * QTY_PRECISION) / QTY_PRECISION
  const unitCostCents = assertCents(line.unitCostCents ?? 0)
  return {
    expectedQty,
    countedQty,
    varianceQty,
    unitCostCents,
    varianceValueCents: Math.round(Math.abs(varianceQty) * unitCostCents),
  }
}

/** Approval produces only non-zero balancing movements. */
export function buildCountAdjustments(lines) {
  return lines.map((line) => {
    const variance = calculateCountVariance(line)
    return {
      ...line,
      ...variance,
      movementType: variance.varianceQty > 0 ? 'COUNT_GAIN' : 'COUNT_LOSS',
      quantity: Math.abs(variance.varianceQty),
    }
  }).filter((line) => line.varianceQty !== 0)
}

export function isReorderBreach(balance, item) {
  const level = roundCountedQuantity(item?.reorderLevel ?? 0)
  if (level === 0) return false
  return roundCountedQuantity(balance?.quantity ?? 0) <= level
}

/** A breach alert is emitted only when a write crosses the threshold downward. */
export function crossesReorderThreshold(beforeQuantity, afterQuantity, item) {
  const level = roundCountedQuantity(item?.reorderLevel ?? 0)
  if (level === 0) return false
  return roundCountedQuantity(beforeQuantity) > level
    && roundCountedQuantity(afterQuantity) <= level
}

// ------------------------------------------------------------------- DTOs

function lineDto(line) {
  return {
    id: line.id ?? null,
    itemId: line.itemId,
    batchId: line.batchId ?? null,
    quantity: line.quantity,
    unitCostCents: line.unitCostCents,
    totalValueCents: line.totalValueCents,
    position: line.position ?? null,
  }
}

/** DTOs omit companyId; clients never learn tenant internals. */
export function toItemDto(row) {
  if (!row) return null
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    type: row.type,
    unit: row.unit,
    standardCostCents: row.standardCostCents,
    reorderLevel: row.reorderLevel,
    trackBatches: row.trackBatches,
    isActive: row.isActive,
    description: row.description ?? null,
    classification: row.classification,
    createdById: row.createdById ?? null,
    createdAt: row.createdAt ?? null,
    updatedAt: row.updatedAt ?? null,
  }
}

export function toWarehouseDto(row) {
  if (!row) return null
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    location: row.location ?? null,
    isActive: row.isActive,
    classification: row.classification,
    createdById: row.createdById ?? null,
    createdAt: row.createdAt ?? null,
    updatedAt: row.updatedAt ?? null,
  }
}

export function toBatchDto(row) {
  if (!row) return null
  return {
    id: row.id,
    itemId: row.itemId,
    batchNumber: row.batchNumber,
    status: row.status,
    unitCostCents: row.unitCostCents,
    manufactureDate: row.manufactureDate ?? null,
    expiryDate: row.expiryDate ?? null,
    classification: row.classification,
    createdById: row.createdById ?? null,
    createdAt: row.createdAt ?? null,
    updatedAt: row.updatedAt ?? null,
  }
}

export function toBalanceDto(row) {
  if (!row) return null
  return {
    id: row.id,
    itemId: row.itemId,
    itemCode: row.item?.code ?? null,
    itemName: row.item?.name ?? null,
    unit: row.item?.unit ?? null,
    warehouseId: row.warehouseId,
    warehouseCode: row.warehouse?.code ?? null,
    warehouseName: row.warehouse?.name ?? null,
    batchId: row.batchId ?? null,
    batchNumber: row.batch?.batchNumber ?? null,
    batchStatus: row.batch?.status ?? null,
    quantity: row.quantity,
    unitCostCents: row.unitCostCents,
    totalValueCents: row.totalValueCents,
    classification: row.classification,
    createdAt: row.createdAt ?? null,
    updatedAt: row.updatedAt ?? null,
  }
}

export function toMovementDto(row) {
  if (!row) return null
  return {
    id: row.id,
    number: row.number,
    type: row.type,
    itemId: row.itemId,
    itemCode: row.item?.code ?? null,
    warehouseId: row.warehouseId,
    warehouseCode: row.warehouse?.code ?? null,
    batchId: row.batchId ?? null,
    quantity: row.quantity,
    unitCostCents: row.unitCostCents,
    totalValueCents: row.totalValueCents,
    movementDate: row.movementDate,
    referenceType: row.referenceType ?? null,
    referenceId: row.referenceId ?? null,
    transferLineId: row.transferLineId ?? null,
    countLineId: row.countLineId ?? null,
    notes: row.notes ?? null,
    classification: row.classification,
    createdById: row.createdById ?? null,
    createdAt: row.createdAt ?? null,
  }
}

export function toTransferDto(row, lines) {
  if (!row) return null
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    sourceWarehouseId: row.sourceWarehouseId,
    destinationWarehouseId: row.destinationWarehouseId,
    transferDate: row.transferDate,
    notes: row.notes ?? null,
    classification: row.classification,
    approvedAt: row.approvedAt ?? null,
    receivedAt: row.receivedAt ?? null,
    createdById: row.createdById ?? null,
    approvedById: row.approvedById ?? null,
    lines: (lines || row.lines || []).map(lineDto),
    createdAt: row.createdAt ?? null,
    updatedAt: row.updatedAt ?? null,
  }
}

function countLineDto(line) {
  return {
    id: line.id ?? null,
    itemId: line.itemId,
    batchId: line.batchId ?? null,
    expectedQty: line.expectedQty,
    countedQty: line.countedQty,
    varianceQty: line.varianceQty,
    unitCostCents: line.unitCostCents,
    varianceValueCents: line.varianceValueCents,
    position: line.position ?? null,
  }
}

export function toCountDto(row, lines) {
  if (!row) return null
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    warehouseId: row.warehouseId,
    countDate: row.countDate,
    notes: row.notes ?? null,
    classification: row.classification,
    approvedAt: row.approvedAt ?? null,
    createdById: row.createdById ?? null,
    approvedById: row.approvedById ?? null,
    lines: (lines || row.lines || []).map(countLineDto),
    createdAt: row.createdAt ?? null,
    updatedAt: row.updatedAt ?? null,
  }
}

// ------------------------------------------------------------ data helpers

async function findRecord(model, id, label, actor = null) {
  const principal = principalOf(actor)
  const row = await db[model].findFirst({
    where: { ...inventoryTenantWhere(principal.companyId, principal.branchId), id },
  })
  if (!row) throw new HttpError(404, `${label} not found`)
  return row
}

async function linesOf(model, parentKey, parentId, companyId) {
  return db[model].findMany({
    where: { companyId, [parentKey]: parentId },
    orderBy: [{ position: 'asc' }, { id: 'asc' }],
  })
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

async function resolveItem(companyId, itemId) {
  const item = await db.inventoryItem.findFirst({ where: { id: itemId, companyId } })
  if (!item) throw new HttpError(404, 'Inventory item not found')
  if (!item.isActive) throw new HttpError(409, 'Inventory item is inactive')
  return item
}

async function resolveWarehouse(companyId, warehouseId) {
  const warehouse = await db.warehouse.findFirst({ where: { id: warehouseId, companyId } })
  if (!warehouse) throw new HttpError(404, 'Warehouse not found')
  if (!warehouse.isActive) throw new HttpError(409, 'Warehouse is inactive')
  return warehouse
}

async function resolveBatch(companyId, itemId, batchId, { requireReleased = false } = {}) {
  if (!batchId) return null
  const batch = await db.inventoryBatch.findFirst({ where: { id: batchId, companyId, itemId } })
  if (!batch) throw new HttpError(404, 'Inventory batch not found')
  if (requireReleased) assertBatchIssuable(batch)
  return batch
}

async function findBalance(companyId, itemId, warehouseId, batchId) {
  return db.stockBalance.findFirst({
    where: {
      companyId,
      itemId,
      warehouseId,
      ...(batchId ? { batchId } : { batchId: null }),
    },
  })
}

async function persistBalance(scope, values) {
  const existing = await findBalance(scope.companyId, scope.itemId, scope.warehouseId, scope.batchId)
  const data = {
    quantity: values.quantity,
    unitCostCents: values.unitCostCents,
    totalValueCents: values.totalValueCents,
    updatedAt: new Date(),
  }
  if (existing) return db.stockBalance.update({ where: { id: existing.id }, data })
  return db.stockBalance.create({
    data: {
      companyId: scope.companyId,
      branchId: scope.branchId || null,
      itemId: scope.itemId,
      warehouseId: scope.warehouseId,
      batchId: scope.batchId || null,
      classification: scope.classification || 'INTERNAL',
      createdById: scope.createdById || null,
      ...data,
    },
  })
}

async function createMovement(scope, input) {
  return db.stockMovement.create({
    data: {
      companyId: scope.companyId,
      branchId: scope.branchId || null,
      number: await nextNumber('stockMovement', 'MOV', scope.companyId),
      type: input.type,
      itemId: scope.itemId,
      warehouseId: scope.warehouseId,
      batchId: scope.batchId || null,
      quantity: input.quantity,
      unitCostCents: input.unitCostCents,
      totalValueCents: input.totalValueCents,
      movementDate: isoDay(input.movementDate),
      referenceType: input.referenceType || null,
      referenceId: input.referenceId || null,
      transferLineId: input.transferLineId || null,
      countLineId: input.countLineId || null,
      notes: input.notes || null,
      classification: input.classification || scope.classification || 'INTERNAL',
      createdById: scope.createdById || null,
    },
  })
}

async function maybeEmitReorderAlert(scope, item, beforeQuantity, afterBalance) {
  if (!crossesReorderThreshold(beforeQuantity, afterBalance.quantity, item)) return false
  await inventoryEvent('ReorderLevelBreached', {
    entityType: 'INVENTORY_ITEM',
    entityId: item.id,
    itemId: item.id,
    warehouseId: scope.warehouseId,
    ...(scope.batchId ? { batchId: scope.batchId } : { batchId: null }),
    classification: item.classification,
  }, { aggregateId: item.id })
  return true
}

// -------------------------------------------------------------- items / warehouses

export async function listItems(query = {}, actor = null) {
  const principal = principalOf(actor)
  const rows = await db.inventoryItem.findMany({
    where: {
      ...inventoryTenantWhere(principal.companyId, principal.branchId),
      ...(query.type ? { type: query.type } : {}),
      ...(query.active ? { isActive: query.active === 'true' } : {}),
    },
    orderBy: [{ code: 'asc' }],
    take: limitOf(query.limit),
  })
  return rows.map(toItemDto)
}

export async function getItem(id, actor = null) {
  return toItemDto(await findRecord('inventoryItem', id, 'Inventory item', actor))
}

export async function createItem(input, actor = null) {
  const principal = principalOf(actor)
  assertDlpSafe(input.name)
  assertDlpSafe(input.description)
  const row = await db.inventoryItem.create({
    data: {
      companyId: principal.companyId,
      branchId: input.branchId || null,
      code: input.code,
      name: input.name,
      type: input.type,
      unit: input.unit || 'EA',
      standardCostCents: assertCents(input.standardCostCents ?? 0),
      reorderLevel: roundCountedQuantity(input.reorderLevel ?? 0),
      trackBatches: input.trackBatches ?? true,
      isActive: input.isActive ?? true,
      description: input.description || null,
      classification: input.classification || 'INTERNAL',
      createdById: principal.userId,
    },
  })
  await auditMutation(actor, 'inventory.item.created', 'InventoryItem', row.id, {
    itemId: row.id,
    classification: row.classification,
  })
  await inventoryEvent('InventoryItemCreated', {
    entityType: 'INVENTORY_ITEM',
    entityId: row.id,
    itemId: row.id,
    classification: row.classification,
  }, { aggregateId: row.id })
  return toItemDto(row)
}

export async function updateItem(id, input, actor = null) {
  const existing = await findRecord('inventoryItem', id, 'Inventory item', actor)
  assertDlpSafe(input.name)
  assertDlpSafe(input.description)
  const row = await db.inventoryItem.update({
    where: { id: existing.id },
    data: {
      ...(input.code ? { code: input.code } : {}),
      ...(input.name ? { name: input.name } : {}),
      ...(input.type ? { type: input.type } : {}),
      ...(input.unit ? { unit: input.unit } : {}),
      ...(input.standardCostCents !== undefined ? { standardCostCents: assertCents(input.standardCostCents) } : {}),
      ...(input.reorderLevel !== undefined ? { reorderLevel: roundCountedQuantity(input.reorderLevel) } : {}),
      ...(input.trackBatches !== undefined ? { trackBatches: input.trackBatches } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.description !== undefined ? { description: input.description || null } : {}),
      ...(input.branchId !== undefined ? { branchId: input.branchId || null } : {}),
      ...(input.classification ? { classification: input.classification } : {}),
    },
  })
  await auditMutation(actor, 'inventory.item.updated', 'InventoryItem', row.id, {
    itemId: row.id,
    classification: row.classification,
  })
  return toItemDto(row)
}

export async function listWarehouses(query = {}, actor = null) {
  const principal = principalOf(actor)
  const rows = await db.warehouse.findMany({
    where: {
      ...inventoryTenantWhere(principal.companyId, principal.branchId),
      ...(query.active ? { isActive: query.active === 'true' } : {}),
    },
    orderBy: [{ code: 'asc' }],
    take: limitOf(query.limit),
  })
  return rows.map(toWarehouseDto)
}

export async function getWarehouse(id, actor = null) {
  return toWarehouseDto(await findRecord('warehouse', id, 'Warehouse', actor))
}

export async function createWarehouse(input, actor = null) {
  const principal = principalOf(actor)
  assertDlpSafe(input.name)
  assertDlpSafe(input.location)
  const row = await db.warehouse.create({
    data: {
      companyId: principal.companyId,
      branchId: input.branchId || null,
      code: input.code,
      name: input.name,
      location: input.location || null,
      isActive: input.isActive ?? true,
      classification: input.classification || 'INTERNAL',
      createdById: principal.userId,
    },
  })
  await auditMutation(actor, 'inventory.warehouse.created', 'Warehouse', row.id, {
    warehouseId: row.id,
    classification: row.classification,
  })
  return toWarehouseDto(row)
}

export async function updateWarehouse(id, input, actor = null) {
  const existing = await findRecord('warehouse', id, 'Warehouse', actor)
  assertDlpSafe(input.name)
  assertDlpSafe(input.location)
  const row = await db.warehouse.update({
    where: { id: existing.id },
    data: {
      ...(input.code ? { code: input.code } : {}),
      ...(input.name ? { name: input.name } : {}),
      ...(input.location !== undefined ? { location: input.location || null } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.branchId !== undefined ? { branchId: input.branchId || null } : {}),
      ...(input.classification ? { classification: input.classification } : {}),
    },
  })
  await auditMutation(actor, 'inventory.warehouse.updated', 'Warehouse', row.id, {
    warehouseId: row.id,
    classification: row.classification,
  })
  return toWarehouseDto(row)
}

// -------------------------------------------------------------------- batches

export async function listBatches(query = {}, actor = null) {
  const principal = principalOf(actor)
  const rows = await db.inventoryBatch.findMany({
    where: {
      ...inventoryTenantWhere(principal.companyId, principal.branchId),
      ...(query.itemId ? { itemId: query.itemId } : {}),
      ...(query.status ? { status: query.status } : {}),
    },
    orderBy: [{ batchNumber: 'asc' }],
    take: limitOf(query.limit),
  })
  return rows.map(toBatchDto)
}

export async function getBatch(id, actor = null) {
  return toBatchDto(await findRecord('inventoryBatch', id, 'Inventory batch', actor))
}

export async function createBatch(input, actor = null) {
  const principal = principalOf(actor)
  assertDlpSafe(input.batchNumber)
  await resolveItem(principal.companyId, input.itemId)
  const row = await db.inventoryBatch.create({
    data: {
      companyId: principal.companyId,
      branchId: input.branchId || null,
      itemId: input.itemId,
      batchNumber: input.batchNumber,
      status: input.status || 'QUARANTINE',
      unitCostCents: assertCents(input.unitCostCents ?? 0),
      manufactureDate: input.manufactureDate || null,
      expiryDate: input.expiryDate || null,
      classification: input.classification || 'INTERNAL',
      createdById: principal.userId,
    },
  })
  await auditMutation(actor, 'inventory.batch.created', 'InventoryBatch', row.id, {
    batchId: row.id,
    itemId: row.itemId,
    classification: row.classification,
  })
  return toBatchDto(row)
}

export async function updateBatch(id, input, actor = null) {
  const existing = await findRecord('inventoryBatch', id, 'Inventory batch', actor)
  assertDlpSafe(input.batchNumber)
  const row = await db.inventoryBatch.update({
    where: { id: existing.id },
    data: {
      ...(input.batchNumber ? { batchNumber: input.batchNumber } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.unitCostCents !== undefined ? { unitCostCents: assertCents(input.unitCostCents) } : {}),
      ...(input.manufactureDate !== undefined ? { manufactureDate: input.manufactureDate || null } : {}),
      ...(input.expiryDate !== undefined ? { expiryDate: input.expiryDate || null } : {}),
      ...(input.branchId !== undefined ? { branchId: input.branchId || null } : {}),
      ...(input.classification ? { classification: input.classification } : {}),
    },
  })
  await auditMutation(actor, 'inventory.batch.updated', 'InventoryBatch', row.id, {
    batchId: row.id,
    itemId: row.itemId,
    classification: row.classification,
  })
  return toBatchDto(row)
}

// -------------------------------------------------------------- stock queries

const balanceInclude = {
  item: { select: { code: true, name: true, unit: true, reorderLevel: true, trackBatches: true } },
  warehouse: { select: { code: true, name: true } },
  batch: { select: { batchNumber: true, status: true } },
}

const movementInclude = {
  item: { select: { code: true } },
  warehouse: { select: { code: true } },
}

export async function listBalances(query = {}, actor = null) {
  const principal = principalOf(actor)
  const rows = await db.stockBalance.findMany({
    where: {
      ...inventoryTenantWhere(principal.companyId, principal.branchId),
      ...(query.itemId ? { itemId: query.itemId } : {}),
      ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
      ...(query.batchId ? { batchId: query.batchId } : {}),
    },
    include: balanceInclude,
    orderBy: [{ itemId: 'asc' }, { warehouseId: 'asc' }],
    take: limitOf(query.limit),
  })
  return rows.map(toBalanceDto)
}

export async function listMovements(query = {}, actor = null) {
  const principal = principalOf(actor)
  const dateFilter = query.from || query.to
    ? {
      movementDate: {
        ...(query.from ? { gte: query.from } : {}),
        ...(query.to ? { lte: query.to } : {}),
      },
    }
    : {}
  const rows = await db.stockMovement.findMany({
    where: {
      ...inventoryTenantWhere(principal.companyId, principal.branchId),
      ...(query.type ? { type: query.type } : {}),
      ...(query.itemId ? { itemId: query.itemId } : {}),
      ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
      ...dateFilter,
    },
    include: movementInclude,
    orderBy: [{ number: 'desc' }],
    take: limitOf(query.limit),
  })
  return rows.map(toMovementDto)
}

export async function listReorderAlerts(query = {}, actor = null) {
  const principal = principalOf(actor)
  const items = await db.inventoryItem.findMany({
    where: {
      ...inventoryTenantWhere(principal.companyId, principal.branchId),
      reorderLevel: { gt: 0 },
      isActive: true,
    },
    orderBy: [{ code: 'asc' }],
    take: limitOf(query.limit),
  })
  if (!items.length) return []
  const balances = await db.stockBalance.findMany({
    where: {
      ...inventoryTenantWhere(principal.companyId, principal.branchId),
      itemId: { in: items.map((item) => item.id) },
      ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
    },
    include: balanceInclude,
    orderBy: [{ itemId: 'asc' }],
    take: MAX_LIST,
  })
  const itemsById = new Map(items.map((item) => [item.id, item]))
  return balances
    .filter((balance) => isReorderBreach(balance, itemsById.get(balance.itemId)))
    .map((balance) => ({
      itemId: balance.itemId,
      itemCode: balance.item?.code ?? null,
      warehouseId: balance.warehouseId,
      warehouseCode: balance.warehouse?.code ?? null,
      batchId: balance.batchId ?? null,
      quantity: balance.quantity,
      reorderLevel: itemsById.get(balance.itemId).reorderLevel,
      unit: balance.item?.unit ?? null,
      classification: itemsById.get(balance.itemId).classification,
    }))
}

// ---------------------------------------------------------- stock movements

export async function receiveStock(input, actor = null) {
  const principal = principalOf(actor)
  const item = await resolveItem(principal.companyId, input.itemId)
  await resolveWarehouse(principal.companyId, input.warehouseId)
  await resolveBatch(principal.companyId, item.id, input.batchId)
  assertBatchRequired(item, input.batchId)
  assertDlpSafe(input.notes)
  const scope = {
    companyId: principal.companyId,
    branchId: input.branchId,
    itemId: item.id,
    warehouseId: input.warehouseId,
    batchId: input.batchId || null,
    classification: input.classification || item.classification,
    createdById: principal.userId,
  }
  const existing = await findBalance(scope.companyId, scope.itemId, scope.warehouseId, scope.batchId)
  const beforeQuantity = existing?.quantity ?? 0
  const result = applyReceipt(existing, {
    quantity: input.quantity,
    unitCostCents: input.unitCostCents,
  })
  const balance = await persistBalance(scope, result)
  const movement = await createMovement(scope, {
    type: input.movementType || 'RECEIPT',
    quantity: roundQuantity(input.quantity),
    unitCostCents: assertCents(input.unitCostCents, { positive: true }),
    totalValueCents: result.movementValueCents,
    movementDate: input.movementDate,
    referenceType: input.referenceType || null,
    referenceId: input.referenceId || null,
    notes: input.notes || null,
  })
  await auditMutation(actor, 'inventory.stock.received', 'StockMovement', movement.id, {
    movementId: movement.id,
    itemId: item.id,
    warehouseId: scope.warehouseId,
    ...(scope.batchId ? { batchId: scope.batchId } : {}),
    classification: movement.classification,
  })
  await inventoryEvent('StockReceived', {
    entityType: 'STOCK_MOVEMENT',
    entityId: movement.id,
    movementId: movement.id,
    itemId: item.id,
    warehouseId: scope.warehouseId,
    batchId: scope.batchId,
    classification: movement.classification,
  }, { aggregateId: movement.id })
  await maybeEmitReorderAlert(scope, item, beforeQuantity, balance)
  return { balance: toBalanceDto(balance), movement: toMovementDto(movement) }
}

export async function issueStock(input, actor = null) {
  const principal = principalOf(actor)
  const item = await resolveItem(principal.companyId, input.itemId)
  await resolveWarehouse(principal.companyId, input.warehouseId)
  await resolveBatch(principal.companyId, item.id, input.batchId, { requireReleased: true })
  assertBatchRequired(item, input.batchId)
  assertDlpSafe(input.notes)
  const scope = {
    companyId: principal.companyId,
    branchId: input.branchId,
    itemId: item.id,
    warehouseId: input.warehouseId,
    batchId: input.batchId || null,
    classification: input.classification || item.classification,
    createdById: principal.userId,
  }
  const existing = await findBalance(scope.companyId, scope.itemId, scope.warehouseId, scope.batchId)
  const beforeQuantity = existing?.quantity ?? 0
  const result = applyIssue(existing, { quantity: input.quantity })
  const balance = await persistBalance(scope, result)
  const movement = await createMovement(scope, {
    type: input.movementType || 'ISSUE',
    quantity: roundQuantity(input.quantity),
    unitCostCents: result.unitCostCents,
    totalValueCents: result.movementValueCents,
    movementDate: input.movementDate,
    referenceType: input.referenceType || null,
    referenceId: input.referenceId || null,
    notes: input.notes || null,
  })
  await auditMutation(actor, 'inventory.stock.issued', 'StockMovement', movement.id, {
    movementId: movement.id,
    itemId: item.id,
    warehouseId: scope.warehouseId,
    ...(scope.batchId ? { batchId: scope.batchId } : {}),
    classification: movement.classification,
  })
  await inventoryEvent('StockIssued', {
    entityType: 'STOCK_MOVEMENT',
    entityId: movement.id,
    movementId: movement.id,
    itemId: item.id,
    warehouseId: scope.warehouseId,
    batchId: scope.batchId,
    classification: movement.classification,
  }, { aggregateId: movement.id })
  await maybeEmitReorderAlert(scope, item, beforeQuantity, balance)
  return { balance: toBalanceDto(balance), movement: toMovementDto(movement) }
}

export async function adjustStock(input, actor = null) {
  const principal = principalOf(actor)
  const item = await resolveItem(principal.companyId, input.itemId)
  await resolveWarehouse(principal.companyId, input.warehouseId)
  await resolveBatch(principal.companyId, item.id, input.batchId, {
    requireReleased: input.direction === 'OUT',
  })
  assertBatchRequired(item, input.batchId)
  assertDlpSafe(input.reason)
  const scope = {
    companyId: principal.companyId,
    branchId: input.branchId,
    itemId: item.id,
    warehouseId: input.warehouseId,
    batchId: input.batchId || null,
    classification: input.classification || item.classification,
    createdById: principal.userId,
  }
  const existing = await findBalance(scope.companyId, scope.itemId, scope.warehouseId, scope.batchId)
  const beforeQuantity = existing?.quantity ?? 0
  const result = applyAdjustment(existing, input)
  const balance = await persistBalance(scope, result)
  const movement = await createMovement(scope, {
    type: result.movementType,
    quantity: roundQuantity(input.quantity),
    unitCostCents: result.unitCostCents,
    totalValueCents: result.movementValueCents,
    movementDate: input.movementDate,
    referenceType: 'ADJUSTMENT',
    referenceId: null,
    notes: input.reason || null,
  })
  await auditMutation(actor, 'inventory.stock.adjusted', 'StockMovement', movement.id, {
    movementId: movement.id,
    itemId: item.id,
    warehouseId: scope.warehouseId,
    ...(scope.batchId ? { batchId: scope.batchId } : {}),
    classification: movement.classification,
  })
  await inventoryEvent('StockAdjusted', {
    entityType: 'STOCK_MOVEMENT',
    entityId: movement.id,
    movementId: movement.id,
    itemId: item.id,
    warehouseId: scope.warehouseId,
    batchId: scope.batchId,
    classification: movement.classification,
  }, { aggregateId: movement.id })
  await maybeEmitReorderAlert(scope, item, beforeQuantity, balance)
  return { balance: toBalanceDto(balance), movement: toMovementDto(movement) }
}

// ------------------------------------------------------------------ transfers

export async function listTransfers(query = {}, actor = null) {
  const principal = principalOf(actor)
  const dateFilter = query.from || query.to
    ? {
      transferDate: {
        ...(query.from ? { gte: query.from } : {}),
        ...(query.to ? { lte: query.to } : {}),
      },
    }
    : {}
  const rows = await db.stockTransfer.findMany({
    where: {
      ...inventoryTenantWhere(principal.companyId, principal.branchId),
      ...(query.status ? { status: query.status } : {}),
      ...dateFilter,
    },
    orderBy: [{ number: 'desc' }],
    take: limitOf(query.limit),
  })
  return rows.map((row) => toTransferDto(row))
}

export async function getTransfer(id, actor = null) {
  const row = await findRecord('stockTransfer', id, 'Stock transfer', actor)
  return toTransferDto(row, await linesOf('stockTransferLine', 'transferId', row.id, row.companyId))
}

export async function createTransfer(input, actor = null) {
  const principal = principalOf(actor)
  const companyId = principal.companyId
  await resolveWarehouse(companyId, input.sourceWarehouseId)
  await resolveWarehouse(companyId, input.destinationWarehouseId)
  if (input.sourceWarehouseId === input.destinationWarehouseId) {
    throw new HttpError(400, 'Source and destination warehouses must differ')
  }
  assertDlpSafe(input.notes)
  const lines = []
  for (const [position, line] of input.lines.entries()) {
    // eslint-disable-next-line no-await-in-loop
    const item = await resolveItem(companyId, line.itemId)
    // eslint-disable-next-line no-await-in-loop
    await resolveBatch(companyId, item.id, line.batchId)
    assertBatchRequired(item, line.batchId)
    lines.push({
      companyId,
      branchId: input.branchId || null,
      itemId: item.id,
      batchId: line.batchId || null,
      quantity: roundQuantity(line.quantity),
      unitCostCents: 0,
      totalValueCents: 0,
      position: line.position ?? position,
      classification: input.classification || item.classification,
      createdById: principal.userId,
    })
  }
  const row = await db.stockTransfer.create({
    data: {
      companyId,
      branchId: input.branchId || null,
      number: await nextNumber('stockTransfer', 'TRF', companyId),
      status: 'DRAFT',
      sourceWarehouseId: input.sourceWarehouseId,
      destinationWarehouseId: input.destinationWarehouseId,
      transferDate: isoDay(input.transferDate),
      notes: input.notes || null,
      classification: input.classification || 'INTERNAL',
      createdById: principal.userId,
      lines: { create: lines },
    },
  })
  await auditMutation(actor, 'inventory.transfer.created', 'StockTransfer', row.id, {
    transferId: row.id,
    classification: row.classification,
  })
  return toTransferDto(row, lines)
}

export async function approveTransfer(id, actor = null) {
  const transfer = await findRecord('stockTransfer', id, 'Stock transfer', actor)
  assertTransferTransition(transfer.status, 'IN_TRANSIT')
  const principal = principalOf(actor)
  const lines = await linesOf('stockTransferLine', 'transferId', transfer.id, transfer.companyId)
  if (!lines.length) throw new HttpError(409, 'Stock transfer has no lines')
  const movementIds = []
  for (const line of lines) {
    const item = await resolveItem(transfer.companyId, line.itemId)
    // eslint-disable-next-line no-await-in-loop
    await resolveBatch(transfer.companyId, item.id, line.batchId, { requireReleased: true })
    const scope = {
      companyId: transfer.companyId,
      branchId: transfer.branchId,
      itemId: item.id,
      warehouseId: transfer.sourceWarehouseId,
      batchId: line.batchId || null,
      classification: transfer.classification,
      createdById: principal.userId,
    }
    // eslint-disable-next-line no-await-in-loop
    const existing = await findBalance(scope.companyId, scope.itemId, scope.warehouseId, scope.batchId)
    const beforeQuantity = existing?.quantity ?? 0
    const result = calculateTransferIssue(existing, line)
    // eslint-disable-next-line no-await-in-loop
    const balance = await persistBalance(scope, result)
    // eslint-disable-next-line no-await-in-loop
    const movement = await createMovement(scope, {
      type: 'TRANSFER_OUT',
      quantity: line.quantity,
      unitCostCents: result.unitCostCents,
      totalValueCents: result.movementValueCents,
      movementDate: transfer.transferDate,
      referenceType: 'STOCK_TRANSFER',
      referenceId: transfer.id,
      transferLineId: line.id,
      notes: null,
    })
    movementIds.push(movement.id)
    // eslint-disable-next-line no-await-in-loop
    await db.stockTransferLine.update({
      where: { id: line.id },
      data: {
        unitCostCents: result.unitCostCents,
        totalValueCents: result.movementValueCents,
      },
    })
    // eslint-disable-next-line no-await-in-loop
    await maybeEmitReorderAlert(scope, item, beforeQuantity, balance)
  }
  const row = await db.stockTransfer.update({
    where: { id: transfer.id },
    data: { status: 'IN_TRANSIT', approvedAt: new Date(), approvedById: principal.userId },
  })
  await auditMutation(actor, 'inventory.transfer.approved', 'StockTransfer', row.id, {
    transferId: row.id,
    movementIds,
    classification: row.classification,
  })
  await inventoryEvent('StockTransferApproved', {
    entityType: 'STOCK_TRANSFER',
    entityId: row.id,
    transferId: row.id,
    sourceWarehouseId: row.sourceWarehouseId,
    destinationWarehouseId: row.destinationWarehouseId,
    classification: row.classification,
  }, { aggregateId: row.id })
  return toTransferDto(row, await linesOf('stockTransferLine', 'transferId', row.id, row.companyId))
}

export async function receiveTransfer(id, actor = null) {
  const transfer = await findRecord('stockTransfer', id, 'Stock transfer', actor)
  assertTransferTransition(transfer.status, 'RECEIVED')
  const principal = principalOf(actor)
  const lines = await linesOf('stockTransferLine', 'transferId', transfer.id, transfer.companyId)
  const movementIds = []
  for (const line of lines) {
    const receipt = calculateTransferReceipt(line)
    const scope = {
      companyId: transfer.companyId,
      branchId: transfer.branchId,
      itemId: line.itemId,
      warehouseId: transfer.destinationWarehouseId,
      batchId: line.batchId || null,
      classification: transfer.classification,
      createdById: principal.userId,
    }
    // eslint-disable-next-line no-await-in-loop
    const existing = await findBalance(scope.companyId, scope.itemId, scope.warehouseId, scope.batchId)
    const beforeQuantity = existing?.quantity ?? 0
    const result = applyReceipt(existing, {
      quantity: receipt.quantity,
      unitCostCents: receipt.unitCostCents,
    }, { allowZeroCost: true })
    // eslint-disable-next-line no-await-in-loop
    const balance = await persistBalance(scope, result)
    // eslint-disable-next-line no-await-in-loop
    const movement = await createMovement(scope, {
      type: 'TRANSFER_IN',
      quantity: receipt.quantity,
      unitCostCents: receipt.unitCostCents,
      totalValueCents: receipt.totalValueCents,
      movementDate: transfer.transferDate,
      referenceType: 'STOCK_TRANSFER',
      referenceId: transfer.id,
      transferLineId: line.id,
      notes: null,
    })
    movementIds.push(movement.id)
    // eslint-disable-next-line no-await-in-loop
    await maybeEmitReorderAlert(scope, { id: line.itemId, reorderLevel: 0, classification: transfer.classification }, beforeQuantity, balance)
  }
  const row = await db.stockTransfer.update({
    where: { id: transfer.id },
    data: { status: 'RECEIVED', receivedAt: new Date() },
  })
  await auditMutation(actor, 'inventory.transfer.received', 'StockTransfer', row.id, {
    transferId: row.id,
    movementIds,
    classification: row.classification,
  })
  return toTransferDto(row, await linesOf('stockTransferLine', 'transferId', row.id, row.companyId))
}

export async function cancelTransfer(id, actor = null) {
  const transfer = await findRecord('stockTransfer', id, 'Stock transfer', actor)
  assertTransferTransition(transfer.status, 'CANCELLED')
  const row = await db.stockTransfer.update({ where: { id: transfer.id }, data: { status: 'CANCELLED' } })
  await auditMutation(actor, 'inventory.transfer.cancelled', 'StockTransfer', row.id, {
    transferId: row.id,
    classification: row.classification,
  })
  return toTransferDto(row, await linesOf('stockTransferLine', 'transferId', row.id, row.companyId))
}

// -------------------------------------------------------------- stock counts

export async function listCounts(query = {}, actor = null) {
  const principal = principalOf(actor)
  const dateFilter = query.from || query.to
    ? {
      countDate: {
        ...(query.from ? { gte: query.from } : {}),
        ...(query.to ? { lte: query.to } : {}),
      },
    }
    : {}
  const rows = await db.stockCount.findMany({
    where: {
      ...inventoryTenantWhere(principal.companyId, principal.branchId),
      ...(query.status ? { status: query.status } : {}),
      ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
      ...dateFilter,
    },
    orderBy: [{ number: 'desc' }],
    take: limitOf(query.limit),
  })
  return rows.map((row) => toCountDto(row))
}

export async function getCount(id, actor = null) {
  const row = await findRecord('stockCount', id, 'Stock count', actor)
  return toCountDto(row, await linesOf('stockCountLine', 'countId', row.id, row.companyId))
}

async function buildCountLines(companyId, warehouseId, lines, actor) {
  const principal = principalOf(actor)
  const result = []
  for (const [position, line] of lines.entries()) {
    const item = await resolveItem(companyId, line.itemId)
    // eslint-disable-next-line no-await-in-loop
    await resolveBatch(companyId, item.id, line.batchId)
    assertBatchRequired(item, line.batchId)
    // eslint-disable-next-line no-await-in-loop
    const balance = await findBalance(companyId, item.id, warehouseId, line.batchId || null)
    const variance = calculateCountVariance({
      expectedQty: balance?.quantity ?? 0,
      countedQty: line.countedQty,
      unitCostCents: balance?.unitCostCents ?? 0,
    })
    result.push({
      companyId,
      branchId: principal.branchId || null,
      itemId: item.id,
      batchId: line.batchId || null,
      expectedQty: variance.expectedQty,
      countedQty: line.countedQty,
      varianceQty: variance.varianceQty,
      unitCostCents: variance.unitCostCents,
      varianceValueCents: variance.varianceValueCents,
      position: line.position ?? position,
      classification: item.classification,
      createdById: principal.userId,
    })
  }
  return result
}

export async function startCount(input, actor = null) {
  const principal = principalOf(actor)
  await resolveWarehouse(principal.companyId, input.warehouseId)
  assertDlpSafe(input.notes)
  const lines = await buildCountLines(principal.companyId, input.warehouseId, input.lines, actor)
  const row = await db.stockCount.create({
    data: {
      companyId: principal.companyId,
      branchId: input.branchId || null,
      number: await nextNumber('stockCount', 'CNT', principal.companyId),
      status: 'DRAFT',
      warehouseId: input.warehouseId,
      countDate: isoDay(input.countDate),
      notes: input.notes || null,
      classification: input.classification || 'INTERNAL',
      createdById: principal.userId,
      lines: { create: lines },
    },
  })
  await auditMutation(actor, 'inventory.count.created', 'StockCount', row.id, {
    countId: row.id,
    warehouseId: row.warehouseId,
    classification: row.classification,
  })
  return toCountDto(row, lines)
}

export async function recordCount(id, input, actor = null) {
  const count = await findRecord('stockCount', id, 'Stock count', actor)
  if (!['DRAFT', 'COUNTING'].includes(count.status)) throw new HttpError(409, 'Only open stock counts can be recorded')
  assertDlpSafe(input.notes)
  const existingLines = await linesOf('stockCountLine', 'countId', count.id, count.companyId)
  const updates = []
  for (const line of input.lines) {
    const existing = existingLines.find((entry) => entry.itemId === line.itemId && (entry.batchId || null) === (line.batchId || null))
    if (!existing) throw new HttpError(404, 'Count line not found')
    const variance = calculateCountVariance({
      expectedQty: existing.expectedQty,
      countedQty: line.countedQty,
      unitCostCents: existing.unitCostCents,
    })
    updates.push(db.stockCountLine.update({
      where: { id: existing.id },
      data: {
        countedQty: variance.countedQty,
        varianceQty: variance.varianceQty,
        varianceValueCents: variance.varianceValueCents,
      },
    }))
  }
  await Promise.all(updates)
  const row = await db.stockCount.update({
    where: { id: count.id },
    data: {
      status: 'COUNTING',
      ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
    },
  })
  await auditMutation(actor, 'inventory.count.recorded', 'StockCount', row.id, {
    countId: row.id,
    warehouseId: row.warehouseId,
    classification: row.classification,
  })
  return toCountDto(row, await linesOf('stockCountLine', 'countId', row.id, row.companyId))
}

export async function approveCount(id, actor = null) {
  const count = await findRecord('stockCount', id, 'Stock count', actor)
  assertCountTransition(count.status, 'APPROVED')
  const principal = principalOf(actor)
  const lines = await linesOf('stockCountLine', 'countId', count.id, count.companyId)
  const adjustments = buildCountAdjustments(lines)
  const movementIds = []
  for (const adjustment of adjustments) {
    const scope = {
      companyId: count.companyId,
      branchId: count.branchId,
      itemId: adjustment.itemId,
      warehouseId: count.warehouseId,
      batchId: adjustment.batchId || null,
      classification: count.classification,
      createdById: principal.userId,
    }
    // eslint-disable-next-line no-await-in-loop
    const balance = await findBalance(scope.companyId, scope.itemId, scope.warehouseId, scope.batchId)
    let result
    if (adjustment.movementType === 'COUNT_GAIN') {
      result = applyReceipt(balance, {
        quantity: adjustment.quantity,
        unitCostCents: adjustment.unitCostCents,
      }, { allowZeroCost: true })
    } else {
      // eslint-disable-next-line no-await-in-loop
      await resolveBatch(count.companyId, adjustment.itemId, adjustment.batchId, { requireReleased: true })
      result = applyIssue(balance, { quantity: adjustment.quantity })
    }
    // eslint-disable-next-line no-await-in-loop
    await persistBalance(scope, result)
    // eslint-disable-next-line no-await-in-loop
    const movement = await createMovement(scope, {
      type: adjustment.movementType,
      quantity: adjustment.quantity,
      unitCostCents: result.unitCostCents,
      totalValueCents: result.movementValueCents,
      movementDate: count.countDate,
      referenceType: 'STOCK_COUNT',
      referenceId: count.id,
      countLineId: adjustment.id,
      notes: null,
    })
    movementIds.push(movement.id)
  }
  const row = await db.stockCount.update({
    where: { id: count.id },
    data: { status: 'APPROVED', approvedAt: new Date(), approvedById: principal.userId },
  })
  await auditMutation(actor, 'inventory.count.approved', 'StockCount', row.id, {
    countId: row.id,
    warehouseId: row.warehouseId,
    movementIds,
    classification: row.classification,
  })
  await inventoryEvent('StockCountApproved', {
    entityType: 'STOCK_COUNT',
    entityId: row.id,
    countId: row.id,
    warehouseId: row.warehouseId,
    classification: row.classification,
  }, { aggregateId: row.id })
  return toCountDto(row, await linesOf('stockCountLine', 'countId', row.id, row.companyId))
}

export async function cancelCount(id, actor = null) {
  const count = await findRecord('stockCount', id, 'Stock count', actor)
  assertCountTransition(count.status, 'CANCELLED')
  const row = await db.stockCount.update({ where: { id: count.id }, data: { status: 'CANCELLED' } })
  await auditMutation(actor, 'inventory.count.cancelled', 'StockCount', row.id, {
    countId: row.id,
    warehouseId: row.warehouseId,
    classification: row.classification,
  })
  return toCountDto(row, await linesOf('stockCountLine', 'countId', row.id, row.companyId))
}
