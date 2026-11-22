// Phase 5 workflow engine.
//
// Definitions hold an ordered JSON step list. Starting a workflow creates one
// PENDING task per resolved assignee for the first step; approvals advance the
// instance, rejections cancel outstanding tasks. Events carry opaque IDs only.

import { db, getTenantContext } from './tenant.js'
import { emitEvent } from './events.js'
import { canAccessBranch } from './authorize.js'
import { recordAudit, recordRequestAudit } from './audit.js'
import { HttpError } from './util.js'
import { createNotification } from './notifications.js'
import { DEFAULT_COMPANY_ID } from '../../shared/src/constants.js'

function tenantId() {
  const ctx = getTenantContext() || {}
  return ctx.companyId || DEFAULT_COMPANY_ID
}

function limitOf(value, fallback = 50) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(Math.floor(parsed), 200) : fallback
}

/** Prisma returns Json as an array, but tolerate a JSON string from seeds. */
export function parseSteps(steps) {
  if (Array.isArray(steps)) return steps
  if (typeof steps === 'string') {
    try {
      const parsed = JSON.parse(steps)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

/** Pure linear progression helper: the step after currentKey, or null. */
export function nextStep(steps, currentKey) {
  const list = parseSteps(steps)
  const index = list.findIndex((step) => step && step.key === currentKey)
  if (index === -1 || index + 1 >= list.length) return null
  return list[index + 1]
}

function isActiveUser(user) {
  return Boolean(user && user.id && (!user.status || user.status === 'ACTIVE'))
}

/**
 * Pure assignee resolution for a step.
 * 1. an explicit assigneeUserId wins;
 * 2. otherwise every active user whose role enum equals assigneeRole;
 * 3. otherwise every active ADMIN user (the fallback owner of last resort).
 */
export function resolveAssigneeIds(step, users, options = {}) {
  const fallbackRole = options.fallbackRole || 'ADMIN'
  const candidates = (Array.isArray(users) ? users : []).filter(isActiveUser)
  if (step?.assigneeUserId) return [step.assigneeUserId]
  if (step?.assigneeRole) {
    const byRole = candidates.filter((user) => user.role === step.assigneeRole)
    if (byRole.length) return [...new Set(byRole.map((user) => user.id))]
  }
  return [...new Set(candidates.filter((user) => user.role === fallbackRole).map((user) => user.id))]
}

export function isWorkflowAdmin(actor) {
  return (actor?.roles || []).includes('ADMIN')
}

function principalOf(actor) {
  const ctx = getTenantContext() || {}
  const userId = actor?.userId ?? ctx.actorId
  if (!userId) throw new HttpError(401, 'Authentication required')
  return {
    userId,
    companyId: actor?.companyId || ctx.companyId || DEFAULT_COMPANY_ID,
    roles: actor?.roles || [],
    branchIds: actor?.branchIds || [],
    req: actor?.req || null,
    correlationId: actor?.correlationId || ctx.correlationId || null,
  }
}

function assertBranchAccess(req, branchId) {
  if (branchId && req && !canAccessBranch(req, branchId)) {
    throw new HttpError(403, 'You cannot access records from this branch')
  }
}

function canSeeBranch(req, branchId) {
  return !branchId || !req || canAccessBranch(req, branchId)
}

/** HTTP mutations use recordRequestAudit (IP/user-agent); worker callers fall
 *  back to recordAudit with the actor and correlation ID they supply. */
async function auditMutation(actor, action, resourceType, resourceId, metadata = {}) {
  const ctx = getTenantContext() || {}
  const input = {
    companyId: actor?.companyId || ctx.companyId || DEFAULT_COMPANY_ID,
    actorId: actor?.userId ?? ctx.actorId ?? null,
    action,
    resourceType,
    resourceId: String(resourceId),
    metadata,
    correlationId: actor?.correlationId || ctx.correlationId || null,
  }
  if (actor?.req) return recordRequestAudit(actor.req, input)
  return recordAudit(input)
}

async function inTenantTransaction(work) {
  const ctx = getTenantContext() || {}
  const companyId = ctx.companyId || DEFAULT_COMPANY_ID
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.company_id', ${companyId}, true)`
    await tx.$executeRaw`SELECT set_config('app.branch_id', ${ctx.branchId || ''}, true)`
    return work(tx, ctx)
  })
}

function toDefinitionDto(row) {
  if (!row) return null
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description ?? null,
    version: row.version,
    steps: parseSteps(row.steps),
    active: row.active,
    classification: row.classification,
    createdById: row.createdById ?? null,
    createdAt: row.createdAt ?? null,
    updatedAt: row.updatedAt ?? null,
  }
}

function toInstanceDto(row) {
  if (!row) return null
  return {
    id: row.id,
    branchId: row.branchId ?? null,
    definitionId: row.definitionId,
    definition: row.definition
      ? { id: row.definition.id, code: row.definition.code, name: row.definition.name }
      : undefined,
    entityType: row.entityType,
    entityId: row.entityId ?? null,
    status: row.status,
    currentStep: row.currentStep ?? null,
    context: row.context ?? null,
    requestedById: row.requestedById,
    createdAt: row.createdAt ?? null,
    completedAt: row.completedAt ?? null,
    tasks: row.tasks ? row.tasks.map((task) => toTaskDto({ ...task, instance: undefined })) : undefined,
  }
}

function toTaskDto(row) {
  if (!row) return null
  return {
    id: row.id,
    instanceId: row.instanceId,
    stepKey: row.stepKey,
    title: row.title,
    assigneeId: row.assigneeId ?? null,
    delegatedFromId: row.delegatedFromId ?? null,
    status: row.status,
    decision: row.decision ?? null,
    comment: row.comment ?? null,
    dueAt: row.dueAt ?? null,
    actedAt: row.actedAt ?? null,
    createdAt: row.createdAt ?? null,
    instance: row.instance ? toInstanceDto(row.instance) : undefined,
  }
}

async function activeUsers() {
  return db.user.findMany({
    where: { companyId: tenantId(), status: 'ACTIVE' },
    select: { id: true, role: true, status: true },
  })
}

export async function listDefinitions() {
  const rows = await db.workflowDefinition.findMany({
    where: { companyId: tenantId() },
    orderBy: [{ code: 'asc' }, { version: 'desc' }],
  })
  return rows.map(toDefinitionDto)
}

export async function createDefinition(input, actor = null) {
  const principal = actor ? principalOf(actor) : null
  const companyId = tenantId()
  const latest = await db.workflowDefinition.findFirst({
    where: { companyId, code: input.code },
    orderBy: { version: 'desc' },
    select: { version: true },
  })
  const row = await db.workflowDefinition.create({
    data: {
      companyId,
      code: input.code,
      name: input.name,
      description: input.description || null,
      version: (latest?.version || 0) + 1,
      steps: input.steps,
      active: input.active ?? true,
      classification: input.classification || 'INTERNAL',
      createdById: principal?.userId ?? getTenantContext()?.actorId ?? null,
    },
  })
  await auditMutation(actor, 'workflow.definition.created', 'WorkflowDefinition', row.id, {
    code: row.code,
    version: row.version,
  })
  return toDefinitionDto(row)
}

/** Instances are filtered (not rejected) for callers without branch access. */
export async function listInstances(query = {}, req = null) {
  const rows = await db.workflowInstance.findMany({
    where: {
      companyId: tenantId(),
      ...(query.status ? { status: query.status } : {}),
      ...(query.entityType ? { entityType: query.entityType } : {}),
    },
    include: {
      definition: { select: { id: true, code: true, name: true } },
      tasks: { orderBy: { createdAt: 'asc' } },
    },
    orderBy: { createdAt: 'desc' },
    take: limitOf(query.limit),
  })
  return rows
    .filter((row) => canSeeBranch(req, row.branchId))
    .map(toInstanceDto)
}

export async function startInstance(input, actor = null) {
  const principal = principalOf(actor)
  const companyId = principal.companyId
  assertBranchAccess(principal.req, input.branchId)

  const definition = await db.workflowDefinition.findFirst({
    where: { companyId, code: input.definitionCode, active: true },
    orderBy: { version: 'desc' },
  })
  if (!definition) throw new HttpError(404, 'Active workflow definition not found')

  const steps = parseSteps(definition.steps)
  const first = steps[0]
  if (!first?.key) throw new HttpError(422, 'Workflow definition has no valid first step')

  const assigneeIds = resolveAssigneeIds(first, await activeUsers())
  if (!assigneeIds.length) throw new HttpError(422, 'No assignee could be resolved for the first workflow step')

  const result = await inTenantTransaction(async (tx) => {
    const instance = await tx.workflowInstance.create({
      data: {
        companyId,
        definitionId: definition.id,
        branchId: input.branchId || null,
        entityType: input.entityType,
        entityId: input.entityId || null,
        status: 'RUNNING',
        currentStep: first.key,
        context: input.context ?? null,
        requestedById: principal.userId,
      },
    })
    await emitEvent('WorkflowInstanceStarted', {
      instanceId: instance.id,
      definitionId: definition.id,
      requestedById: principal.userId,
      classification: definition.classification,
      entityType: input.entityType,
      entityId: input.entityId || null,
    }, {
      client: tx,
      aggregateType: 'WorkflowInstance',
      aggregateId: instance.id,
      actorId: principal.userId,
      branchId: instance.branchId,
    })

    const tasks = []
    for (const assigneeId of assigneeIds) {
      const task = await tx.workflowTask.create({
        data: {
          companyId,
          instanceId: instance.id,
          stepKey: first.key,
          title: first.label,
          assigneeId,
          status: 'PENDING',
        },
      })
      tasks.push(task)
      await emitEvent('WorkflowTaskAssigned', {
        taskId: task.id,
        instanceId: instance.id,
        stepKey: first.key,
        assigneeId,
        classification: definition.classification,
        entityType: input.entityType,
        entityId: input.entityId || null,
      }, {
        client: tx,
        aggregateType: 'WorkflowTask',
        aggregateId: task.id,
        actorId: principal.userId,
        branchId: instance.branchId,
      })
    }
    return { instance, tasks }
  })

  await auditMutation(actor, 'workflow.instance.started', 'WorkflowInstance', result.instance.id, {
    definitionId: definition.id,
    entityType: input.entityType,
    taskIds: result.tasks.map((task) => task.id),
  })
  return {
    instance: toInstanceDto(result.instance),
    tasks: result.tasks.map(toTaskDto),
  }
}

/** Default: assignees (and delegates) see their tasks, ADMIN sees all.
 *  `mine=1` restricts even administrators to their own tasks. */
export async function listMyTasks(query = {}, actor = null) {
  const principal = actor ? principalOf(actor) : null
  const mine = query.mine === true || query.mine === '1' || query.mine === 'true'
  const where = {
    companyId: tenantId(),
    ...(query.status ? { status: query.status } : {}),
  }
  if (principal && (mine || !isWorkflowAdmin(principal))) {
    where.OR = [
      { assigneeId: principal.userId },
      { delegatedFromId: principal.userId },
    ]
  }
  const rows = await db.workflowTask.findMany({
    where,
    include: { instance: { include: { definition: { select: { id: true, code: true, name: true } } } } },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    take: limitOf(query.limit),
  })
  return rows
    .filter((row) => canSeeBranch(principal?.req, row.instance?.branchId))
    .map(toTaskDto)
}

/** Optional req enforces task ownership and branch access for HTTP callers. */
export async function getTask(id, req = null) {
  return toTaskDto(await findTaskRecord(id, req))
}

async function findTaskRecord(id, req = null) {
  const row = await db.workflowTask.findFirst({
    where: { id, companyId: tenantId() },
    include: { instance: { include: { definition: true } } },
  })
  if (!row) throw new HttpError(404, 'Workflow task not found')
  if (req?.auth) {
    const roles = req.auth.roles || []
    const related = row.assigneeId === req.auth.userId || row.delegatedFromId === req.auth.userId
    if (!roles.includes('ADMIN') && !related) throw new HttpError(404, 'Workflow task not found')
    assertBranchAccess(req, row.instance?.branchId)
  }
  return row
}

export async function decideTask(id, input, actor = null) {
  const principal = principalOf(actor)
  const task = await findTaskRecord(id)
  assertBranchAccess(principal.req, task.instance?.branchId)
  if (task.assigneeId !== principal.userId && !isWorkflowAdmin(principal)) {
    throw new HttpError(403, 'Only the assignee or an administrator can decide this task')
  }
  if (task.status !== 'PENDING') throw new HttpError(409, 'This task has already been actioned')

  const definition = task.instance.definition
  const next = input.decision === 'APPROVED'
    ? nextStep(parseSteps(definition.steps), task.stepKey)
    : null
  const nextAssignees = next ? resolveAssigneeIds(next, await activeUsers()) : []
  if (next && !nextAssignees.length) {
    throw new HttpError(422, 'No assignee could be resolved for the next workflow step')
  }

  const now = new Date()
  const result = await inTenantTransaction(async (tx) => {
    const updatedTask = await tx.workflowTask.update({
      where: { id: task.id },
      data: {
        status: input.decision,
        decision: input.decision,
        comment: input.comment || null,
        actedAt: now,
      },
    })

    let instance
    const createdTasks = []
    if (input.decision === 'REJECTED') {
      await tx.workflowTask.updateMany({
        where: { companyId: tenantId(), instanceId: task.instanceId, status: 'PENDING' },
        data: { status: 'CANCELLED' },
      })
      instance = await tx.workflowInstance.update({
        where: { id: task.instanceId },
        data: { status: 'REJECTED', completedAt: now },
      })
    } else if (next) {
      instance = await tx.workflowInstance.update({
        where: { id: task.instanceId },
        data: { currentStep: next.key },
      })
      for (const assigneeId of nextAssignees) {
        const created = await tx.workflowTask.create({
          data: {
            companyId: tenantId(),
            instanceId: task.instanceId,
            stepKey: next.key,
            title: next.label,
            assigneeId,
            status: 'PENDING',
          },
        })
        createdTasks.push(created)
        await emitEvent('WorkflowTaskAssigned', {
          taskId: created.id,
          instanceId: task.instanceId,
          stepKey: next.key,
          assigneeId,
          classification: definition.classification,
          entityType: task.instance.entityType,
          entityId: task.instance.entityId || null,
        }, {
          client: tx,
          aggregateType: 'WorkflowTask',
          aggregateId: created.id,
          actorId: principal.userId,
          branchId: task.instance.branchId,
        })
      }
    } else {
      instance = await tx.workflowInstance.update({
        where: { id: task.instanceId },
        data: { status: 'COMPLETED', completedAt: now },
      })
    }

    if (input.decision === 'REJECTED' || !next) {
      await emitEvent('WorkflowCompleted', {
        instanceId: task.instanceId,
        definitionId: definition.id,
        decision: input.decision,
        requestedById: task.instance.requestedById,
        classification: definition.classification,
        entityType: task.instance.entityType,
        entityId: task.instance.entityId || null,
      }, {
        client: tx,
        aggregateType: 'WorkflowInstance',
        aggregateId: task.instanceId,
        actorId: principal.userId,
        branchId: instance.branchId,
      })
    }
    return { updatedTask, instance, createdTasks }
  })

  // In-app notice to the requester. Text is generic: no comments, context or
  // entity content crosses into the notification.
  await createNotification({
    userId: task.instance.requestedById,
    category: 'WORKFLOW',
    title: 'Workflow update',
    message: `Workflow ${definition.name} was ${input.decision === 'APPROVED' ? 'approved' : 'rejected'}`,
    classification: definition.classification,
    entityType: 'WORKFLOW',
    entityId: task.instanceId,
    actorId: principal.userId,
    correlationId: principal.correlationId || undefined,
  })

  await auditMutation(actor, 'workflow.task.decided', 'WorkflowTask', task.id, {
    instanceId: task.instanceId,
    stepKey: task.stepKey,
    decision: input.decision,
  })
  return {
    task: toTaskDto(result.updatedTask),
    instance: toInstanceDto(result.instance),
    tasks: result.createdTasks.map(toTaskDto),
  }
}

/**
 * Delegation keeps an audit trail: the original PENDING task becomes DELEGATED
 * and a fresh PENDING task is created for the same step and new assignee.
 */
export async function delegateTask(id, input, actor = null) {
  const principal = principalOf(actor)
  const task = await findTaskRecord(id)
  assertBranchAccess(principal.req, task.instance?.branchId)
  if (task.assigneeId !== principal.userId && !isWorkflowAdmin(principal)) {
    throw new HttpError(403, 'Only the assignee or an administrator can delegate this task')
  }
  if (task.status !== 'PENDING') throw new HttpError(409, 'Only pending tasks can be delegated')

  const target = await db.user.findFirst({
    where: { companyId: tenantId(), id: input.toUserId, status: 'ACTIVE' },
    select: { id: true },
  })
  if (!target) throw new HttpError(404, 'Delegatee not found')
  if (target.id === task.assigneeId) throw new HttpError(422, 'Cannot delegate to the current assignee')

  const result = await inTenantTransaction(async (tx) => {
    const delegated = await tx.workflowTask.update({
      where: { id: task.id },
      data: { status: 'DELEGATED', comment: input.comment || null },
    })
    const fresh = await tx.workflowTask.create({
      data: {
        companyId: tenantId(),
        instanceId: task.instanceId,
        stepKey: task.stepKey,
        title: task.title,
        assigneeId: target.id,
        delegatedFromId: task.assigneeId || principal.userId,
        status: 'PENDING',
      },
    })
    await emitEvent('WorkflowTaskAssigned', {
      taskId: fresh.id,
      instanceId: task.instanceId,
      stepKey: task.stepKey,
      assigneeId: target.id,
      classification: task.instance.definition.classification,
      entityType: task.instance.entityType,
      entityId: task.instance.entityId || null,
    }, {
      client: tx,
      aggregateType: 'WorkflowTask',
      aggregateId: fresh.id,
      actorId: principal.userId,
      branchId: task.instance.branchId,
    })
    return { delegated, fresh }
  })

  await auditMutation(actor, 'workflow.task.delegated', 'WorkflowTask', task.id, {
    instanceId: task.instanceId,
    delegatedTaskId: result.fresh.id,
    toUserId: target.id,
  })
  return {
    task: toTaskDto(result.delegated),
    delegatedTask: toTaskDto(result.fresh),
  }
}
