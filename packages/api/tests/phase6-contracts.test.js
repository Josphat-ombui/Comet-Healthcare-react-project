import assert from 'node:assert/strict'
import test from 'node:test'

import { PERMISSIONS, ROLE_PERMISSIONS } from '../../shared/src/permissions.js'
import { DomainEventSchemas } from '../../shared/src/events.js'

const FINANCE_PERMISSIONS = [
  'finance.account.read',
  'finance.account.write',
  'finance.journal.read',
  'finance.journal.write',
  'finance.journal.post',
  'finance.party.read',
  'finance.party.write',
  'finance.invoice.read',
  'finance.invoice.write',
  'finance.invoice.issue',
  'finance.payment.read',
  'finance.payment.write',
  'finance.budget.read',
  'finance.budget.write',
  'finance.statutory.read',
  'finance.statutory.write',
  'finance.statutory.verify',
  'finance.statement.read',
  'finance.etims.read',
  'finance.etims.write',
]

const ROLE_FINANCE_PERMISSIONS = {
  MANAGER: [
    'finance.account.read',
    'finance.account.write',
    'finance.journal.read',
    'finance.journal.write',
    'finance.journal.post',
    'finance.party.read',
    'finance.party.write',
    'finance.invoice.read',
    'finance.invoice.write',
    'finance.invoice.issue',
    'finance.payment.read',
    'finance.payment.write',
    'finance.budget.read',
    'finance.budget.write',
    'finance.statutory.read',
    'finance.statement.read',
    'finance.etims.read',
  ],
  STAFF: [
    'finance.account.read',
    'finance.journal.read',
    'finance.party.read',
    'finance.invoice.read',
    'finance.payment.read',
    'finance.budget.read',
    'finance.statutory.read',
    'finance.statement.read',
  ],
  COMPLIANCE: [
    'finance.account.read',
    'finance.journal.read',
    'finance.party.read',
    'finance.invoice.read',
    'finance.payment.read',
    'finance.budget.read',
    'finance.statutory.read',
    'finance.statutory.write',
    'finance.statutory.verify',
    'finance.statement.read',
    'finance.etims.read',
    'finance.etims.write',
  ],
}

const VALID_EVENT_PAYLOADS = {
  FinanceAccountCreated: {
    accountId: 'fac_1',
    code: '1000',
    type: 'ASSET',
    classification: 'INTERNAL',
    entityType: 'FINANCE_ACCOUNT',
    entityId: 'fac_1',
  },
  JournalPosted: {
    journalId: 'fjr_1',
    number: 'JV-2026-1',
    status: 'POSTED',
    lineCount: 2,
    classification: 'INTERNAL',
    entityType: 'FINANCE_JOURNAL',
    entityId: 'fjr_1',
  },
  InvoiceIssued: {
    invoiceId: 'fin_1',
    number: 'INV-2026-1',
    direction: 'SALES',
    type: 'INVOICE',
    status: 'ISSUED',
    classification: 'INTERNAL',
    entityType: 'FINANCE_INVOICE',
    entityId: 'fin_1',
  },
  PaymentRecorded: {
    paymentId: 'fpy_1',
    number: 'PAY-2026-1',
    direction: 'INCOMING',
    method: 'MPESA',
    classification: 'INTERNAL',
    entityType: 'FINANCE_PAYMENT',
    entityId: 'fpy_1',
  },
  BudgetApproved: {
    budgetId: 'fbd_1',
    code: 'BUDGET-2026-Q4',
    classification: 'INTERNAL',
    entityType: 'FINANCE_BUDGET',
    entityId: 'fbd_1',
  },
  StatutoryRateVerified: {
    rateId: 'frt_1',
    code: 'VAT_STANDARD',
    kind: 'VAT',
    effectiveFrom: '2026-01-01',
    classification: 'INTERNAL',
    entityType: 'STATUTORY_RATE',
    entityId: 'frt_1',
  },
  EtimsSubmissionQueued: {
    submissionId: 'fet_1',
    invoiceId: 'fin_1',
    status: 'QUEUED',
    classification: 'INTERNAL',
    entityType: 'ETIMS_SUBMISSION',
    entityId: 'fet_1',
  },
  EtimsSubmissionFailed: {
    submissionId: 'fet_1',
    invoiceId: 'fin_1',
    reasonCode: 'PROVIDER_TIMEOUT',
    classification: 'INTERNAL',
    entityType: 'ETIMS_SUBMISSION',
    entityId: 'fet_1',
  },
}

const FORBIDDEN_EXTRA_FIELDS = ['title', 'body', 'companyId', 'taxPin', 'payload']

test('Phase 6 finance permission codes are registered', () => {
  for (const code of FINANCE_PERMISSIONS) {
    assert.ok(PERMISSIONS[code], `missing permission: ${code}`)
    assert.equal(typeof PERMISSIONS[code], 'string')
    assert.ok(PERMISSIONS[code].length > 0)
  }
})

test('Phase 6 finance role mappings match the contract', () => {
  assert.deepEqual(ROLE_PERMISSIONS.ADMIN, Object.keys(PERMISSIONS))
  for (const [role, expected] of Object.entries(ROLE_FINANCE_PERMISSIONS)) {
    const actual = ROLE_PERMISSIONS[role].filter((code) => code.startsWith('finance.'))
    assert.deepEqual(actual, expected, `${role} finance permissions do not match`)
  }
  const manager = ROLE_PERMISSIONS.MANAGER
  assert.ok(!manager.includes('finance.statutory.write'))
  assert.ok(!manager.includes('finance.statutory.verify'))
  assert.ok(!manager.includes('finance.etims.write'))
})

test('Phase 6 event schemas accept ID-only payloads and reject content fields', () => {
  for (const [type, payload] of Object.entries(VALID_EVENT_PAYLOADS)) {
    const schema = DomainEventSchemas[type]
    assert.ok(schema, `missing event schema: ${type}`)
    assert.doesNotThrow(() => schema.parse(payload), `${type} rejected a valid ID-only payload`)
    for (const field of FORBIDDEN_EXTRA_FIELDS) {
      assert.throws(
        () => schema.parse({ ...payload, [field]: 'must-not-leak' }),
        undefined,
        `${type} accepted extra field ${field}`,
      )
    }
  }
})

test('StatutoryRateVerified only accepts VAT rates', () => {
  const payload = VALID_EVENT_PAYLOADS.StatutoryRateVerified
  assert.doesNotThrow(() => DomainEventSchemas.StatutoryRateVerified.parse(payload))
  assert.throws(() => DomainEventSchemas.StatutoryRateVerified.parse({ ...payload, kind: 'WITHHOLDING' }))
  assert.throws(() => DomainEventSchemas.StatutoryRateVerified.parse({ ...payload, kind: 'SERVICE' }))
})
