// Phase 13 manufacturing HTTP surface. Routes validate, authorise and audit;
// GMP guards, integer-cent math, inventory delegation and tenant scoping live
// in lib/manufacturing.js. Events and audit metadata carry IDs only.

import { Router } from 'express'
import { requireAuth } from '../lib/auth.js'
import { requirePermission } from '../lib/authorize.js'
import { recordRequestAudit } from '../lib/audit.js'
import {
  manufacturingWorkCenterCreateSchema,
  manufacturingWorkCenterUpdateSchema,
  manufacturingWorkCenterQuerySchema,
  manufacturingBomCreateSchema,
  manufacturingBomUpdateSchema,
  manufacturingBomTransitionSchema,
  manufacturingBomQuerySchema,
  manufacturingOrderCreateSchema,
  manufacturingOrderUpdateSchema,
  manufacturingOrderQuerySchema,
  manufacturingBatchCreateSchema,
  manufacturingBatchUpdateSchema,
  manufacturingBatchTransitionSchema,
  manufacturingBatchQuerySchema,
  manufacturingBatchReleaseSchema,
  manufacturingBatchIssueSchema,
  manufacturingQcCheckCreateSchema,
  manufacturingQcCheckUpdateSchema,
  manufacturingQcDecisionSchema,
  manufacturingQcQuerySchema,
} from '../lib/validation.js'
import {
  listWorkCenters, getWorkCenter, createWorkCenter, updateWorkCenter, deleteWorkCenter,
  listBoms, getBom, createBom, updateBom, transitionBom,
  listOrders, getOrder, createOrder, updateOrder, transitionOrder,
  listBatches, getBatch, createBatchRecord, updateBatchRecord, transitionBatch,
  issueBatchMaterials, releaseBatch,
  listQcChecks, getQcCheck, createQcCheck, updateQcCheck, signQcCheck,
} from '../lib/manufacturing.js'

export const manufacturingRouter = Router()

manufacturingRouter.use(requireAuth)

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

async function auditRead(req, action, resourceType, resourceId) {
  return recordRequestAudit(req, {
    action,
    resourceType,
    resourceId: String(resourceId),
    metadata: { resourceId: String(resourceId), classification: 'INTERNAL' },
  })
}

// --------------------------------------------------------------- work centers

manufacturingRouter.get('/work-centers', requirePermission('manufacturing.workcenter.read'), async (req, res) => {
  const query = manufacturingWorkCenterQuerySchema.parse(req.query)
  return res.json({ workCenters: await listWorkCenters(query, actor(req)) })
})

manufacturingRouter.post('/work-centers', requirePermission('manufacturing.workcenter.write'), async (req, res) => {
  const body = manufacturingWorkCenterCreateSchema.parse(req.body)
  return res.status(201).json({ workCenter: await createWorkCenter(body, actor(req)) })
})

manufacturingRouter.get('/work-centers/:id', requirePermission('manufacturing.workcenter.read'), async (req, res) => {
  const workCenter = await getWorkCenter(req.params.id, actor(req))
  await auditRead(req, 'manufacturing.workcenter.read', 'WorkCenter', req.params.id)
  return res.json({ workCenter })
})

manufacturingRouter.patch('/work-centers/:id', requirePermission('manufacturing.workcenter.write'), async (req, res) => {
  const body = manufacturingWorkCenterUpdateSchema.parse(req.body)
  return res.json({ workCenter: await updateWorkCenter(req.params.id, body, actor(req)) })
})

manufacturingRouter.delete('/work-centers/:id', requirePermission('manufacturing.workcenter.write'), async (req, res) => {
  return res.json({ workCenter: await deleteWorkCenter(req.params.id, actor(req)) })
})

// ----------------------------------------------------------------------- BOMs

manufacturingRouter.get('/boms', requirePermission('manufacturing.bom.read'), async (req, res) => {
  const query = manufacturingBomQuerySchema.parse(req.query)
  return res.json({ boms: await listBoms(query, actor(req)) })
})

manufacturingRouter.post('/boms', requirePermission('manufacturing.bom.write'), async (req, res) => {
  const body = manufacturingBomCreateSchema.parse(req.body)
  return res.status(201).json({ bom: await createBom(body, actor(req)) })
})

manufacturingRouter.get('/boms/:id', requirePermission('manufacturing.bom.read'), async (req, res) => {
  const bom = await getBom(req.params.id, actor(req))
  await auditRead(req, 'manufacturing.bom.read', 'Bom', req.params.id)
  return res.json({ bom })
})

manufacturingRouter.patch('/boms/:id', requirePermission('manufacturing.bom.write'), async (req, res) => {
  const body = manufacturingBomUpdateSchema.parse(req.body)
  return res.json({ bom: await updateBom(req.params.id, body, actor(req)) })
})

manufacturingRouter.post('/boms/:id/status', requirePermission('manufacturing.bom.approve'), async (req, res) => {
  const status = manufacturingBomTransitionSchema.parse(req.body || {}).status
  return res.json({ bom: await transitionBom(req.params.id, status, actor(req)) })
})

// ------------------------------------------------------------ production orders

manufacturingRouter.get('/orders', requirePermission('manufacturing.order.read'), async (req, res) => {
  const query = manufacturingOrderQuerySchema.parse(req.query)
  return res.json({ orders: await listOrders(query, actor(req)) })
})

manufacturingRouter.post('/orders', requirePermission('manufacturing.order.write'), async (req, res) => {
  const body = manufacturingOrderCreateSchema.parse(req.body)
  return res.status(201).json({ order: await createOrder(body, actor(req)) })
})

manufacturingRouter.get('/orders/:id', requirePermission('manufacturing.order.read'), async (req, res) => {
  const order = await getOrder(req.params.id, actor(req))
  await auditRead(req, 'manufacturing.order.read', 'ProductionOrder', req.params.id)
  return res.json({ order })
})

manufacturingRouter.patch('/orders/:id', requirePermission('manufacturing.order.write'), async (req, res) => {
  const body = manufacturingOrderUpdateSchema.parse(req.body)
  return res.json({ order: await updateOrder(req.params.id, body, actor(req)) })
})

manufacturingRouter.post('/orders/:id/release', requirePermission('manufacturing.order.release'), async (req, res) => {
  return res.json({ order: await transitionOrder(req.params.id, 'RELEASED', actor(req)) })
})

manufacturingRouter.post('/orders/:id/start', requirePermission('manufacturing.order.write'), async (req, res) => {
  return res.json({ order: await transitionOrder(req.params.id, 'IN_PROGRESS', actor(req)) })
})

manufacturingRouter.post('/orders/:id/complete', requirePermission('manufacturing.order.complete'), async (req, res) => {
  return res.json({ order: await transitionOrder(req.params.id, 'COMPLETED', actor(req)) })
})

manufacturingRouter.post('/orders/:id/cancel', requirePermission('manufacturing.order.write'), async (req, res) => {
  return res.json({ order: await transitionOrder(req.params.id, 'CANCELLED', actor(req)) })
})

// --------------------------------------------------------------- batch records

manufacturingRouter.get('/batches', requirePermission('manufacturing.batch.read'), async (req, res) => {
  const query = manufacturingBatchQuerySchema.parse(req.query)
  return res.json({ batches: await listBatches(query, actor(req)) })
})

manufacturingRouter.post('/batches', requirePermission('manufacturing.batch.write'), async (req, res) => {
  const body = manufacturingBatchCreateSchema.parse(req.body)
  return res.status(201).json({ batch: await createBatchRecord(body, actor(req)) })
})

manufacturingRouter.get('/batches/:id', requirePermission('manufacturing.batch.read'), async (req, res) => {
  const batch = await getBatch(req.params.id, actor(req))
  await auditRead(req, 'manufacturing.batch.read', 'BatchRecord', req.params.id)
  return res.json({ batch })
})

manufacturingRouter.patch('/batches/:id', requirePermission('manufacturing.batch.write'), async (req, res) => {
  const body = manufacturingBatchUpdateSchema.parse(req.body)
  return res.json({ batch: await updateBatchRecord(req.params.id, body, actor(req)) })
})

manufacturingRouter.post('/batches/:id/start', requirePermission('manufacturing.batch.write'), async (req, res) => {
  return res.json({ batch: await transitionBatch(req.params.id, 'IN_PROGRESS', undefined, actor(req)) })
})

manufacturingRouter.post('/batches/:id/review', requirePermission('manufacturing.batch.review'), async (req, res) => {
  return res.json({ batch: await transitionBatch(req.params.id, 'REVIEW', undefined, actor(req)) })
})

manufacturingRouter.post('/batches/:id/reject', requirePermission('manufacturing.batch.write'), async (req, res) => {
  const body = manufacturingBatchTransitionSchema.parse({ status: 'REJECTED', reason: req.body?.reason })
  return res.json({ batch: await transitionBatch(req.params.id, 'REJECTED', body.reason, actor(req)) })
})

manufacturingRouter.post('/batches/:id/issue', requirePermission('manufacturing.batch.write'), async (req, res) => {
  const body = manufacturingBatchIssueSchema.parse(req.body)
  const lines = await issueBatchMaterials(req.params.id, body, actor(req))
  return res.json({ lines })
})

manufacturingRouter.post('/batches/:id/release', requirePermission('manufacturing.batch.release'), async (req, res) => {
  const body = manufacturingBatchReleaseSchema.parse(req.body)
  return res.json(await releaseBatch(req.params.id, body, actor(req)))
})

// ------------------------------------------------------------------- QC checks

manufacturingRouter.get('/batches/:id/qc-checks', requirePermission('manufacturing.qc.read'), async (req, res) => {
  const query = manufacturingQcQuerySchema.parse(req.query)
  return res.json({ qcChecks: await listQcChecks(req.params.id, query, actor(req)) })
})

manufacturingRouter.post('/batches/:id/qc-checks', requirePermission('manufacturing.qc.write'), async (req, res) => {
  const body = manufacturingQcCheckCreateSchema.parse(req.body)
  return res.status(201).json({ qcCheck: await createQcCheck(req.params.id, body, actor(req)) })
})

manufacturingRouter.get('/qc-checks/:id', requirePermission('manufacturing.qc.read'), async (req, res) => {
  const qcCheck = await getQcCheck(req.params.id, actor(req))
  await auditRead(req, 'manufacturing.qc.read', 'QcCheck', req.params.id)
  return res.json({ qcCheck })
})

manufacturingRouter.patch('/qc-checks/:id', requirePermission('manufacturing.qc.write'), async (req, res) => {
  const body = manufacturingQcCheckUpdateSchema.parse(req.body)
  return res.json({ qcCheck: await updateQcCheck(req.params.id, body, actor(req)) })
})

manufacturingRouter.post('/qc-checks/:id/sign', requirePermission('manufacturing.qc.write'), async (req, res) => {
  const body = manufacturingQcDecisionSchema.parse(req.body)
  return res.json({ qcCheck: await signQcCheck(req.params.id, body, actor(req)) })
})
