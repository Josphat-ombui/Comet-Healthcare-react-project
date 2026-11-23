// Phase 15 public API v1 unit/contract tests. Pure helpers, schemas, middleware,
// permissions and wiring only - no database or network calls. Cross-tenant RLS
// isolation is verified separately by the deployment probe.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  PUBLIC_API_CONTRACT,
  PUBLIC_API_VERSION,
  getPublicDocs,
  getPublicHealth,
  publicRateLimit,
  requirePublicScope,
} from '../lib/public-api.js'
import {
  PUBLIC_SCOPES,
  PUBLIC_FINANCE_SUMMARIES,
  publicApiFinanceQuerySchema,
  publicApiSalesQuerySchema,
  publicClientCreateSchema,
} from '../lib/validation.js'
import { PERMISSIONS, ROLE_PERMISSIONS } from '../../shared/src/permissions.js'

function read(relative) {
  return readFileSync(new URL(relative, import.meta.url), 'utf8')
}

function fakeResponse() {
  const headers = {}
  const response = {
    statusCode: null,
    body: null,
    headers,
    status(code) {
      this.statusCode = code
      return this
    },
    json(payload) {
      this.body = payload
      return this
    },
    setHeader(name, value) {
      headers[name] = value
    },
  }
  return response
}

// ---------------------------------------------------------------- contract

test('public contract is a read-only v1 surface with three explicit scopes', () => {
  assert.equal(PUBLIC_API_VERSION, '1.0.0')
  assert.equal(PUBLIC_API_CONTRACT.version, '1.0.0')
  assert.equal(PUBLIC_API_CONTRACT.basePath, '/api/public/v1')
  assert.equal(PUBLIC_API_CONTRACT.readOnly, true)
  assert.deepEqual([...PUBLIC_SCOPES], [
    'public:health:read',
    'public:finance:read',
    'public:sales:read',
  ])
  assert.deepEqual(PUBLIC_API_CONTRACT.scopes, [...PUBLIC_SCOPES])
  assert.deepEqual(PUBLIC_API_CONTRACT.endpoints.map((endpoint) => `${endpoint.method} ${endpoint.path}`), [
    'GET /health',
    'GET /finance/summary',
    'GET /sales/summary',
    'GET /docs',
  ])
  for (const endpoint of PUBLIC_API_CONTRACT.endpoints) {
    assert.equal(endpoint.method, 'GET')
  }
  assert.equal(getPublicDocs(), PUBLIC_API_CONTRACT)
})

test('public health exposes only contract metadata and granted scopes', () => {
  const health = getPublicHealth(['public:health:read'])
  assert.equal(health.status, 'ok')
  assert.equal(health.version, '1.0.0')
  assert.deepEqual(health.scopes, ['public:health:read'])
  const serialized = JSON.stringify(health)
  for (const forbidden of ['keyHash', 'apiKeyId', 'secret', 'companyId', '4111111111111111']) {
    assert.equal(serialized.includes(forbidden), false)
  }
})

// ------------------------------------------------------------------ schemas

test('public query schemas are strict, typed and reject reversed periods', () => {
  assert.deepEqual(publicApiFinanceQuerySchema.parse({}), { kind: 'income' })
  assert.deepEqual([...PUBLIC_FINANCE_SUMMARIES], ['income', 'ageing'])
  assert.equal(publicApiFinanceQuerySchema.safeParse({ kind: 'balance' }).success, false)
  assert.equal(publicApiFinanceQuerySchema.safeParse({ kind: 'income', companyId: 'cmp_other' }).success, false)
  assert.equal(publicApiFinanceQuerySchema.safeParse({ kind: 'income', from: '2026-02-01', to: '2026-01-01' }).success, false)
  assert.equal(publicApiSalesQuerySchema.safeParse({ from: '2026-01-01', to: '2026-01-31' }).success, true)
  assert.equal(publicApiSalesQuerySchema.safeParse({ from: '2026-01-01', where: 'totalCents > 0' }).success, false)
})

test('client registration accepts a key hash or link, never a raw key', () => {
  const hash = 'a'.repeat(64)
  const supplied = publicClientCreateSchema.parse({
    name: 'Partner integration',
    keyHash: hash,
    keyPrefix: 'cmt_partner_',
    scopes: ['public:health:read'],
  })
  assert.equal(supplied.keyHash, hash)
  assert.equal(Object.hasOwn(supplied, 'key'), false)

  const linked = publicClientCreateSchema.parse({
    name: 'Partner integration',
    apiKeyId: 'key_1',
    scopes: ['public:finance:read'],
  })
  assert.equal(linked.apiKeyId, 'key_1')

  assert.equal(publicClientCreateSchema.safeParse({
    name: 'Partner integration',
    scopes: ['public:health:read'],
  }).success, false)
  assert.equal(publicClientCreateSchema.safeParse({
    name: 'Partner integration',
    key: 'raw-secret-token',
    keyPrefix: 'cmt_partner_',
    scopes: ['public:health:read'],
  }).success, false)
  assert.equal(publicClientCreateSchema.safeParse({
    name: 'Partner integration',
    apiKeyId: 'key_1',
    scopes: ['health:read'],
  }).success, false)
})

// --------------------------------------------------------------- middleware

test('scope middleware requires an explicitly granted scope', () => {
  const req = { publicApiKey: { scopes: ['public:health:read'] } }
  let nextCalls = 0
  const allowed = fakeResponse()
  requirePublicScope('public:health:read')(req, allowed, () => { nextCalls += 1 })
  assert.equal(nextCalls, 1)
  assert.equal(allowed.statusCode, null)

  const denied = fakeResponse()
  requirePublicScope('public:finance:read')(req, denied, () => { nextCalls += 1 })
  assert.equal(nextCalls, 1)
  assert.equal(denied.statusCode, 403)
  assert.deepEqual(denied.body.required, ['public:finance:read'])

  const unauthenticated = fakeResponse()
  requirePublicScope('public:health:read')({}, unauthenticated, () => { nextCalls += 1 })
  assert.equal(unauthenticated.statusCode, 403)
})

test('rate limiter is per key, not per source IP, and returns retry headers', () => {
  const keyId = `key_rate_${Date.now()}_${Math.random().toString(36).slice(2)}`
  const req = { publicApiKey: { id: keyId, rateLimit: 2 } }
  let nextCalls = 0
  const next = () => { nextCalls += 1 }

  assert.equal(publicRateLimit(req, fakeResponse(), next), undefined)
  assert.equal(publicRateLimit(req, fakeResponse(), next), undefined)
  assert.equal(nextCalls, 2)

  const limited = fakeResponse()
  publicRateLimit(req, limited, next)
  assert.equal(nextCalls, 2)
  assert.equal(limited.statusCode, 429)
  assert.equal(limited.headers['X-RateLimit-Limit'], '2')
  assert.equal(limited.headers['X-RateLimit-Remaining'], '0')
  assert.ok(Number(limited.headers['Retry-After']) > 0)

  const otherKey = fakeResponse()
  publicRateLimit({ publicApiKey: { id: `${keyId}_other`, rateLimit: 2 } }, otherKey, next)
  assert.equal(otherKey.statusCode, null)
  assert.equal(nextCalls, 3)

  const unauthenticated = fakeResponse()
  publicRateLimit({}, unauthenticated, next)
  assert.equal(unauthenticated.statusCode, 401)
  assert.equal(nextCalls, 3)
})

// -------------------------------------------------------------- permissions

test('six developer permissions separate client, subscription and delivery duties', () => {
  const keys = Object.keys(PERMISSIONS).filter((key) => (
    key.startsWith('public.client.') || key.startsWith('webhook.')
  ))
  assert.equal(keys.length, 6)
  assert.deepEqual(keys.sort(), [
    'public.client.read', 'public.client.write',
    'webhook.delivery.read', 'webhook.delivery.retry',
    'webhook.subscription.read', 'webhook.subscription.write',
  ])
  for (const key of keys) {
    assert.equal(ROLE_PERMISSIONS.ADMIN.includes(key), true)
  }
  for (const key of ['public.client.write', 'webhook.subscription.write', 'webhook.delivery.retry']) {
    assert.equal(ROLE_PERMISSIONS.MANAGER.includes(key), true)
    assert.equal(ROLE_PERMISSIONS.STAFF.includes(key), false)
    assert.equal(ROLE_PERMISSIONS.COMPLIANCE.includes(key), false)
  }
  for (const key of ['public.client.read', 'webhook.subscription.read', 'webhook.delivery.read']) {
    assert.equal(ROLE_PERMISSIONS.STAFF.includes(key), true)
    assert.equal(ROLE_PERMISSIONS.COMPLIANCE.includes(key), true)
  }
})

// ------------------------------------------------------------ source contract

test('public service uses scoped reads and integer cents without a SQL surface', () => {
  const source = read('../lib/public-api.js')
  assert.doesNotMatch(source, /\$queryRaw|\$executeRaw/)
  assert.doesNotMatch(source, /taxRate\s*[:=]/)
  assert.match(source, /getStatement/)
  assert.match(source, /Number\.isSafeInteger/)
  assert.match(source, /endsWith\('Cents'\)/)
  assert.match(source, /sha256\(token\)/)
  assert.match(source, /status: \{ in: \['CONFIRMED', 'FULFILLED'\] \}/)
})

test('public router mounts docs before auth and exposes no write verbs', () => {
  const api = read('../index.js')
  assert.match(api, /app\.use\('\/api\/public\/v1', publicV1Router\)/)
  assert.equal((api.match(/app\.use\('\/api\/public\/v1'/g) || []).length, 1)

  const routes = read('../routes/public-v1.routes.js')
  const docsIndex = routes.indexOf("publicV1Router.get('/docs'")
  const authIndex = routes.indexOf('publicV1Router.use(publicApiAuth)')
  assert.ok(docsIndex >= 0 && authIndex > docsIndex)
  assert.match(routes, /requirePublicScope\('public:health:read'\)/)
  assert.match(routes, /requirePublicScope\('public:finance:read'\)/)
  assert.match(routes, /requirePublicScope\('public:sales:read'\)/)
  assert.match(routes, /publicRateLimit/)
  assert.doesNotMatch(routes, /\.(post|put|patch|delete)\(/)
  assert.match(routes, /res\.status\(405\)\.json\(\{ error: 'Public API v1 is read-only' \}\)/)
})
