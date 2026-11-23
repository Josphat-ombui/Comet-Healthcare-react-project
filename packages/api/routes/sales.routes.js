// Phase 7 sales HTTP surface. Routes only validate, authorise and audit;
// every state transition lives in lib/sales.js. Tenant context comes from the
// authenticated principal — a client-supplied companyId is never accepted.

import { Router } from 'express'
import { requireAuth } from '../lib/auth.js'
import { requirePermission } from '../lib/authorize.js'
import { recordRequestAudit } from '../lib/audit.js'
import {
  salesQuoteCreateSchema, salesQuoteUpdateSchema, salesOrderCreateSchema,
  salesOrderUpdateSchema, salesDeliveryCreateSchema, salesDeliveryUpdateSchema,
  salesReturnCreateSchema, salesReturnUpdateSchema, salesInvoiceFromOrderSchema,
  salesQuoteQuerySchema, salesOrderQuerySchema, salesDeliveryQuerySchema,
  salesReturnQuerySchema,
} from '../lib/validation.js'
import {
  listQuotes, getQuote, createQuote, updateQuote, convertQuoteToOrder,
  listOrders, getOrder, createOrder, updateOrder, confirmOrder,
  listDeliveryNotes, getDeliveryNote, createDeliveryNote, updateDeliveryNote,
  issueDeliveryNote, deliverDeliveryNote,
  listReturns, getReturn, createReturn, updateReturn, approveReturn, receiveReturn,
  createInvoiceFromOrder,
} from '../lib/sales.js'

export const salesRouter = Router()

salesRouter.use(requireAuth)

function actor(req) {
  return {
    userId: req.auth.userId,
    companyId: req.auth.companyId,
    branchId: req.auth.branchId,
    roles: req.auth.roles,
    correlationId: req.correlationId,
    req,
  }
}

/** Read-only audits deliberately carry an action and IDs only. */
async function auditRead(req, action, resourceType, resourceId) {
  return recordRequestAudit(req, {
    action,
    resourceType,
    resourceId: String(resourceId),
    metadata: { resourceId: String(resourceId), classification: 'INTERNAL' },
  })
}

// ------------------------------------------------------------------- quotes

salesRouter.get('/quotes', requirePermission('sales.quote.read'), async (req, res) => {
  const query = salesQuoteQuerySchema.parse(req.query)
  return res.json({ quotes: await listQuotes(query, actor(req)) })
})

salesRouter.post('/quotes', requirePermission('sales.quote.write'), async (req, res) => {
  const body = salesQuoteCreateSchema.parse(req.body)
  return res.status(201).json({ quote: await createQuote(body, actor(req)) })
})

salesRouter.get('/quotes/:id', requirePermission('sales.quote.read'), async (req, res) => {
  const quote = await getQuote(req.params.id, actor(req))
  await auditRead(req, 'sales.quote.read', 'SalesQuote', req.params.id)
  return res.json({ quote })
})

salesRouter.patch('/quotes/:id', requirePermission('sales.quote.write'), async (req, res) => {
  const body = salesQuoteUpdateSchema.parse(req.body)
  return res.json({ quote: await updateQuote(req.params.id, body, actor(req)) })
})

salesRouter.post('/quotes/:id/convert', requirePermission('sales.quote.write'), async (req, res) => {
  return res.status(201).json({ result: await convertQuoteToOrder(req.params.id, actor(req)) })
})

// ------------------------------------------------------------------- orders

salesRouter.get('/orders', requirePermission('sales.order.read'), async (req, res) => {
  const query = salesOrderQuerySchema.parse(req.query)
  return res.json({ orders: await listOrders(query, actor(req)) })
})

salesRouter.post('/orders', requirePermission('sales.order.write'), async (req, res) => {
  const body = salesOrderCreateSchema.parse(req.body)
  return res.status(201).json({ order: await createOrder(body, actor(req)) })
})

salesRouter.get('/orders/:id', requirePermission('sales.order.read'), async (req, res) => {
  const order = await getOrder(req.params.id, actor(req))
  await auditRead(req, 'sales.order.read', 'SalesOrder', req.params.id)
  return res.json({ order })
})

salesRouter.patch('/orders/:id', requirePermission('sales.order.write'), async (req, res) => {
  const body = salesOrderUpdateSchema.parse(req.body)
  return res.json({ order: await updateOrder(req.params.id, body, actor(req)) })
})

salesRouter.post('/orders/:id/confirm', requirePermission('sales.order.confirm'), async (req, res) => {
  return res.json({ order: await confirmOrder(req.params.id, actor(req)) })
})

salesRouter.post('/orders/:id/invoice', requirePermission('sales.invoice.create'), async (req, res) => {
  const body = salesInvoiceFromOrderSchema.parse(req.body || {})
  return res.status(201).json({ result: await createInvoiceFromOrder(req.params.id, body, actor(req)) })
})

// ----------------------------------------------------------- delivery notes

salesRouter.get('/deliveries', requirePermission('sales.delivery.read'), async (req, res) => {
  const query = salesDeliveryQuerySchema.parse(req.query)
  return res.json({ deliveries: await listDeliveryNotes(query, actor(req)) })
})

salesRouter.post('/deliveries', requirePermission('sales.delivery.write'), async (req, res) => {
  const body = salesDeliveryCreateSchema.parse(req.body)
  return res.status(201).json({ delivery: await createDeliveryNote(body, actor(req)) })
})

salesRouter.get('/deliveries/:id', requirePermission('sales.delivery.read'), async (req, res) => {
  const delivery = await getDeliveryNote(req.params.id, actor(req))
  await auditRead(req, 'sales.delivery.read', 'DeliveryNote', req.params.id)
  return res.json({ delivery })
})

salesRouter.patch('/deliveries/:id', requirePermission('sales.delivery.write'), async (req, res) => {
  const body = salesDeliveryUpdateSchema.parse(req.body)
  return res.json({ delivery: await updateDeliveryNote(req.params.id, body, actor(req)) })
})

salesRouter.post('/deliveries/:id/issue', requirePermission('sales.delivery.issue'), async (req, res) => {
  return res.json({ delivery: await issueDeliveryNote(req.params.id, actor(req)) })
})

salesRouter.post('/deliveries/:id/deliver', requirePermission('sales.delivery.issue'), async (req, res) => {
  return res.json({ delivery: await deliverDeliveryNote(req.params.id, actor(req)) })
})

// -------------------------------------------------------------- sales returns

salesRouter.get('/returns', requirePermission('sales.return.read'), async (req, res) => {
  const query = salesReturnQuerySchema.parse(req.query)
  return res.json({ returns: await listReturns(query, actor(req)) })
})

salesRouter.post('/returns', requirePermission('sales.return.write'), async (req, res) => {
  const body = salesReturnCreateSchema.parse(req.body)
  return res.status(201).json({ return: await createReturn(body, actor(req)) })
})

salesRouter.get('/returns/:id', requirePermission('sales.return.read'), async (req, res) => {
  const record = await getReturn(req.params.id, actor(req))
  await auditRead(req, 'sales.return.read', 'SalesReturn', req.params.id)
  return res.json({ return: record })
})

salesRouter.patch('/returns/:id', requirePermission('sales.return.write'), async (req, res) => {
  const body = salesReturnUpdateSchema.parse(req.body)
  return res.json({ return: await updateReturn(req.params.id, body, actor(req)) })
})

salesRouter.post('/returns/:id/approve', requirePermission('sales.return.approve'), async (req, res) => {
  return res.json({ return: await approveReturn(req.params.id, actor(req)) })
})

salesRouter.post('/returns/:id/receive', requirePermission('sales.return.approve'), async (req, res) => {
  return res.json({ return: await receiveReturn(req.params.id, actor(req)) })
})
