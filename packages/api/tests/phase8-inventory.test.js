// Phase 8 inventory unit tests. Pure helpers, schemas and contracts only — no
// database or network calls. Cross-tenant RLS isolation is verified separately
// by the deployment probe in the implementation guide.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  inventoryTenantWhere, roundQuantity, roundCountedQuantity, calculateMovementValue,
  calculateWeightedAverage, applyReceipt, applyIssue, applyAdjustment,
  assertBatchIssuable, assertBatchRequired, assertTransferTransition, assertCountTransition,
  calculateTransferIssue, calculateTransferReceipt, calculateCountVariance,
  buildCountAdjustments, isReorderBreach, crossesReorderThreshold,
  toItemDto, toWarehouseDto, toBatchDto, toBalanceDto, toMovementDto, toTransferDto, toCountDto,
} from '../lib/inventory.js'
import {
  inventoryItemCreateSchema, inventoryReceiptSchema, inventoryIssueSchema,
  inventoryAdjustmentSchema, inventoryTransferCreateSchema, inventoryCountCreateSchema,
  inventoryBalanceQuerySchema, INVENTORY_MONEY_FIELDS,
} from '../lib/validation.js'
import {
  DomainEventSchemas, InventoryItemCreatedDataSchema, StockReceivedDataSchema,
  StockIssuedDataSchema, StockAdjustedDataSchema, StockTransferApprovedDataSchema,
  StockCountApprovedDataSchema, ReorderLevelBreachedDataSchema,
} from '../../shared/src/events.js'
import { dispatchEvent } from '../../realtime/src/events.js'

const today = '2026-11-23'

// ------------------------------------------------------- quantity + cent math

test('weighted-average receipts blend total value and round once to whole cents', () => {
  const result = calculateWeightedAverage(
    { quantity: 10, unitCostCents: 100, totalValueCents: 1000 },
    { quantity: 10, unitCostCents: 150 }
  )
  assert.deepEqual(result, {
    quantity: 20,
    unitCostCents: 125,
    totalValueCents: 2500,
    receiptValueCents: 1500,
  })
})

test('fractional weighted averages round once and rebuild total from the rounded cost', () => {
  const result = applyReceipt(
    { quantity: 3, unitCostCents: 100, totalValueCents: 300 },
    { quantity: 1, unitCostCents: 101 }
  )
  assert.deepEqual(result, {
    quantity: 4,
    unitCostCents: 100,
    totalValueCents: 400,
    movementValueCents: 101,
  })
  assert.equal(Number.isSafeInteger(result.totalValueCents), true)
})

test('receipt then issue updates balance quantity and movement value at average cost', () => {
  const received = applyReceipt(
    { quantity: 10, unitCostCents: 100, totalValueCents: 1000 },
    { quantity: 10, unitCostCents: 150 }
  )
  const issued = applyIssue(received, { quantity: 4 })
  assert.deepEqual(issued, {
    quantity: 16,
    unitCostCents: 125,
    totalValueCents: 2000,
    movementValueCents: 500,
  })
  assert.throws(() => applyIssue(issued, { quantity: 17 }), /Insufficient stock/)
})

test('quantities round to three decimals and money rejects fractional cents', () => {
  assert.equal(roundQuantity(1.2344), 1.234)
  assert.equal(roundCountedQuantity(0), 0)
  assert.throws(() => roundQuantity(0), /greater than zero/)
  assert.equal(calculateMovementValue(2, 125), 250)
  assert.throws(() => calculateMovementValue(1, 12.5), /integer number of cents/)
  assert.deepEqual(applyAdjustment(
    { quantity: 5, unitCostCents: 100, totalValueCents: 500 },
    { direction: 'IN', quantity: 1, unitCostCents: 0 }
  ), {
    quantity: 6,
    unitCostCents: 83,
    totalValueCents: 498,
    movementValueCents: 0,
    movementType: 'ADJUSTMENT_IN',
  })
})

// --------------------------------------------------------- batches + lifecycle

test('quarantined, expired and recalled batches cannot be issued', () => {
  assert.equal(assertBatchIssuable({ status: 'RELEASED' }), true)
  assert.equal(assertBatchIssuable(null), true)
  for (const status of ['QUARANTINE', 'EXPIRED', 'RECALLED']) {
    assert.throws(() => assertBatchIssuable({ status }), new RegExp(status))
  }
})

test('batch-tracked items require a batch on every stock line', () => {
  assert.equal(assertBatchRequired({ trackBatches: true }, 'bat_1'), true)
  assert.throws(() => assertBatchRequired({ trackBatches: true }, null), /batch is required/)
  assert.equal(assertBatchRequired({ trackBatches: false }, null), true)
})

test('transfer and count state machines reject skipped or terminal transitions', () => {
  assert.equal(assertTransferTransition('DRAFT', 'IN_TRANSIT'), true)
  assert.equal(assertTransferTransition('IN_TRANSIT', 'RECEIVED'), true)
  assert.throws(() => assertTransferTransition('DRAFT', 'RECEIVED'), /Cannot change stock transfer/)
  assert.throws(() => assertTransferTransition('RECEIVED', 'DRAFT'), /Cannot change stock transfer/)
  assert.equal(assertCountTransition('DRAFT', 'COUNTING'), true)
  assert.equal(assertCountTransition('COUNTING', 'APPROVED'), true)
  assert.throws(() => assertCountTransition('DRAFT', 'APPROVED'), /Cannot change stock count/)
  assert.throws(() => assertCountTransition('APPROVED', 'COUNTING'), /Cannot change stock count/)
})

test('transfer issue captures source cost and receipt reuses the captured cost', () => {
  const balance = { quantity: 10, unitCostCents: 100, totalValueCents: 1000 }
  const line = { quantity: 4, unitCostCents: 0 }
  const outbound = calculateTransferIssue(balance, line)
  assert.equal(outbound.unitCostCents, 100)
  assert.equal(outbound.movementValueCents, 400)
  assert.deepEqual(calculateTransferReceipt({ ...line, unitCostCents: outbound.unitCostCents }), {
    quantity: 4,
    unitCostCents: 100,
    totalValueCents: 400,
  })
})

test('count approval produces only non-zero balancing adjustments with cent values', () => {
  const lines = [
    { id: 'cl_1', itemId: 'itm_1', batchId: null, expectedQty: 10, countedQty: 12, unitCostCents: 100 },
    { id: 'cl_2', itemId: 'itm_1', batchId: null, expectedQty: 10, countedQty: 8, unitCostCents: 100 },
    { id: 'cl_3', itemId: 'itm_1', batchId: null, expectedQty: 10, countedQty: 10, unitCostCents: 100 },
  ]
  assert.deepEqual(calculateCountVariance(lines[0]), {
    expectedQty: 10, countedQty: 12, varianceQty: 2, unitCostCents: 100, varianceValueCents: 200,
  })
  const adjustments = buildCountAdjustments(lines)
  assert.equal(adjustments.length, 2)
  assert.deepEqual(adjustments.map((entry) => [entry.movementType, entry.quantity, entry.varianceValueCents]), [
    ['COUNT_GAIN', 2, 200],
    ['COUNT_LOSS', 2, 200],
  ])
  const zeroCostGain = applyReceipt(null, { quantity: 2, unitCostCents: 0 }, { allowZeroCost: true })
  assert.equal(zeroCostGain.movementValueCents, 0)
  assert.equal(zeroCostGain.unitCostCents, 0)
})

test('reorder alerts fire only on a downward threshold crossing', () => {
  const item = { reorderLevel: 5 }
  assert.equal(isReorderBreach({ quantity: 5 }, item), true)
  assert.equal(isReorderBreach({ quantity: 6 }, item), false)
  assert.equal(isReorderBreach({ quantity: 1 }, { reorderLevel: 0 }), false)
  assert.equal(crossesReorderThreshold(6, 5, item), true)
  assert.equal(crossesReorderThreshold(5, 4, item), false)
  assert.equal(crossesReorderThreshold(10, 4, { reorderLevel: 0 }), false)
})

// ------------------------------------------------------- validation + DLP

const receiptBody = {
  itemId: 'itm_1', warehouseId: 'wh_1', quantity: 2,
  unitCostCents: 1250, movementDate: today,
}

test('inventory write schemas reject companyId, status and calculated columns', () => {
  assert.equal(inventoryReceiptSchema.parse(receiptBody).unitCostCents, 1250)
  assert.throws(() => inventoryReceiptSchema.parse({ ...receiptBody, companyId: 'co_other' }), /Unrecognized key/)
  assert.throws(() => inventoryReceiptSchema.parse({ ...receiptBody, totalValueCents: 2500 }), /Unrecognized key/)
  assert.throws(() => inventoryReceiptSchema.parse({ ...receiptBody, unitCostCents: 12.5 }), /expected int/)
  assert.throws(() => inventoryReceiptSchema.parse({ ...receiptBody, movementDate: '23-11-2026' }), /YYYY-MM-DD/)
  assert.throws(() => inventoryItemCreateSchema.parse({
    code: 'ITM-1', name: 'Tablets', type: 'RAW_MATERIAL', status: 'ACTIVE',
  }), /Unrecognized key/)
})

test('inventory validation fails closed on restricted free text', () => {
  assert.throws(
    () => inventoryReceiptSchema.parse({ ...receiptBody, notes: 'Card 4111111111111111' }),
    /CARD_NUMBER/
  )
  assert.throws(
    () => inventoryAdjustmentSchema.parse({
      itemId: 'itm_1', warehouseId: 'wh_1', direction: 'IN', quantity: 1,
      movementDate: today, reason: 'National ID 12345678',
    }),
    /KENYAN_NATIONAL_ID/
  )
  assert.throws(
    () => inventoryIssueSchema.parse({
      itemId: 'itm_1', warehouseId: 'wh_1', quantity: 1, movementDate: today,
      companyId: 'co_other',
    }),
    /Unrecognized key/
  )
  assert.deepEqual(INVENTORY_MONEY_FIELDS, ['standardCostCents', 'unitCostCents', 'totalValueCents'])
})

test('document and query schemas enforce positive quantities and bounded limits', () => {
  assert.equal(inventoryTransferCreateSchema.parse({
    sourceWarehouseId: 'wh_1', destinationWarehouseId: 'wh_2', transferDate: today,
    lines: [{ itemId: 'itm_1', quantity: 1 }],
  }).lines[0].quantity, 1)
  assert.throws(() => inventoryTransferCreateSchema.parse({
    sourceWarehouseId: 'wh_1', destinationWarehouseId: 'wh_1', transferDate: today,
    lines: [{ itemId: 'itm_1', quantity: 1 }],
  }), /must differ/)
  assert.throws(() => inventoryCountCreateSchema.parse({
    warehouseId: 'wh_1', countDate: today, lines: [{ itemId: 'itm_1', countedQty: -1 }],
  }), /0/)
  assert.equal(inventoryBalanceQuerySchema.parse({ limit: '25' }).limit, 25)
  assert.throws(() => inventoryBalanceQuerySchema.parse({ limit: '9999' }), /200/)
  assert.throws(() => inventoryBalanceQuerySchema.parse({ companyId: 'co_other' }), /Unrecognized key/)
})

// -------------------------------------------------------------- tenant scope

test('inventoryTenantWhere scopes by company and allows null/organisation branches', () => {
  assert.deepEqual(inventoryTenantWhere('co_a', null), { companyId: 'co_a' })
  assert.deepEqual(inventoryTenantWhere('co_a', 'br_1'), {
    companyId: 'co_a',
    OR: [{ branchId: null }, { branchId: 'br_1' }],
  })
  assert.equal(JSON.stringify(inventoryTenantWhere('co_a', 'br_1')).includes('co_b'), false)
})

test('inventory DTOs never expose companyId to clients', () => {
  const dtos = [
    toItemDto({ id: 'itm_1', companyId: 'co_secret', classification: 'INTERNAL' }),
    toWarehouseDto({ id: 'wh_1', companyId: 'co_secret', classification: 'INTERNAL' }),
    toBatchDto({ id: 'bat_1', companyId: 'co_secret', itemId: 'itm_1', classification: 'INTERNAL' }),
    toBalanceDto({ id: 'bal_1', companyId: 'co_secret', itemId: 'itm_1', warehouseId: 'wh_1', classification: 'INTERNAL' }),
    toMovementDto({ id: 'mov_1', companyId: 'co_secret', itemId: 'itm_1', warehouseId: 'wh_1', classification: 'INTERNAL' }),
    toTransferDto({ id: 'trf_1', companyId: 'co_secret', classification: 'INTERNAL' }, []),
    toCountDto({ id: 'cnt_1', companyId: 'co_secret', classification: 'INTERNAL' }, []),
  ]
  for (const dto of dtos) assert.equal('companyId' in dto, false)
})

// ---------------------------------------------------------- strict ID-only events

test('all inventory event schemas are registered and strictly ID/classification-only', () => {
  const names = [
    'InventoryItemCreated', 'StockReceived', 'StockIssued', 'StockAdjusted',
    'StockTransferApproved', 'StockCountApproved', 'ReorderLevelBreached',
  ]
  const cases = [
    [InventoryItemCreatedDataSchema, {
      entityType: 'INVENTORY_ITEM', entityId: 'itm_1', itemId: 'itm_1', classification: 'INTERNAL',
    }],
    [StockReceivedDataSchema, {
      entityType: 'STOCK_MOVEMENT', entityId: 'mov_1', movementId: 'mov_1',
      itemId: 'itm_1', warehouseId: 'wh_1', batchId: null, classification: 'INTERNAL',
    }],
    [StockIssuedDataSchema, {
      entityType: 'STOCK_MOVEMENT', entityId: 'mov_2', movementId: 'mov_2',
      itemId: 'itm_1', warehouseId: 'wh_1', batchId: 'bat_1', classification: 'CONFIDENTIAL',
    }],
    [StockAdjustedDataSchema, {
      entityType: 'STOCK_MOVEMENT', entityId: 'mov_3', movementId: 'mov_3',
      itemId: 'itm_1', warehouseId: 'wh_1', batchId: null, classification: 'INTERNAL',
    }],
    [StockTransferApprovedDataSchema, {
      entityType: 'STOCK_TRANSFER', entityId: 'trf_1', transferId: 'trf_1',
      sourceWarehouseId: 'wh_1', destinationWarehouseId: 'wh_2', classification: 'INTERNAL',
    }],
    [StockCountApprovedDataSchema, {
      entityType: 'STOCK_COUNT', entityId: 'cnt_1', countId: 'cnt_1',
      warehouseId: 'wh_1', classification: 'INTERNAL',
    }],
    [ReorderLevelBreachedDataSchema, {
      entityType: 'INVENTORY_ITEM', entityId: 'itm_1', itemId: 'itm_1',
      warehouseId: 'wh_1', batchId: null, classification: 'INTERNAL',
    }],
  ]
  for (const name of names) assert.equal(typeof DomainEventSchemas[name]?.parse, 'function', `missing ${name}`)
  for (const [schema, valid] of cases) {
    assert.deepEqual(schema.parse(valid), valid)
    for (const forbidden of ['companyId', 'quantity', 'unitCostCents', 'totalValueCents', 'notes', 'name']) {
      assert.throws(() => schema.parse({ ...valid, [forbidden]: 'secret' }), /Unrecognized key/)
    }
  }
})

test('inventory socket frames route only to the company room and carry no content', () => {
  const emitted = []
  const io = {
    to(room) {
      return { emit(socketEvent, payload) { emitted.push({ room, socketEvent, payload }) } }
    },
  }
  const event = {
    id: 'evt_1', type: 'StockReceived', version: 1,
    occurredAt: new Date(0).toISOString(), correlationId: 'cor_1',
    companyId: 'co_a', branchId: 'br_1', actorId: 'usr_1',
    data: {
      entityType: 'STOCK_MOVEMENT', entityId: 'mov_1', movementId: 'mov_1',
      itemId: 'itm_1', warehouseId: 'wh_1', batchId: null, classification: 'CONFIDENTIAL',
    },
  }
  assert.equal(dispatchEvent(io, event), 1)
  assert.deepEqual(emitted, [{
    room: 'company:co_a',
    socketEvent: 'inventory:stock',
    payload: {
      eventId: 'evt_1', type: 'StockReceived', occurredAt: event.occurredAt,
      correlationId: 'cor_1', data: event.data,
    },
  }])
  const serialised = JSON.stringify(emitted)
  for (const secret of ['br_1', 'usr_1', 'quantity', 'unitCostCents', 'co_b']) {
    assert.equal(serialised.includes(secret), false)
  }
})
