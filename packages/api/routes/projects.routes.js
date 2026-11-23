// Phase 12 projects HTTP surface. Routes only validate, authorise and audit;
// lifecycle guards, integer-cent math, finance delegation and tenant scoping
// live in lib/projects.js. All subordinate resources are nested under a project
// so cross-project references cannot be addressed by an opaque child ID alone.

import { Router } from 'express'
import { requireAuth } from '../lib/auth.js'
import { requirePermission } from '../lib/authorize.js'
import { recordRequestAudit } from '../lib/audit.js'
import {
  projectCreateSchema,
  projectUpdateSchema,
  projectTransitionSchema,
  projectQuerySchema,
  projectMemberCreateSchema,
  projectMemberUpdateSchema,
  projectMilestoneCreateSchema,
  projectMilestoneTransitionSchema,
  projectMilestoneQuerySchema,
  projectTaskCreateSchema,
  projectTaskUpdateSchema,
  projectTaskTransitionSchema,
  projectTaskQuerySchema,
  projectTimeCreateSchema,
  projectTimeDecisionSchema,
  projectTimeInvoiceSchema,
  projectTimeQuerySchema,
  projectBudgetLinkCreateSchema,
} from '../lib/validation.js'
import {
  listProjects, getProject, createProject, updateProject, transitionProject,
  listMembers, getMember, createMember, updateMember,
  listMilestones, getMilestone, createMilestone, transitionMilestone,
  listTasks, getTask, createTask, updateTask, transitionTask,
  listTimeEntries, getTimeEntry, createTimeEntry, decideTimeEntry, invoiceTimeEntry,
  getProjectBudgetUsage, linkBudget,
} from '../lib/projects.js'

export const projectsRouter = Router()

projectsRouter.use(requireAuth)

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

function statusBody(req) {
  return projectTransitionSchema.parse(req.body || {}).status
}

// ------------------------------------------------------------------ projects

projectsRouter.get('/', requirePermission('projects.project.read'), async (req, res) => {
  const query = projectQuerySchema.parse(req.query)
  return res.json({ projects: await listProjects(query, actor(req)) })
})

projectsRouter.post('/', requirePermission('projects.project.write'), async (req, res) => {
  const body = projectCreateSchema.parse(req.body)
  return res.status(201).json({ project: await createProject(body, actor(req)) })
})

projectsRouter.get('/:id', requirePermission('projects.project.read'), async (req, res) => {
  const project = await getProject(req.params.id, actor(req))
  await auditRead(req, 'projects.project.read', 'Project', req.params.id)
  return res.json({ project })
})

projectsRouter.patch('/:id', requirePermission('projects.project.write'), async (req, res) => {
  const body = projectUpdateSchema.parse(req.body)
  return res.json({ project: await updateProject(req.params.id, body, actor(req)) })
})

projectsRouter.post('/:id/status', requirePermission('projects.project.write'), async (req, res) => {
  const status = statusBody(req)
  return res.json({ project: await transitionProject(req.params.id, status, actor(req)) })
})

// ------------------------------------------------------------------- members

projectsRouter.get('/:id/members', requirePermission('projects.member.read'), async (req, res) => {
  return res.json({ members: await listMembers(req.params.id, actor(req)) })
})

projectsRouter.post('/:id/members', requirePermission('projects.member.write'), async (req, res) => {
  const body = projectMemberCreateSchema.parse(req.body)
  return res.status(201).json({ member: await createMember(req.params.id, body, actor(req)) })
})

projectsRouter.get('/:id/members/:memberId', requirePermission('projects.member.read'), async (req, res) => {
  const member = await getMember(req.params.id, req.params.memberId, actor(req))
  await auditRead(req, 'projects.member.read', 'ProjectMember', req.params.memberId)
  return res.json({ member })
})

projectsRouter.patch('/:id/members/:memberId', requirePermission('projects.member.write'), async (req, res) => {
  const body = projectMemberUpdateSchema.parse(req.body)
  return res.json({ member: await updateMember(req.params.id, req.params.memberId, body, actor(req)) })
})

// ---------------------------------------------------------------- milestones

projectsRouter.get('/:id/milestones', requirePermission('projects.milestone.read'), async (req, res) => {
  const query = projectMilestoneQuerySchema.parse(req.query)
  return res.json({ milestones: await listMilestones(req.params.id, query, actor(req)) })
})

projectsRouter.post('/:id/milestones', requirePermission('projects.milestone.write'), async (req, res) => {
  const body = projectMilestoneCreateSchema.parse(req.body)
  return res.status(201).json({ milestone: await createMilestone(req.params.id, body, actor(req)) })
})

projectsRouter.get('/:id/milestones/:milestoneId', requirePermission('projects.milestone.read'), async (req, res) => {
  const milestone = await getMilestone(req.params.id, req.params.milestoneId, actor(req))
  await auditRead(req, 'projects.milestone.read', 'Milestone', req.params.milestoneId)
  return res.json({ milestone })
})

projectsRouter.post(
  '/:id/milestones/:milestoneId/status',
  requirePermission('projects.milestone.write'),
  async (req, res) => {
    const status = projectMilestoneTransitionSchema.parse(req.body || {}).status
    return res.json({
      milestone: await transitionMilestone(req.params.id, req.params.milestoneId, status, actor(req)),
    })
  }
)

// --------------------------------------------------------------------- tasks

projectsRouter.get('/:id/tasks', requirePermission('projects.task.read'), async (req, res) => {
  const query = projectTaskQuerySchema.parse(req.query)
  return res.json({ tasks: await listTasks(req.params.id, query, actor(req)) })
})

projectsRouter.post('/:id/tasks', requirePermission('projects.task.write'), async (req, res) => {
  const body = projectTaskCreateSchema.parse(req.body)
  return res.status(201).json({ task: await createTask(req.params.id, body, actor(req)) })
})

projectsRouter.get('/:id/tasks/:taskId', requirePermission('projects.task.read'), async (req, res) => {
  const task = await getTask(req.params.id, req.params.taskId, actor(req))
  await auditRead(req, 'projects.task.read', 'ProjectTask', req.params.taskId)
  return res.json({ task })
})

projectsRouter.patch('/:id/tasks/:taskId', requirePermission('projects.task.write'), async (req, res) => {
  const body = projectTaskUpdateSchema.parse(req.body)
  return res.json({ task: await updateTask(req.params.id, req.params.taskId, body, actor(req)) })
})

projectsRouter.post('/:id/tasks/:taskId/status', requirePermission('projects.task.write'), async (req, res) => {
  const status = projectTaskTransitionSchema.parse(req.body || {}).status
  return res.json({ task: await transitionTask(req.params.id, req.params.taskId, status, actor(req)) })
})

// --------------------------------------------------------------- time entries

projectsRouter.get('/:id/time', requirePermission('projects.time.read'), async (req, res) => {
  const query = projectTimeQuerySchema.parse(req.query)
  return res.json({ timeEntries: await listTimeEntries(req.params.id, query, actor(req)) })
})

projectsRouter.post('/:id/time', requirePermission('projects.time.write'), async (req, res) => {
  const body = projectTimeCreateSchema.parse(req.body)
  return res.status(201).json({ timeEntry: await createTimeEntry(req.params.id, body, actor(req)) })
})

projectsRouter.get('/:id/time/:timeId', requirePermission('projects.time.read'), async (req, res) => {
  const entry = await getTimeEntry(req.params.id, req.params.timeId, actor(req))
  await auditRead(req, 'projects.time.read', 'TimeEntry', req.params.timeId)
  return res.json({ timeEntry: entry })
})

projectsRouter.post('/:id/time/:timeId/decision', requirePermission('projects.time.approve'), async (req, res) => {
  const body = projectTimeDecisionSchema.parse(req.body || {})
  return res.json({ timeEntry: await decideTimeEntry(req.params.id, req.params.timeId, body, actor(req)) })
})

projectsRouter.post(
  '/:id/time/:timeId/invoice',
  requirePermission('projects.time.bill'),
  requirePermission('finance.invoice.write'),
  requirePermission('finance.invoice.issue'),
  async (req, res) => {
    const body = projectTimeInvoiceSchema.parse(req.body || {})
    return res.json({ ...await invoiceTimeEntry(req.params.id, req.params.timeId, body, actor(req)) })
  }
)

// -------------------------------------------------------------- budget links

projectsRouter.get(
  '/:id/budget',
  requirePermission('projects.budget.read'),
  requirePermission('finance.budget.read'),
  async (req, res) => {
    return res.json({ budget: await getProjectBudgetUsage(req.params.id, actor(req)) })
  }
)

projectsRouter.post(
  '/:id/budget/links',
  requirePermission('projects.budget.link'),
  requirePermission('finance.budget.write'),
  async (req, res) => {
    const body = projectBudgetLinkCreateSchema.parse(req.body)
    return res.status(201).json({ link: await linkBudget(req.params.id, body, actor(req)) })
  }
)
