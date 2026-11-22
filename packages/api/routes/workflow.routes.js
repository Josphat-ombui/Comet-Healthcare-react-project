// Workflow HTTP surface. Routes validate, authorise and pass a request-bound
// actor for auditing; state transitions live in lib/workflow.js.

import { Router } from 'express'
import { requireAuth } from '../lib/auth.js'
import { requirePermission, canAccessBranch } from '../lib/authorize.js'
import { HttpError } from '../lib/util.js'
import {
  workflowDefinitionSchema, workflowStartSchema,
  workflowTaskDecisionSchema, workflowDelegateSchema,
} from '../lib/validation.js'
import {
  listDefinitions, createDefinition, listInstances, startInstance,
  listMyTasks, decideTask, delegateTask,
} from '../lib/workflow.js'

export const workflowRouter = Router()

workflowRouter.use(requireAuth)

function actor(req) {
  return {
    userId: req.auth.userId,
    companyId: req.auth.companyId,
    branchId: req.auth.branchId,
    branchIds: req.auth.branchIds,
    roles: req.auth.roles,
    correlationId: req.correlationId,
    req,
  }
}

function assertBranch(req, branchId) {
  if (branchId && !canAccessBranch(req, branchId)) {
    throw new HttpError(403, 'You cannot access records from this branch')
  }
}

function listQuery(source) {
  return {
    status: typeof source.status === 'string' ? source.status : undefined,
    entityType: typeof source.entityType === 'string' ? source.entityType : undefined,
    limit: source.limit,
  }
}

// ------------------------------------------------------------- definitions

workflowRouter.get('/definitions', requirePermission('workflow.definition.read'), async (_req, res) => {
  return res.json({ definitions: await listDefinitions() })
})

workflowRouter.post('/definitions', requirePermission('workflow.definition.write'), async (req, res) => {
  const body = workflowDefinitionSchema.parse(req.body)
  const definition = await createDefinition(body, actor(req))
  return res.status(201).json({ definition })
})

// --------------------------------------------------------------- instances

workflowRouter.get('/instances', requirePermission('workflow.instance.read'), async (req, res) => {
  return res.json({ instances: await listInstances(listQuery(req.query), req) })
})

workflowRouter.post('/instances', requirePermission('workflow.definition.read'), async (req, res) => {
  const body = workflowStartSchema.parse(req.body)
  assertBranch(req, body.branchId)
  return res.status(201).json(await startInstance(body, actor(req)))
})

// ------------------------------------------------------------------- tasks

workflowRouter.get('/tasks', requirePermission('workflow.task.approve', 'workflow.instance.read'), async (req, res) => {
  const query = {
    ...listQuery(req.query),
    mine: req.query.mine === '1' || req.query.mine === 'true',
  }
  return res.json({ tasks: await listMyTasks(query, actor(req)) })
})

workflowRouter.post('/tasks/:id/decide', requirePermission('workflow.task.approve'), async (req, res) => {
  const body = workflowTaskDecisionSchema.parse(req.body)
  return res.json(await decideTask(req.params.id, body, actor(req)))
})

workflowRouter.post('/tasks/:id/delegate', requirePermission('workflow.task.delegate'), async (req, res) => {
  const body = workflowDelegateSchema.parse(req.body)
  return res.json(await delegateTask(req.params.id, body, actor(req)))
})
