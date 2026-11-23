// Phase 15 webhook lifecycle, signing helpers and replay-safe provider
// callbacks.
//
// Secrets are accepted only in a write request, then stored as an AES-GCM
// envelope plus a SHA-256 lookup hash. No DTO ever contains the plaintext, the
// envelope or the hash. Delivery payloads and developer events are constrained
// to opaque IDs and classification; no business content enters the queue.

import crypto from 'node:crypto'
import { prisma } from './prisma.js'
import { db, getTenantContext, withTenant } from './tenant.js'
import { sha256 } from './auth.js'
import { encryptString } from './crypto.js'
import { config } from './config.js'
import { emitEvent } from './events.js'
import { enqueueJob } from './queues.js'
import { recordAudit } from './audit.js'
import { HttpError } from './util.js'
import {
  webhookCallbackSchema,
  webhookDeliveryPayloadSchema,
  WEBHOOK_EVENT_TYPES,
  WEBHOOK_DELIVERY_STATUSES,
  WEBHOOK_REASON_CODES,
  PUBLIC_SCOPES,
} from './validation.js'

export const WEBHOOK_SIGNATURE_HEADER = 'x-comet-signature'
export const WEBHOOK_DELIVERY_HEADER = 'x-comet-delivery-id'
export const WEBHOOK_EVENT_HEADER = 'x-comet-event-id'
export const WEBHOOK_TIMESTAMP_HEADER = 'x-comet-timestamp'

export const WEBHOOK_CONTRACT = Object.freeze({
  basePath: '/api/webhooks',
  signing: {
    algorithm: 'HMAC-SHA256',
    canonical: 'stable JSON with object keys sorted at every level',
    header: WEBHOOK_SIGNATURE_HEADER,
    format: 'sha256=<64 lowercase hex characters>',
    secretPolicy: 'Per-subscription secret; encrypted at rest and never returned by a DTO',
  },
  callback: {
    path: '/callbacks/:clientId/verify',
    hmacKey: 'SHA-256 hex digest of the linked API key, known to the provider',
    body: 'Strict ID-only envelope: eventId, eventType, entityType, entityId, occurredAt, timestamp',
    freshnessSeconds: config.webhook.callbackTtlSeconds,
    replayProtection: 'Append-only audit ledger plus an in-memory freshness cache',
  },
  retry: {
    queue: 'webhook.deliver',
    maxAttempts: config.webhook.maxAttempts,
    backoffMs: config.webhook.retryBackoffMs,
    payload: 'Opaque IDs and classification only',
  },
  eventTypes: [...WEBHOOK_EVENT_TYPES],
  endpoints: [
    { method: 'GET', path: '/docs', permission: null },
    { method: 'POST', path: '/callbacks/:clientId/verify', permission: null },
    { method: 'GET', path: '/clients', permission: 'public.client.read' },
    { method: 'POST', path: '/clients', permission: 'public.client.write' },
    { method: 'POST', path: '/clients/:id/revoke', permission: 'public.client.write' },
    { method: 'GET', path: '/subscriptions', permission: 'webhook.subscription.read' },
    { method: 'POST', path: '/subscriptions', permission: 'webhook.subscription.write' },
    { method: 'POST', path: '/subscriptions/:id/rotate', permission: 'webhook.subscription.write' },
    { method: 'GET', path: '/deliveries', permission: 'webhook.delivery.read' },
    { method: 'POST', path: '/deliveries/:id/retry', permission: 'webhook.delivery.retry' },
  ],
})

const EVENT_ENTITY = Object.freeze({
  InvoiceIssued: ['INVOICE', 'invoiceId'],
  PaymentRecorded: ['PAYMENT', 'paymentId'],
  SalesOrderConfirmed: ['SALES_ORDER', 'orderId'],
  DeliveryNoteIssued: ['DELIVERY_NOTE', 'deliveryNoteId'],
  ReportRunCompleted: ['REPORT_RUN', 'runId'],
  DashboardUpdated: ['DASHBOARD', 'dashboardId'],
  BatchReleased: ['BATCH_RECORD', 'batchId'],
})

// Developer lifecycle events are never fanned out to webhooks: that would let
// a subscription create a delivery which emits another developer event.
const DEVELOPER_EVENT_TYPES = new Set([
  'WebhookSubscriptionCreated', 'WebhookDeliveryFailed', 'PublicClientRevoked',
])

const replayCache = new Map()

function companyId() {
  const id = getTenantContext()?.companyId
  if (!id) throw new HttpError(500, 'Tenant context is required')
  return id
}

function asArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : []
}

function maskPrefix(prefix) {
  const value = String(prefix || '')
  if (value.length <= 6) return '••••••'
  return `${value.slice(0, 4)}••${value.slice(-2)}`
}

async function assertBranch(branchId, tenantId) {
  if (!branchId) return
  const branch = await db.branch.findFirst({
    where: { id: branchId, companyId: tenantId },
    select: { id: true },
  })
  if (!branch) throw new HttpError(400, 'Invalid branchId')
}

async function findClient(id, tenantId) {
  const client = await db.publicClient.findFirst({
    where: { id, companyId: tenantId },
    select: {
      id: true, companyId: true, branchId: true, apiKeyId: true, name: true, status: true,
      apiKey: { select: { keyPrefix: true } },
    },
  })
  if (!client) throw new HttpError(404, 'Public client not found')
  return client
}

async function audit(actor, action, resourceType, resourceId, metadata) {
  await recordAudit({
    companyId: metadata.companyId || companyId(),
    actorId: actor?.userId || getTenantContext()?.actorId || null,
    action,
    resourceType,
    resourceId: String(resourceId),
    metadata,
    correlationId: actor?.correlationId || getTenantContext()?.correlationId || null,
  })
}

// ------------------------------------------------------------------- DTOs

export function toClientDto(row) {
  return {
    id: row.id,
    name: row.name,
    apiKeyId: row.apiKeyId,
    keyPrefix: maskPrefix(row.apiKey?.keyPrefix || row.keyPrefix),
    scopes: asArray(row.scopes).filter((scope) => PUBLIC_SCOPES.includes(scope)),
    status: row.status,
    branchId: row.branchId || null,
    revokedAt: row.revokedAt || null,
    createdAt: row.createdAt,
  }
}

export function toSubscriptionDto(row) {
  return {
    id: row.id,
    url: row.url,
    eventTypes: asArray(row.eventTypes).filter((type) => WEBHOOK_EVENT_TYPES.includes(type)),
    status: row.status,
    clientId: row.clientId || null,
    branchId: row.branchId || null,
    secretConfigured: Boolean(row.secretEncrypted && row.secretHash),
    rotatedAt: row.rotatedAt || null,
    createdAt: row.createdAt,
  }
}

export function toDeliveryDto(row) {
  return {
    id: row.id,
    subscriptionId: row.subscriptionId,
    eventId: row.eventId,
    eventType: row.eventType,
    payload: sanitizeWebhookPayload(row.payload),
    status: WEBHOOK_DELIVERY_STATUSES.includes(row.status) ? row.status : 'FAILED',
    attempts: Number.isSafeInteger(row.attempts) && row.attempts >= 0 ? row.attempts : 0,
    nextAttemptAt: row.nextAttemptAt || null,
    responseStatus: Number.isSafeInteger(row.responseStatus) ? row.responseStatus : null,
    lastError: WEBHOOK_REASON_CODES.includes(row.lastError) ? row.lastError : null,
    deliveredAt: row.deliveredAt || null,
    createdAt: row.createdAt,
  }
}

// --------------------------------------------------------- canonical signing

/** Stable JSON for HMAC: object keys are sorted at every level. */
export function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort()
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

export function signCanonical(canonical, secret) {
  return crypto.createHmac('sha256', secret).update(canonical).digest('hex')
}

export function signatureHeader(canonical, secret) {
  return `sha256=${signCanonical(canonical, secret)}`
}

export function timingSafeHex(expected, provided) {
  if (typeof provided !== 'string' || !/^[a-f0-9]{64}$/i.test(provided)) return false
  const a = Buffer.from(expected, 'hex')
  const b = Buffer.from(provided, 'hex')
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

/** Rebuild only the allow-listed ID-only payload from an outbox envelope. */
export function buildWebhookPayload(event) {
  const mapping = EVENT_ENTITY[event?.type]
  const data = event?.data || {}
  if (!mapping || !event?.id || !event?.occurredAt) return null
  const [entityType, idField] = mapping
  const entityId = data[idField] || data.entityId
  if (typeof entityId !== 'string' || !entityId) return null
  const candidate = {
    eventId: event.id,
    eventType: event.type,
    entityType,
    entityId,
    occurredAt: event.occurredAt,
    correlationId: typeof event.correlationId === 'string' ? event.correlationId : null,
    classification: data.classification || 'INTERNAL',
  }
  const parsed = webhookDeliveryPayloadSchema.safeParse(candidate)
  return parsed.success ? parsed.data : null
}

export function sanitizeWebhookPayload(value) {
  const parsed = webhookDeliveryPayloadSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

// ------------------------------------------------------------ client lifecycle

export async function registerClient(input, actor) {
  const tenantId = companyId()
  const createdByUserId = actor?.userId || null
  await assertBranch(input.branchId, tenantId)

  let apiKey
  if (input.apiKeyId) {
    apiKey = await db.apiKey.findFirst({
      where: { id: input.apiKeyId, companyId: tenantId, revokedAt: null },
      select: { id: true, keyPrefix: true },
    })
    if (!apiKey) throw new HttpError(404, 'API key not found')
    const linked = await db.publicClient.findFirst({
      where: { companyId: tenantId, apiKeyId: apiKey.id },
      select: { id: true },
    })
    if (linked) throw new HttpError(409, 'API key is already linked to a public client')
  } else {
    const existing = await db.apiKey.findFirst({
      where: { companyId: tenantId, keyHash: input.keyHash },
      select: { id: true },
    })
    if (existing) throw new HttpError(409, 'API key hash is already registered')
    apiKey = await db.apiKey.create({
      data: {
        companyId: tenantId,
        userId: createdByUserId,
        name: input.name,
        keyPrefix: input.keyPrefix,
        keyHash: input.keyHash,
        scopes: input.scopes,
        rateLimit: 60,
      },
    })
  }

  const client = await db.publicClient.create({
    data: {
      companyId: tenantId,
      branchId: input.branchId || null,
      apiKeyId: apiKey.id,
      name: input.name,
      scopes: input.scopes,
      createdByUserId,
    },
  })
  await audit(actor, 'public.client.registered', 'PublicClient', client.id, {
    clientId: client.id, apiKeyId: apiKey.id, classification: 'INTERNAL',
  })
  return toClientDto({ ...client, apiKey: { keyPrefix: apiKey.keyPrefix } })
}

export async function listClients(query) {
  const rows = await db.publicClient.findMany({
    where: { companyId: companyId(), ...(query.status ? { status: query.status } : {}) },
    select: {
      id: true, name: true, apiKeyId: true, scopes: true, status: true, branchId: true,
      revokedAt: true, createdAt: true, apiKey: { select: { keyPrefix: true } },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: query.limit,
  })
  return rows.map(toClientDto)
}

export async function getClient(id) {
  return toClientDto(await findClient(id, companyId()))
}

export async function revokeClient(id, actor) {
  const tenantId = companyId()
  const client = await findClient(id, tenantId)
  if (client.status === 'REVOKED') return toClientDto(client)

  const now = new Date()
  const updated = await db.publicClient.update({
    where: { id: client.id },
    data: { status: 'REVOKED', revokedAt: now },
  })
  await db.apiKey.updateMany({
    where: { id: client.apiKeyId, companyId: tenantId },
    data: { revokedAt: now },
  })
  await audit(actor, 'public.client.revoked', 'PublicClient', client.id, {
    clientId: client.id, apiKeyId: client.apiKeyId, classification: 'INTERNAL',
  })
  await emitEvent('PublicClientRevoked', {
    entityType: 'PUBLIC_CLIENT',
    entityId: client.id,
    clientId: client.id,
    apiKeyId: client.apiKeyId,
    classification: 'INTERNAL',
  }, { aggregateType: 'PublicClient', aggregateId: client.id })
  return toClientDto(updated)
}

// -------------------------------------------------------- subscription lifecycle

export async function createSubscription(input, actor) {
  const tenantId = companyId()
  await assertBranch(input.branchId, tenantId)
  if (input.clientId) await findClient(input.clientId, tenantId)

  const secretHash = sha256(input.secret)
  let row
  try {
    row = await db.webhookSubscription.create({
      data: {
        companyId: tenantId,
        branchId: input.branchId || null,
        clientId: input.clientId || null,
        url: input.url,
        eventTypes: input.eventTypes,
        secretEncrypted: encryptString(input.secret),
        secretHash,
        status: 'ACTIVE',
        createdByUserId: actor?.userId || null,
      },
    })
  } catch (error) {
    if (error?.code === 'P2002') throw new HttpError(409, 'Webhook secret is already in use')
    throw error
  }

  await audit(actor, 'webhook.subscription.created', 'WebhookSubscription', row.id, {
    subscriptionId: row.id, clientId: row.clientId, classification: 'INTERNAL',
  })
  await emitEvent('WebhookSubscriptionCreated', {
    entityType: 'WEBHOOK_SUBSCRIPTION',
    entityId: row.id,
    subscriptionId: row.id,
    clientId: row.clientId,
    classification: 'INTERNAL',
  }, { aggregateType: 'WebhookSubscription', aggregateId: row.id })
  return toSubscriptionDto(row)
}

export async function listSubscriptions(query) {
  const rows = await db.webhookSubscription.findMany({
    where: { companyId: companyId(), ...(query.status ? { status: query.status } : {}), ...(query.clientId ? { clientId: query.clientId } : {}) },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: query.limit,
  })
  return rows.map(toSubscriptionDto)
}

export async function getSubscription(id) {
  const row = await db.webhookSubscription.findFirst({
    where: { id, companyId: companyId() },
  })
  if (!row) throw new HttpError(404, 'Webhook subscription not found')
  return toSubscriptionDto(row)
}

async function findSubscription(id, tenantId) {
  const row = await db.webhookSubscription.findFirst({ where: { id, companyId: tenantId } })
  if (!row) throw new HttpError(404, 'Webhook subscription not found')
  return row
}

export async function updateSubscriptionStatus(id, status, actor) {
  const tenantId = companyId()
  const existing = await findSubscription(id, tenantId)
  if (existing.status === status) return toSubscriptionDto(existing)
  const row = await db.webhookSubscription.update({ where: { id: existing.id }, data: { status } })
  await audit(actor, 'webhook.subscription.updated', 'WebhookSubscription', row.id, {
    subscriptionId: row.id, clientId: row.clientId, classification: 'INTERNAL',
  })
  return toSubscriptionDto(row)
}

export async function rotateSubscriptionSecret(id, secret, actor) {
  const tenantId = companyId()
  const existing = await findSubscription(id, tenantId)
  const secretHash = sha256(secret)
  if (secretHash === existing.secretHash) throw new HttpError(409, 'New secret must differ from the current secret')
  let row
  try {
    row = await db.webhookSubscription.update({
      where: { id: existing.id },
      data: { secretEncrypted: encryptString(secret), secretHash, rotatedAt: new Date() },
    })
  } catch (error) {
    if (error?.code === 'P2002') throw new HttpError(409, 'Webhook secret is already in use')
    throw error
  }
  await audit(actor, 'webhook.subscription.rotated', 'WebhookSubscription', row.id, {
    subscriptionId: row.id, clientId: row.clientId, classification: 'INTERNAL',
  })
  return toSubscriptionDto(row)
}

// ------------------------------------------------------------ delivery ledger

export async function enqueueWebhookDelivery(delivery, options = {}) {
  const ctx = getTenantContext() || {}
  const jobId = options.jobId || `webhook-deliver-${delivery.id}`
  return enqueueJob('webhook.deliver', {
    deliveryId: delivery.id,
    companyId: delivery.companyId,
    branchId: delivery.branchId || null,
    correlationId: options.correlationId || ctx.correlationId || null,
  }, {
    jobId,
    attempts: config.webhook.maxAttempts,
    backoffMs: config.webhook.retryBackoffMs,
    type: 'webhook.deliver',
  })
}

export async function listDeliveries(query) {
  const rows = await db.webhookDelivery.findMany({
    where: {
      companyId: companyId(),
      ...(query.subscriptionId ? { subscriptionId: query.subscriptionId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.eventType ? { eventType: query.eventType } : {}),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: query.limit,
  })
  return rows.map(toDeliveryDto)
}

export async function getDelivery(id) {
  const row = await db.webhookDelivery.findFirst({ where: { id, companyId: companyId() } })
  if (!row) throw new HttpError(404, 'Webhook delivery not found')
  return toDeliveryDto(row)
}

export async function retryDelivery(id, actor) {
  const tenantId = companyId()
  const delivery = await db.webhookDelivery.findFirst({ where: { id, companyId: tenantId } })
  if (!delivery) throw new HttpError(404, 'Webhook delivery not found')
  if (delivery.status === 'DELIVERED') throw new HttpError(409, 'Delivered webhooks cannot be retried')
  const subscription = await db.webhookSubscription.findFirst({
    where: { id: delivery.subscriptionId, companyId: tenantId, status: 'ACTIVE' },
    select: { id: true },
  })
  if (!subscription) throw new HttpError(409, 'Webhook subscription is not active')

  const row = await db.webhookDelivery.update({
    where: { id: delivery.id },
    data: {
      status: 'PENDING',
      attempts: 0,
      nextAttemptAt: new Date(),
      responseStatus: null,
      lastError: null,
      deliveredAt: null,
    },
  })
  await enqueueWebhookDelivery(row, {
    jobId: `webhook-deliver-${row.id}-retry-${Date.now()}`,
    correlationId: actor?.correlationId || null,
  })
  await audit(actor, 'webhook.delivery.retried', 'WebhookDelivery', row.id, {
    deliveryId: row.id, subscriptionId: row.subscriptionId, eventId: row.eventId,
    classification: 'INTERNAL',
  })
  return toDeliveryDto(row)
}

/** Fan-out committed outbox events to matching active subscriptions. */
export async function createWebhookDeliveries(client, event) {
  if (!event?.companyId || DEVELOPER_EVENT_TYPES.has(event.type)) return []
  const payload = buildWebhookPayload(event)
  if (!payload) return []

  const subscriptions = await client.webhookSubscription.findMany({
    where: { companyId: event.companyId, status: 'ACTIVE' },
    select: { id: true, companyId: true, branchId: true, eventTypes: true },
  })
  const created = []
  for (const subscription of subscriptions) {
    if (!asArray(subscription.eventTypes).includes(event.type)) continue
    const existing = await client.webhookDelivery.findUnique({
      where: { subscriptionId_eventId: { subscriptionId: subscription.id, eventId: event.id } },
      select: { id: true },
    })
    if (existing) continue
    const delivery = await client.webhookDelivery.create({
      data: {
        companyId: event.companyId,
        branchId: subscription.branchId || event.branchId || null,
        subscriptionId: subscription.id,
        eventId: event.id,
        eventType: event.type,
        payload,
        status: 'PENDING',
        attempts: 0,
        nextAttemptAt: new Date(),
      },
    })
    await withTenant({
      companyId: event.companyId,
      branchId: delivery.branchId || '',
      actorId: event.actorId || null,
      correlationId: event.correlationId,
    }, () => enqueueWebhookDelivery(delivery, { correlationId: event.correlationId }))
    created.push({ deliveryId: delivery.id })
  }
  return created
}

// -------------------------------------------------------- provider callbacks

function pruneReplayCache(now) {
  for (const [key, expiresAt] of replayCache) {
    if (expiresAt <= now) replayCache.delete(key)
  }
}

/** Stable replay identity; exported so the contract can be tested in isolation. */
export function callbackReplayKey(companyId, clientId, eventId, timestamp) {
  return sha256(`${companyId}|${clientId}|${eventId}|${timestamp}`)
}

/** Audit-ledger replay check with no DB dependency in the comparison itself. */
export function replayAcceptedFromAudit(entries, replayKey) {
  return (Array.isArray(entries) ? entries : []).some((entry) => (
    entry?.metadata && typeof entry.metadata === 'object' && entry.metadata.replayKey === replayKey
  ))
}

async function alreadyAccepted(tenantId, replayKey, since) {
  if (replayCache.has(replayKey)) return true
  const entries = await db.auditLog.findMany({
    where: {
      companyId: tenantId,
      action: 'webhook.callback.accepted',
      resourceType: 'WebhookCallback',
      createdAt: { gte: since },
    },
    select: { metadata: true },
    take: 200,
    orderBy: { createdAt: 'desc' },
  })
  return replayAcceptedFromAudit(entries, replayKey)
}

/**
 * Verify a provider callback. The HMAC key is the linked API key's SHA-256
 * hash, so a provider only needs the same opaque secret it uses for the public
 * API; the hash never leaves the server. Signature is checked before replay so
 * unsigned requests cannot probe the replay ledger.
 */
export async function verifyProviderCallback(clientId, body, signature, options = {}) {
  const client = await prisma.publicClient.findUnique({
    where: { id: clientId },
    select: { id: true, companyId: true, status: true, apiKeyId: true },
  })
  if (!client || client.status !== 'ACTIVE') throw new HttpError(401, 'Invalid callback signature')

  return withTenant({ companyId: client.companyId, actorId: client.id }, async () => {
    const parsed = webhookCallbackSchema.safeParse(body)
    if (!parsed.success) throw new HttpError(400, 'Invalid callback body')
    const callback = parsed.data

    const key = await db.apiKey.findFirst({
      where: { id: client.apiKeyId, companyId: client.companyId, revokedAt: null },
      select: { keyHash: true, expiresAt: true },
    })
    if (!key || (key.expiresAt && key.expiresAt.getTime() <= Date.now())) {
      throw new HttpError(401, 'Invalid callback signature')
    }

    const expected = signCanonical(canonicalize(callback), key.keyHash)
    const provided = String(signature || '').replace(/^sha256=/i, '')
    if (!timingSafeHex(expected, provided)) throw new HttpError(401, 'Invalid callback signature')

    const now = options.now || Date.now()
    const timestamp = Date.parse(callback.timestamp)
    const occurredAt = Date.parse(callback.occurredAt)
    const ttlMs = config.webhook.callbackTtlSeconds * 1000
    if (!Number.isFinite(timestamp) || !Number.isFinite(occurredAt)
      || Math.abs(now - timestamp) > ttlMs || Math.abs(now - occurredAt) > ttlMs * 2) {
      throw new HttpError(400, 'Stale callback timestamp')
    }

    pruneReplayCache(now)
    const replayKey = callbackReplayKey(client.companyId, client.id, callback.eventId, callback.timestamp)
    if (await alreadyAccepted(client.companyId, replayKey, new Date(now - ttlMs))) {
      throw new HttpError(409, 'Replay detected')
    }

    await audit(null, 'webhook.callback.accepted', 'WebhookCallback', callback.eventId, {
      replayKey,
      clientId: client.id,
      eventId: callback.eventId,
      classification: 'INTERNAL',
    })
    replayCache.set(replayKey, now + ttlMs)
    return {
      accepted: true,
      eventId: callback.eventId,
      verificationId: replayKey.slice(0, 16),
    }
  })
}

export const WEBHOOK_DEVELOPER_EVENT_TYPES = [...DEVELOPER_EVENT_TYPES]
