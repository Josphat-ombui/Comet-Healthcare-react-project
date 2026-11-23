// Phase 7 sales unit tests. Pure helpers, schemas and contracts only — no
// database or network calls. Database isolation is verified separately by the
// cross-tenant RLS probe in the deployment runbook.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateSalesLine, calculateSalesTotals, assertDocumentTransition,
  assertInvoiceEligibility, assertVerifiedSalesRate, quoteToOrderInput,
  deliveryFromOrderInput, returnFromDeliveryInput, salesTenantWhere,
  toQuoteDto, toOrderDto, toDeliveryDto, toReturnDto,
} from '../lib/sales.js'
import {
  salesQuoteCreateSchema, salesOrderCreateSchema, salesInvoiceFromOrderSchema,
  salesQuoteQuerySchema,
} from '../lib/validation.js'
import {
  SalesQuoteCreatedDataSchema, SalesOrderConfirmedDataSchema,
  DeliveryNoteIssuedDataSchema, SalesReturnApprovedDataSchema,
  SalesInvoiceCreatedDataSchema, DomainEventSchemas,
} from '../../shared/src/events.js'
import { dispatchEvent } from '../../realtime/src/events.js'

const line = (overrides = {}) => ({
  description: 'Tablets', qty: 3, unitPriceCents: 10_000, ...overrides,
})

// ------------------------------------------------------------- cent arithmetic

test('calculateSalesLine multiplies quantity by integer unit cents', () => {
  assert.deepEqual(calculateSalesLine(line()), {
    netCents: 30_000, taxCents: 0, grossCents: 30_000,
  })
})

test('calculateSalesLine rounds fractional quantities once and rejects invalid input', () => {
  assert.deepEqual(calculateSalesLine(line({ qty: 1.005, unitPriceCents: 999 })), {
    netCents: 1004, taxCents: 0, grossCents: 1004,
  })
  assert.throws(() => calculateSalesLine(line({ qty: 0 })), /Quantity/)
  assert.throws(() => calculateSalesLine(line({ unitPriceCents: 10.5 })), /Unit price/)
  assert.throws(() => calculateSalesLine(line({ unitPriceCents: 0 })), /Unit price/)
})

test('calculateSalesTotals sums whole cents without introducing tax', () => {
  const totals = calculateSalesTotals([
    line({ qty: 3, unitPriceCents: 10_000 }),
    line({ qty: 2, unitPriceCents: 12_345 }),
    line({ netCents: 100, taxCents: 0, grossCents: 100 }),
  ])
  assert.deepEqual(totals, { subtotalCents: 54_790, taxCents: 0, totalCents: 54_790 })
  assert.throws(() => calculateSalesTotals([]), /At least one line/)
  assert.throws(() => calculateSalesTotals([line({ unitPriceCents: 1.5 })]), /positive integer/)
})

test('sales DTOs never leak companyId or customer free text into events', () => {
  const row = {
    id: 'quo_1', companyId: 'co_secret', number: 'QUO-2026-0001', status: 'DRAFT',
    partyId: 'pty_1', quoteDate: '2026-01-15', validUntil: null, currency: 'KES',
    taxRateId: 'rate_1', subtotalCents: 30_000, taxCents: 0, totalCents: 30_000,
    notes: 'Acme card 4111111111111111', classification: 'CONFIDENTIAL',
    createdById: 'usr_1', createdAt: new Date(0), updatedAt: new Date(0),
  }
  const lines = [{ id: 'ln_1', companyId: 'co_secret', ...line(), netCents: 30_000, taxCents: 0, grossCents: 30_000, position: 0 }]
  const quote = toQuoteDto(row, lines)
  assert.equal('companyId' in quote, false)
  assert.equal('companyId' in quote.lines[0], false)
  assert.equal(quote.totalCents, 30_000)

  const order = toOrderDto({ ...row, quoteId: 'quo_1', financeInvoiceId: null, orderDate: '2026-01-16', requestedDate: null }, lines)
  const delivery = toDeliveryDto({ ...row, orderId: 'ord_1', deliveryDate: '2026-01-17', issuedAt: null, deliveredAt: null }, lines)
  const returned = toReturnDto({ ...row, orderId: 'ord_1', deliveryNoteId: 'dn_1', returnDate: '2026-01-18', reason: null, approvedAt: null, receivedAt: null }, lines)
  for (const dto of [order, delivery, returned]) {
    assert.equal('companyId' in dto, false)
    assert.equal('companyId' in dto.lines[0], false)
  }
})

// ------------------------------------------------------------ state machines

test('quote transition guard accepts forward motion and blocks terminal reopens', () => {
  assert.equal(assertDocumentTransition('quote', 'DRAFT', 'SENT'), true)
  assert.equal(assertDocumentTransition('quote', 'SENT', 'ACCEPTED'), true)
  assert.equal(assertDocumentTransition('quote', 'ACCEPTED', 'CONVERTED'), true)
  assert.throws(() => assertDocumentTransition('quote', 'CONVERTED', 'DRAFT'), /Cannot change quote/)
  assert.throws(() => assertDocumentTransition('quote', 'SENT', 'DRAFT'), /Cannot change quote/)
})

test('order lifecycle only moves DRAFT -> CONFIRMED -> FULFILLED', () => {
  assert.equal(assertDocumentTransition('order', 'DRAFT', 'CONFIRMED'), true)
  assert.equal(assertDocumentTransition('order', 'CONFIRMED', 'FULFILLED'), true)
  assert.throws(() => assertDocumentTransition('order', 'DRAFT', 'FULFILLED'), /Cannot change order/)
  assert.throws(() => assertDocumentTransition('order', 'FULFILLED', 'CONFIRMED'), /Cannot change order/)
  assert.throws(() => assertDocumentTransition('order', 'CANCELLED', 'CONFIRMED'), /Cannot change order/)
})

test('delivery lifecycle requires issue before delivery', () => {
  assert.equal(assertDocumentTransition('delivery', 'DRAFT', 'ISSUED'), true)
  assert.equal(assertDocumentTransition('delivery', 'ISSUED', 'IN_TRANSIT'), true)
  assert.equal(assertDocumentTransition('delivery', 'IN_TRANSIT', 'DELIVERED'), true)
  assert.equal(assertDocumentTransition('delivery', 'ISSUED', 'DELIVERED'), true)
  assert.throws(() => assertDocumentTransition('delivery', 'DRAFT', 'DELIVERED'), /Cannot change delivery/)
  assert.throws(() => assertDocumentTransition('delivery', 'DELIVERED', 'ISSUED'), /Cannot change delivery/)
})

test('return lifecycle requires approval before receipt', () => {
  assert.equal(assertDocumentTransition('return', 'DRAFT', 'APPROVED'), true)
  assert.equal(assertDocumentTransition('return', 'APPROVED', 'RECEIVED'), true)
  assert.equal(assertDocumentTransition('return', 'DRAFT', 'REJECTED'), true)
  assert.throws(() => assertDocumentTransition('return', 'DRAFT', 'RECEIVED'), /Cannot change return/)
  assert.throws(() => assertDocumentTransition('return', 'RECEIVED', 'APPROVED'), /Cannot change return/)
})

// --------------------------------------------------------- document conversion

test('quoteToOrderInput carries IDs and integer cents, never a rate value', () => {
  const quote = {
    id: 'quo_1', partyId: 'pty_1', validUntil: '2026-02-01', currency: 'KES',
    taxRateId: 'rate_1', notes: 'Internal note', branchId: 'br_1',
    classification: 'CONFIDENTIAL', rateBps: 1600,
    lines: [{ description: 'Tablets', qty: 3, unitPriceCents: 10_000, netCents: 30_000 }],
  }
  const order = quoteToOrderInput(quote, '2026-01-16')
  assert.equal(order.quoteId, 'quo_1')
  assert.equal(order.partyId, 'pty_1')
  assert.equal(order.orderDate, '2026-01-16')
  assert.equal(order.requestedDate, '2026-02-01')
  assert.equal(order.taxRateId, 'rate_1')
  assert.equal('rateBps' in order, false)
  assert.equal(order.lines[0].unitPriceCents, 10_000)
  assert.equal('netCents' in order.lines[0], false)
  assert.throws(() => quoteToOrderInput(null), /not found/)
})

test('delivery and return projections require valid source documents', () => {
  const order = {
    id: 'ord_1', status: 'CONFIRMED', partyId: 'pty_1', currency: 'KES',
    branchId: null, classification: 'INTERNAL', notes: null,
    lines: [{ description: 'Tablets', qty: 2, unitPriceCents: 10_000 }],
  }
  const delivery = deliveryFromOrderInput(order, '2026-01-20')
  assert.equal(delivery.orderId, 'ord_1')
  assert.equal(delivery.partyId, 'pty_1')
  assert.equal(delivery.lines[0].unitPriceCents, 10_000)
  assert.throws(() => deliveryFromOrderInput({ ...order, status: 'DRAFT' }, '2026-01-20'), /confirmed/)

  const note = {
    id: 'dn_1', orderId: 'ord_1', partyId: 'pty_1', currency: 'KES',
    classification: 'INTERNAL',
    lines: [{ description: 'Tablets', qty: 1, unitPriceCents: 10_000 }],
  }
  const returned = returnFromDeliveryInput(note, '2026-01-21')
  assert.equal(returned.deliveryNoteId, 'dn_1')
  assert.equal(returned.orderId, 'ord_1')
  assert.equal(returned.lines[0].qty, 1)
  assert.throws(() => returnFromDeliveryInput(null), /not found/)
})

// ------------------------------------------------------------ invoice guards

test('assertInvoiceEligibility only accepts a confirmed, uninvoiced order', () => {
  const order = { status: 'CONFIRMED', financeInvoiceId: null }
  assert.equal(assertInvoiceEligibility(order), true)
  assert.throws(() => assertInvoiceEligibility(null), /not found/)
  assert.throws(() => assertInvoiceEligibility({ status: 'DRAFT', financeInvoiceId: null }), /confirmed/)
  assert.throws(() => assertInvoiceEligibility({ status: 'CONFIRMED', financeInvoiceId: 'inv_1' }), /already exists/)
})

test('assertVerifiedSalesRate rejects unknown, unverified and non-VAT rates', () => {
  const verified = { id: 'rate_1', kind: 'VAT', status: 'VERIFIED', rateBps: 1600 }
  assert.equal(assertVerifiedSalesRate(verified), verified)
  assert.throws(() => assertVerifiedSalesRate(null), /not found/)
  assert.throws(() => assertVerifiedSalesRate({ ...verified, status: 'UNVERIFIED' }), /VERIFIED/)
  assert.throws(() => assertVerifiedSalesRate({ ...verified, status: 'SUPERSEDED' }), /VERIFIED/)
  assert.throws(() => assertVerifiedSalesRate({ ...verified, kind: 'OTHER' }), /VAT/)
})

// -------------------------------------------------------- validation + DLP

test('sales create schemas are strict: no companyId, no status, no rate values', () => {
  const body = {
    partyId: 'pty_1', quoteDate: '2026-01-15', currency: 'KES',
    lines: [line()], notes: 'Handover note',
  }
  assert.equal(salesQuoteCreateSchema.parse(body).currency, 'KES')
  assert.throws(() => salesQuoteCreateSchema.parse({ ...body, companyId: 'co_other' }), /Unrecognized key/)
  assert.throws(() => salesQuoteCreateSchema.parse({ ...body, status: 'ACCEPTED' }), /Unrecognized key/)
  assert.throws(() => salesQuoteCreateSchema.parse({ ...body, rateBps: 1600 }), /Unrecognized key/)
  assert.throws(() => salesQuoteCreateSchema.parse({ ...body, lines: [line({ unitPriceCents: 12.5 })] }), /expected int/)
  assert.throws(() => salesQuoteCreateSchema.parse({ ...body, quoteDate: '15-01-2026' }), /YYYY-MM-DD/)
  assert.throws(
    () => salesOrderCreateSchema.parse({ partyId: 'pty_1', orderDate: '2026-01-15' }),
    /At least one line or a quoteId is required/
  )
})

test('sales validation fails closed on restricted text', () => {
  const body = {
    partyId: 'pty_1', quoteDate: '2026-01-15',
    lines: [line({ description: 'Card 4111111111111111' })],
  }
  assert.throws(() => salesQuoteCreateSchema.parse(body), /CARD_NUMBER/)
  assert.throws(() => salesQuoteCreateSchema.parse({
    partyId: 'pty_1', quoteDate: '2026-01-15', lines: [line()], notes: 'National ID 12345678',
  }), /KENYAN_NATIONAL_ID/)
})

test('invoice-from-order accepts omitted taxRateId but rejects extra rate fields', () => {
  assert.deepEqual(salesInvoiceFromOrderSchema.parse({}), {})
  assert.equal(salesInvoiceFromOrderSchema.parse({ taxRateId: 'rate_1' }).taxRateId, 'rate_1')
  assert.throws(() => salesInvoiceFromOrderSchema.parse({ rateBps: 1600 }), /Unrecognized key/)
  assert.throws(() => salesInvoiceFromOrderSchema.parse({ issueDate: '2026-13-01' }), /valid date/)
})

test('sales query schemas bound limits and reject unknown filters', () => {
  assert.equal(salesQuoteQuerySchema.parse({ limit: '25' }).limit, 25)
  assert.throws(() => salesQuoteQuerySchema.parse({ limit: '9999' }), /200/)
  assert.throws(() => salesQuoteQuerySchema.parse({ companyId: 'co_other' }), /Unrecognized key/)
})

// -------------------------------------------------------------- tenant scope

test('salesTenantWhere scopes by company and allows null/organisation branches', () => {
  assert.deepEqual(salesTenantWhere('co_a', null), { companyId: 'co_a' })
  assert.deepEqual(salesTenantWhere('co_a', 'br_1'), {
    companyId: 'co_a',
    OR: [{ branchId: null }, { branchId: 'br_1' }],
  })
  assert.equal(JSON.stringify(salesTenantWhere('co_a', 'br_1')).includes('co_b'), false)
})

// ---------------------------------------------------------- IDs-only events

test('all sales event payload schemas are strict and ID/classification-only', () => {
  for (const name of [
    'SalesQuoteCreated', 'SalesOrderConfirmed', 'DeliveryNoteIssued',
    'SalesReturnApproved', 'SalesInvoiceCreated',
  ]) {
    assert.equal(typeof DomainEventSchemas[name]?.parse, 'function', `missing ${name} schema`)
  }
  const cases = [
    [SalesQuoteCreatedDataSchema, {
      entityType: 'SALES_QUOTE', entityId: 'quo_1', quoteId: 'quo_1', classification: 'INTERNAL',
    }],
    [SalesOrderConfirmedDataSchema, {
      entityType: 'SALES_ORDER', entityId: 'ord_1', orderId: 'ord_1', quoteId: 'quo_1', classification: 'INTERNAL',
    }],
    [DeliveryNoteIssuedDataSchema, {
      entityType: 'DELIVERY_NOTE', entityId: 'dn_1', deliveryNoteId: 'dn_1', orderId: 'ord_1', classification: 'INTERNAL',
    }],
    [SalesReturnApprovedDataSchema, {
      entityType: 'SALES_RETURN', entityId: 'ret_1', returnId: 'ret_1', deliveryNoteId: 'dn_1', classification: 'INTERNAL',
    }],
    [SalesInvoiceCreatedDataSchema, {
      entityType: 'FINANCE_INVOICE', entityId: 'inv_1', invoiceId: 'inv_1', orderId: 'ord_1', classification: 'INTERNAL',
    }],
  ]
  for (const [schema, valid] of cases) {
    assert.deepEqual(schema.parse(valid), valid)
    assert.throws(() => schema.parse({ ...valid, totalCents: 30_000 }), /Unrecognized key/)
    assert.throws(() => schema.parse({ ...valid, description: 'Acme' }), /Unrecognized key/)
    assert.throws(() => schema.parse({ ...valid, companyId: 'co_secret' }), /Unrecognized key/)
  }
})

test('sales socket frames route only to the company room', () => {
  const emitted = []
  const io = {
    to(room) {
      return { emit(socketEvent, payload) { emitted.push({ room, socketEvent, payload }) } }
    },
  }
  const event = {
    id: 'evt_1', type: 'SalesOrderConfirmed', version: 1,
    occurredAt: new Date(0).toISOString(), correlationId: 'cor_1',
    companyId: 'co_a', branchId: 'br_1', actorId: 'usr_1',
    data: {
      entityType: 'SALES_ORDER', entityId: 'ord_1', orderId: 'ord_1',
      quoteId: 'quo_1', classification: 'CONFIDENTIAL',
    },
  }
  assert.equal(dispatchEvent(io, event), 1)
  assert.deepEqual(emitted, [{
    room: 'company:co_a',
    socketEvent: 'sales:order',
    payload: {
      eventId: 'evt_1', type: 'SalesOrderConfirmed', occurredAt: event.occurredAt,
      correlationId: 'cor_1', data: event.data,
    },
  }])
  assert.equal(JSON.stringify(emitted).includes('br_1'), false)
  assert.equal(JSON.stringify(emitted).includes('usr_1'), false)
})
