// Phase 15 webhook unit/contract tests. Pure signing helpers, DTO guards,
// schemas, events, sockets and source wiring only - no database or network
// calls. Cross-tenant RLS isolation is verified by the deployment probe.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  WEBHOOK_CONTRACT,
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_DEVELOPER_EVENT_TYPES,
  buildWebhookPayload,
  callbackReplayKey,
  canonicalize,
  replayAcceptedFromAudit,
  sanitizeWebhookPayload,
  signCanonical,
  signatureHeader,
  timingSafeHex,
  toClientDto,
  toDeliveryDto,
  toSubscriptionDto,
} from '../lib/webhooks.js'
import {
  webhookCallbackSchema,
  webhookSubscriptionCreateSchema,
  webhookSubscriptionRotateSchema,
  webhookDeliveryPayloadSchema,
} from '../lib/validation.js'
import {
  DomainEventSchemas,
  WebhookSubscriptionCreatedDataSchema,
  WebhookDeliveryFailedDataSchema,
  PublicClientRevokedDataSchema,
} from '../../shared/src/events.js'
import { dispatchEvent } from '../../realtime/src/events.js'
import { webhookBackoffMs } from '../../workers/src/jobs.js'

function read(relative) {
  return readFileSync(new URL(relative, import.meta.url), 'utf8')
}

const goodPayload = {
  eventId: 'evt_1',
  eventType: 'InvoiceIssued',
  entityType: 'INVOICE',
  entityId: 'inv_1',
  occurredAt: '2026-11-23T00:00:00.000Z',
  correlationId: 'cor_1',
  classification: 'INTERNAL',
}

// ------------------------------------------------------------------ signing

test('canonical JSON sorts every object level and keeps arrays ordered', () => {
  assert.equal(
    canonicalize({ b: 1, a: { d: 2, c: [{ z: 3, y: 4 }] } }),
    '{"a":{"c":[{"y":4,"z":3}],"d":2},"b":1}',
  )
  assert.equal(canonicalize({ z: null, a: [3, 1, 2] }), '{"a":[3,1,2],"z":null}')
})

test('signatures are deterministic, prefixed and compared in constant time', () => {
  const canonical = canonicalize(goodPayload)
  const signature = signCanonical(canonical, 'fixture-secret')
  assert.match(signature, /^[a-f0-9]{64}$/)
  assert.equal(signature, signCanonical(canonical, 'fixture-secret'))
  assert.notEqual(signature, signCanonical(canonical, 'other-secret'))
  assert.equal(signatureHeader(canonical, 'fixture-secret'), `sha256=${signature}`)
  assert.equal(timingSafeHex(signature, signature), true)
  assert.equal(timingSafeHex(signature, `sha256=${signature}`), false)
  assert.equal(timingSafeHex(signature, 'abc'), false)
  assert.equal(timingSafeHex(signature, 'z'.repeat(64)), false)
})

// ----------------------------------------------------------- payload mapping

test('outbox events become allow-listed ID-only webhook payloads', () => {
  const payload = buildWebhookPayload({
    id: 'evt_1',
    type: 'InvoiceIssued',
    occurredAt: '2026-11-23T00:00:00.000Z',
    correlationId: 'cor_1',
    data: {
      invoiceId: 'inv_1',
      classification: 'INTERNAL',
      totalCents: 125000,
      clientName: 'Secret customer',
      url: 'https://example.invalid/hook',
    },
  })
  assert.deepEqual(payload, goodPayload)
  assert.deepEqual(Object.keys(payload).sort(), [
    'classification', 'correlationId', 'entityId', 'entityType', 'eventId', 'eventType', 'occurredAt',
  ])
  assert.equal(buildWebhookPayload({ id: 'evt_x', type: 'UnknownEvent', occurredAt: '2026-11-23T00:00:00.000Z', data: {} }), null)
  assert.equal(buildWebhookPayload({ id: 'evt_x', type: 'InvoiceIssued', occurredAt: '2026-11-23T00:00:00.000Z', data: {} }), null)
})

test('delivery and callback payload schemas reject extra business fields', () => {
  assert.deepEqual(sanitizeWebhookPayload(goodPayload), goodPayload)
  for (const extra of [
    { totalCents: 100 }, { secret: 'secret' }, { url: 'https://example.invalid' },
    { clientName: 'Customer' }, { responseBody: 'OK' }, { signature: 'sha256=abc' },
  ]) {
    assert.equal(webhookDeliveryPayloadSchema.safeParse({ ...goodPayload, ...extra }).success, false)
    assert.equal(sanitizeWebhookPayload({ ...goodPayload, ...extra }), null)
  }
  const callback = {
    eventId: 'evt_1', eventType: 'InvoiceIssued', entityType: 'INVOICE', entityId: 'inv_1',
    occurredAt: '2026-11-23T00:00:00.000Z', timestamp: '2026-11-23T00:00:05.000Z',
  }
  assert.equal(webhookCallbackSchema.safeParse(callback).success, true)
  assert.equal(webhookCallbackSchema.safeParse({ ...callback, secret: 'x'.repeat(32) }).success, false)
})

// --------------------------------------------------------------- DTO masking

test('management DTOs never expose secrets, hashes, envelopes or raw responses', () => {
  const client = toClientDto({
    id: 'cl_1', name: 'Partner', apiKeyId: 'key_1', scopes: ['public:health:read', 'not:a:scope'],
    status: 'ACTIVE', branchId: null, revokedAt: null, createdAt: new Date('2026-11-23T00:00:00.000Z'),
    apiKey: { keyPrefix: 'cmt_abcdefghij' },
  })
  assert.deepEqual(client.scopes, ['public:health:read'])
  assert.equal(client.keyPrefix.includes('abcdefghij'), false)
  assert.match(client.keyPrefix, /••/)

  const subscription = toSubscriptionDto({
    id: 'sub_1', url: 'https://example.invalid/hook', eventTypes: ['InvoiceIssued', 'Bogus'],
    status: 'ACTIVE', clientId: 'cl_1', branchId: null,
    secretEncrypted: 'v1.iv.tag.envelope', secretHash: 'a'.repeat(64),
    rotatedAt: null, createdAt: new Date('2026-11-23T00:00:00.000Z'),
  })
  assert.deepEqual(subscription.eventTypes, ['InvoiceIssued'])
  assert.equal(subscription.secretConfigured, true)
  const subscriptionText = JSON.stringify(subscription)
  assert.equal(subscriptionText.includes('v1.iv.tag.envelope'), false)
  assert.equal(subscriptionText.includes('a'.repeat(64)), false)

  const delivery = toDeliveryDto({
    id: 'del_1', subscriptionId: 'sub_1', eventId: 'evt_1', eventType: 'InvoiceIssued',
    payload: goodPayload, status: 'FAILED', attempts: 2,
    nextAttemptAt: null, responseStatus: 500, lastError: 'NETWORK_BODY_TEXT',
    deliveredAt: null, createdAt: new Date('2026-11-23T00:00:00.000Z'), responseBody: 'provider error body',
  })
  assert.deepEqual(delivery.payload, goodPayload)
  assert.equal(delivery.lastError, null)
  assert.equal(JSON.stringify(delivery).includes('provider error body'), false)

  const tampered = toDeliveryDto({
    ...delivery,
    payload: { ...goodPayload, secret: 'do-not-leak', totalCents: 1 },
  })
  assert.equal(tampered.payload, null)
  assert.equal(JSON.stringify(tampered).includes('do-not-leak'), false)
})

// ------------------------------------------------------------ input validation

test('subscription schemas enforce public HTTPS URLs and strong whole-field secrets', () => {
  const base = {
    url: 'https://hooks.example.com/comet',
    eventTypes: ['InvoiceIssued'],
    secret: 'fixture_secret_1234567890_abcdefghijklmno',
  }
  assert.equal(webhookSubscriptionCreateSchema.safeParse(base).success, true)
  assert.equal(webhookSubscriptionCreateSchema.safeParse({ ...base, url: 'http://hooks.example.com/comet' }).success, false)
  assert.equal(webhookSubscriptionCreateSchema.safeParse({ ...base, url: 'https://localhost/comet' }).success, false)
  assert.equal(webhookSubscriptionCreateSchema.safeParse({ ...base, url: 'https://127.0.0.1/comet' }).success, false)
  assert.equal(webhookSubscriptionCreateSchema.safeParse({ ...base, url: 'https://user:pass@hooks.example.com/comet' }).success, false)
  assert.equal(webhookSubscriptionCreateSchema.safeParse({ ...base, secret: 'short' }).success, false)
  assert.equal(webhookSubscriptionCreateSchema.safeParse({ ...base, eventTypes: [] }).success, false)
  assert.equal(webhookSubscriptionRotateSchema.safeParse({ secret: 'short' }).success, false)
  assert.equal(webhookSubscriptionCreateSchema.safeParse({ ...base, secretEncrypted: 'v1.x.y.z' }).success, false)
})

// -------------------------------------------------------------------- replay

test('replay identity is deterministic and audit entries are detected', () => {
  const key = callbackReplayKey('cmp_comet', 'cl_1', 'evt_1', '2026-11-23T00:00:00.000Z')
  assert.match(key, /^[a-f0-9]{64}$/)
  assert.equal(key, callbackReplayKey('cmp_comet', 'cl_1', 'evt_1', '2026-11-23T00:00:00.000Z'))
  assert.notEqual(key, callbackReplayKey('cmp_other', 'cl_1', 'evt_1', '2026-11-23T00:00:00.000Z'))
  assert.equal(replayAcceptedFromAudit([{ metadata: { replayKey: key } }], key), true)
  assert.equal(replayAcceptedFromAudit([{ metadata: { replayKey: 'other' } }], key), false)
  assert.equal(replayAcceptedFromAudit(null, key), false)
})

test('callback signature is verified before replay state is consulted', () => {
  const source = read('../lib/webhooks.js')
  const signatureIndex = source.indexOf('timingSafeHex(expected, provided)')
  const replayIndex = source.indexOf('alreadyAccepted(client.companyId, replayKey')
  assert.ok(signatureIndex > -1 && replayIndex > signatureIndex)
  assert.match(source, /action: 'webhook\.callback\.accepted'/)
  assert.match(source, /callbackReplayKey\(client\.companyId, client\.id, callback\.eventId, callback\.timestamp\)/)
  assert.match(source, /Math\.abs\(now - timestamp\) > ttlMs/)
  assert.equal(WEBHOOK_SIGNATURE_HEADER, 'x-comet-signature')
  assert.match(WEBHOOK_CONTRACT.signing.format, /sha256=<64 lowercase hex characters>/)
})

// --------------------------------------------------------------------- events

test('developer event schemas are strict and ID/classification-only', () => {
  const created = {
    entityType: 'WEBHOOK_SUBSCRIPTION', entityId: 'sub_1', subscriptionId: 'sub_1',
    clientId: 'cl_1', classification: 'INTERNAL',
  }
  const failed = {
    entityType: 'WEBHOOK_DELIVERY', entityId: 'del_1', deliveryId: 'del_1',
    subscriptionId: 'sub_1', eventId: 'evt_1', reasonCode: 'HTTP_ERROR', classification: 'INTERNAL',
  }
  const revoked = {
    entityType: 'PUBLIC_CLIENT', entityId: 'cl_1', clientId: 'cl_1',
    apiKeyId: 'key_1', classification: 'INTERNAL',
  }
  assert.equal(DomainEventSchemas.WebhookSubscriptionCreated.parse(created).subscriptionId, 'sub_1')
  assert.equal(DomainEventSchemas.WebhookDeliveryFailed.parse(failed).reasonCode, 'HTTP_ERROR')
  assert.equal(DomainEventSchemas.PublicClientRevoked.parse(revoked).apiKeyId, 'key_1')
  assert.equal(WebhookSubscriptionCreatedDataSchema.parse(created).entityId, 'sub_1')
  assert.equal(WebhookDeliveryFailedDataSchema.parse(failed).deliveryId, 'del_1')
  assert.equal(PublicClientRevokedDataSchema.parse(revoked).clientId, 'cl_1')

  for (const extra of [
    { url: 'https://example.invalid/hook' }, { secret: 'x'.repeat(32) },
    { keyHash: 'a'.repeat(64) }, { responseBody: 'provider said no' },
    { payload: goodPayload }, { totalCents: 100 }, { name: 'Partner' },
  ]) {
    assert.throws(() => DomainEventSchemas.WebhookSubscriptionCreated.parse({ ...created, ...extra }), /unrecognized/i)
    assert.throws(() => DomainEventSchemas.WebhookDeliveryFailed.parse({ ...failed, ...extra }), /unrecognized/i)
    assert.throws(() => DomainEventSchemas.PublicClientRevoked.parse({ ...revoked, ...extra }), /unrecognized/i)
  }
  assert.deepEqual(WEBHOOK_DEVELOPER_EVENT_TYPES, [
    'WebhookSubscriptionCreated', 'WebhookDeliveryFailed', 'PublicClientRevoked',
  ])
})

test('developer events map to two company-room-only ERP socket channels', () => {
  const emitted = []
  const io = { to: (room) => ({ emit: (event, payload) => emitted.push({ room, event, payload }) }) }
  const base = {
    companyId: 'cmp_comet',
    branchId: 'br_1',
    occurredAt: '2026-11-23T00:00:00.000Z',
    correlationId: 'cor_1',
  }
  for (const [type, data, expectedEvent] of [
    ['WebhookSubscriptionCreated', { entityType: 'WEBHOOK_SUBSCRIPTION', entityId: 'sub_1', subscriptionId: 'sub_1', clientId: 'cl_1', classification: 'INTERNAL' }, 'developer:webhook'],
    ['WebhookDeliveryFailed', { entityType: 'WEBHOOK_DELIVERY', entityId: 'del_1', deliveryId: 'del_1', subscriptionId: 'sub_1', eventId: 'evt_1', reasonCode: 'HTTP_ERROR', classification: 'INTERNAL' }, 'developer:webhook'],
    ['PublicClientRevoked', { entityType: 'PUBLIC_CLIENT', entityId: 'cl_1', clientId: 'cl_1', apiKeyId: 'key_1', classification: 'INTERNAL' }, 'developer:client'],
  ]) {
    emitted.length = 0
    assert.equal(dispatchEvent(io, { ...base, type, data }), 1)
    assert.equal(emitted[0].room, 'company:cmp_comet')
    assert.equal(emitted[0].event, expectedEvent)
    const text = JSON.stringify(emitted[0].payload)
    assert.equal(text.includes('br_1'), false)
    for (const forbidden of ['secret', 'keyHash', 'responseBody', 'totalCents', 'url']) {
      assert.equal(text.includes(forbidden), false)
    }
  }
})

// ------------------------------------------------------- delivery/retry queue

test('retry backoff doubles with a cap and never carries provider content', () => {
  const base = webhookBackoffMs(1)
  assert.ok(base >= 100)
  assert.equal(webhookBackoffMs(2), Math.min(base * 2, 60_000))
  assert.equal(webhookBackoffMs(20), 60_000)

  const webhooks = read('../lib/webhooks.js')
  assert.match(webhooks, /enqueueJob\('webhook\.deliver', \{/)
  assert.match(webhooks, /deliveryId: delivery\.id/)
  assert.doesNotMatch(webhooks, /secretEncrypted:.*webhook\.deliver/)
  assert.match(webhooks, /subscriptionId_eventId/)
  assert.match(WEBHOOK_CONTRACT.retry.payload, /Opaque IDs/)
})

test('worker records retrying/failed delivery states with an ID-only failure event', () => {
  const jobs = read('../../workers/src/jobs.js')
  const webhookSection = jobs.slice(jobs.indexOf('// -------------------------------------------------------- webhook.deliver'))
  assert.match(webhookSection, /status: final \? 'FAILED' : 'RETRYING'/)
  assert.match(webhookSection, /'WebhookDeliveryFailed'/)
  assert.match(webhookSection, /lastError: reasonCode/)
  assert.match(webhookSection, /responseStatus: Number\.isSafeInteger/)
  assert.match(webhookSection, /sanitizeWebhookPayload\(delivery\.payload\)/)
  assert.match(webhookSection, /signatureHeader\(canonical, secret\)/)
  assert.doesNotMatch(webhookSection, /response\.(text|json|body)\(\)/)
  assert.match(webhookSection, /'webhook\.deliver': deliverWebhook/)
})

test('outbox publisher fans out webhooks only after successful publication', () => {
  const apiQueues = read('../lib/queues.js')
  const workerIndex = read('../../workers/src/index.js')
  assert.match(apiQueues, /'webhook\.deliver'/)
  assert.match(workerIndex, /'webhook\.deliver'/)
  const publishIndex = workerIndex.indexOf("status: 'PUBLISHED'")
  const fanoutIndex = workerIndex.indexOf('fanoutWebhooks(prisma, event.payload)')
  assert.ok(publishIndex > -1 && fanoutIndex > publishIndex)
  assert.match(workerIndex, /Webhook fanout for outbox event .* failed/)
})

// ------------------------------------------------------------ HTTP surface

test('webhook router protects management routes and signs callback first', () => {
  const api = read('../index.js')
  assert.match(api, /app\.use\('\/api\/webhooks', webhooksRouter\)/)
  assert.equal((api.match(/app\.use\('\/api\/webhooks'/g) || []).length, 1)

  const routes = read('../routes/webhooks.routes.js')
  const authIndex = routes.indexOf('webhooksRouter.use(requireAuth)')
  const callbackIndex = routes.indexOf("webhooksRouter.post('/callbacks/:clientId/verify'")
  const docsIndex = routes.indexOf("webhooksRouter.get('/docs'")
  assert.ok(docsIndex >= 0 && authIndex > docsIndex)
  assert.ok(callbackIndex >= 0 && authIndex > callbackIndex)
  for (const permission of [
    'public.client.read', 'public.client.write',
    'webhook.subscription.read', 'webhook.subscription.write',
    'webhook.delivery.read', 'webhook.delivery.retry',
  ]) {
    assert.match(routes, new RegExp(`requirePermission\\('${permission}'\\)`))
  }
  assert.equal((routes.match(/webhooksRouter\.use\(requireAuth\)/g) || []).length, 1)
})

// ----------------------------------------------------- migration & fixtures

test('migration enables tenant/branch RLS for every new developer table', () => {
  const migration = read('../../../prisma/migrations/20261123000900_phase15_public_api/migration.sql')
  for (const table of ['PublicClient', 'WebhookSubscription', 'WebhookDelivery']) {
    assert.match(migration, new RegExp(`'${table}'`))
  }
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/)
  assert.match(migration, /tenant_branch_scope/)
  assert.match(migration, /app\.company_id/)
  assert.match(migration, /app\.branch_id/)
  assert.match(migration, /WebhookDelivery_subscriptionId_eventId_key/)
})

test('phase 15 seed fixtures are idempotent and inert', () => {
  const seed = read('../../../prisma/seed.js')
  for (const delegate of ['apiKey.upsert', 'publicClient.upsert', 'webhookSubscription.upsert', 'webhookDelivery.upsert']) {
    assert.match(seed, new RegExp(delegate.replace('.', '\\.')))
  }
  assert.match(seed, /status: 'DISABLED'/)
  assert.match(seed, /lastError: 'NETWORK_ERROR'/)
  assert.match(seed, /not-a-real-secret/)
  assert.match(seed, /example\.invalid/)
})

test('ERP developer tab refetches authenticated data from ID-only socket frames', () => {
  const html = read('../../erp/public/index.html')
  for (const id of ['tabDeveloper', 'developerView', 'developerClientRows', 'developerSubscriptionRows', 'developerDeliveryRows']) {
    assert.match(html, new RegExp(`id="${id}"`))
  }
  const app = read('../../erp/public/app.js')
  assert.match(app, /'developer:webhook'/)
  assert.match(app, /'developer:client'/)
  assert.match(app, /function onDeveloperEvent\(\)/)
  assert.match(app, /request\('\/webhooks\/clients'\)/)
  assert.match(app, /loadDeveloper\(\)/)
  assert.match(app, /data-retry-delivery/)
})
