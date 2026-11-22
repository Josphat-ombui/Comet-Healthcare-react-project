// Phase 4 messaging business rules.
//
// Routes validate and authorise; this module enforces inbox/thread access,
// internal-note visibility, recipient resolution, DLP and event emission.

import { db } from './tenant.js'
import { emitEvent } from './events.js'
import { enforceDlp } from './dlp.js'
import { HttpError } from './util.js'
import { signRealtimeToken } from './session.js'
import * as repo from './messaging-repository.js'

const DEFAULT_TIMEOUT = 10_000

async function scopedTransaction(companyId, branchId, work) {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.company_id', ${companyId}, true)`
    await tx.$executeRaw`SELECT set_config('app.branch_id', ${branchId || ''}, true)`
    return work(tx)
  }, { timeout: DEFAULT_TIMEOUT })
}

function principalOf(principal) {
  if (!principal?.userId || !principal?.companyId) throw new HttpError(401, 'Authentication required')
  return {
    userId: principal.userId,
    companyId: principal.companyId,
    branchId: principal.branchId || null,
    branchIds: principal.branchIds || [],
    departmentId: principal.departmentId || null,
    roles: principal.roles || [],
  }
}

async function assertThreadAccess(principal, thread) {
  if (!thread) throw new HttpError(404, 'Thread not found')
  if (repo.isOrgWide(principal)) return

  if (thread.createdById === principal.userId || thread.assignedToId === principal.userId) return

  if (thread.inboxId) {
    const access = await repo.getInboxAccess(principal.companyId, principal, thread.inboxId)
    if (access) return
  }

  const receipt = await db.messageRecipient.findFirst({
    where: {
      companyId: principal.companyId,
      userId: principal.userId,
      message: { threadId: thread.id },
    },
    select: { id: true },
  })
  if (!receipt) throw new HttpError(404, 'Thread not found')
}

async function requireManageableThread(principal, thread) {
  if (!thread.inboxId) return
  const access = await repo.getInboxAccess(principal.companyId, principal, thread.inboxId)
  if (access !== 'MANAGER' && access !== 'AGENT' && !repo.isOrgWide(principal)) {
    throw new HttpError(403, 'You cannot manage this shared inbox thread')
  }
}

async function canSeeInternalNotes(principal, thread) {
  if (repo.isOrgWide(principal)) return true
  if (!thread.inboxId) return false
  const access = await repo.getInboxAccess(principal.companyId, principal, thread.inboxId)
  return access === 'MANAGER' || access === 'AGENT'
}

function toMessageDto(message, options = {}) {
  if (message.visibility === 'INTERNAL' && !options.internalVisible && message.senderId !== options.viewerId) {
    return null
  }
  const recipients = (message.recipients || [])
    .filter((recipient) => options.viewerIsSender || !recipient.isBcc)
    .map((recipient) => ({
      userId: recipient.userId,
      inboxId: recipient.inboxId,
      inboxName: recipient.inbox?.name || null,
      name: recipient.user ? `${recipient.user.firstName} ${recipient.user.lastName}` : null,
      status: recipient.status,
      deliveredAt: recipient.deliveredAt,
      readAt: recipient.readAt,
    }))

  return {
    id: message.id,
    threadId: message.threadId,
    senderId: message.senderId,
    senderName: message.sender
      ? `${message.sender.firstName} ${message.sender.lastName}`
      : message.senderInbox?.name || 'System',
    senderInboxId: message.senderInboxId,
    body: message.recalledAt ? '[This message was recalled]' : message.body,
    visibility: message.visibility,
    priority: message.priority,
    classification: message.classification,
    recalledAt: message.recalledAt,
    editedAt: message.editedAt,
    createdAt: message.createdAt,
    reactions: (message.reactions || []).map((reaction) => ({
      id: reaction.id, userId: reaction.userId, emoji: reaction.emoji, createdAt: reaction.createdAt,
    })),
    receipts: message.visibility === 'INTERNAL' ? [] : recipients,
    edits: message.edits || [],
    attachments: message.attachments || [],
  }
}

function eventRecipientIds(recipients) {
  return {
    userIds: recipients.map((row) => row.userId).filter(Boolean),
    inboxIds: recipients.map((row) => row.inboxId).filter(Boolean),
  }
}

export const messagingService = {
  // ------------------------------------------------------------- inboxes
  async listInboxes(principalInput) {
    const principal = principalOf(principalInput)
    return repo.listInboxes(principal.companyId, principal)
  },

  async createInbox(principalInput, input) {
    const principal = principalOf(principalInput)
    return repo.createInbox(principal.companyId, input)
  },

  async listInboxMembers(principalInput, inboxId) {
    const principal = principalOf(principalInput)
    const inbox = await repo.findInbox(principal.companyId, inboxId)
    if (!inbox) throw new HttpError(404, 'Inbox not found')
    if (!repo.isOrgWide(principal)) {
      const access = await repo.getInboxAccess(principal.companyId, principal, inboxId)
      if (!access) throw new HttpError(403, 'You are not a member of this inbox')
    }
    return repo.listInboxMembers(principal.companyId, inboxId)
  },

  // ------------------------------------------------------------- threads
  async listThreads(principalInput, query) {
    const principal = principalOf(principalInput)
    return repo.listThreads(principal.companyId, principal, query)
  },

  async getThread(principalInput, threadId) {
    const principal = principalOf(principalInput)
    const thread = await repo.findThread(principal.companyId, threadId)
    await assertThreadAccess(principal, thread)
    return {
      ...thread,
      access: repo.isOrgWide(principal) ? 'MANAGER' : await repo.getInboxAccess(principal.companyId, principal, thread.inboxId),
      canSeeInternal: await canSeeInternalNotes(principal, thread),
    }
  },

  async createThread(principalInput, input) {
    const principal = principalOf(principalInput)
    if (input.inboxId) {
      const access = await repo.getInboxAccess(principal.companyId, principal, input.inboxId)
      if (!access && !repo.isOrgWide(principal)) throw new HttpError(403, 'You cannot post to this inbox')
    }
    if (input.channelId) {
      const channels = await repo.listChannels(principal.companyId, principal)
      if (!channels.some((channel) => channel.id === input.channelId)) {
        throw new HttpError(403, 'You cannot post to this channel')
      }
    }

    const recipients = input.recipients?.length
      ? await repo.resolveInternalRecipients(principal.companyId, input.recipients, principal.userId)
      : []
    if (!input.inboxId && !input.channelId && !recipients.length) {
      throw new HttpError(422, 'Add at least one internal recipient or choose an inbox')
    }
    const dlp = enforceDlp({ body: input.subject })
    const thread = await repo.createThread(principal.companyId, principal, input)
    return { thread, dlpTypes: dlp.types }
  },

  async updateThread(principalInput, threadId, patch) {
    const principal = principalOf(principalInput)
    const thread = await repo.findThread(principal.companyId, threadId)
    await assertThreadAccess(principal, thread)
    await requireManageableThread(principal, thread)
    return repo.updateThread(principal.companyId, threadId, patch)
  },

  async assignThread(principalInput, threadId, assignedToId) {
    const principal = principalOf(principalInput)
    const thread = await repo.findThread(principal.companyId, threadId)
    await assertThreadAccess(principal, thread)
    await requireManageableThread(principal, thread)

    const updated = await repo.assignThread(principal.companyId, threadId, assignedToId)
    await emitEvent('ThreadAssigned', {
      threadId,
      inboxId: thread.inboxId || null,
      assignedToId: assignedToId || null,
      assignedById: principal.userId,
    }, { aggregateType: 'Thread', aggregateId: threadId })
    return updated
  },

  async resolveThread(principalInput, threadId, status = 'RESOLVED') {
    const principal = principalOf(principalInput)
    const thread = await repo.findThread(principal.companyId, threadId)
    await assertThreadAccess(principal, thread)
    await requireManageableThread(principal, thread)

    const updated = await repo.updateThread(principal.companyId, threadId, { status })
    await emitEvent('ThreadResolved', {
      threadId,
      inboxId: thread.inboxId || null,
      status,
      resolvedById: principal.userId,
    }, { aggregateType: 'Thread', aggregateId: threadId })
    return updated
  },

  // ------------------------------------------------------------ messages
  async sendMessage(principalInput, threadId, input, idempotencyKey) {
    const principal = principalOf(principalInput)
    if (!idempotencyKey || idempotencyKey.length > 200) {
      throw new HttpError(400, 'An Idempotency-Key header is required for message sends')
    }
    const thread = await repo.findThread(principal.companyId, threadId)
    await assertThreadAccess(principal, thread)

    const key = `${principal.companyId}:${idempotencyKey}`
    const existing = await repo.findByIdempotencyKey(principal.companyId, key)
    if (existing) {
      const detail = await repo.findMessageDetail(principal.companyId, existing.id)
      return {
        message: toMessageDto(detail, {
          internalVisible: await canSeeInternalNotes(principal, thread),
          viewerId: principal.userId,
          viewerIsSender: detail.senderId === principal.userId,
        }),
        replay: true,
      }
    }

    if (input.visibility === 'INTERNAL' && !(await canSeeInternalNotes(principal, thread))) {
      throw new HttpError(403, 'You cannot post internal notes in this thread')
    }

    const recipients = input.recipients?.length
      ? await repo.resolveInternalRecipients(principal.companyId, input.recipients, principal.userId)
      : await repo.threadParticipantRecipients(principal.companyId, thread, principal.userId)
    if (!recipients.length) {
      throw new HttpError(422, 'There are no internal recipients for this reply')
    }

    const dlp = enforceDlp({ body: input.body, subject: thread.subject })
    const visibleUsers = await repo.internalNoteViewerIds(principal.companyId, thread, principal.userId)
    const eventRecipients = input.visibility === 'INTERNAL'
      ? visibleUsers.map((userId) => ({ userId, inboxId: null }))
      : recipients

    const message = await scopedTransaction(principal.companyId, principal.branchId, async (tx) => {
      const deliveredAt = new Date()
      const row = await repo.insertMessageWithRecipients(
        tx,
        principal.companyId,
        {
          threadId,
          companyId: principal.companyId,
          branchId: thread.branchId || principal.branchId || null,
          senderId: principal.userId,
          body: input.body,
          visibility: input.visibility,
          priority: input.priority || thread.priority,
          classification: input.classification || thread.classification,
          idempotencyKey: key,
        },
        recipients.map((recipient) => ({
          ...recipient,
          status: 'DELIVERED',
          deliveredAt,
        }))
      )
      await tx.thread.update({
        where: { id: threadId },
        data: { lastMessageAt: deliveredAt, status: thread.status === 'RESOLVED' ? 'OPEN' : thread.status },
      })
      const ids = eventRecipientIds(eventRecipients)
      await emitEvent('MessageSent', {
        messageId: row.id,
        threadId,
        inboxId: thread.inboxId || null,
        channelId: thread.channelId || null,
        visibility: row.visibility,
        classification: row.classification,
        recipientUserIds: ids.userIds,
        recipientInboxIds: ids.inboxIds,
      }, {
        client: tx,
        aggregateType: 'Message',
        aggregateId: row.id,
        branchId: row.branchId,
      })
      return row
    })

    const detail = await repo.findMessageDetail(principal.companyId, message.id)
    return {
      message: toMessageDto(detail, {
        internalVisible: await canSeeInternalNotes(principal, thread),
        viewerId: principal.userId,
        viewerIsSender: true,
      }),
      replay: false,
      dlpTypes: dlp.types,
    }
  },

  async listMessages(principalInput, threadId, query) {
    const principal = principalOf(principalInput)
    const thread = await repo.findThread(principal.companyId, threadId)
    await assertThreadAccess(principal, thread)
    const internalVisible = await canSeeInternalNotes(principal, thread)
    const rows = await repo.listMessages(principal.companyId, threadId, query)
    return rows
      .map((row) => toMessageDto(row, {
        internalVisible,
        viewerId: principal.userId,
        viewerIsSender: row.senderId === principal.userId,
      }))
      .filter(Boolean)
  },

  async recallMessage(principalInput, messageId) {
    const principal = principalOf(principalInput)
    const message = await repo.findMessage(principal.companyId, messageId)
    if (!message) throw new HttpError(404, 'Message not found')
    const thread = await repo.findThread(principal.companyId, message.threadId)
    await assertThreadAccess(principal, thread)
    if (message.senderId !== principal.userId && !repo.isOrgWide(principal)) {
      throw new HttpError(403, 'Only the sender or an administrator can recall this message')
    }
    if (message.recalledAt) throw new HttpError(409, 'Message has already been recalled')

    const updated = await repo.recallMessage(principal.companyId, messageId, principal.userId)
    const ids = eventRecipientIds(message.recipients || [])
    await emitEvent('MessageRecalled', {
      messageId,
      threadId: message.threadId,
      recalledById: principal.userId,
      recipientUserIds: ids.userIds,
      recipientInboxIds: ids.inboxIds,
    }, { aggregateType: 'Message', aggregateId: messageId })
    return updated
  },

  async editMessage(principalInput, messageId, input) {
    const principal = principalOf(principalInput)
    const message = await repo.findMessage(principal.companyId, messageId)
    if (!message) throw new HttpError(404, 'Message not found')
    const thread = await repo.findThread(principal.companyId, message.threadId)
    await assertThreadAccess(principal, thread)
    if (message.senderId !== principal.userId && !repo.isOrgWide(principal)) {
      throw new HttpError(403, 'Only the sender or an administrator can edit this message')
    }
    if (message.recalledAt) throw new HttpError(409, 'Recalled messages cannot be edited')

    const dlp = enforceDlp({ body: input.body })
    const updated = await repo.editMessage(principal.companyId, messageId, principal.userId, input.body, input.reason)
    return { message: updated, dlpTypes: dlp.types }
  },

  async addReaction(principalInput, messageId, emoji) {
    const principal = principalOf(principalInput)
    const message = await repo.findMessage(principal.companyId, messageId)
    if (!message) throw new HttpError(404, 'Message not found')
    const thread = await repo.findThread(principal.companyId, message.threadId)
    await assertThreadAccess(principal, thread)
    if (message.visibility === 'INTERNAL' && !(await canSeeInternalNotes(principal, thread))) {
      throw new HttpError(403, 'You cannot react to this internal note')
    }

    const result = await repo.addReaction(principal.companyId, messageId, principal.userId, emoji)
    if (result.created) {
      await emitEvent('ReactionAdded', {
        messageId,
        threadId: message.threadId,
        userId: principal.userId,
        emoji,
      }, { aggregateType: 'Message', aggregateId: messageId })
    }
    return result
  },

  async removeReaction(principalInput, messageId, emoji) {
    const principal = principalOf(principalInput)
    const message = await repo.findMessage(principal.companyId, messageId)
    if (!message) throw new HttpError(404, 'Message not found')
    const thread = await repo.findThread(principal.companyId, message.threadId)
    await assertThreadAccess(principal, thread)
    return repo.removeReaction(principal.companyId, messageId, principal.userId, emoji)
  },

  async markRead(principalInput, messageId) {
    const principal = principalOf(principalInput)
    const message = await repo.findMessage(principal.companyId, messageId)
    if (!message) throw new HttpError(404, 'Message not found')
    const thread = await repo.findThread(principal.companyId, message.threadId)
    await assertThreadAccess(principal, thread)
    if (message.visibility === 'INTERNAL') return { recorded: false }
    const result = await repo.markRecipientRead(principal.companyId, messageId, principal.userId)
    return { recorded: result.count > 0 }
  },

  // ------------------------------------------------------------ channels
  async listChannels(principalInput) {
    const principal = principalOf(principalInput)
    return repo.listChannels(principal.companyId, principal)
  },

  async createChannel(principalInput, input) {
    const principal = principalOf(principalInput)
    return repo.createChannel(principal.companyId, principal, input)
  },

  async joinChannel(principalInput, channelId) {
    const principal = principalOf(principalInput)
    return repo.joinChannel(principal.companyId, channelId, principal.userId)
  },

  // ------------------------------------------------------------- routing
  async evaluateRouting(principalInput, input) {
    const principal = principalOf(principalInput)
    return repo.evaluateRoutingRules(principal.companyId, input)
  },

  // ------------------------------------------------------------ realtime
  async issueRealtimeToken(principalInput) {
    const principal = principalOf(principalInput)
    const [inboxIds, threads, channels] = await Promise.all([
      repo.accessibleInboxIds(principal.companyId, principal),
      repo.listThreads(principal.companyId, principal, { limit: 200 }),
      repo.listChannels(principal.companyId, principal),
    ])
    const prefix = `company:${principal.companyId}`
    const rooms = [
      prefix,
      `${prefix}:user:${principal.userId}`,
      ...(principal.branchIds || []).map((branchId) => `${prefix}:branch:${branchId}`),
      ...inboxIds.map((id) => `${prefix}:inbox:${id}`),
      ...threads.map((thread) => `${prefix}:thread:${thread.id}`),
      ...channels.map((channel) => `${prefix}:channel:${channel.id}`),
    ]
    return { token: signRealtimeToken(principal, rooms), rooms: [...new Set(rooms)] }
  },
}
