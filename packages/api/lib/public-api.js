// Phase 15 public API v1.
//
// Only allow-listed GET endpoints are exposed. Authentication uses the hash of
// an opaque API key held by the existing ApiKey model; the raw key and its hash
// are never returned by a DTO. Every query runs through the tenant-scoped `db`
// proxy with the company/branch resolved from the registered PublicClient.
// Summaries delegate to the finance/sales helpers and expose integer cents only.

import { prisma } from './prisma.js'
import { db, getTenantContext, withTenant } from './tenant.js'
import { sha256 } from './auth.js'
import { getStatement } from './finance.js'
import { PUBLIC_SCOPES } from './validation.js'

export const PUBLIC_API_VERSION = '1.0.0'

export const PUBLIC_API_CONTRACT = Object.freeze({
  version: PUBLIC_API_VERSION,
  basePath: '/api/public/v1',
  readOnly: true,
  authentication: 'Bearer <opaque-api-key>; the server stores SHA-256(key) only',
  scopes: [...PUBLIC_SCOPES],
  endpoints: [
    { method: 'GET', path: '/health', scope: 'public:health:read', summary: 'Service health and contract version' },
    { method: 'GET', path: '/finance/summary', scope: 'public:finance:read', summary: 'Allow-listed income or ageing totals' },
    { method: 'GET', path: '/sales/summary', scope: 'public:sales:read', summary: 'Confirmed and fulfilled order totals and counts' },
    { method: 'GET', path: '/docs', scope: null, summary: 'Static developer contract (no tenant data)' },
  ],
  notes: [
    'No writes, IDs of private records, titles, line items or free text are exposed.',
    'All monetary values are safe integer cents; no statutory rate is calculated here.',
    'Rate limits are applied per API key, not only per source IP.',
  ],
})

function asArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : []
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function safeTotals(totals) {
  const output = {}
  if (!totals || typeof totals !== 'object' || Array.isArray(totals)) return output
  for (const [key, value] of Object.entries(totals)) {
    if (!key.endsWith('Cents') || !Number.isSafeInteger(value)) continue
    output[key] = value
  }
  return output
}

function unavailable(reportKey, reason, period) {
  return { reportKey, dataAvailable: false, reason, period }
}

function available(reportKey, rows, totals, period) {
  if (!Array.isArray(rows) || rows.length === 0 || !totals || typeof totals !== 'object') {
    return unavailable(reportKey, 'NO_DATA', period)
  }
  const totalsCents = safeTotals(totals)
  if (!Object.keys(totalsCents).length) return unavailable(reportKey, 'NO_DATA', period)
  const counts = { records: rows.length }
  if (Number.isSafeInteger(totals.invoiceCount)) counts.invoices = totals.invoiceCount
  return {
    reportKey,
    dataAvailable: true,
    period,
    counts,
    totalsCents,
    totalsAvailable: true,
  }
}

/** Resolve a bearer API key, then pin the request to that key's tenant/branch. */
export async function publicApiAuth(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!token) return res.status(401).json({ error: 'API key required' })

  try {
    // The company is not known until the opaque hash is resolved. This is the
    // only privileged lookup: it selects IDs/scope metadata, never business
    // data, and still fails closed to a generic 401 for unknown or revoked keys.
    const key = await prisma.apiKey.findFirst({
      where: { keyHash: sha256(token), revokedAt: null },
      select: {
        id: true, companyId: true, keyPrefix: true, scopes: true,
        rateLimit: true, expiresAt: true,
      },
    })
    if (!key || (key.expiresAt && key.expiresAt.getTime() <= Date.now())) {
      return res.status(401).json({ error: 'Invalid or expired API key' })
    }

    const client = await withTenant({ companyId: key.companyId }, () => db.publicClient.findFirst({
      where: { apiKeyId: key.id, status: 'ACTIVE' },
      select: { id: true, companyId: true, branchId: true, scopes: true, status: true },
    }))
    if (!client || client.companyId !== key.companyId) {
      return res.status(401).json({ error: 'Invalid or expired API key' })
    }

    const keyScopes = asArray(key.scopes)
    const clientScopes = asArray(client.scopes)
    const scopes = PUBLIC_SCOPES.filter((scope) => keyScopes.includes(scope) && clientScopes.includes(scope))
    if (!scopes.length) return res.status(403).json({ error: 'No public API scopes granted' })

    req.publicApiKey = {
      id: key.id,
      keyPrefix: key.keyPrefix,
      scopes,
      rateLimit: Math.max(1, Number(key.rateLimit) || 60),
    }
    req.publicClient = {
      id: client.id,
      companyId: client.companyId,
      branchId: client.branchId || null,
    }
    req.auth = {
      userId: null,
      actorId: client.id,
      companyId: client.companyId,
      branchId: client.branchId || null,
      roles: [],
      correlationId: req.correlationId || null,
    }

    return await withTenant({
      companyId: client.companyId,
      branchId: client.branchId || '',
      actorId: client.id,
      correlationId: req.correlationId,
    }, async () => {
      await db.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
      return next()
    })
  } catch (error) {
    return next(error)
  }
}

/** Require one of the explicit public scopes. */
export function requirePublicScope(...scopes) {
  return (req, res, next) => {
    const granted = req.publicApiKey?.scopes || []
    if (scopes.some((scope) => granted.includes(scope))) return next()
    return res.status(403).json({ error: 'Insufficient scope', required: scopes })
  }
}

const rateBuckets = new Map()

/** Per-key sliding-window limiter. The key ID, not the IP, is the identity. */
export function publicRateLimit(req, res, next) {
  const key = req.publicApiKey
  if (!key) return res.status(401).json({ error: 'API key required' })
  const now = Date.now()
  const windowMs = 60_000
  const recent = (rateBuckets.get(key.id) || []).filter((time) => now - time < windowMs)
  if (recent.length >= key.rateLimit) {
    res.setHeader('Retry-After', Math.ceil(windowMs / 1000))
    res.setHeader('X-RateLimit-Limit', String(key.rateLimit))
    res.setHeader('X-RateLimit-Remaining', '0')
    return res.status(429).json({ error: 'API key rate limit exceeded' })
  }
  recent.push(now)
  rateBuckets.set(key.id, recent)
  res.setHeader('X-RateLimit-Limit', String(key.rateLimit))
  res.setHeader('X-RateLimit-Remaining', String(Math.max(0, key.rateLimit - recent.length)))
  return next()
}

export function getPublicHealth(scopes = PUBLIC_SCOPES) {
  return {
    status: 'ok',
    service: 'comet-public-api',
    version: PUBLIC_API_VERSION,
    time: new Date().toISOString(),
    scopes: [...scopes],
  }
}

export function getPublicDocs() {
  return PUBLIC_API_CONTRACT
}

/** Finance summary: allow-listed statements only, with rows never returned. */
export async function getPublicFinanceSummary(query) {
  const kind = query.kind
  const period = kind === 'income'
    ? { from: query.from || null, to: query.to || null }
    : { asOf: query.asOf || query.to || today() }
  try {
    const filters = kind === 'income'
      ? { from: query.from, to: query.to }
      : { asOf: period.asOf }
    const report = (await getStatement(kind, filters))?.report
    return available(`public:finance:${kind}`, report?.rows, report?.totals, period)
  } catch {
    return unavailable(`public:finance:${kind}`, 'NO_DATA', period)
  }
}

/** Sales summary: confirmed/fulfilled counts and integer-cent totals only. */
export async function getPublicSalesSummary(query, client = null) {
  const ctx = getTenantContext() || {}
  const companyId = ctx.companyId
  if (!companyId) throw new Error('Public sales summary requires tenant context')
  const branchId = client?.branchId || null
  const period = { from: query.from || null, to: query.to || null }

  const orders = await db.salesOrder.findMany({
    where: {
      companyId,
      status: { in: ['CONFIRMED', 'FULFILLED'] },
      ...(branchId ? { branchId: { in: [null, branchId] } } : {}),
      ...(query.from || query.to
        ? { orderDate: { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) } }
        : {}),
    },
    select: { id: true, status: true, subtotalCents: true, taxCents: true, totalCents: true },
  })

  if (!orders.length) return unavailable('public:sales:orders', 'NO_DATA', period)
  const totalsCents = { subtotalCents: 0, taxCents: 0, totalCents: 0 }
  for (const order of orders) {
    for (const field of Object.keys(totalsCents)) {
      const value = order[field]
      const next = totalsCents[field] + value
      if (!Number.isSafeInteger(value) || !Number.isSafeInteger(next)) {
        return unavailable('public:sales:orders', 'NO_DATA', period)
      }
      totalsCents[field] = next
    }
  }
  return {
    reportKey: 'public:sales:orders',
    dataAvailable: true,
    period,
    counts: { records: orders.length },
    totalsCents,
    totalsAvailable: true,
  }
}
