// Phase 9 procurement HTTP surface. Routes only validate, authorise and audit;
// document lifecycle, stock postings and cent arithmetic live in
// lib/procurement.js. Tenant and branch scope always come from the authenticated
// principal, never from a request body.

import { Router } from 'express'
import { requireAuth } from '../lib/auth.js'
import { requirePermission } from '../lib/authorize.js'
import { recordRequestAudit } from '../lib/audit.js'
import {
  procurementRequisitionCreateSchema,
  procurementOrderCreateSchema,
  procurementReceiptCreateSchema,
  procurementReturnCreateSchema,
  procurementMatchCreateSchema,
  procurementRequisitionQuerySchema,
  procurementOrderQuerySchema,
  procurementReceiptQuerySchema,
  procurementReturnQuerySchema,
  procurementMatchQuerySchema,
  procurementConvertSchema,
  procurementReceiptInspectSchema,
  procurementActionSchema,
} from '../lib/validation.js'
import {
  listRequisitions, getRequisition, createRequisition, submitRequisition, approveRequisition, convertRequisition,
  listOrders, getOrder, createOrder, approveOrder, sendOrder,
  listReceipts, getReceipt, createGoodsReceipt, inspectGoodsReceipt,
  listReturns, getReturn, createSupplierReturn, approveSupplierReturn,
  listMatches, getMatch, createThreeWayMatch, approveThreeWayMatch,
} from '../lib/procurement.js'

export const procurementRouter = Router()

procurementRouter.use(requireAuth)

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

function actionBody(req) {
  return procurementActionSchema.parse(req.body || {})
}

// -------------------------------------------------------------- requisitions

procurementRouter.get('/requisitions', requirePermission('procurement.requisition.read'), async (req, res) => {
  const query = procurementRequisitionQuerySchema.parse(req.query)
  return res.json({ requisitions: await listRequisitions(query, actor(req)) })
})

procurementRouter.post('/requisitions', requirePermission('procurement.requisition.write'), async (req, res) => {
  const body = procurementRequisitionCreateSchema.parse(req.body)
  return res.status(201).json({ requisition: await createRequisition(body, actor(req)) })
})

procurementRouter.get('/requisitions/:id', requirePermission('procurement.requisition.read'), async (req, res) => {
  const requisition = await getRequisition(req.params.id, actor(req))
  await auditRead(req, 'procurement.requisition.read', 'PurchaseRequisition', req.params.id)
  return res.json({ requisition })
})

procurementRouter.post('/requisitions/:id/submit', requirePermission('procurement.requisition.write'), async (req, res) => {
  actionBody(req)
  return res.json({ requisition: await submitRequisition(req.params.id, actor(req)) })
})

procurementRouter.post('/requisitions/:id/approve', requirePermission('procurement.requisition.approve'), async (req, res) => {
  actionBody(req)
  return res.json({ requisition: await approveRequisition(req.params.id, actor(req)) })
})

procurementRouter.post('/requisitions/:id/convert', requirePermission('procurement.requisition.approve'), async (req, res) => {
  const body = procurementConvertSchema.parse(req.body)
  return res.status(201).json(await convertRequisition(req.params.id, body, actor(req)))
})

// --------------------------------------------------------------------- orders

procurementRouter.get('/orders', requirePermission('procurement.order.read'), async (req, res) => {
  const query = procurementOrderQuerySchema.parse(req.query)
  return res.json({ orders: await listOrders(query, actor(req)) })
})

procurementRouter.post('/orders', requirePermission('procurement.order.write'), async (req, res) => {
  const body = procurementOrderCreateSchema.parse(req.body)
  return res.status(201).json({ order: await createOrder(body, actor(req)) })
})

procurementRouter.get('/orders/:id', requirePermission('procurement.order.read'), async (req, res) => {
  const order = await getOrder(req.params.id, actor(req))
  await auditRead(req, 'procurement.order.read', 'PurchaseOrder', req.params.id)
  return res.json({ order })
})

procurementRouter.post('/orders/:id/approve', requirePermission('procurement.order.approve'), async (req, res) => {
  actionBody(req)
  return res.json({ order: await approveOrder(req.params.id, actor(req)) })
})

procurementRouter.post('/orders/:id/send', requirePermission('procurement.order.send'), async (req, res) => {
  actionBody(req)
  return res.json({ order: await sendOrder(req.params.id, actor(req)) })
})

// ------------------------------------------------------------------- receipts

procurementRouter.get('/receipts', requirePermission('procurement.receipt.read'), async (req, res) => {
  const query = procurementReceiptQuerySchema.parse(req.query)
  return res.json({ receipts: await listReceipts(query, actor(req)) })
})

procurementRouter.post('/receipts', requirePermission('procurement.receipt.write'), async (req, res) => {
  const body = procurementReceiptCreateSchema.parse(req.body)
  return res.status(201).json(await createGoodsReceipt(body, actor(req)))
})

procurementRouter.get('/receipts/:id', requirePermission('procurement.receipt.read'), async (req, res) => {
  const receipt = await getReceipt(req.params.id, actor(req))
  await auditRead(req, 'procurement.receipt.read', 'GoodsReceipt', req.params.id)
  return res.json({ receipt })
})

procurementRouter.post('/receipts/:id/inspect', requirePermission('procurement.receipt.inspect'), async (req, res) => {
  const body = procurementReceiptInspectSchema.parse(req.body)
  return res.json({ receipt: await inspectGoodsReceipt(req.params.id, body, actor(req)) })
})

// -------------------------------------------------------------------- returns

procurementRouter.get('/returns', requirePermission('procurement.return.read'), async (req, res) => {
  const query = procurementReturnQuerySchema.parse(req.query)
  return res.json({ returns: await listReturns(query, actor(req)) })
})

procurementRouter.post('/returns', requirePermission('procurement.return.write'), async (req, res) => {
  const body = procurementReturnCreateSchema.parse(req.body)
  return res.status(201).json({ returnDocument: await createSupplierReturn(body, actor(req)) })
})

procurementRouter.get('/returns/:id', requirePermission('procurement.return.read'), async (req, res) => {
  const returnDocument = await getReturn(req.params.id, actor(req))
  await auditRead(req, 'procurement.return.read', 'SupplierReturn', req.params.id)
  return res.json({ returnDocument })
})

procurementRouter.post('/returns/:id/approve', requirePermission('procurement.return.approve'), async (req, res) => {
  actionBody(req)
  return res.json({ returnDocument: await approveSupplierReturn(req.params.id, actor(req)) })
})

// -------------------------------------------------------------------- matches

procurementRouter.get('/matches', requirePermission('procurement.match.read'), async (req, res) => {
  const query = procurementMatchQuerySchema.parse(req.query)
  return res.json({ matches: await listMatches(query, actor(req)) })
})

procurementRouter.post('/matches', requirePermission('procurement.match.approve'), async (req, res) => {
  const body = procurementMatchCreateSchema.parse(req.body)
  return res.status(201).json({ match: await createThreeWayMatch(body, actor(req)) })
})

procurementRouter.get('/matches/:id', requirePermission('procurement.match.read'), async (req, res) => {
  const match = await getMatch(req.params.id, actor(req))
  await auditRead(req, 'procurement.match.read', 'ThreeWayMatch', req.params.id)
  return res.json({ match })
})

procurementRouter.post('/matches/:id/approve', requirePermission('procurement.match.approve'), async (req, res) => {
  actionBody(req)
  return res.json({ match: await approveThreeWayMatch(req.params.id, actor(req)) })
})
