// Phase 4 messaging data access. Every query goes through the tenant-scoped
// `db` proxy; callers also pass companyId explicitly for defence in depth.

import { db } from './tenant.js'
import { HttpError } from './util.js'

export function isOrgWide(principal) {
  const roles = principal.roles || []
  return roles.includes('ADMIN') || roles.includes('COMPLIANCE')
}

const INBOX_SELECT = {
  id: true, code: true, name: true, internalAddress: true, kind: true,
  branchId: true, departmentId: true, ownerUserId: true, classification: true, isActive: true,
}

const THREAD_SELECT = {
  id: true, companyId: true, branchId: true, inboxId: true, channelId: true,
  subject: true, status: true, priority: true, dueDate: true, assignedToId: true,
  createdById: true, lastMessageAt: true, snoozedUntil: true, archived: true,
  classification: true, createdAt: true, updatedAt: true,
}

const MESSAGE_SELECT = {
  id: true, companyId: true, threadId: true, senderId: true, senderInboxId: true,
  body: true, visibility: true, priority: true, classification: true,
  recalledAt: true, recalledBy: true, editedAt: true, createdAt: true,
}

// ---------------------------------------------------------------- inboxes

export async function listInboxes(companyId, principal) {
  const where = { companyId, isActive: true, deletedAt: null }
  if (!isOrgWide(principal) && principal.branchIds?.length) {
    where.branchId = { in: [...principal.branchIds, null] }
  }
  return db.inbox.findMany({ where, orderBy: { name: 'asc' }, select: INBOX_SELECT })
}

export async function findInbox(companyId, inboxId) {
  return db.inbox.findFirst({ where: { id: inboxId, companyId, deletedAt: null }, select: INBOX_SELECT })
}

export async function createInbox(companyId, input) {
  return db.inbox.create({
    data: {
      companyId,
      code: input.code,
      name: input.name,
      kind: input.kind,
      internalAddress: input.internalAddress || `${input.code}@internal`,
      branchId: input.branchId || null,
      departmentId: input.departmentId || null,
      description: input.description || null,
      classification: input.classification,
    },
    select: INBOX_SELECT,
  })
}

export async function listInboxMembers(companyId, inboxId) {
  const rows = await db.inboxMembership.findMany({
    where: { companyId, inboxId },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true, userId: true, role: true, canAssign: true, notify: true,
      user: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  })
  return rows.map((row) => ({
    id: row.id, userId: row.userId, role: row.role,
    canAssign: row.canAssign, notify: row.notify, user: row.user,
  }))
}

export async function getInboxAccess(companyId, principal, inboxId) {
  if (!inboxId) return null
  if (isOrgWide(principal)) return 'MANAGER'
  const inbox = await findInbox(companyId, inboxId)
  if (!inbox) return null
  if (inbox.ownerUserId === principal.userId) return 'MANAGER'
  const membership = await db.inboxMembership.findFirst({
    where: { companyId, inboxId, userId: principal.userId },
    select: { role: true, canAssign: true },
  })
  if (!membership) return null
  return membership.role === 'MANAGER' ? 'MANAGER' : membership.canAssign ? 'AGENT' : 'MEMBER'
}

/** Inboxes whose threads a principal may see. */
export async function accessibleInboxIds(companyId, principal) {
  const inboxes = await db.inbox.findMany({
    where: { companyId, isActive: true, deletedAt: null },
    select: {
      id: true, code: true, kind: true, branchId: true, departmentId: true,
      ownerUserId: true,
      memberships: { where: { userId: principal.userId }, select: { id: true } },
    },
  })
  if (isOrgWide(principal)) return inboxes.map((inbox) => inbox.id)

  const roleCodes = (principal.roles || []).map((role) => role.toLowerCase())
  return inboxes
    .filter((inbox) => (
      inbox.memberships.length > 0 ||
      inbox.ownerUserId === principal.userId ||
      (inbox.departmentId && inbox.departmentId === principal.departmentId) ||
      (inbox.kind === 'BRANCH' && inbox.branchId && (principal.branchIds || []).includes(inbox.branchId)) ||
      (inbox.kind === 'ROLE' && roleCodes.some((code) => inbox.code.toLowerCase().includes(code)))
    ))
    .map((inbox) => inbox.id)
}

// ---------------------------------------------------------------- threads

export async function listThreads(companyId, principal, query) {
  const inboxIds = await accessibleInboxIds(companyId, principal)
  const recipientRows = await db.messageRecipient.findMany({
    where: { companyId, userId: principal.userId },
    select: { message: { select: { threadId: true } } },
    take: 1000,
  })
  const receivedThreadIds = [...new Set(recipientRows.map((row) => row.message.threadId))]

  const or = [
    { inboxId: { in: inboxIds } },
    { createdById: principal.userId },
    { assignedToId: principal.userId },
    { id: { in: receivedThreadIds } },
  ]
  const where = {
    companyId,
    deletedAt: null,
    OR: or,
    ...(query.status ? { status: query.status } : {}),
    ...(query.inboxId ? { inboxId: query.inboxId } : {}),
    ...(query.channelId ? { channelId: query.channelId } : {}),
    ...(query.assignedToId ? { assignedToId: query.assignedToId } : {}),
    ...(query.archived ? { archived: query.archived === 'true' } : {}),
  }
  const threads = await db.thread.findMany({
    where,
    orderBy: [{ lastMessageAt: 'desc' }, { createdAt: 'desc' }],
    take: query.limit,
    select: {
      ...THREAD_SELECT,
      inbox: { select: { id: true, name: true, code: true } },
      channel: { select: { id: true, name: true } },
      assignedTo: { select: { id: true, firstName: true, lastName: true } },
      _count: { select: { messages: true } },
    },
  })
  return threads.map((thread) => ({
    ...thread,
    messageCount: thread._count.messages,
    _count: undefined,
  }))
}

export async function findThread(companyId, threadId) {
  return db.thread.findFirst({
    where: { id: threadId, companyId, deletedAt: null },
    select: {
      ...THREAD_SELECT,
      inbox: { select: { id: true, name: true, code: true } },
      channel: { select: { id: true, name: true } },
      assignedTo: { select: { id: true, firstName: true, lastName: true } },
    },
  })
}

export async function createThread(companyId, principal, input) {
  return db.thread.create({
    data: {
      companyId,
      subject: input.subject,
      inboxId: input.inboxId || null,
      channelId: input.channelId || null,
      branchId: input.branchId || principal.branchId || null,
      priority: input.priority,
      classification: input.classification,
      createdById: principal.userId,
      lastMessageAt: new Date(),
      // Direct threads have no shared inbox; recipients define participation.
    },
    select: THREAD_SELECT,
  })
}

export async function updateThread(companyId, threadId, patch) {
  return db.thread.update({
    where: { id: threadId },
    data: {
      ...(patch.status ? { status: patch.status } : {}),
      ...(patch.priority ? { priority: patch.priority } : {}),
      ...(patch.dueDate !== undefined ? { dueDate: patch.dueDate ? new Date(patch.dueDate) : null } : {}),
      ...(patch.snoozedUntil !== undefined ? { snoozedUntil: patch.snoozedUntil ? new Date(patch.snoozedUntil) : null } : {}),
      ...(patch.archived !== undefined ? { archived: patch.archived } : {}),
    },
    select: THREAD_SELECT,
  })
}

export async function assignThread(companyId, threadId, assignedToId) {
  return db.thread.update({
    where: { id: threadId },
    data: { assignedToId: assignedToId || null, status: assignedToId ? 'OPEN' : undefined },
    select: THREAD_SELECT,
  })
}

// ---------------------------------------------------------------- messages

export async function listMessages(companyId, threadId, query) {
  const where = { companyId, threadId, deletedAt: null }
  if (query.before) where.id = { lt: query.before }
  else if (query.after) where.id = { gt: query.after }
  const rows = await db.message.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: query.limit,
    select: {
      ...MESSAGE_SELECT,
      sender: { select: { id: true, firstName: true, lastName: true, email: true } },
      senderInbox: { select: { id: true, name: true, code: true } },
      recipients: {
        select: {
          id: true, userId: true, inboxId: true, isCc: true, isBcc: true,
          status: true, deliveredAt: true, readAt: true,
          user: { select: { id: true, firstName: true, lastName: true } },
          inbox: { select: { id: true, name: true } },
        },
      },
      reactions: {
        select: { id: true, userId: true, emoji: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      },
      edits: { select: { id: true, editedById: true, previousBody: true, reason: true, createdAt: true } },
      attachments: {
        where: { deletedAt: null },
        select: { id: true, fileName: true, mimeType: true, size: true, scanStatus: true, previewUrl: true },
      },
    },
  })
  return rows.reverse()
}

export async function findMessage(companyId, messageId) {
  return db.message.findFirst({
    where: { id: messageId, companyId, deletedAt: null },
    select: { ...MESSAGE_SELECT, recipients: { select: { userId: true, inboxId: true, status: true, readAt: true } } },
  })
}

export async function findMessageDetail(companyId, messageId) {
  return db.message.findFirst({
    where: { id: messageId, companyId, deletedAt: null },
    select: {
      ...MESSAGE_SELECT,
      sender: { select: { id: true, firstName: true, lastName: true, email: true } },
      senderInbox: { select: { id: true, name: true, code: true } },
      recipients: {
        select: {
          id: true, userId: true, inboxId: true, isCc: true, isBcc: true,
          status: true, deliveredAt: true, readAt: true,
          user: { select: { id: true, firstName: true, lastName: true } },
          inbox: { select: { id: true, name: true } },
        },
      },
      reactions: { select: { id: true, userId: true, emoji: true, createdAt: true }, orderBy: { createdAt: 'asc' } },
      edits: { select: { id: true, editedById: true, reason: true, createdAt: true } },
      attachments: {
        where: { deletedAt: null },
        select: { id: true, fileName: true, mimeType: true, size: true, scanStatus: true, previewUrl: true },
      },
    },
  })
}

/** Recipients of the most recent message, reused as defaults for a reply. */
export async function threadParticipantRecipients(companyId, thread, excludedUserId) {
  const last = await db.message.findFirst({
    where: { companyId, threadId: thread.id, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    select: {
      senderId: true,
      recipients: { select: { userId: true, inboxId: true, departmentId: true, roleId: true, branchId: true } },
    },
  })
  const recipients = []
  const seen = new Set()
  const push = (row) => {
    const key = [row.userId, row.inboxId, row.departmentId, row.roleId, row.branchId].join('|')
    if (!key.replace(/\|/g, '') || seen.has(key)) return
    if (row.userId === excludedUserId) return
    seen.add(key)
    recipients.push(row)
  }
  if (last?.senderId && last.senderId !== excludedUserId) push({ userId: last.senderId })
  ;(last?.recipients || []).forEach((row) => push({
    userId: row.userId || null,
    inboxId: row.inboxId || null,
    departmentId: row.departmentId || null,
    roleId: row.roleId || null,
    branchId: row.branchId || null,
  }))
  if (!recipients.length && thread.inboxId) push({ inboxId: thread.inboxId })
  return recipients
}

export async function findByIdempotencyKey(companyId, key) {
  return db.message.findFirst({
    where: { idempotencyKey: key, companyId },
    select: MESSAGE_SELECT,
  })
}

/** Insert message + recipients inside the caller's transaction so the outbox
 *  row commits with the business write. */
export async function insertMessageWithRecipients(tx, companyId, message, recipients) {
  const row = await tx.message.create({ data: { ...message, companyId } })
  if (recipients.length) {
    await tx.messageRecipient.createMany({
      data: recipients.map((recipient) => ({ ...recipient, companyId, messageId: row.id })),
    })
  }
  return row
}

export async function markRecipientsDelivered(companyId, messageId, recipientIds) {
  if (!recipientIds.length) return
  await db.messageRecipient.updateMany({
    where: { companyId, messageId, id: { in: recipientIds }, status: 'PENDING' },
    data: { status: 'DELIVERED', deliveredAt: new Date() },
  })
}

export async function markRecipientRead(companyId, messageId, userId) {
  return db.messageRecipient.updateMany({
    where: { companyId, messageId, userId, status: { not: 'READ' } },
    data: { status: 'READ', readAt: new Date(), deliveredAt: new Date() },
  })
}

export async function recallMessage(companyId, messageId, actorId) {
  return db.message.update({
    where: { id: messageId },
    data: { recalledAt: new Date(), recalledBy: actorId },
    select: MESSAGE_SELECT,
  })
}

export async function editMessage(companyId, messageId, actorId, body, reason) {
  const existing = await db.message.findFirst({
    where: { id: messageId, companyId, deletedAt: null },
    select: { body: true },
  })
  if (!existing) throw new HttpError(404, 'Message not found')
  const updated = await db.message.update({
    where: { id: messageId },
    data: { body, editedAt: new Date() },
    select: MESSAGE_SELECT,
  })
  await db.messageEdit.create({
    data: { companyId, messageId, editedById: actorId, previousBody: existing.body, reason: reason || null },
  })
  return updated
}

export async function addReaction(companyId, messageId, userId, emoji) {
  const existing = await db.messageReaction.findFirst({
    where: { companyId, messageId, userId, emoji },
    select: { id: true },
  })
  if (existing) return { reaction: existing, created: false }
  const reaction = await db.messageReaction.create({
    data: { companyId, messageId, userId, emoji },
    select: { id: true, userId: true, emoji: true, createdAt: true },
  })
  return { reaction, created: true }
}

export async function removeReaction(companyId, messageId, userId, emoji) {
  return db.messageReaction.deleteMany({ where: { companyId, messageId, userId, emoji } })
}

// ---------------------------------------------------------------- channels

export async function listChannels(companyId, principal) {
  const where = { companyId, isArchived: false, deletedAt: null }
  if (!isOrgWide(principal) && principal.branchIds?.length) {
    where.OR = [{ branchId: { in: principal.branchIds } }, { branchId: null }]
  }
  return db.channel.findMany({
    where,
    orderBy: { name: 'asc' },
    select: {
      id: true, name: true, description: true, visibility: true, classification: true,
      branchId: true, departmentId: true,
      members: { where: { userId: principal.userId }, select: { id: true, role: true } },
    },
  })
}

export async function createChannel(companyId, principal, input) {
  return db.channel.create({
    data: {
      companyId,
      name: input.name,
      description: input.description || null,
      visibility: input.visibility,
      classification: input.classification,
      branchId: input.branchId || null,
      departmentId: input.departmentId || null,
      createdById: principal.userId,
      members: {
        create: { companyId, userId: principal.userId, role: 'OWNER' },
      },
    },
    select: { id: true, name: true, description: true, visibility: true, classification: true },
  })
}

export async function joinChannel(companyId, channelId, userId) {
  const channel = await db.channel.findFirst({
    where: { id: channelId, companyId, deletedAt: null },
    select: { id: true, visibility: true },
  })
  if (!channel) throw new HttpError(404, 'Channel not found')
  if (channel.visibility === 'PRIVATE') {
    throw new HttpError(403, 'Private channels require an invitation')
  }
  await db.channelMembership.upsert({
    where: { channelId_userId: { channelId, userId } },
    update: {},
    create: { companyId, channelId, userId, role: 'MEMBER' },
  })
  return { channelId, joined: true }
}

// ---------------------------------------------------------------- recipients

function splitRef(ref) {
  const index = ref.indexOf(':')
  if (index === -1) return [null, ref]
  return [ref.slice(0, index).toLowerCase(), ref.slice(index + 1).trim()]
}

/** Resolve internal aliases to concrete recipient rows. External-looking
 *  addresses are rejected before any lookup — internal messaging never calls
 *  SMTP and never accepts an external address. */
export async function resolveInternalRecipients(companyId, refs, excludedUserId = null) {
  const invalid = []
  const seen = new Set()
  const recipients = []

  const push = (row) => {
    const key = [row.userId, row.inboxId, row.departmentId, row.roleId, row.branchId].join('|')
    if (!key.replace(/\|/g, '')) return
    if (row.userId === excludedUserId) return
    if (seen.has(key)) return
    seen.add(key)
    recipients.push(row)
  }

  for (const raw of refs || []) {
    const ref = String(raw).trim()
    if (!ref) continue

    if (ref === '@internal') {
      const inboxes = await db.inbox.findMany({
        where: { companyId, isActive: true, deletedAt: null, kind: { in: ['DEPARTMENT', 'SHARED'] } },
        select: { id: true },
        take: 100,
      })
      inboxes.forEach((inbox) => push({ inboxId: inbox.id }))
      continue
    }

    // A dotted external address is never accepted, even if a local part exists.
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ref)) {
      invalid.push({ value: ref.replace(/@.*$/, '@[redacted]'), reason: 'external-address' })
      continue
    }

    let [kind, value] = splitRef(ref)
    if (!kind) {
      kind = ref.includes('@') ? 'inbox' : 'user'
      value = ref
    }

    try {
      if (kind === 'user') {
        const user = await db.user.findFirst({
          where: {
            companyId,
            status: 'ACTIVE',
            OR: [{ id: value }, { email: value.toLowerCase() }, { email: `${value.toLowerCase()}@comethealthcare.local` }],
          },
          select: { id: true, branchId: true, departmentId: true },
        })
        if (!user) throw new Error('unknown-user')
        push({ userId: user.id, branchId: user.branchId || null })
      } else if (kind === 'inbox') {
        const inbox = await db.inbox.findFirst({
          where: { companyId, isActive: true, deletedAt: null, OR: [{ code: value }, { internalAddress: value }] },
          select: { id: true },
        })
        if (!inbox) throw new Error('unknown-inbox')
        push({ inboxId: inbox.id })
      } else if (kind === 'department') {
        const department = await db.department.findFirst({
          where: { companyId, OR: [{ code: value }, { id: value }] },
          select: { id: true },
        })
        if (!department) throw new Error('unknown-department')
        const inbox = await db.inbox.findFirst({
          where: { companyId, departmentId: department.id, isActive: true },
          select: { id: true },
        })
        push({ departmentId: department.id, ...(inbox ? { inboxId: inbox.id } : {}) })
      } else if (kind === 'role') {
        const role = await db.accessRole.findFirst({
          where: { companyId, OR: [{ code: value.toUpperCase() }, { id: value }] },
          select: { id: true },
        })
        if (!role) throw new Error('unknown-role')
        push({ roleId: role.id })
      } else if (kind === 'branch') {
        const branch = await db.branch.findFirst({
          where: { companyId, OR: [{ code: value }, { id: value }] },
          select: { id: true },
        })
        if (!branch) throw new Error('unknown-branch')
        push({ branchId: branch.id })
      } else {
        throw new Error('unknown-recipient-kind')
      }
    } catch {
      invalid.push({ value: String(value).slice(0, 80), reason: 'unresolved' })
    }
  }

  if (invalid.length) {
    throw new HttpError(422, 'One or more recipients could not be resolved to internal users or inboxes', { invalid })
  }
  if (!recipients.length) {
    throw new HttpError(422, 'At least one internal recipient is required')
  }
  return recipients.slice(0, 100)
}

// ---------------------------------------------------------------- routing

export async function evaluateRoutingRules(companyId, input) {
  const rules = await db.routingRule.findMany({
    where: {
      companyId,
      isEnabled: true,
      OR: [{ branchId: null }, ...(input.branchId ? [{ branchId: input.branchId }] : [])],
    },
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, name: true, matchType: true, matchValue: true, targetInboxId: true, assignToId: true },
  })
  const haystack = `${input.subject || ''}\n${input.body || ''}`.toLowerCase()
  for (const rule of rules) {
    const value = rule.matchValue.toLowerCase()
    const matches =
      (rule.matchType === 'KEYWORD' && haystack.includes(value)) ||
      (rule.matchType === 'FORM_TYPE' && (input.formType || '').toLowerCase() === value) ||
      (rule.matchType === 'SENDER_TYPE' && (input.senderType || '').toLowerCase() === value)
    if (matches) {
      return {
        ruleId: rule.id,
        ruleName: rule.name,
        targetInboxId: rule.targetInboxId,
        assignToId: rule.assignToId || null,
      }
    }
  }
  return null
}

/** User IDs who may see INTERNAL notes in a thread: sender + inbox managers. */
export async function internalNoteViewerIds(companyId, thread, senderId) {
  const ids = new Set([senderId].filter(Boolean))
  if (thread?.inboxId) {
    const managers = await db.inboxMembership.findMany({
      where: { companyId, inboxId: thread.inboxId, role: 'MANAGER' },
      select: { userId: true },
    })
    managers.forEach((row) => ids.add(row.userId))
  }
  return [...ids]
}
