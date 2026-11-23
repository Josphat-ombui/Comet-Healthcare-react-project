// Phase 9 procurement unit tests. Pure helpers, schemas and contracts only —
// no database or network calls. Cross-tenant RLS isolation is verified by the
// deployment probe in the implementation guide.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  procurementTenantWhere, calculateProcurementLine, calculateProcurementTotals,
  requisitionToOrderInput, calculateReceiptProgress, calculateThreeWayMatch,
  assertProcurementTransition, assertReleasedBatch, assertProcurementItemActive,
  toRequisitionDto, toOrderDto, toReceiptDto, toReturnDto, toMatchDto,
} from '../lib/procurement.js'
import {
  procurementRequisitionCreateSchema, procurementOrderCreateSchema,
  procurementReceiptCreateSchema, procurementReturnCreateSchema,
  procurementMatchCreateSchema, procurementConvertSchema,
  procurementReceiptInspectSchema, procurementActionSchema,
  procurementMatchQuerySchema, PROCUREMENT_MONEY_FIELDS,
} from '../lib/validation.js'
import {
  DomainEventSchemas, PurchaseRequisitionApprovedDataSchema,
  PurchaseOrderApprovedDataSchema, GoodsReceiptReceivedDataSchema,
  SupplierReturnApprovedDataSchema, ThreeWayMatchFlaggedDataSchema,
} from '../../shared/src/events.js'
import { PERMISSIONS, ROLE_PERMISSIONS } from '../../shared/src/permissions.js'
import { dispatchEvent } from '../../realtime/src/events.js'

const today = '2026-11-23'

// ------------------------------------------------------------- cent arithmetic

test('procurement line values round once to whole integer cents', () => {
  assert.deepEqual(calculateProcurementLine({ qty: 1.234, unitCostCents: 1250 }), {
    qty: 1.234, unitCostCents: 1250, totalCents: 1543,
  })
  assert.equal(Number.isSafeInteger(calculateProcurementLine({ qty: 3, unitCostCents: 333 }).totalCents), true)
  assert.throws(() => calculateProcurementLine({ qty: 1, unitCostCents: 12.5 }), /integer number of cents/)
  assert.throws(() => calculateProcurementLine({ qty: 0, unitCostCents: 100 }), /greater than zero/)
  assert.deepEqual(calculateProcurementTotals([
    { totalCents: 1543 },
    { totalCents: 2500 },
  ]), { totalCents: 4043 })
  assert.throws(() => calculateProcurementTotals([]), /At least one line/)
  assert.throws(() => calculateProcurementTotals([{ totalCents: 1.5 }]), /integer number of cents/)
})

// ------------------------------------------------------------- conversion flow

test('approved requisition projection carries IDs and never copies tax or tolerance', () => {
  const requisition = {
    id: 'req_1', status: 'APPROVED', supplierId: 'sup_1', currency: 'KES',
    requiredDate: '2026-12-01', notes: 'Approved fixture', branchId: 'br_1',
    classification: 'INTERNAL',
    lines: [{
      itemId: 'itm_1', warehouseId: 'wh_1', description: 'API line',
      qty: 2, unitCostCents: 1250,
    }],
  }
  const order = requisitionToOrderInput(requisition, 'ignored_supplier', today)
  assert.equal(order.requisitionId, 'req_1')
  assert.equal(order.supplierId, 'sup_1')
  assert.equal(order.orderDate, today)
  assert.equal(order.expectedDate, '2026-12-01')
  assert.equal(order.branchId, 'br_1')
  assert.deepEqual(order.lines, [{
    itemId: 'itm_1', warehouseId: 'wh_1', description: 'API line',
    qty: 2, unitCostCents: 1250,
  }])
  const serialised = JSON.stringify(order)
  for (const forbidden of ['tax', 'Tax', 'tolerance', 'Tolerance', 'companyId', 'vat']) {
    assert.equal(serialised.includes(forbidden), false)
  }
  assert.throws(
    () => requisitionToOrderInput({ ...requisition, status: 'DRAFT' }, 'sup_1', today),
    /Only an approved requisition/
  )
})

// ------------------------------------------------------------- state machines

test('requisition, order, receipt, return and match transitions reject skipped steps', () => {
  assert.equal(assertProcurementTransition('requisition', 'DRAFT', 'SUBMITTED'), true)
  assert.equal(assertProcurementTransition('requisition', 'APPROVED', 'CONVERTED'), true)
  assert.throws(() => assertProcurementTransition('requisition', 'DRAFT', 'CONVERTED'), /Cannot change requisition/)

  assert.equal(assertProcurementTransition('order', 'DRAFT', 'APPROVED'), true)
  assert.equal(assertProcurementTransition('order', 'APPROVED', 'SENT'), true)
  assert.equal(assertProcurementTransition('order', 'SENT', 'PARTIALLY_RECEIVED'), true)
  assert.equal(assertProcurementTransition('order', 'PARTIALLY_RECEIVED', 'RECEIVED'), true)
  assert.throws(() => assertProcurementTransition('order', 'DRAFT', 'SENT'), /Cannot change order/)
  assert.throws(() => assertProcurementTransition('order', 'RECEIVED', 'SENT'), /Cannot change order/)

  assert.equal(assertProcurementTransition('receipt', 'DRAFT', 'RECEIVED'), true)
  assert.equal(assertProcurementTransition('receipt', 'RECEIVED', 'REJECTED'), true)
  assert.throws(() => assertProcurementTransition('receipt', 'INSPECTED', 'RECEIVED'), /Cannot change receipt/)

  assert.equal(assertProcurementTransition('return', 'DRAFT', 'APPROVED'), true)
  assert.equal(assertProcurementTransition('return', 'APPROVED', 'SENT'), true)
  assert.equal(assertProcurementTransition('return', 'SENT', 'RECEIVED'), true)
  assert.throws(() => assertProcurementTransition('return', 'DRAFT', 'RECEIVED'), /Cannot change return/)
  assert.throws(() => assertProcurementTransition('return', 'RECEIVED', 'DRAFT'), /Cannot change return/)

  assert.equal(assertProcurementTransition('match', 'PENDING', 'DISCREPANCY'), true)
  assert.equal(assertProcurementTransition('match', 'DISCREPANCY', 'APPROVED'), true)
  assert.throws(() => assertProcurementTransition('match', 'APPROVED', 'MATCHED'), /Cannot change match/)
})

// -------------------------------------------------------------- goods receipts

test('receipt progress tracks partial and full order lines without over-receipt', () => {
  const lines = [{ id: 'ol_1', qty: 10 }, { id: 'ol_2', qty: 5 }]
  const partial = calculateReceiptProgress(lines, [{ lines: [{ orderLineId: 'ol_1', qty: 4 }] }])
  assert.equal(partial.status, 'PARTIALLY_RECEIVED')
  assert.deepEqual(partial.lines[0], {
    id: 'ol_1', qty: 10, receivedQty: 4, remainingQty: 6, lineStatus: 'PARTIALLY_RECEIVED',
  })
  assert.equal(partial.lines[1].lineStatus, 'PARTIALLY_RECEIVED')

  const full = calculateReceiptProgress(lines, [{
    lines: [
      { orderLineId: 'ol_1', qty: 10 },
      { orderLineId: 'ol_2', qty: 5 },
    ],
  }])
  assert.equal(full.status, 'RECEIVED')
  assert.equal(full.lines.every((line) => line.lineStatus === 'RECEIVED'), true)
  assert.equal(full.lines.every((line) => line.remainingQty === 0), true)
})

test('quarantined batches and inactive items are rejected by pure lifecycle guards', () => {
  assert.equal(assertReleasedBatch({ status: 'RELEASED' }).status, 'RELEASED')
  assert.equal(assertReleasedBatch(null), null)
  assert.throws(() => assertReleasedBatch({ status: 'QUARANTINE' }), /RELEASED batches/)
  assert.equal(assertProcurementItemActive({ isActive: true }).isActive, true)
  assert.throws(() => assertProcurementItemActive(null), /not found/)
  assert.throws(() => assertProcurementItemActive({ isActive: false }), /inactive/)
})

// -------------------------------------------------------------- three-way match

test('three-way match is cent-exact and uses tolerance only as a business threshold', () => {
  const orderLines = [{ id: 'ol_1', qty: 10, unitCostCents: 1000 }]
  const receiptLines = [{ orderLineId: 'ol_1', qty: 10, totalCents: 10_000 }]
  const exact = calculateThreeWayMatch({ orderLines, receiptLines, toleranceBps: 0 })
  assert.deepEqual(exact, {
    expectedCents: 10_000,
    receiptActualCents: 10_000,
    invoiceTotalCents: null,
    priceVarianceCents: 0,
    invoiceVarianceCents: null,
    quantityVarianceQty: 0,
    toleranceBps: 0,
    status: 'MATCHED',
  })

  const within = calculateThreeWayMatch({
    orderLines,
    receiptLines: [{ orderLineId: 'ol_1', qty: 10, totalCents: 10_050 }],
    invoiceTotalCents: 10_100,
    toleranceBps: 100,
  })
  assert.equal(within.priceVarianceCents, 50)
  assert.equal(within.invoiceVarianceCents, 100)
  assert.equal(within.status, 'MATCHED')

  const flagged = calculateThreeWayMatch({
    orderLines,
    receiptLines: [{ orderLineId: 'ol_1', qty: 10, totalCents: 10_201 }],
    invoiceTotalCents: 10_300,
    toleranceBps: 100,
  })
  assert.equal(flagged.priceVarianceCents, 201)
  assert.equal(flagged.invoiceVarianceCents, 300)
  assert.equal(flagged.quantityVarianceQty, 0)
  assert.equal(flagged.status, 'DISCREPANCY')
  assert.equal(Object.keys(flagged).some((key) => /tax|vat|statutory/i.test(key)), false)
})

test('three-way match rejects receipt lines that do not belong to the order', () => {
  assert.throws(() => calculateThreeWayMatch({
    orderLines: [{ id: 'ol_1', qty: 1, unitCostCents: 100 }],
    receiptLines: [{ orderLineId: 'ol_other', qty: 1, totalCents: 100 }],
  }), /does not belong/)
  assert.throws(() => calculateThreeWayMatch({
    orderLines: [{ id: 'ol_1', qty: 1, unitCostCents: 100 }],
    receiptLines: [{ orderLineId: 'ol_1', qty: 1, totalCents: 100.5 }],
  }), /integer number of cents/)
})

// --------------------------------------------------------------- tenant scope

test('procurement tenant scoping allows organisation-wide rows but never another company', () => {
  assert.deepEqual(procurementTenantWhere('co_a', null), { companyId: 'co_a' })
  assert.deepEqual(procurementTenantWhere('co_a', 'br_1'), {
    companyId: 'co_a',
    OR: [{ branchId: null }, { branchId: 'br_1' }],
  })
  assert.equal(JSON.stringify(procurementTenantWhere('co_a', 'br_1')).includes('co_b'), false)
})

test('procurement DTOs never expose companyId or internal audit columns', () => {
  const base = { id: 'doc_1', companyId: 'co_secret', classification: 'INTERNAL' }
  const dtos = [
    toRequisitionDto({ ...base, number: 'REQ-1', status: 'DRAFT', requisitionDate: today, currency: 'KES', totalCents: 0 }),
    toOrderDto({ ...base, number: 'PO-1', status: 'DRAFT', orderDate: today, supplierId: 'sup_1', currency: 'KES', totalCents: 0 }),
    toReceiptDto({ ...base, number: 'GRN-1', status: 'DRAFT', receiptDate: today, orderId: 'po_1', supplierId: 'sup_1', currency: 'KES', totalCents: 0 }),
    toReturnDto({ ...base, number: 'RET-1', status: 'DRAFT', returnDate: today, orderId: 'po_1', supplierId: 'sup_1', currency: 'KES', totalCents: 0 }),
    toMatchDto({
      ...base, number: 'MCH-1', status: 'MATCHED', orderId: 'po_1', supplierId: 'sup_1',
      poTotalCents: 0, receiptTotalCents: 0, priceVarianceCents: 0,
      quantityVarianceQty: 0, toleranceBps: 0,
    }),
  ]
  for (const dto of dtos) {
    assert.equal(dto.companyId, undefined)
    assert.equal(dto.createdById, undefined)
  }
  assert.deepEqual(PROCUREMENT_MONEY_FIELDS, [
    'unitCostCents', 'totalCents', 'subtotalCents', 'poTotalCents', 'receiptTotalCents',
    'invoiceTotalCents', 'priceVarianceCents', 'invoiceVarianceCents',
  ])
})

// --------------------------------------------------------- validation and DLP

const procurementLine = {
  itemId: 'itm_1', description: 'API purchase line', qty: 2, unitCostCents: 1250,
}

test('procurement write schemas reject client-supplied tenant, status and computed fields', () => {
  const requisition = procurementRequisitionCreateSchema.parse({
    requisitionDate: today, lines: [procurementLine],
  })
  assert.equal(requisition.currency, 'KES')
  assert.equal(requisition.classification, 'INTERNAL')
  assert.throws(() => procurementRequisitionCreateSchema.parse({
    requisitionDate: today, lines: [procurementLine], companyId: 'co_other',
  }), /Unrecognized key/)
  assert.throws(() => procurementRequisitionCreateSchema.parse({
    requisitionDate: today, lines: [procurementLine], status: 'APPROVED',
  }), /Unrecognized key/)
  assert.throws(() => procurementRequisitionCreateSchema.parse({
    requisitionDate: today, lines: [procurementLine], totalCents: 2500,
  }), /Unrecognized key/)
  assert.throws(() => procurementRequisitionCreateSchema.parse({
    requisitionDate: '23-11-2026', lines: [procurementLine],
  }), /YYYY-MM-DD/)
  assert.throws(() => procurementRequisitionCreateSchema.parse({
    requisitionDate: today, lines: [{ ...procurementLine, description: undefined }],
  }), /description/)
  assert.equal(procurementOrderCreateSchema.parse({
    supplierId: 'sup_1', orderDate: today, lines: [procurementLine],
  }).supplierId, 'sup_1')
  assert.throws(() => procurementOrderCreateSchema.parse({
    orderDate: today, lines: [procurementLine],
  }), /supplierId is required/)
})

test('procurement schemas fail closed on restricted free text', () => {
  assert.throws(() => procurementRequisitionCreateSchema.parse({
    requisitionDate: today, lines: [procurementLine], notes: 'Card 4111111111111111',
  }), /CARD_NUMBER/)
  assert.throws(() => procurementReturnCreateSchema.parse({
    orderId: 'po_1', returnDate: today, lines: [procurementLine],
    reason: 'National ID 12345678',
  }), /KENYAN_NATIONAL_ID/)
  assert.throws(() => procurementMatchCreateSchema.parse({
    orderId: 'po_1', notes: 'Card 4111111111111111',
  }), /CARD_NUMBER/)
  assert.throws(() => procurementReceiptCreateSchema.parse({
    orderId: 'po_1', receiptDate: today,
    lines: [{ orderLineId: 'ol_1', qty: 1, companyId: 'co_other' }],
  }), /Unrecognized key/)
})

test('action, conversion and query schemas stay strict and reject tolerance tampering', () => {
  assert.deepEqual(procurementActionSchema.parse({}), {})
  assert.throws(() => procurementActionSchema.parse({ status: 'APPROVED' }), /Unrecognized key/)
  assert.deepEqual(procurementReceiptInspectSchema.parse({ decision: 'REJECT' }), { decision: 'REJECT' })
  assert.throws(() => procurementReceiptInspectSchema.parse({ decision: 'APPROVE' }), /Invalid option/)
  assert.throws(() => procurementConvertSchema.parse({
    supplierId: 'sup_1', matchToleranceBps: 500,
  }), /Unrecognized key/)
  assert.equal(procurementMatchQuerySchema.parse({ status: 'PENDING', limit: '25' }).limit, 25)
  assert.throws(() => procurementMatchQuerySchema.parse({ companyId: 'co_other' }), /Unrecognized key/)
  assert.throws(() => procurementMatchQuerySchema.parse({ status: 'FLAGGED' }), /Invalid option/)
})

// --------------------------------------------------------- permissions, events

test('all procurement permissions exist and are granted to the admin role', () => {
  const names = [
    'procurement.requisition.read', 'procurement.requisition.write', 'procurement.requisition.approve',
    'procurement.order.read', 'procurement.order.write', 'procurement.order.approve', 'procurement.order.send',
    'procurement.receipt.read', 'procurement.receipt.write', 'procurement.receipt.inspect',
    'procurement.return.read', 'procurement.return.write', 'procurement.return.approve',
    'procurement.match.read', 'procurement.match.approve',
  ]
  for (const name of names) {
    assert.equal(typeof PERMISSIONS[name], 'string', `missing ${name}`)
    assert.equal(ROLE_PERMISSIONS.ADMIN.includes(name), true, `admin missing ${name}`)
  }
})

test('procurement event schemas are registered and strictly ID/classification-only', () => {
  const cases = [
    ['PurchaseRequisitionApproved', PurchaseRequisitionApprovedDataSchema, {
      entityType: 'PURCHASE_REQUISITION', entityId: 'req_1', requisitionId: 'req_1', classification: 'INTERNAL',
    }],
    ['PurchaseOrderApproved', PurchaseOrderApprovedDataSchema, {
      entityType: 'PURCHASE_ORDER', entityId: 'po_1', orderId: 'po_1', classification: 'INTERNAL',
    }],
    ['GoodsReceiptReceived', GoodsReceiptReceivedDataSchema, {
      entityType: 'GOODS_RECEIPT', entityId: 'grn_1', receiptId: 'grn_1',
      orderId: 'po_1', classification: 'INTERNAL',
    }],
    ['SupplierReturnApproved', SupplierReturnApprovedDataSchema, {
      entityType: 'SUPPLIER_RETURN', entityId: 'ret_1', returnId: 'ret_1',
      orderId: 'po_1', receiptId: 'grn_1', classification: 'INTERNAL',
    }],
    ['ThreeWayMatchFlagged', ThreeWayMatchFlaggedDataSchema, {
      entityType: 'THREE_WAY_MATCH', entityId: 'mch_1', matchId: 'mch_1',
      orderId: 'po_1', receiptId: 'grn_1', classification: 'CONFIDENTIAL',
    }],
  ]
  for (const [name, schema, valid] of cases) {
    assert.equal(typeof DomainEventSchemas[name]?.parse, 'function', `missing ${name}`)
    assert.deepEqual(schema.parse(valid), valid)
    for (const forbidden of [
      'companyId', 'number', 'status', 'amountCents', 'totalCents', 'taxRate', 'notes', 'supplierName',
    ]) {
      assert.throws(() => schema.parse({ ...valid, [forbidden]: 'secret' }), /Unrecognized key/)
    }
  }
})

test('procurement socket frames route only to the company room and carry no document content', () => {
  const emitted = []
  const io = {
    to(room) {
      return { emit(socketEvent, payload) { emitted.push({ room, socketEvent, payload }) } }
    },
  }
  const event = {
    id: 'evt_1', type: 'SupplierReturnApproved', version: 1,
    occurredAt: new Date(0).toISOString(), correlationId: 'cor_1',
    companyId: 'co_a', branchId: 'br_1', actorId: 'usr_1',
    data: {
      entityType: 'SUPPLIER_RETURN', entityId: 'ret_1', returnId: 'ret_1',
      orderId: 'po_1', receiptId: 'grn_1', classification: 'CONFIDENTIAL',
    },
  }
  assert.equal(dispatchEvent(io, event), 1)
  assert.deepEqual(emitted, [{
    room: 'company:co_a',
    socketEvent: 'procurement:return',
    payload: {
      eventId: 'evt_1', type: 'SupplierReturnApproved', occurredAt: event.occurredAt,
      correlationId: 'cor_1', data: event.data,
    },
  }])
  const serialised = JSON.stringify(emitted)
  for (const secret of ['br_1', 'usr_1', 'amountCents', 'co_b']) {
    assert.equal(serialised.includes(secret), false)
  }
})
