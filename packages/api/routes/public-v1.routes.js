// Phase 15 public API v1 router. Static docs are public; every other route is
// API-key authenticated, per-key rate limited, scope checked and read-only.

import { Router } from 'express'
import {
  publicApiAuth,
  publicRateLimit,
  requirePublicScope,
  getPublicDocs,
  getPublicHealth,
  getPublicFinanceSummary,
  getPublicSalesSummary,
} from '../lib/public-api.js'
import { publicApiFinanceQuerySchema, publicApiSalesQuerySchema } from '../lib/validation.js'

export const publicV1Router = Router()

// Static contract only; never includes tenant data or a business identifier.
publicV1Router.get('/docs', (_req, res) => res.json({ docs: getPublicDocs() }))

publicV1Router.use(publicApiAuth)
publicV1Router.use(publicRateLimit)

publicV1Router.get('/health', requirePublicScope('public:health:read'), (req, res) => {
  return res.json({ health: getPublicHealth(req.publicApiKey.scopes) })
})

publicV1Router.get('/finance/summary', requirePublicScope('public:finance:read'), async (req, res) => {
  const query = publicApiFinanceQuerySchema.parse(req.query)
  return res.json({ summary: await getPublicFinanceSummary(query) })
})

publicV1Router.get('/sales/summary', requirePublicScope('public:sales:read'), async (req, res) => {
  const query = publicApiSalesQuerySchema.parse(req.query)
  return res.json({ summary: await getPublicSalesSummary(query, req.publicClient) })
})

// The public surface is deliberately read-only. A valid key cannot turn it
// into a write surface by guessing another HTTP verb.
publicV1Router.use((_req, res) => res.status(405).json({ error: 'Public API v1 is read-only' }))
