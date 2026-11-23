// Phase 13 manufacturing lifecycle service.
//
// Work centers, BOMs, production orders, GMP batch records and QC checks are
// tenant/branch scoped through the Prisma proxy in lib/tenant.js. Money is
// integer cents; quantities are rounded once at this boundary. Deviation and
// QC result notes are encrypted at rest and never decrypted into DTOs, audit
// metadata or events. Domain events contain opaque IDs and classification only.

import { randomBytes } from 'node:crypto'
import { db, getTenantContext } from './tenant.js'
import { emitEvent } from './events.js'
import { recordAudit, recordRequestAudit } from './audit.js'
import { HttpError } from './util.js'
import { encryptString } from './crypto.js'
import {
  createBatch, inventoryTenantWhere, issueStock, receiveStock, roundQuantity,
} from './inventory.js'

const MAX_LIST = 200
const MILLI = 1000n
const NOTES_KEY_ID = 'object-encryption-v1'

// ------------------------------------------------------------- small helpers

function tenantId() {
  const ctx = getTenantContext() || {}
  return ctx.companyId || 'cmp_comet'
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

/** Tenant + optional branch scope. A NULL branchId is visible to every branch. */
export function manufacturingTenantWhere(companyId, branchId) {
  const scope = { companyId: companyId || tenantId() }
  if (branchId) return { ...scope, OR: [{ branchId: null }, { branchId }] }
  return scope
}

function limitOf(value, fallback = 50) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.min(Math.floor(parsed), MAX_LIST)
}

function idOf(value, label) {
  const id = typeof value === 'string' ? value.trim() : ''
  if (!id) throw new HttpError(400, `${label} is required`)
  return id
}

function isoInstant(value, label = 'Timestamp') {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) throw new HttpError(400, `Invalid ${label}`)
  return date.toISOString()
}

function isoDay(value, label = 'Date') {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new HttpError(400, `Invalid ${label}`)
    return value.toISOString().slice(0, 10)
  }
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new HttpError(400, `Invalid ${label}`)
  }
  const date = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new HttpError(400, `Invalid ${label}`)
  }
  return value
}

function dayInstant(value, label = 'Date') {
  return new Date(`${isoDay(value, label)}T00:00:00.000Z`)
}

function isoOrNullDto(value) {
  return value ? isoInstant(value) : null
}

function dayOrNullDto(value) {
  if (!value) return null
  return isoDay(value)
}

function quantityDto(value) {
  return value === null || value === undefined ? null : Number(value)
}

function assertCents(value, label = 'Amount', { positive = false } = {}) {
  const cents = Number(value)
  if (!Number.isSafeInteger(cents) || (positive ? cents <= 0 : cents < 0)) {
    throw new HttpError(400, positive
      ? `${label} must be a positive integer number of cents`
      : `${label} must be a non-negative integer number of cents`)
  }
  return cents
}

/** Exact three-decimal quantity to integer milli-units. */
function quantityToMilli(value, label = 'Quantity') {
  const text = typeof value === 'number' || typeof value === 'bigint' ? String(value) : String(value ?? '').trim()
  if (!/^\d+(?:\.\d{1,3})?$/.test(text)) throw new HttpError(400, `Invalid ${label}`)
  const [whole, fraction = ''] = text.split('.')
  const milli = BigInt(whole) * MILLI + BigInt(fraction.padEnd(3, '0'))
  if (milli <= 0n) throw new HttpError(400, `${label} must be greater than zero`)
  return milli
}

function milliToQuantity(milli) {
  return Number(milli) / 1000
}

/**
 * Line cost in whole cents. Quantity is scaled to milli-units and the single
 * half-up rounding step happens at the cent boundary; no float enters a
 * *Cents column.
 */
export function calculateBomLineCostCents(quantity, unitCostCents) {
  const cost = assertCents(unitCostCents, 'Unit cost')
  const milli = quantityToMilli(quantity)
  const cents = Number((milli * BigInt(cost) + 500n) / MILLI)
  if (!Number.isSafeInteger(cents)) throw new HttpError(400, 'Line cost exceeds safe integer cents')
  return cents
}

export function calculateBomStandardCostCents(lines) {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new HttpError(400, 'A BOM needs at least one line')
  }
  return lines.reduce((sum, line) => sum + calculateBomLineCostCents(line.quantity, line.unitCostCents), 0)
}

/** Multiply two rounded quantities once, keeping three decimal places. */
export function multiplyQuantities(a, b) {
  const product = quantityToMilli(a) * quantityToMilli(b)
  return milliToQuantity((product + 500n) / MILLI)
}

function generateCode(prefix) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${randomBytes(2).toString('hex').toUpperCase()}`
}

function notesEnvelope(value) {
  if (!value) return { encrypted: null, keyId: null }
  return { encrypted: encryptString(value), keyId: NOTES_KEY_ID }
}

function translatePrisma(error, label) {
  if (error?.code === 'P2002') throw new HttpError(409, `${label} already exists`)
  throw error
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

async function manufacturingEvent(type, data, aggregateId, aggregateType = 'Manufacturing') {
  return emitEvent(type, data, { aggregateType, aggregateId })
}

const delegates = {
  workCenter: db.workCenter,
  bom: db.bom,
  bomLine: db.bomLine,
  order: db.productionOrder,
  orderLine: db.productionOrderLine,
  batch: db.batchRecord,
  qcCheck: db.qcCheck,
}

const labels = {
  workCenter: 'Work center',
  bom: 'BOM',
  bomLine: 'BOM line',
  order: 'Production order',
  orderLine: 'Production order line',
  batch: 'Batch record',
  qcCheck: 'QC check',
}

async function findRecord(kind, id, actor) {
  const principal = principalOf(actor)
  const row = await delegates[kind].findFirst({
    where: {
      id: idOf(id, labels[kind]),
      ...manufacturingTenantWhere(principal.companyId, principal.branchId),
      ...(kind === 'workCenter' || kind === 'bom' || kind === 'order' ? { deletedAt: null } : {}),
    },
  })
  if (!row) throw new HttpError(404, `${labels[kind]} not found`)
  return row
}

async function assertBranch(companyId, branchId) {
  if (!branchId) return null
  const branch = await db.branch.findFirst({ where: { id: branchId, companyId } })
  if (!branch) throw new HttpError(400, 'Invalid branch')
  return branch
}

async function assertItem(companyId, itemId) {
  const item = await db.inventoryItem.findFirst({
    where: { id: idOf(itemId, 'Inventory item'), ...inventoryTenantWhere(companyId, null) },
  })
  if (!item) throw new HttpError(400, 'Invalid inventory item')
  return item
}

async function assertWarehouse(companyId, warehouseId) {
  const warehouse = await db.warehouse.findFirst({
    where: { id: idOf(warehouseId, 'Warehouse'), ...inventoryTenantWhere(companyId, null) },
  })
  if (!warehouse) throw new HttpError(400, 'Invalid warehouse')
  return warehouse
}

// --------------------------------------------------------- state machines

export function assertBomTransition(current, next) {
  const allowed = {
    DRAFT: ['APPROVED', 'OBSOLETE'],
    APPROVED: ['OBSOLETE'],
    OBSOLETE: [],
  }
  if (!allowed[current]?.includes(next)) {
    throw new HttpError(409, `Cannot change BOM status from ${current} to ${next}`)
  }
  return true
}

export function assertOrderTransition(current, next) {
  const allowed = {
    DRAFT: ['RELEASED', 'CANCELLED'],
    RELEASED: ['IN_PROGRESS', 'CANCELLED'],
    IN_PROGRESS: ['COMPLETED', 'QUALITY_HOLD'],
    QUALITY_HOLD: ['COMPLETED'],
    COMPLETED: [],
    CANCELLED: [],
  }
  if (!allowed[current]?.includes(next)) {
    throw new HttpError(409, `Cannot change production order status from ${current} to ${next}`)
  }
  return true
}

export function assertBatchTransition(current, next) {
  const allowed = {
    OPEN: ['IN_PROGRESS', 'REJECTED'],
    IN_PROGRESS: ['REVIEW', 'REJECTED'],
    REVIEW: ['REJECTED'],
    RELEASED: [],
    REJECTED: [],
  }
  if (!allowed[current]?.includes(next)) {
    throw new HttpError(409, `Cannot change batch status from ${current} to ${next}`)
  }
  return true
}

export function assertQcTransition(current, next) {
  const allowed = {
    PENDING: ['REVIEW', 'PASS', 'FAIL'],
    REVIEW: ['PASS', 'FAIL'],
    PASS: [],
    FAIL: [],
  }
  if (!allowed[current]?.includes(next)) {
    throw new HttpError(409, `Cannot change QC check status from ${current} to ${next}`)
  }
  return true
}

/** Pure release guard used by the release endpoint and exercised by tests. */
export function assertBatchReleaseReady(batch, checks, releaserUserId, order) {
  if (!batch) throw new HttpError(404, 'Batch record not found')
  if (batch.status !== 'REVIEW') throw new HttpError(409, 'Batch must be in REVIEW before release')
  if (!batch.batchNumber) throw new HttpError(400, 'GMP batch number is required')
  if (!batch.manufacturingDate || !batch.expiryDate) {
    throw new HttpError(400, 'Manufacturing and expiry dates are required')
  }
  if (!batch.openedByUserId || !batch.reviewedByUserId || !releaserUserId) {
    throw new HttpError(400, 'Batch signatures are incomplete')
  }
  if (batch.reviewedByUserId === releaserUserId) {
    throw new HttpError(403, 'Batch reviewer and releaser must be different users')
  }
  if (batch.openedByUserId === releaserUserId || order?.createdByUserId === releaserUserId) {
    throw new HttpError(403, 'Production users cannot release their own batch')
  }
  if (!Array.isArray(checks) || checks.length === 0) {
    throw new HttpError(409, 'At least one mandatory QC check is required')
  }
  if (checks.some((check) => check.status === 'FAIL')) {
    throw new HttpError(409, 'QC failure blocks batch release')
  }
  if (checks.some((check) => check.status !== 'PASS')) {
    throw new HttpError(409, 'All QC checks must pass before batch release')
  }
  if (!checks.some((check) => check.isMandatory)) {
    throw new HttpError(409, 'At least one mandatory QC check is required')
  }
  return true
}

// ---------------------------------------------------------------- DTOs

export function toWorkCenterDto(row) {
  if (!row) return null
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description ?? null,
    status: row.status,
    capacityPerDay: quantityDto(row.capacityPerDay),
    branchId: row.branchId ?? null,
    classification: row.classification,
    createdAt: isoOrNullDto(row.createdAt),
    updatedAt: isoOrNullDto(row.updatedAt),
  }
}

export function toBomLineDto(row) {
  if (!row) return null
  return {
    id: row.id,
    bomId: row.bomId,
    itemId: row.itemId,
    quantity: quantityDto(row.quantity),
    uom: row.uom,
    unitCostCents: row.unitCostCents,
    lineCostCents: calculateBomLineCostCents(row.quantity, row.unitCostCents),
    isCritical: row.isCritical,
    sequence: row.sequence,
    classification: row.classification,
  }
}

export function toBomDto(row) {
  if (!row) return null
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    productItemId: row.productItemId,
    version: row.version,
    status: row.status,
    standardCostCents: row.standardCostCents,
    effectiveFrom: dayOrNullDto(row.effectiveFrom),
    effectiveTo: dayOrNullDto(row.effectiveTo),
    approvedByUserId: row.approvedByUserId ?? null,
    approvedAt: isoOrNullDto(row.approvedAt),
    branchId: row.branchId ?? null,
    classification: row.classification,
    lines: Array.isArray(row.lines) ? row.lines.map(toBomLineDto) : [],
    createdAt: isoOrNullDto(row.createdAt),
    updatedAt: isoOrNullDto(row.updatedAt),
  }
}

export function toOrderLineDto(row) {
  if (!row) return null
  return {
    id: row.id,
    orderId: row.orderId,
    itemId: row.itemId,
    quantityRequired: quantityDto(row.quantityRequired),
    quantityIssued: quantityDto(row.quantityIssued),
    uom: row.uom,
    sequence: row.sequence,
    classification: row.classification,
  }
}

export function toOrderDto(row) {
  if (!row) return null
  return {
    id: row.id,
    orderNumber: row.orderNumber,
    bomId: row.bomId,
    workCenterId: row.workCenterId,
    productItemId: row.productItemId,
    quantityPlanned: quantityDto(row.quantityPlanned),
    quantityProduced: quantityDto(row.quantityProduced),
    uom: row.uom,
    status: row.status,
    plannedStartDate: dayOrNullDto(row.plannedStartDate),
    plannedEndDate: dayOrNullDto(row.plannedEndDate),
    releasedByUserId: row.releasedByUserId ?? null,
    releasedAt: isoOrNullDto(row.releasedAt),
    startedByUserId: row.startedByUserId ?? null,
    startedAt: isoOrNullDto(row.startedAt),
    completedByUserId: row.completedByUserId ?? null,
    completedAt: isoOrNullDto(row.completedAt),
    branchId: row.branchId ?? null,
    classification: row.classification,
    lines: Array.isArray(row.lines) ? row.lines.map(toOrderLineDto) : [],
    createdAt: isoOrNullDto(row.createdAt),
    updatedAt: isoOrNullDto(row.updatedAt),
  }
}

export function toBatchDto(row) {
  if (!row) return null
  return {
    id: row.id,
    batchNumber: row.batchNumber,
    productionOrderId: row.productionOrderId,
    bomId: row.bomId,
    productItemId: row.productItemId,
    workCenterId: row.workCenterId ?? null,
    inventoryBatchId: row.inventoryBatchId ?? null,
    quantityProduced: quantityDto(row.quantityProduced),
    uom: row.uom,
    status: row.status,
    manufacturingDate: dayOrNullDto(row.manufacturingDate),
    expiryDate: dayOrNullDto(row.expiryDate),
    deviationNotesPresent: Boolean(row.deviationNotesEncrypted),
    openedByUserId: row.openedByUserId,
    reviewedByUserId: row.reviewedByUserId ?? null,
    reviewedAt: isoOrNullDto(row.reviewedAt),
    releasedByUserId: row.releasedByUserId ?? null,
    releasedAt: isoOrNullDto(row.releasedAt),
    branchId: row.branchId ?? null,
    classification: row.classification,
    createdAt: isoOrNullDto(row.createdAt),
    updatedAt: isoOrNullDto(row.updatedAt),
  }
}

export function toQcCheckDto(row) {
  if (!row) return null
  return {
    id: row.id,
    batchId: row.batchId,
    checkCode: row.checkCode,
    name: row.name,
    isMandatory: row.isMandatory,
    status: row.status,
    observedValue: row.observedValue ?? null,
    resultNotesPresent: Boolean(row.resultNotesEncrypted),
    signedByUserId: row.signedByUserId ?? null,
    signedAt: isoOrNullDto(row.signedAt),
    branchId: row.branchId ?? null,
    classification: row.classification,
    createdAt: isoOrNullDto(row.createdAt),
    updatedAt: isoOrNullDto(row.updatedAt),
  }
}

const bomInclude = { lines: { orderBy: [{ sequence: 'asc' }, { itemId: 'asc' }] } }
const orderInclude = { lines: { orderBy: [{ sequence: 'asc' }, { itemId: 'asc' }] } }

// --------------------------------------------------------------- work centers

export async function listWorkCenters(query = {}, actor = null) {
  const principal = principalOf(actor)
  const rows = await db.workCenter.findMany({
    where: {
      ...manufacturingTenantWhere(principal.companyId, principal.branchId),
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
    },
    orderBy: [{ code: 'asc' }],
    take: limitOf(query.limit),
  })
  return rows.map(toWorkCenterDto)
}

export async function getWorkCenter(id, actor = null) {
  return toWorkCenterDto(await findRecord('workCenter', id, actor))
}

export async function createWorkCenter(input, actor = null) {
  const principal = principalOf(actor)
  await assertBranch(principal.companyId, input.branchId || null)
  const data = {
    companyId: principal.companyId,
    branchId: input.branchId || null,
    code: input.code || generateCode('WC'),
    name: input.name,
    description: input.description || null,
    status: input.status || 'ACTIVE',
    capacityPerDay: input.capacityPerDay ?? null,
    classification: input.classification || 'INTERNAL',
    createdByUserId: principal.userId,
  }
  try {
    const row = await db.workCenter.create({ data })
    await auditMutation(actor, 'manufacturing.workcenter.created', 'WorkCenter', row.id, {
      workCenterId: row.id,
      classification: row.classification,
    })
    return toWorkCenterDto(row)
  } catch (error) {
    return translatePrisma(error, 'Work center')
  }
}

export async function updateWorkCenter(id, input, actor = null) {
  const existing = await findRecord('workCenter', id, actor)
  const principal = principalOf(actor)
  if (Object.prototype.hasOwnProperty.call(input, 'branchId')) {
    await assertBranch(principal.companyId, input.branchId || null)
  }
  const row = await db.workCenter.update({
    where: { id: existing.id },
    data: {
      ...(input.name ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description || null } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.capacityPerDay !== undefined ? { capacityPerDay: input.capacityPerDay ?? null } : {}),
      ...(input.branchId !== undefined ? { branchId: input.branchId || null } : {}),
      ...(input.classification ? { classification: input.classification } : {}),
    },
  })
  await auditMutation(actor, 'manufacturing.workcenter.updated', 'WorkCenter', row.id, {
    workCenterId: row.id,
    classification: row.classification,
  })
  return toWorkCenterDto(row)
}

export async function deleteWorkCenter(id, actor = null) {
  const existing = await findRecord('workCenter', id, actor)
  const inUse = await db.productionOrder.count({
    where: { workCenterId: existing.id, companyId: existing.companyId, deletedAt: null },
  })
  if (inUse > 0) throw new HttpError(409, 'Work center is referenced by production orders')
  const row = await db.workCenter.update({
    where: { id: existing.id },
    data: { deletedAt: new Date(), status: 'INACTIVE' },
  })
  await auditMutation(actor, 'manufacturing.workcenter.deleted', 'WorkCenter', row.id, {
    workCenterId: row.id,
    classification: row.classification,
  })
  return toWorkCenterDto(row)
}

// ----------------------------------------------------------------------- BOMs

export async function listBoms(query = {}, actor = null) {
  const principal = principalOf(actor)
  const rows = await db.bom.findMany({
    where: {
      ...manufacturingTenantWhere(principal.companyId, principal.branchId),
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.productItemId ? { productItemId: query.productItemId } : {}),
    },
    include: bomInclude,
    orderBy: [{ code: 'asc' }],
    take: limitOf(query.limit),
  })
  return rows.map(toBomDto)
}

export async function getBom(id, actor = null) {
  return toBomDto(await findRecord('bom', id, actor).then((row) => (
    db.bom.findFirst({ where: { id: row.id }, include: bomInclude })
  )))
}

async function replaceBomLines(bomId, companyId, branchId, lines) {
  await db.bomLine.deleteMany({ where: { bomId, companyId } })
  if (!lines?.length) return
  await db.bomLine.createMany({
    data: lines.map((line) => ({
      companyId,
      branchId: line.branchId ?? branchId ?? null,
      bomId,
      itemId: line.itemId,
      quantity: roundQuantity(line.quantity),
      uom: line.uom || 'EA',
      unitCostCents: assertCents(line.unitCostCents, 'Unit cost'),
      isCritical: Boolean(line.isCritical),
      sequence: line.sequence ?? 0,
      classification: 'INTERNAL',
    })),
  })
}

export async function createBom(input, actor = null) {
  const principal = principalOf(actor)
  await assertBranch(principal.companyId, input.branchId || null)
  await assertItem(principal.companyId, input.productItemId)
  for (const line of input.lines) await assertItem(principal.companyId, line.itemId)
  const standardCostCents = calculateBomStandardCostCents(input.lines)
  try {
    const row = await db.bom.create({
      data: {
        companyId: principal.companyId,
        branchId: input.branchId || null,
        code: input.code || generateCode('BOM'),
        name: input.name,
        productItemId: input.productItemId,
        version: input.version || '1',
        status: 'DRAFT',
        standardCostCents,
        effectiveFrom: input.effectiveFrom ? dayInstant(input.effectiveFrom, 'Effective from') : null,
        effectiveTo: input.effectiveTo ? dayInstant(input.effectiveTo, 'Effective to') : null,
        classification: input.classification || 'INTERNAL',
        createdByUserId: principal.userId,
      },
    })
    await replaceBomLines(row.id, row.companyId, row.branchId, input.lines)
    const full = await db.bom.findFirst({ where: { id: row.id }, include: bomInclude })
    await auditMutation(actor, 'manufacturing.bom.created', 'Bom', row.id, {
      bomId: row.id,
      productItemId: row.productItemId,
      classification: row.classification,
    })
    return toBomDto(full)
  } catch (error) {
    return translatePrisma(error, 'BOM')
  }
}

export async function updateBom(id, input, actor = null) {
  const existing = await findRecord('bom', id, actor)
  if (existing.status !== 'DRAFT') throw new HttpError(409, 'Only draft BOMs can be edited')
  const principal = principalOf(actor)
  if (Object.prototype.hasOwnProperty.call(input, 'branchId')) {
    await assertBranch(principal.companyId, input.branchId || null)
  }
  for (const line of input.lines || []) await assertItem(principal.companyId, line.itemId)
  const standardCostCents = input.lines ? calculateBomStandardCostCents(input.lines) : existing.standardCostCents
  const row = await db.bom.update({
    where: { id: existing.id },
    data: {
      ...(input.name ? { name: input.name } : {}),
      ...(input.effectiveFrom !== undefined
        ? { effectiveFrom: input.effectiveFrom ? dayInstant(input.effectiveFrom, 'Effective from') : null }
        : {}),
      ...(input.effectiveTo !== undefined
        ? { effectiveTo: input.effectiveTo ? dayInstant(input.effectiveTo, 'Effective to') : null }
        : {}),
      ...(input.branchId !== undefined ? { branchId: input.branchId || null } : {}),
      ...(input.classification ? { classification: input.classification } : {}),
      standardCostCents,
    },
  })
  if (input.lines) await replaceBomLines(row.id, row.companyId, row.branchId, input.lines)
  const full = await db.bom.findFirst({ where: { id: row.id }, include: bomInclude })
  await auditMutation(actor, 'manufacturing.bom.updated', 'Bom', row.id, {
    bomId: row.id,
    classification: row.classification,
  })
  return toBomDto(full)
}

export async function transitionBom(id, status, actor = null) {
  const existing = await findRecord('bom', id, actor)
  assertBomTransition(existing.status, status)
  const principal = principalOf(actor)
  if (status === 'APPROVED') {
    if (!principal.userId) throw new HttpError(400, 'Approver identity is required')
    if (existing.createdByUserId && existing.createdByUserId === principal.userId) {
      throw new HttpError(403, 'BOM creator cannot approve their own BOM')
    }
  }
  const row = await db.bom.update({
    where: { id: existing.id },
    data: {
      status,
      ...(status === 'APPROVED'
        ? { approvedByUserId: principal.userId, approvedAt: new Date() }
        : {}),
    },
  })
  await auditMutation(actor, 'manufacturing.bom.transitioned', 'Bom', row.id, {
    bomId: row.id,
    classification: row.classification,
  })
  if (status === 'APPROVED') {
    await manufacturingEvent('BomApproved', {
      entityType: 'BOM',
      entityId: row.id,
      bomId: row.id,
      productItemId: row.productItemId,
      classification: row.classification,
    }, row.id, 'Bom')
  }
  return toBomDto(await db.bom.findFirst({ where: { id: row.id }, include: bomInclude }))
}

// ----------------------------------------------------------- production orders

export async function listOrders(query = {}, actor = null) {
  const principal = principalOf(actor)
  const rows = await db.productionOrder.findMany({
    where: {
      ...manufacturingTenantWhere(principal.companyId, principal.branchId),
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.workCenterId ? { workCenterId: query.workCenterId } : {}),
    },
    include: orderInclude,
    orderBy: [{ orderNumber: 'asc' }],
    take: limitOf(query.limit),
  })
  return rows.map(toOrderDto)
}

export async function getOrder(id, actor = null) {
  const row = await findRecord('order', id, actor)
  return toOrderDto(await db.productionOrder.findFirst({ where: { id: row.id }, include: orderInclude }))
}

export async function createOrder(input, actor = null) {
  const principal = principalOf(actor)
  await assertBranch(principal.companyId, input.branchId || null)
  const bom = await findRecord('bom', input.bomId, actor)
  if (bom.status !== 'APPROVED') throw new HttpError(409, 'Only approved BOMs can be used for production')
  const workCenter = await findRecord('workCenter', input.workCenterId, actor)
  if (workCenter.status !== 'ACTIVE') throw new HttpError(409, 'Work center is not active')
  await assertItem(principal.companyId, input.productItemId)
  if (input.productItemId !== bom.productItemId) {
    throw new HttpError(400, 'Output item must match the BOM product')
  }
  const lines = await db.bomLine.findMany({
    where: { bomId: bom.id, companyId: principal.companyId },
    orderBy: [{ sequence: 'asc' }, { itemId: 'asc' }],
  })
  try {
    const row = await db.productionOrder.create({
      data: {
        companyId: principal.companyId,
        branchId: input.branchId || null,
        orderNumber: input.orderNumber || generateCode('PO'),
        bomId: bom.id,
        workCenterId: workCenter.id,
        productItemId: input.productItemId,
        quantityPlanned: roundQuantity(input.quantityPlanned),
        uom: input.uom || 'EA',
        status: 'DRAFT',
        plannedStartDate: input.plannedStartDate ? dayInstant(input.plannedStartDate, 'Planned start') : null,
        plannedEndDate: input.plannedEndDate ? dayInstant(input.plannedEndDate, 'Planned end') : null,
        classification: input.classification || 'INTERNAL',
        createdByUserId: principal.userId,
        lines: {
          create: lines.map((line) => ({
            companyId: principal.companyId,
            branchId: input.branchId || null,
            itemId: line.itemId,
            quantityRequired: multiplyQuantities(line.quantity, input.quantityPlanned),
            uom: line.uom,
            sequence: line.sequence,
            classification: 'INTERNAL',
          })),
        },
      },
      include: orderInclude,
    })
    await auditMutation(actor, 'manufacturing.order.created', 'ProductionOrder', row.id, {
      orderId: row.id,
      bomId: row.bomId,
      classification: row.classification,
    })
    return toOrderDto(row)
  } catch (error) {
    return translatePrisma(error, 'Production order')
  }
}

export async function updateOrder(id, input, actor = null) {
  const existing = await findRecord('order', id, actor)
  if (existing.status !== 'DRAFT') throw new HttpError(409, 'Only draft production orders can be edited')
  const principal = principalOf(actor)
  if (Object.prototype.hasOwnProperty.call(input, 'branchId')) {
    await assertBranch(principal.companyId, input.branchId || null)
  }
  const row = await db.productionOrder.update({
    where: { id: existing.id },
    data: {
      ...(input.quantityPlanned !== undefined
        ? { quantityPlanned: roundQuantity(input.quantityPlanned) }
        : {}),
      ...(input.uom ? { uom: input.uom } : {}),
      ...(input.plannedStartDate !== undefined
        ? { plannedStartDate: input.plannedStartDate ? dayInstant(input.plannedStartDate, 'Planned start') : null }
        : {}),
      ...(input.plannedEndDate !== undefined
        ? { plannedEndDate: input.plannedEndDate ? dayInstant(input.plannedEndDate, 'Planned end') : null }
        : {}),
      ...(input.branchId !== undefined ? { branchId: input.branchId || null } : {}),
      ...(input.classification ? { classification: input.classification } : {}),
    },
    include: orderInclude,
  })
  await auditMutation(actor, 'manufacturing.order.updated', 'ProductionOrder', row.id, {
    orderId: row.id,
    classification: row.classification,
  })
  return toOrderDto(row)
}

export async function transitionOrder(id, status, actor = null) {
  const existing = await findRecord('order', id, actor)
  assertOrderTransition(existing.status, status)
  const principal = principalOf(actor)
  if (!principal.userId) throw new HttpError(400, 'User identity is required for this transition')

  if (status === 'RELEASED' && existing.createdByUserId === principal.userId) {
    throw new HttpError(403, 'Order creator cannot release their own order')
  }
  if (status === 'COMPLETED') {
    if (existing.releasedByUserId === principal.userId) {
      throw new HttpError(403, 'Order releaser cannot complete their own order')
    }
    const releasedBatches = await db.batchRecord.count({
      where: { productionOrderId: existing.id, companyId: existing.companyId, status: 'RELEASED' },
    })
    if (releasedBatches === 0) throw new HttpError(409, 'A released batch is required to complete the order')
  }

  const data = { status }
  if (status === 'RELEASED') Object.assign(data, { releasedByUserId: principal.userId, releasedAt: new Date() })
  if (status === 'IN_PROGRESS') Object.assign(data, { startedByUserId: principal.userId, startedAt: new Date() })
  if (status === 'COMPLETED') Object.assign(data, { completedByUserId: principal.userId, completedAt: new Date() })
  const row = await db.productionOrder.update({
    where: { id: existing.id },
    data,
    include: orderInclude,
  })
  await auditMutation(actor, 'manufacturing.order.transitioned', 'ProductionOrder', row.id, {
    orderId: row.id,
    classification: row.classification,
  })
  if (status === 'RELEASED') {
    await manufacturingEvent('ProductionOrderReleased', {
      entityType: 'PRODUCTION_ORDER',
      entityId: row.id,
      orderId: row.id,
      bomId: row.bomId,
      workCenterId: row.workCenterId,
      classification: row.classification,
    }, row.id, 'ProductionOrder')
  }
  return toOrderDto(row)
}

// -------------------------------------------------------------- batch records

export async function listBatches(query = {}, actor = null) {
  const principal = principalOf(actor)
  const rows = await db.batchRecord.findMany({
    where: {
      ...manufacturingTenantWhere(principal.companyId, principal.branchId),
      ...(query.status ? { status: query.status } : {}),
      ...(query.productionOrderId ? { productionOrderId: query.productionOrderId } : {}),
    },
    orderBy: [{ batchNumber: 'asc' }],
    take: limitOf(query.limit),
  })
  return rows.map(toBatchDto)
}

export async function getBatch(id, actor = null) {
  return toBatchDto(await findRecord('batch', id, actor))
}

export async function createBatchRecord(input, actor = null) {
  const principal = principalOf(actor)
  if (!principal.userId) throw new HttpError(400, 'User identity is required to open a batch')
  await assertBranch(principal.companyId, input.branchId || null)
  const order = await findRecord('order', input.productionOrderId, actor)
  if (!['RELEASED', 'IN_PROGRESS'].includes(order.status)) {
    throw new HttpError(409, 'Production order must be released before opening a batch')
  }
  if (input.productItemId !== order.productItemId) {
    throw new HttpError(400, 'Batch product must match the production order')
  }
  await assertItem(principal.companyId, input.productItemId)
  const notes = notesEnvelope(input.deviationNotes)
  try {
    const row = await db.batchRecord.create({
      data: {
        companyId: principal.companyId,
        branchId: input.branchId || null,
        batchNumber: input.batchNumber,
        productionOrderId: order.id,
        bomId: order.bomId,
        productItemId: input.productItemId,
        workCenterId: order.workCenterId,
        quantityProduced: roundQuantity(input.quantityProduced),
        uom: input.uom || 'EA',
        status: 'OPEN',
        manufacturingDate: dayInstant(input.manufacturingDate, 'Manufacturing date'),
        expiryDate: dayInstant(input.expiryDate, 'Expiry date'),
        deviationNotesEncrypted: notes.encrypted,
        deviationNotesKeyId: notes.keyId,
        openedByUserId: principal.userId,
        classification: input.classification || 'RESTRICTED',
      },
    })
    await auditMutation(actor, 'manufacturing.batch.opened', 'BatchRecord', row.id, {
      batchId: row.id,
      orderId: row.id && order.id,
      classification: row.classification,
    })
    await manufacturingEvent('BatchRecordOpened', {
      entityType: 'BATCH_RECORD',
      entityId: row.id,
      batchId: row.id,
      orderId: order.id,
      productItemId: row.productItemId,
      classification: row.classification,
    }, row.id, 'BatchRecord')
    return toBatchDto(row)
  } catch (error) {
    return translatePrisma(error, 'Batch record')
  }
}

export async function updateBatchRecord(id, input, actor = null) {
  const existing = await findRecord('batch', id, actor)
  if (!['OPEN', 'IN_PROGRESS'].includes(existing.status)) {
    throw new HttpError(409, 'Only open batches can be edited')
  }
  const principal = principalOf(actor)
  if (Object.prototype.hasOwnProperty.call(input, 'branchId')) {
    await assertBranch(principal.companyId, input.branchId || null)
  }
  const notes = input.deviationNotes !== undefined ? notesEnvelope(input.deviationNotes) : null
  const row = await db.batchRecord.update({
    where: { id: existing.id },
    data: {
      ...(input.quantityProduced !== undefined
        ? { quantityProduced: roundQuantity(input.quantityProduced) }
        : {}),
      ...(input.manufacturingDate
        ? { manufacturingDate: dayInstant(input.manufacturingDate, 'Manufacturing date') }
        : {}),
      ...(input.expiryDate ? { expiryDate: dayInstant(input.expiryDate, 'Expiry date') } : {}),
      ...(notes ? { deviationNotesEncrypted: notes.encrypted, deviationNotesKeyId: notes.keyId } : {}),
      ...(input.branchId !== undefined ? { branchId: input.branchId || null } : {}),
      ...(input.classification ? { classification: input.classification } : {}),
    },
  })
  await auditMutation(actor, 'manufacturing.batch.updated', 'BatchRecord', row.id, {
    batchId: row.id,
    classification: row.classification,
  })
  return toBatchDto(row)
}

export async function transitionBatch(id, status, reason, actor = null) {
  const existing = await findRecord('batch', id, actor)
  assertBatchTransition(existing.status, status)
  const principal = principalOf(actor)
  if (status === 'REVIEW') {
    if (!principal.userId) throw new HttpError(400, 'Reviewer identity is required')
    if (existing.openedByUserId === principal.userId) {
      throw new HttpError(403, 'Batch opener cannot review their own batch')
    }
    const order = await findRecord('order', existing.productionOrderId, actor)
    if (order.createdByUserId === principal.userId || order.releasedByUserId === principal.userId) {
      throw new HttpError(403, 'Production users cannot review their own batch')
    }
  }
  const row = await db.batchRecord.update({
    where: { id: existing.id },
    data: {
      status,
      ...(status === 'REVIEW'
        ? { reviewedByUserId: principal.userId, reviewedAt: new Date() }
        : {}),
      ...(status === 'REJECTED' ? { rejectedReason: reason || null } : {}),
    },
  })
  await auditMutation(actor, 'manufacturing.batch.transitioned', 'BatchRecord', row.id, {
    batchId: row.id,
    classification: row.classification,
  })
  return toBatchDto(row)
}

/**
 * Issue component stock for a batch using the existing inventory helper. Each
 * call writes its own stock movement and audit entry; the manufacturing service
 * only records issued quantities on the order lines.
 */
export async function issueBatchMaterials(id, input, actor = null) {
  const batch = await findRecord('batch', id, actor)
  if (!['IN_PROGRESS', 'REVIEW'].includes(batch.status)) {
    throw new HttpError(409, 'Batch must be in progress before issuing materials')
  }
  const principal = principalOf(actor)
  const results = []
  for (const line of input.lines) {
    const orderLine = await delegates.orderLine.findFirst({
      where: {
        id: line.orderLineId,
        orderId: batch.productionOrderId,
        companyId: principal.companyId,
      },
    })
    if (!orderLine) throw new HttpError(404, 'Production order line not found')
    const remaining = Number(orderLine.quantityRequired) - Number(orderLine.quantityIssued)
    if (line.quantity > remaining + 1e-9) throw new HttpError(400, 'Issue quantity exceeds remaining requirement')
    await assertWarehouse(principal.companyId, line.warehouseId)
    if (line.branchId) await assertBranch(principal.companyId, line.branchId)
    const movement = await issueStock({
      itemId: orderLine.itemId,
      warehouseId: line.warehouseId,
      batchId: line.batchId || null,
      branchId: line.branchId ?? batch.branchId ?? null,
      quantity: line.quantity,
      movementType: 'PRODUCTION_ISSUE',
      referenceType: 'BATCH_RECORD',
      referenceId: batch.id,
      classification: orderLine.classification,
    }, actor)
    const updated = await db.productionOrderLine.update({
      where: { id: orderLine.id },
      data: { quantityIssued: roundQuantity(Number(orderLine.quantityIssued) + line.quantity) },
    })
    results.push({ orderLineId: updated.id, movementId: movement.movement.id })
  }
  await auditMutation(actor, 'manufacturing.batch.materials.issued', 'BatchRecord', batch.id, {
    batchId: batch.id,
    lineCount: results.length,
    classification: batch.classification,
  })
  return results
}

/** Release a reviewed batch: GMP guards, InventoryBatch creation, stock receipt. */
export async function releaseBatch(id, input, actor = null) {
  const batch = await findRecord('batch', id, actor)
  const principal = principalOf(actor)
  if (!principal.userId) throw new HttpError(400, 'Releaser identity is required')
  const order = await findRecord('order', batch.productionOrderId, actor)
  const checks = await db.qcCheck.findMany({
    where: { batchId: batch.id, companyId: principal.companyId },
  })
  assertBatchReleaseReady(batch, checks, principal.userId, order)
  await assertWarehouse(principal.companyId, input.warehouseId)
  if (input.branchId) await assertBranch(principal.companyId, input.branchId)

  const bom = await db.bom.findFirst({
    where: { id: batch.bomId, companyId: principal.companyId },
  })
  const unitCostCents = assertCents(
    input.unitCostCents ?? bom?.standardCostCents ?? 0,
    'Finished goods unit cost',
    { positive: true },
  )
  const inventoryBatch = await createBatch({
    itemId: batch.productItemId,
    batchNumber: batch.batchNumber,
    status: 'RELEASED',
    unitCostCents,
    manufactureDate: dayOrNullDto(batch.manufacturingDate),
    expiryDate: dayOrNullDto(batch.expiryDate),
    branchId: input.branchId ?? batch.branchId ?? null,
    classification: 'RESTRICTED',
  }, actor)

  const receipt = await receiveStock({
    itemId: batch.productItemId,
    warehouseId: input.warehouseId,
    batchId: inventoryBatch.id,
    branchId: input.branchId ?? batch.branchId ?? null,
    quantity: Number(batch.quantityProduced),
    unitCostCents,
    movementType: 'PRODUCTION_RECEIPT',
    referenceType: 'BATCH_RECORD',
    referenceId: batch.id,
    classification: 'RESTRICTED',
  }, actor)

  const row = await db.batchRecord.update({
    where: { id: batch.id },
    data: {
      status: 'RELEASED',
      inventoryBatchId: inventoryBatch.id,
      releasedByUserId: principal.userId,
      releasedAt: new Date(),
    },
  })
  await auditMutation(actor, 'manufacturing.batch.released', 'BatchRecord', row.id, {
    batchId: row.id,
    orderId: order.id,
    inventoryBatchId: inventoryBatch.id,
    movementId: receipt.movement.id,
    classification: row.classification,
  })
  await manufacturingEvent('BatchReleased', {
    entityType: 'BATCH_RECORD',
    entityId: row.id,
    batchId: row.id,
    orderId: order.id,
    inventoryBatchId: inventoryBatch.id,
    classification: row.classification,
  }, row.id, 'BatchRecord')
  return { batch: toBatchDto(row), inventoryBatch: inventoryBatch, movement: receipt.movement }
}

// ------------------------------------------------------------------ QC checks

export async function listQcChecks(batchId, query = {}, actor = null) {
  await findRecord('batch', batchId, actor)
  const principal = principalOf(actor)
  const rows = await db.qcCheck.findMany({
    where: {
      batchId: String(batchId),
      ...manufacturingTenantWhere(principal.companyId, principal.branchId),
      ...(query.status ? { status: query.status } : {}),
    },
    orderBy: [{ checkCode: 'asc' }],
    take: limitOf(query.limit),
  })
  return rows.map(toQcCheckDto)
}

export async function getQcCheck(id, actor = null) {
  return toQcCheckDto(await findRecord('qcCheck', id, actor))
}

export async function createQcCheck(batchId, input, actor = null) {
  const batch = await findRecord('batch', batchId, actor)
  if (!['OPEN', 'IN_PROGRESS'].includes(batch.status)) {
    throw new HttpError(409, 'QC checks can only be added to open batches')
  }
  const principal = principalOf(actor)
  await assertBranch(principal.companyId, input.branchId || null)
  const notes = notesEnvelope(input.resultNotes)
  try {
    const row = await db.qcCheck.create({
      data: {
        companyId: principal.companyId,
        branchId: input.branchId || null,
        batchId: batch.id,
        checkCode: input.checkCode,
        name: input.name,
        isMandatory: input.isMandatory,
        status: 'PENDING',
        observedValue: input.observedValue || null,
        resultNotesEncrypted: notes.encrypted,
        resultNotesKeyId: notes.keyId,
        classification: input.classification || 'CONFIDENTIAL',
      },
    })
    await auditMutation(actor, 'manufacturing.qc.created', 'QcCheck', row.id, {
      qcCheckId: row.id,
      batchId: row.id && batch.id,
      classification: row.classification,
    })
    return toQcCheckDto(row)
  } catch (error) {
    return translatePrisma(error, 'QC check')
  }
}

export async function updateQcCheck(id, input, actor = null) {
  const existing = await findRecord('qcCheck', id, actor)
  if (!['PENDING', 'REVIEW'].includes(existing.status)) {
    throw new HttpError(409, 'Only unsigned QC checks can be edited')
  }
  const principal = principalOf(actor)
  if (Object.prototype.hasOwnProperty.call(input, 'branchId')) {
    await assertBranch(principal.companyId, input.branchId || null)
  }
  const notes = input.resultNotes !== undefined ? notesEnvelope(input.resultNotes) : null
  const row = await db.qcCheck.update({
    where: { id: existing.id },
    data: {
      ...(input.name ? { name: input.name } : {}),
      ...(input.isMandatory !== undefined ? { isMandatory: input.isMandatory } : {}),
      ...(input.observedValue !== undefined ? { observedValue: input.observedValue || null } : {}),
      ...(notes ? { resultNotesEncrypted: notes.encrypted, resultNotesKeyId: notes.keyId } : {}),
      ...(input.branchId !== undefined ? { branchId: input.branchId || null } : {}),
      ...(input.classification ? { classification: input.classification } : {}),
    },
  })
  await auditMutation(actor, 'manufacturing.qc.updated', 'QcCheck', row.id, {
    qcCheckId: row.id,
    classification: row.classification,
  })
  return toQcCheckDto(row)
}

export async function signQcCheck(id, input, actor = null) {
  const existing = await findRecord('qcCheck', id, actor)
  assertQcTransition(existing.status, input.decision)
  const principal = principalOf(actor)
  if (!principal.userId) throw new HttpError(400, 'QC signer identity is required')
  const batch = await findRecord('batch', existing.batchId, actor)
  if (['RELEASED', 'REJECTED'].includes(batch.status)) {
    throw new HttpError(409, 'Batch is no longer open for QC decisions')
  }
  if (batch.reviewedByUserId === principal.userId) {
    throw new HttpError(403, 'Batch reviewer cannot sign their own QC check')
  }
  const notes = input.resultNotes !== undefined ? notesEnvelope(input.resultNotes) : null
  const row = await db.qcCheck.update({
    where: { id: existing.id },
    data: {
      status: input.decision,
      signedByUserId: principal.userId,
      signedAt: new Date(),
      ...(notes ? { resultNotesEncrypted: notes.encrypted, resultNotesKeyId: notes.keyId } : {}),
    },
  })
  await auditMutation(actor, 'manufacturing.qc.signed', 'QcCheck', row.id, {
    qcCheckId: row.id,
    batchId: batch.id,
    classification: row.classification,
  })
  if (input.decision === 'FAIL') {
    if (batch.status === 'IN_PROGRESS') {
      await db.productionOrder.update({
        where: { id: batch.productionOrderId },
        data: { status: 'QUALITY_HOLD' },
      })
    }
    await manufacturingEvent('QcCheckFailed', {
      entityType: 'QC_CHECK',
      entityId: row.id,
      qcCheckId: row.id,
      batchId: batch.id,
      classification: row.classification,
    }, row.id, 'QcCheck')
  }
  return toQcCheckDto(row)
}
