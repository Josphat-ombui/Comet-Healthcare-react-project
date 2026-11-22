// Phase 6 worker + realtime contracts. No BullMQ, Redis or database needed:
// processors are exercised with a small in-memory Prisma-shaped fake.

import assert from 'node:assert/strict'
import test from 'node:test'

import { QUEUE_NAMES } from '../lib/queues.js'
import { createProcessors } from '../../workers/src/jobs.js'
import { dispatchEvent } from '../../realtime/src/events.js'

const COMPANY_ID = 'cmp_finance'
const SUBMISSION_ID = 'ets_1'
const INVOICE_ID = 'inv_1'
const CORRELATION_ID = 'cor_finance'

const SUBMISSION_DATA = {
  submissionId: SUBMISSION_ID,
  invoiceId: INVOICE_ID,
  classification: 'INTERNAL',
  entityType: 'ETIMS_SUBMISSION',
  entityId: SUBMISSION_ID,
}

const VALID_PAYLOAD = {
  schemaVersion: 1,
  documentType: 'INVOICE',
  invoiceNumber: 'INV-001',
  currency: 'KES',
  lines: [{ description: 'Secret line item', quantity: 1 }],
  totals: { subtotal: 100, tax: 0, total: 100 },
  provider: 'certified-provider',
}

function etimsJob() {
  return {
    id: 'job_1',
    data: {
      companyId: COMPANY_ID,
      invoiceId: INVOICE_ID,
      submissionId: SUBMISSION_ID,
      correlationId: CORRELATION_ID,
    },
  }
}

function fakePrisma(submission) {
  const calls = {
    jobUpdates: [],
    submissionUpdates: [],
    outboxEvents: [],
    notifications: [],
    deliveries: [],
  }
  const prisma = {
    etimsSubmission: {
      findFirst: async () => submission,
      update: async ({ where, data }) => {
        calls.submissionUpdates.push({ where, data })
        return { ...submission, ...data }
      },
    },
    user: {
      findMany: async () => [{ id: 'usr_admin' }, { id: 'usr_compliance' }],
    },
    notification: {
      create: async ({ data }) => {
        const row = { id: `ntf_${calls.notifications.length + 1}`, ...data }
        calls.notifications.push(row)
        return row
      },
    },
    notificationDelivery: {
      create: async ({ data }) => {
        calls.deliveries.push(data)
        return { id: `dlv_${calls.deliveries.length}`, ...data }
      },
    },
    outboxEvent: {
      create: async ({ data }) => {
        calls.outboxEvents.push(data)
        return { id: `evt_${calls.outboxEvents.length}`, ...data }
      },
    },
    jobRecord: {
      updateMany: async (args) => {
        calls.jobUpdates.push(args)
        return { count: 1 }
      },
    },
  }
  return { prisma, calls }
}

function recordingIo() {
  const emitted = []
  return {
    emitted,
    io: {
      to(room) {
        return { emit: (name, payload) => emitted.push({ room, name, payload }) }
      },
    },
  }
}

function financeEvent(type, data) {
  return {
    id: `evt_${type}`,
    type,
    version: 1,
    occurredAt: '2026-11-22T00:00:00.000Z',
    correlationId: CORRELATION_ID,
    companyId: COMPANY_ID,
    data,
  }
}

test('Phase 6 eTIMS queue and processor are registered', () => {
  assert.ok(QUEUE_NAMES.includes('finance.etims.submit'))
  const processors = createProcessors({})
  assert.equal(typeof processors['finance.etims.submit'], 'function')
})

test('submitEtims skips a missing submission without touching events or notifications', async () => {
  const { prisma, calls } = fakePrisma(null)
  const result = await createProcessors(prisma)['finance.etims.submit'](etimsJob())

  assert.deepEqual(result, { skipped: true })
  assert.equal(calls.submissionUpdates.length, 0)
  assert.equal(calls.outboxEvents.length, 0)
  assert.equal(calls.notifications.length, 0)
  assert.equal(calls.jobUpdates.at(-1).data.status, 'COMPLETED')
  assert.deepEqual(calls.jobUpdates.at(-1).data.result, { skipped: true })
})

test('submitEtims marks a valid submission PENDING for a certified provider only', async () => {
  const { prisma, calls } = fakePrisma({ id: SUBMISSION_ID, companyId: COMPANY_ID, payload: VALID_PAYLOAD })
  const result = await createProcessors(prisma)['finance.etims.submit'](etimsJob())

  assert.deepEqual(result, { submissionId: SUBMISSION_ID, status: 'PENDING' })
  assert.equal(calls.jobUpdates[0].data.status, 'RUNNING')
  assert.equal(calls.jobUpdates.at(-1).data.status, 'COMPLETED')
  assert.deepEqual(calls.jobUpdates.at(-1).data.result, result)

  assert.equal(calls.submissionUpdates.length, 1)
  const update = calls.submissionUpdates[0].data
  assert.equal(update.status, 'PENDING')
  assert.equal(update.provider, 'certified-provider')
  assert.equal(update.submittedAt, null)
  assert.equal(update.externalReference, null)
  assert.equal(update.lastError, null)

  assert.equal(calls.outboxEvents.length, 1)
  const event = calls.outboxEvents[0]
  assert.equal(event.eventType, 'EtimsSubmissionQueued')
  assert.equal(event.correlationId, CORRELATION_ID)
  assert.deepEqual(event.payload.data, { ...SUBMISSION_DATA, status: 'PENDING' })
})

test('submitEtims notifications are in-app, ID-only and never carry payload content', async () => {
  const { prisma, calls } = fakePrisma({ id: SUBMISSION_ID, companyId: COMPANY_ID, payload: VALID_PAYLOAD })
  await createProcessors(prisma)['finance.etims.submit'](etimsJob())

  assert.equal(calls.notifications.length, 2)
  assert.deepEqual(calls.notifications.map((n) => n.userId).sort(), ['usr_admin', 'usr_compliance'])
  for (const notification of calls.notifications) {
    assert.equal(notification.category, 'SYSTEM')
    assert.equal(notification.classification, 'INTERNAL')
    assert.equal(notification.entityType, 'ETIMS_SUBMISSION')
    assert.equal(notification.entityId, SUBMISSION_ID)
    assert.ok(notification.deliveredAt instanceof Date)
    assert.equal(notification.title, 'eTIMS submission awaiting certified provider')
  }
  assert.equal(calls.deliveries.length, 2)
  for (const delivery of calls.deliveries) {
    assert.equal(delivery.channel, 'IN_APP')
    assert.equal(delivery.status, 'DELIVERED')
    assert.ok(delivery.sentAt instanceof Date)
    assert.equal(['smtp', 'email'].includes(String(delivery.channel).toLowerCase()), false)
  }

  const serialized = JSON.stringify({ events: calls.outboxEvents, notifications: calls.notifications })
  for (const secret of ['Secret line item', 'INV-001', 'KES', '100']) {
    assert.equal(serialized.includes(secret), false, `payload content leaked: ${secret}`)
  }
})

test('submitEtims fails closed on an invalid payload and throws so BullMQ retries', async () => {
  const { prisma, calls } = fakePrisma({
    id: SUBMISSION_ID,
    companyId: COMPANY_ID,
    payload: { schemaVersion: 1, documentType: 'INVOICE' },
  })
  await assert.rejects(
    () => createProcessors(prisma)['finance.etims.submit'](etimsJob()),
    /Invalid eTIMS payload/
  )

  assert.equal(calls.submissionUpdates[0].data.status, 'FAILED')
  assert.equal(calls.submissionUpdates[0].data.lastError, 'INVALID_PAYLOAD')
  assert.equal(calls.outboxEvents.length, 1)
  assert.equal(calls.outboxEvents[0].eventType, 'EtimsSubmissionFailed')
  assert.deepEqual(calls.outboxEvents[0].payload.data, {
    ...SUBMISSION_DATA,
    reasonCode: 'INVALID_PAYLOAD',
  })
  assert.equal(calls.notifications.length, 2)
  assert.equal(calls.jobUpdates.at(-1).data.status, 'FAILED')
  assert.equal(calls.jobUpdates.at(-1).data.error, 'Invalid eTIMS payload')
  assert.equal(JSON.stringify(calls).includes('INV-001'), false)
})

test('realtime sends InvoiceIssued to the company room as finance:invoice', () => {
  const { emitted, io } = recordingIo()
  const event = financeEvent('InvoiceIssued', {
    invoiceId: INVOICE_ID,
    classification: 'INTERNAL',
    entityType: 'INVOICE',
    entityId: INVOICE_ID,
  })

  assert.equal(dispatchEvent(io, event), 1)
  assert.equal(emitted.length, 1)
  assert.equal(emitted[0].room, `company:${COMPANY_ID}`)
  assert.equal(emitted[0].name, 'finance:invoice')
  assert.deepEqual(emitted[0].payload.data, event.data)
})

test('realtime maps every Phase 6 finance event and adds known user rooms only', () => {
  const expected = {
    FinanceAccountCreated: 'finance:account',
    JournalPosted: 'finance:journal',
    InvoiceIssued: 'finance:invoice',
    PaymentRecorded: 'finance:payment',
    BudgetApproved: 'finance:budget',
    StatutoryRateVerified: 'finance:rate',
    EtimsSubmissionQueued: 'finance:etims',
    EtimsSubmissionFailed: 'finance:etims-failed',
  }
  for (const [type, name] of Object.entries(expected)) {
    const { emitted, io } = recordingIo()
    const event = financeEvent(type, { ...SUBMISSION_DATA, actorId: 'usr_admin' })
    assert.equal(dispatchEvent(io, event), 2, `${type} should reach company and actor rooms`)
    assert.deepEqual(emitted.map((e) => e.room), [
      `company:${COMPANY_ID}`,
      `company:${COMPANY_ID}:user:usr_admin`,
    ])
    assert.ok(emitted.every((e) => e.name === name))
  }

  const { emitted, io } = recordingIo()
  dispatchEvent(io, financeEvent('EtimsSubmissionFailed', { ...SUBMISSION_DATA, requestedById: 'usr_requester' }))
  assert.equal(emitted[0].name, 'finance:etims-failed')
  assert.equal(emitted[1].room, `company:${COMPANY_ID}:user:usr_requester`)
})

test('finance events never use messaging thread or inbox rooms', () => {
  const types = [
    'FinanceAccountCreated', 'JournalPosted', 'InvoiceIssued', 'PaymentRecorded',
    'BudgetApproved', 'StatutoryRateVerified', 'EtimsSubmissionQueued', 'EtimsSubmissionFailed',
  ]
  for (const type of types) {
    const { emitted, io } = recordingIo()
    const event = financeEvent(type, {
      ...SUBMISSION_DATA,
      // Adversarial room fields: finance envelopes never carry these IDs.
      threadId: 'thr_secret',
      recipientInboxIds: ['inb_secret'],
    })
    dispatchEvent(io, event)
    assert.ok(emitted.length >= 1, `${type} should emit`)
    for (const { room } of emitted) {
      assert.equal(room.includes(':thread:'), false)
      assert.equal(room.includes(':inbox:'), false)
    }
  }
})

test('finance socket payload data is ID-only', () => {
  const types = [
    'FinanceAccountCreated', 'JournalPosted', 'InvoiceIssued', 'PaymentRecorded',
    'BudgetApproved', 'StatutoryRateVerified', 'EtimsSubmissionQueued', 'EtimsSubmissionFailed',
  ]
  for (const type of types) {
    const { emitted, io } = recordingIo()
    // Minimal ID-only data, as carried by the shared finance event schemas.
    const event = financeEvent(type, SUBMISSION_DATA)
    dispatchEvent(io, event)
    assert.ok(emitted.length >= 1, `${type} should emit`)
    for (const { payload } of emitted) {
      assert.deepEqual(Object.keys(payload.data).sort(), [
        'classification', 'entityId', 'entityType', 'invoiceId', 'submissionId',
      ])
      assert.equal('title' in payload.data, false)
      assert.equal('body' in payload.data, false)
      assert.equal('amount' in payload.data, false)
      assert.equal(JSON.stringify(payload).includes('Secret'), false)
    }
  }
})
