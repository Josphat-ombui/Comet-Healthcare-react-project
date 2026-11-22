// Phase 6 finance unit tests. Pure helpers only — no database or network calls.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toCents, fromCents, calculateLine, toAccountDto, toPartyDto, toSubmissionDto, toPaymentDto } from '../lib/finance.js'
import { buildEtimsPayload } from '../lib/etims.js'
import { financePaymentSchema, financePartySchema, financeRateSchema, financeInvoiceSchema } from '../lib/validation.js'

test('toCents converts decimal strings without floating-point drift', () => {
  assert.equal(toCents('12.34'), 1234)
  assert.equal(toCents('0.05'), 5)
  assert.equal(toCents('-7.1'), -710)
  assert.equal(toCents(19.99), 1999)
  assert.equal(toCents('123'), 12300)
  assert.throws(() => toCents('not money'), /Invalid amount/)
})

test('fromCents renders integer cents as a decimal amount', () => {
  assert.equal(fromCents(1234), 12.34)
  assert.equal(fromCents(0), 0)
  assert.equal(fromCents(150), 1.5)
  assert.equal(fromCents(-505), -5.05)
})

test('calculateLine applies an exclusive 1600 bps statutory rate', () => {
  const result = calculateLine({ qty: 3, unitPriceCents: 10_000, rateBps: 1600, taxInclusive: false })
  assert.deepEqual(result, { netCents: 30_000, taxCents: 4_800, grossCents: 34_800 })
})

test('calculateLine extracts an inclusive 1600 bps statutory rate', () => {
  const result = calculateLine({ qty: 1, unitPriceCents: 11_600, rateBps: 1600, taxInclusive: true })
  assert.deepEqual(result, { netCents: 10_000, taxCents: 1_600, grossCents: 11_600 })
})

test('calculateLine rounds inclusive nets to whole cents', () => {
  const result = calculateLine({ qty: 1, unitPriceCents: 12_345, rateBps: 1600, taxInclusive: true })
  assert.equal(result.netCents + result.taxCents, 12_345)
  assert.equal(result.grossCents, 12_345)
  assert.ok(result.netCents > 0 && result.taxCents > 0)
})

test('calculateLine rejects invalid quantities, prices and rates', () => {
  assert.throws(() => calculateLine({ qty: 0, unitPriceCents: 100, rateBps: 1600 }), /Quantity/)
  assert.throws(() => calculateLine({ qty: 1, unitPriceCents: 10.5, rateBps: 1600 }), /Unit price/)
  assert.throws(() => calculateLine({ qty: 1, unitPriceCents: 100, rateBps: 10_001 }), /statutory rate/)
})

test('account DTOs never expose tenant identifiers', () => {
  const dto = toAccountDto({
    id: 'acc_1', companyId: 'co_secret', code: '1000', name: 'Cash', type: 'ASSET',
    normalBalance: 'DEBIT', systemCode: 'BANK', parentId: null, currency: 'KES',
    isActive: true, classification: 'INTERNAL', createdAt: new Date(0), updatedAt: new Date(0),
  })
  const json = JSON.stringify(dto)
  assert.equal(json.includes('co_secret'), false)
  assert.equal('companyId' in dto, false)
  assert.equal(dto.systemCode, 'BANK')
})

test('party DTOs expose only a PIN presence flag and encrypted marker', () => {
  const dto = toPartyDto({
    id: 'pty_1', companyId: 'co_secret', type: 'CUSTOMER', name: 'Acme', legalName: 'Acme Ltd',
    taxPinCiphertext: 'v1.iv.tag.ciphertext', email: 'a@example.test', phone: null,
    currency: 'KES', classification: 'CONFIDENTIAL',
  })
  const json = JSON.stringify(dto)
  assert.equal(dto.hasTaxPin, true)
  assert.equal(dto.taxPinMasked, '[ENCRYPTED]')
  assert.equal('taxPinCiphertext' in dto, false)
  assert.equal('companyId' in dto, false)
  assert.equal(json.includes('v1.iv.tag.ciphertext'), false)
})

test('submission DTO hides payload unless explicitly requested as detail', () => {
  const row = {
    id: 'sub_1', companyId: 'co_secret', invoiceId: 'inv_1', payloadVersion: '1.0',
    status: 'FAILED', provider: 'KRA_ETIMS', externalReference: null, attempts: 2,
    lastError: 'Rejected card 4111111111111111', payload: { invoiceNumber: 'INV-2026-0001' },
    queuedAt: new Date(0), submittedAt: null,
  }
  const list = toSubmissionDto(row)
  assert.equal('payload' in list, false)
  assert.equal('companyId' in list, false)
  assert.equal(list.lastError.includes('4111111111111111'), false)
  assert.ok(list.lastError.includes('CARD_NUMBER'))
  assert.deepEqual(toSubmissionDto(row, { includePayload: true }).payload, row.payload)
})

test('payment DTO keeps only allocation IDs and amounts', () => {
  const dto = toPaymentDto({
    id: 'pay_1', companyId: 'co_secret', number: 'PAY-2026-0001', direction: 'INCOMING',
    partyId: 'pty_1', method: 'MPESA', amountCents: 10_000, currency: 'KES', paidAt: new Date(0),
    reference: 'bank receipt', status: 'COMPLETED', journalId: 'jrn_1', classification: 'INTERNAL',
    createdById: 'usr_1',
  }, [{ id: 'alloc_1', companyId: 'co_secret', invoiceId: 'inv_1', amountCents: 10_000 }])
  assert.equal('companyId' in dto, false)
  assert.equal('companyId' in dto.allocations[0], false)
  assert.deepEqual(dto.allocations[0], { id: 'alloc_1', invoiceId: 'inv_1', amountCents: 10_000 })
})

test('eTIMS payload encrypts company PIN references and omits internal IDs', async () => {
  const invoice = {
    id: 'inv_1', companyId: 'co_secret', number: 'INV-2026-0001', direction: 'SALES',
    type: 'INVOICE', issueDate: '2026-01-15', currency: 'KES', taxInclusive: false,
    classification: 'CONFIDENTIAL', subtotalCents: 30_000, taxCents: 4_800, totalCents: 34_800,
  }
  const payload = await buildEtimsPayload(invoice, {
    payloadVersion: '6.1',
    provider: 'KRA_ETIMS',
    lines: [{ description: 'Tablets', qty: 3, unitPriceCents: 10_000, netCents: 30_000, taxCents: 4_800, grossCents: 34_800 }],
    party: { type: 'CUSTOMER', taxPinCiphertext: 'v1.encrypted.buyer' },
    taxRate: { rateBps: 1600, status: 'VERIFIED' },
    companyProfile: { vatReg: 'P051234567L' },
    encrypt: (value) => `enc:${String(value).length}`,
  })
  assert.equal(payload.schemaVersion, '6.1')
  assert.equal(payload.provider, 'KRA_ETIMS')
  assert.equal(payload.documentType, 'Invoice')
  assert.equal(payload.supplierPinRef, 'enc:11')
  assert.equal(payload.buyerPinRef, 'v1.encrypted.buyer')
  assert.equal(payload.lines[0].vatRate, 0.16)
  assert.deepEqual(payload.totals, { net: 300, vat: 48, gross: 348 })
  const json = JSON.stringify(payload)
  assert.equal(json.includes('P051234567L'), false)
  assert.equal(json.includes('co_secret'), false)
  assert.equal(json.includes('inv_1'), false)
})

test('eTIMS payload swaps supplier and buyer for purchase invoices', async () => {
  const payload = await buildEtimsPayload({
    id: 'inv_2', number: 'BILL-2026-0001', direction: 'PURCHASE', type: 'CREDIT_NOTE',
    issueDate: '2026-02-01', currency: 'KES', classification: 'INTERNAL',
    taxInclusive: true, subtotalCents: 10_000, taxCents: 1_600, totalCents: 11_600,
  }, {
    lines: [],
    party: { type: 'SUPPLIER', taxPinCiphertext: 'v1.encrypted.supplier' },
    taxRate: { rateBps: 1600 },
    companyProfile: { vatReg: 'P000000000X' },
    encrypt: () => 'enc:company',
  })
  assert.equal(payload.documentType, 'CreditNote')
  assert.equal(payload.supplierPinRef, 'v1.encrypted.supplier')
  assert.equal(payload.buyerPinRef, 'enc:company')
})

test('financePaymentSchema rejects card numbers and KRA PINs in references', () => {
  const base = {
    direction: 'INCOMING', partyId: 'pty_1', method: 'MPESA', amountCents: 10_000,
    allocations: [{ invoiceId: 'inv_1', amountCents: 10_000 }],
  }
  const card = financePaymentSchema.safeParse({ ...base, reference: 'Paid with 4111111111111111' })
  assert.equal(card.success, false)
  assert.match(JSON.stringify(card.error.issues), /CARD_NUMBER/)
  assert.equal(JSON.stringify(card.error.issues).includes('4111111111111111'), false)

  const pin = financePaymentSchema.safeParse({ ...base, reference: 'Ref A123456789Z' })
  assert.equal(pin.success, false)
  assert.match(JSON.stringify(pin.error.issues), /KRA_PIN/)
  assert.equal(JSON.stringify(pin.error.issues).includes('A123456789Z'), false)
})

test('financePartySchema accepts a whole KRA PIN but rejects embedded secrets', () => {
  const valid = financePartySchema.safeParse({
    type: 'CUSTOMER', name: 'Acme', taxPin: 'A123456789Z', currency: 'KES',
  })
  assert.equal(valid.success, true)
  assert.equal(valid.data.currency, 'KES')

  const invalid = financePartySchema.safeParse({
    type: 'CUSTOMER', name: 'Acme', taxPin: 'pin 4111111111111111', currency: 'KES',
  })
  assert.equal(invalid.success, false)
  assert.match(JSON.stringify(invalid.error.issues), /CARD_NUMBER/)
})

test('financeRateSchema never accepts a verified status at creation', () => {
  const parsed = financeRateSchema.parse({
    code: 'VAT16', label: 'Standard VAT', rateBps: 1600,
    effectiveFrom: '2026-01-01', sourceReference: 'Finance Act 2026',
    status: 'VERIFIED', verifiedBy: 'someone',
  })
  assert.equal(parsed.kind, 'VAT')
  assert.equal('status' in parsed, false)
  assert.equal('verifiedBy' in parsed, false)
  assert.equal(financeRateSchema.safeParse({
    code: 'VAT0', label: 'Zero', rateBps: 0, effectiveFrom: '2026-01-01', sourceReference: 'n/a',
  }).success, false)
})

test('financeInvoiceSchema validates lines and applies defaults', () => {
  const parsed = financeInvoiceSchema.parse({
    direction: 'SALES', partyId: 'pty_1', issueDate: '2026-03-01',
    lines: [{ description: 'Service', qty: 2, unitPriceCents: 5000 }],
  })
  assert.equal(parsed.type, 'INVOICE')
  assert.equal(parsed.taxInclusive, false)
  assert.equal(parsed.currency, 'KES')
  assert.equal(parsed.lines.length, 1)
  assert.equal(financeInvoiceSchema.safeParse({
    direction: 'SALES', partyId: 'pty_1', issueDate: '2026-03-01', lines: [],
  }).success, false)
})
