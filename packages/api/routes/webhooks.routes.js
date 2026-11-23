// Phase 15 webhook HTTP surface. Provider callbacks and static docs are
// mounted before session auth; all management routes require a session and a
// scoped permission. No route returns a plaintext secret, key hash or HMAC.

import { Router } from 'express'
import { requireAuth } from '../lib/auth.js'
import { requirePermission } from '../lib/authorize.js'
import {
  WEBHOOK_CONTRACT,
  WEBHOOK_SIGNATURE_HEADER,
  registerClient,
  listClients,
  getClient,
  revokeClient,
  createSubscription,
  listSubscriptions,
  getSubscription,
  updateSubscriptionStatus,
  rotateSubscriptionSecret,
  listDeliveries,
  getDelivery,
  retryDelivery,
  verifyProviderCallback,
} from '../lib/webhooks.js'
import {
  publicClientCreateSchema,
  publicClientListQuerySchema,
  publicClientActionSchema,
  webhookSubscriptionCreateSchema,
  webhookSubscriptionRotateSchema,
  webhookSubscriptionUpdateSchema,
  webhookSubscriptionQuerySchema,
  webhookDeliveryQuerySchema,
  webhookActionSchema,
  webhookCallbackSchema,
} from '../lib/validation.js'

export const webhooksRouter = Router()

// Static developer contract: no tenant data and no authentication required.
webhooksRouter.get('/docs', (_req, res) => res.json({ docs: WEBHOOK_CONTRACT }))

// Unauthenticated by session: the provider proves possession of the API key
// secret through a timing-safe HMAC. Signature is verified before replay state
// is consulted.
webhooksRouter.post('/callbacks/:clientId/verify', async (req, res) => {
  const body = webhookCallbackSchema.parse(req.body)
  const signature = req.header(WEBHOOK_SIGNATURE_HEADER) || ''
  return res.json({ result: await verifyProviderCallback(req.params.clientId, body, signature) })
})

webhooksRouter.use(requireAuth)

function actor(req) {
  return {
    userId: req.auth.userId,
    companyId: req.auth.companyId,
    branchId: req.auth.branchId,
    correlationId: req.correlationId,
    req,
  }
}

// --------------------------------------------------------------- public clients

webhooksRouter.get('/clients', requirePermission('public.client.read'), async (req, res) => {
  const query = publicClientListQuerySchema.parse(req.query)
  return res.json({ clients: await listClients(query) })
})

webhooksRouter.post('/clients', requirePermission('public.client.write'), async (req, res) => {
  const body = publicClientCreateSchema.parse(req.body)
  return res.status(201).json({ client: await registerClient(body, actor(req)) })
})

webhooksRouter.get('/clients/:id', requirePermission('public.client.read'), async (req, res) => {
  return res.json({ client: await getClient(req.params.id) })
})

webhooksRouter.post('/clients/:id/revoke', requirePermission('public.client.write'), async (req, res) => {
  publicClientActionSchema.parse(req.body || {})
  return res.json({ client: await revokeClient(req.params.id, actor(req)) })
})

// ------------------------------------------------------------- subscriptions

webhooksRouter.get('/subscriptions', requirePermission('webhook.subscription.read'), async (req, res) => {
  const query = webhookSubscriptionQuerySchema.parse(req.query)
  return res.json({ subscriptions: await listSubscriptions(query) })
})

webhooksRouter.post('/subscriptions', requirePermission('webhook.subscription.write'), async (req, res) => {
  const body = webhookSubscriptionCreateSchema.parse(req.body)
  return res.status(201).json({ subscription: await createSubscription(body, actor(req)) })
})

webhooksRouter.get('/subscriptions/:id', requirePermission('webhook.subscription.read'), async (req, res) => {
  return res.json({ subscription: await getSubscription(req.params.id) })
})

webhooksRouter.patch('/subscriptions/:id', requirePermission('webhook.subscription.write'), async (req, res) => {
  const body = webhookSubscriptionUpdateSchema.parse(req.body)
  return res.json({ subscription: await updateSubscriptionStatus(req.params.id, body.status, actor(req)) })
})

webhooksRouter.post('/subscriptions/:id/rotate', requirePermission('webhook.subscription.write'), async (req, res) => {
  const body = webhookSubscriptionRotateSchema.parse(req.body)
  return res.json({ subscription: await rotateSubscriptionSecret(req.params.id, body.secret, actor(req)) })
})

// ------------------------------------------------------------------ deliveries

webhooksRouter.get('/deliveries', requirePermission('webhook.delivery.read'), async (req, res) => {
  const query = webhookDeliveryQuerySchema.parse(req.query)
  return res.json({ deliveries: await listDeliveries(query) })
})

webhooksRouter.get('/deliveries/:id', requirePermission('webhook.delivery.read'), async (req, res) => {
  return res.json({ delivery: await getDelivery(req.params.id) })
})

webhooksRouter.post('/deliveries/:id/retry', requirePermission('webhook.delivery.retry'), async (req, res) => {
  webhookActionSchema.parse(req.body || {})
  return res.json({ delivery: await retryDelivery(req.params.id, actor(req)) })
})
