// Phase 10 service HTTP surface. Routes only validate, authorise and audit;
// lifecycle, SLA, stock and cent arithmetic live in lib/service.js. Tenant and
// branch scope always come from the authenticated principal, never from a
// request body.

import { Router } from 'express'
import { requireAuth } from '../lib/auth.js'
import { requirePermission } from '../lib/authorize.js'
import { recordRequestAudit } from '../lib/audit.js'
import {
  serviceContractCreateSchema,
  serviceTicketCreateSchema,
  serviceTicketAssignSchema,
  serviceTicketResolveSchema,
  serviceWorkOrderCreateSchema,
  serviceWorkOrderScheduleSchema,
  serviceWorkOrderCompleteSchema,
  serviceVisitCreateSchema,
  serviceVisitCheckOutSchema,
  servicePartUsageCreateSchema,
  serviceInvoiceCreateSchema,
  serviceContractQuerySchema,
  serviceTicketQuerySchema,
  serviceWorkOrderQuerySchema,
  serviceVisitQuerySchema,
  servicePartUsageQuerySchema,
  serviceActionSchema,
} from '../lib/validation.js'
import {
  listContracts, getContract, createContract, activateContract, suspendContract, cancelContract,
  listTickets, getTicket, createTicket, assignTicket, startTicket, waitForTicket, resolveTicket,
  closeTicket, cancelTicket,
  listWorkOrders, getWorkOrder, createWorkOrder, scheduleWorkOrder, startWorkOrder,
  completeWorkOrder, cancelWorkOrder, createWorkOrderInvoice,
  listVisits, getVisit, createVisit, checkInVisit, checkOutVisit, cancelVisit,
  listPartUsages, getPartUsage, createPartUsage,
} from '../lib/service.js'

export const serviceRouter = Router()

serviceRouter.use(requireAuth)

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
  return serviceActionSchema.parse(req.body || {})
}

// ------------------------------------------------------------------ contracts

serviceRouter.get('/contracts', requirePermission('service.contract.read'), async (req, res) => {
  const query = serviceContractQuerySchema.parse(req.query)
  return res.json({ contracts: await listContracts(query, actor(req)) })
})

serviceRouter.post('/contracts', requirePermission('service.contract.write'), async (req, res) => {
  const body = serviceContractCreateSchema.parse(req.body)
  return res.status(201).json({ contract: await createContract(body, actor(req)) })
})

serviceRouter.get('/contracts/:id', requirePermission('service.contract.read'), async (req, res) => {
  const contract = await getContract(req.params.id, actor(req))
  await auditRead(req, 'service.contract.read', 'ServiceContract', req.params.id)
  return res.json({ contract })
})

serviceRouter.post('/contracts/:id/activate', requirePermission('service.contract.write'), async (req, res) => {
  actionBody(req)
  return res.json({ contract: await activateContract(req.params.id, actor(req)) })
})

serviceRouter.post('/contracts/:id/suspend', requirePermission('service.contract.write'), async (req, res) => {
  actionBody(req)
  return res.json({ contract: await suspendContract(req.params.id, actor(req)) })
})

serviceRouter.post('/contracts/:id/cancel', requirePermission('service.contract.write'), async (req, res) => {
  actionBody(req)
  return res.json({ contract: await cancelContract(req.params.id, actor(req)) })
})

// -------------------------------------------------------------------- tickets

serviceRouter.get('/tickets', requirePermission('service.ticket.read'), async (req, res) => {
  const query = serviceTicketQuerySchema.parse(req.query)
  return res.json({ tickets: await listTickets(query, actor(req)) })
})

serviceRouter.post('/tickets', requirePermission('service.ticket.write'), async (req, res) => {
  const body = serviceTicketCreateSchema.parse(req.body)
  return res.status(201).json({ ticket: await createTicket(body, actor(req)) })
})

serviceRouter.get('/tickets/:id', requirePermission('service.ticket.read'), async (req, res) => {
  const ticket = await getTicket(req.params.id, actor(req))
  await auditRead(req, 'service.ticket.read', 'ServiceTicket', req.params.id)
  return res.json({ ticket })
})

serviceRouter.post('/tickets/:id/assign', requirePermission('service.ticket.assign'), async (req, res) => {
  const body = serviceTicketAssignSchema.parse(req.body)
  return res.json({ ticket: await assignTicket(req.params.id, body, actor(req)) })
})

serviceRouter.post('/tickets/:id/start', requirePermission('service.ticket.write'), async (req, res) => {
  actionBody(req)
  return res.json({ ticket: await startTicket(req.params.id, actor(req)) })
})

serviceRouter.post('/tickets/:id/wait', requirePermission('service.ticket.write'), async (req, res) => {
  actionBody(req)
  return res.json({ ticket: await waitForTicket(req.params.id, actor(req)) })
})

serviceRouter.post('/tickets/:id/resolve', requirePermission('service.ticket.resolve'), async (req, res) => {
  const body = serviceTicketResolveSchema.parse(req.body)
  return res.json({ ticket: await resolveTicket(req.params.id, body, actor(req)) })
})

serviceRouter.post('/tickets/:id/close', requirePermission('service.ticket.resolve'), async (req, res) => {
  actionBody(req)
  return res.json({ ticket: await closeTicket(req.params.id, actor(req)) })
})

serviceRouter.post('/tickets/:id/cancel', requirePermission('service.ticket.write'), async (req, res) => {
  actionBody(req)
  return res.json({ ticket: await cancelTicket(req.params.id, actor(req)) })
})

// --------------------------------------------------------------- work orders

serviceRouter.get('/work-orders', requirePermission('service.workorder.read'), async (req, res) => {
  const query = serviceWorkOrderQuerySchema.parse(req.query)
  return res.json({ workOrders: await listWorkOrders(query, actor(req)) })
})

serviceRouter.post('/work-orders', requirePermission('service.workorder.write'), async (req, res) => {
  const body = serviceWorkOrderCreateSchema.parse(req.body)
  return res.status(201).json({ workOrder: await createWorkOrder(body, actor(req)) })
})

serviceRouter.get('/work-orders/:id', requirePermission('service.workorder.read'), async (req, res) => {
  const workOrder = await getWorkOrder(req.params.id, actor(req))
  await auditRead(req, 'service.workorder.read', 'WorkOrder', req.params.id)
  return res.json({ workOrder })
})

serviceRouter.post('/work-orders/:id/schedule', requirePermission('service.workorder.schedule'), async (req, res) => {
  const body = serviceWorkOrderScheduleSchema.parse(req.body)
  return res.json({ workOrder: await scheduleWorkOrder(req.params.id, body, actor(req)) })
})

serviceRouter.post('/work-orders/:id/start', requirePermission('service.workorder.write'), async (req, res) => {
  actionBody(req)
  return res.json({ workOrder: await startWorkOrder(req.params.id, actor(req)) })
})

serviceRouter.post('/work-orders/:id/complete', requirePermission('service.workorder.complete'), async (req, res) => {
  const body = serviceWorkOrderCompleteSchema.parse(req.body)
  return res.json({ workOrder: await completeWorkOrder(req.params.id, body, actor(req)) })
})

serviceRouter.post('/work-orders/:id/cancel', requirePermission('service.workorder.write'), async (req, res) => {
  actionBody(req)
  return res.json({ workOrder: await cancelWorkOrder(req.params.id, actor(req)) })
})

serviceRouter.post('/work-orders/:id/invoice', requirePermission('service.workorder.complete'), async (req, res) => {
  const body = serviceInvoiceCreateSchema.parse(req.body)
  return res.status(201).json(await createWorkOrderInvoice(req.params.id, body, actor(req)))
})

// --------------------------------------------------------------------- visits

serviceRouter.get('/visits', requirePermission('service.visit.read'), async (req, res) => {
  const query = serviceVisitQuerySchema.parse(req.query)
  return res.json({ visits: await listVisits(query, actor(req)) })
})

serviceRouter.post('/visits', requirePermission('service.visit.write'), async (req, res) => {
  const body = serviceVisitCreateSchema.parse(req.body)
  return res.status(201).json({ visit: await createVisit(body, actor(req)) })
})

serviceRouter.get('/visits/:id', requirePermission('service.visit.read'), async (req, res) => {
  const visit = await getVisit(req.params.id, actor(req))
  await auditRead(req, 'service.visit.read', 'ServiceVisit', req.params.id)
  return res.json({ visit })
})

serviceRouter.post('/visits/:id/check-in', requirePermission('service.visit.write'), async (req, res) => {
  actionBody(req)
  return res.json({ visit: await checkInVisit(req.params.id, actor(req)) })
})

serviceRouter.post('/visits/:id/complete', requirePermission('service.visit.write'), async (req, res) => {
  const body = serviceVisitCheckOutSchema.parse(req.body)
  return res.json({ visit: await checkOutVisit(req.params.id, body, actor(req)) })
})

serviceRouter.post('/visits/:id/cancel', requirePermission('service.visit.write'), async (req, res) => {
  actionBody(req)
  return res.json({ visit: await cancelVisit(req.params.id, actor(req)) })
})

// ---------------------------------------------------------------- part usage

serviceRouter.get('/parts', requirePermission('service.part.read'), async (req, res) => {
  const query = servicePartUsageQuerySchema.parse(req.query)
  return res.json({ partUsages: await listPartUsages(query, actor(req)) })
})

serviceRouter.post('/parts', requirePermission('service.part.write'), async (req, res) => {
  const body = servicePartUsageCreateSchema.parse(req.body)
  return res.status(201).json({ partUsage: await createPartUsage(body, actor(req)) })
})

serviceRouter.get('/parts/:id', requirePermission('service.part.read'), async (req, res) => {
  const partUsage = await getPartUsage(req.params.id, actor(req))
  await auditRead(req, 'service.part.read', 'ServicePartUsage', req.params.id)
  return res.json({ partUsage })
})
