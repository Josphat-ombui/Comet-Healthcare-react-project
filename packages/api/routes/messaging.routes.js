// Internal messaging HTTP surface. Routes validate, authorise and audit;
// business rules live in lib/messaging.js.

import { Router } from 'express'
import { requireAuth } from '../lib/auth.js'
import { requirePermission, canAccessBranch } from '../lib/authorize.js'
import { recordRequestAudit } from '../lib/audit.js'
import { messagingService } from '../lib/messaging.js'
import { HttpError } from '../lib/util.js'
import {
  createInboxSchema, createThreadSchema, threadQuerySchema, updateThreadSchema,
  assignThreadSchema, sendMessageSchema, editMessageSchema, reactionSchema,
  messageQuerySchema, createChannelSchema, routingEvaluateSchema,
} from '../lib/validation.js'

export const messagingRouter = Router()

messagingRouter.use(requireAuth)

function principal(req) {
  return {
    userId: req.auth.userId,
    companyId: req.auth.companyId,
    branchId: req.auth.branchId,
    branchIds: req.auth.branchIds,
    departmentId: req.auth.departmentId,
    roles: req.auth.roles,
  }
}

async function audit(req, action, resourceType, resourceId, metadata = {}) {
  return recordRequestAudit(req, { action, resourceType, resourceId, metadata })
}

function assertBranch(req, branchId) {
  if (branchId && !canAccessBranch(req, branchId)) {
    throw new HttpError(403, 'You cannot access records from this branch')
  }
}

// ---------------------------------------------------------------- inboxes

messagingRouter.get('/inboxes', requirePermission('messaging.inbox.read'), async (req, res) => {
  return res.json({ inboxes: await messagingService.listInboxes(principal(req)) })
})

messagingRouter.post('/inboxes', requirePermission('messaging.inbox.manage'), async (req, res) => {
  const body = createInboxSchema.parse(req.body)
  const inbox = await messagingService.createInbox(principal(req), body)
  await audit(req, 'MESSAGE_INBOX_CREATED', 'Inbox', inbox.id, { code: inbox.code, kind: inbox.kind })
  return res.status(201).json({ inbox })
})

messagingRouter.get('/inboxes/:id/members', requirePermission('messaging.inbox.read'), async (req, res) => {
  const members = await messagingService.listInboxMembers(principal(req), req.params.id)
  return res.json({ members })
})

// ---------------------------------------------------------------- threads

messagingRouter.get('/threads', requirePermission('messaging.inbox.read'), async (req, res) => {
  const query = threadQuerySchema.parse(req.query)
  if (query.inboxId) {
    const inboxes = await messagingService.listInboxes(principal(req))
    const inbox = inboxes.find((item) => item.id === query.inboxId)
    if (!inbox) return res.status(404).json({ error: 'Inbox not found' })
    assertBranch(req, inbox.branchId)
  }
  return res.json({ threads: await messagingService.listThreads(principal(req), query) })
})

messagingRouter.post('/threads', requirePermission('messaging.thread.write'), async (req, res) => {
  const body = createThreadSchema.parse(req.body)
  const p = principal(req)
  if (body.branchId) assertBranch(req, body.branchId)
  const { thread, dlpTypes } = await messagingService.createThread(p, body)
  await audit(req, 'MESSAGE_THREAD_CREATED', 'Thread', thread.id, {
    inboxId: thread.inboxId, channelId: thread.channelId, dlpTypes,
  })
  return res.status(201).json({ thread })
})

messagingRouter.get('/threads/:id', requirePermission('messaging.inbox.read'), async (req, res) => {
  const thread = await messagingService.getThread(principal(req), req.params.id)
  assertBranch(req, thread.branchId)
  return res.json({ thread })
})

messagingRouter.patch('/threads/:id', requirePermission('messaging.thread.write'), async (req, res) => {
  const body = updateThreadSchema.parse(req.body)
  const thread = await messagingService.updateThread(principal(req), req.params.id, body)
  await audit(req, 'MESSAGE_THREAD_UPDATED', 'Thread', thread.id, { status: thread.status, archived: thread.archived })
  return res.json({ thread })
})

messagingRouter.post('/threads/:id/assign', requirePermission('messaging.thread.assign'), async (req, res) => {
  const body = assignThreadSchema.parse(req.body)
  const thread = await messagingService.assignThread(principal(req), req.params.id, body.assignedToId)
  await audit(req, 'MESSAGE_THREAD_ASSIGNED', 'Thread', thread.id, { assignedToId: body.assignedToId })
  return res.json({ thread })
})

messagingRouter.post('/threads/:id/resolve', requirePermission('messaging.thread.resolve'), async (req, res) => {
  const thread = await messagingService.resolveThread(principal(req), req.params.id)
  await audit(req, 'MESSAGE_THREAD_RESOLVED', 'Thread', thread.id, { status: thread.status })
  return res.json({ thread })
})

messagingRouter.get('/threads/:id/messages', requirePermission('messaging.inbox.read'), async (req, res) => {
  const query = messageQuerySchema.parse(req.query)
  const messages = await messagingService.listMessages(principal(req), req.params.id, query)
  return res.json({ messages })
})

messagingRouter.post('/threads/:id/messages', requirePermission('messaging.message.send'), async (req, res) => {
  const body = sendMessageSchema.parse(req.body)
  const key = req.get('Idempotency-Key') || req.get('idempotency-key') || ''
  const result = await messagingService.sendMessage(principal(req), req.params.id, body, key)
  if (!result.replay) {
    await audit(req, 'MESSAGE_SENT', 'Message', result.message.id, {
      threadId: req.params.id,
      visibility: result.message.visibility,
      dlpTypes: result.dlpTypes,
    })
  }
  return res.status(result.replay ? 200 : 201).json(result)
})

// ---------------------------------------------------------------- messages

messagingRouter.post('/messages/:id/recall', requirePermission('messaging.message.recall'), async (req, res) => {
  const message = await messagingService.recallMessage(principal(req), req.params.id)
  await audit(req, 'MESSAGE_RECALLED', 'Message', message.id, { threadId: message.threadId })
  return res.json({ message })
})

messagingRouter.post('/messages/:id/edit', requirePermission('messaging.message.edit'), async (req, res) => {
  const body = editMessageSchema.parse(req.body)
  const result = await messagingService.editMessage(principal(req), req.params.id, body)
  await audit(req, 'MESSAGE_EDITED', 'Message', result.message.id, {
    threadId: result.message.threadId, reason: body.reason || null, dlpTypes: result.dlpTypes,
  })
  return res.json({ message: result.message })
})

messagingRouter.post('/messages/:id/reactions', requirePermission('messaging.message.react'), async (req, res) => {
  const body = reactionSchema.parse(req.body)
  const result = await messagingService.addReaction(principal(req), req.params.id, body.emoji)
  if (result.created) await audit(req, 'MESSAGE_REACTION_ADDED', 'Message', req.params.id, { emoji: body.emoji })
  return res.status(result.created ? 201 : 200).json(result)
})

messagingRouter.delete('/messages/:id/reactions/:emoji', requirePermission('messaging.message.react'), async (req, res) => {
  const emoji = decodeURIComponent(req.params.emoji)
  const result = await messagingService.removeReaction(principal(req), req.params.id, emoji)
  await audit(req, 'MESSAGE_REACTION_REMOVED', 'Message', req.params.id, { emoji })
  return res.json({ removed: result.count > 0 })
})

messagingRouter.post('/messages/:id/read', requirePermission('messaging.inbox.read'), async (req, res) => {
  const result = await messagingService.markRead(principal(req), req.params.id)
  return res.json(result)
})

// ---------------------------------------------------------------- channels

messagingRouter.get('/channels', requirePermission('messaging.channel.read'), async (req, res) => {
  return res.json({ channels: await messagingService.listChannels(principal(req)) })
})

messagingRouter.post('/channels', requirePermission('messaging.thread.write'), async (req, res) => {
  const body = createChannelSchema.parse(req.body)
  const channel = await messagingService.createChannel(principal(req), body)
  await audit(req, 'MESSAGE_CHANNEL_CREATED', 'Channel', channel.id, { name: channel.name })
  return res.status(201).json({ channel })
})

messagingRouter.post('/channels/:id/join', requirePermission('messaging.channel.read'), async (req, res) => {
  const result = await messagingService.joinChannel(principal(req), req.params.id)
  await audit(req, 'MESSAGE_CHANNEL_JOINED', 'Channel', req.params.id, {})
  return res.json(result)
})

// -------------------------------------------------------- routing / realtime

messagingRouter.post('/routing/evaluate', requirePermission('messaging.inbox.read'), async (req, res) => {
  const body = routingEvaluateSchema.parse(req.body)
  const match = await messagingService.evaluateRouting(principal(req), body)
  return res.json({ match })
})

messagingRouter.get('/realtime-token', requirePermission('messaging.inbox.read'), async (req, res) => {
  const result = await messagingService.issueRealtimeToken(principal(req))
  return res.json(result)
})
