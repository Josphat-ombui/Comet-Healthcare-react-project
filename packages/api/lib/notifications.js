// Phase 5 in-app notifications.
//
// Notifications are IN-APP ONLY: no SMTP, push or external channel is ever
// used. Domain events carry opaque IDs and classification only — titles and
// messages stay behind the authenticated API so visibility is rechecked.

import { db, getTenantContext, withTenant } from './tenant.js'
import { emitEvent } from './events.js'
import { HttpError } from './util.js'
import { DEFAULT_COMPANY_ID } from '../../shared/src/constants.js'

function tenantId() {
  const ctx = getTenantContext() || {}
  return ctx.companyId || DEFAULT_COMPANY_ID
}

/** Public notification shape. Never include companyId or other tenant internals. */
export function toNotificationDto(row) {
  if (!row) return null
  return {
    id: row.id,
    userId: row.userId,
    category: row.category,
    title: row.title,
    message: row.message,
    classification: row.classification,
    entityType: row.entityType ?? null,
    entityId: row.entityId ?? null,
    readAt: row.readAt ?? null,
    deliveredAt: row.deliveredAt ?? null,
    expiresAt: row.expiresAt ?? null,
    createdAt: row.createdAt ?? null,
  }
}

/** Pure event-payload builder. Extra fields (title/message/object keys) are
 *  deliberately dropped, so an event can never carry notification content. */
export function notificationEventData({
  notificationId,
  userId,
  category,
  classification = 'INTERNAL',
  entityType = 'SYSTEM',
  entityId = null,
}) {
  return {
    notificationId,
    userId,
    category,
    classification,
    entityType: entityType || 'SYSTEM',
    entityId: entityId || null,
  }
}

/** Pure ID-only payload for NotificationRead. */
export function notificationReadEventData(notificationId, userId) {
  return { notificationId, userId }
}

async function inTenantTransaction(work) {
  const ctx = getTenantContext() || {}
  const companyId = ctx.companyId || DEFAULT_COMPANY_ID
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.company_id', ${companyId}, true)`
    await tx.$executeRaw`SELECT set_config('app.branch_id', ${ctx.branchId || ''}, true)`
    return work(tx, ctx, companyId)
  })
}

/**
 * Create an in-app notification and its IN_APP delivery row.
 *
 * Callable from HTTP handlers and workers (no Express request required): the
 * tenant company/branch/actor are taken from the AsyncLocalStorage context.
 * If the recipient has explicitly disabled IN_APP notifications, nothing is
 * created and `null` is returned.
 */
export async function createNotification({
  userId,
  category,
  title,
  message,
  classification = 'INTERNAL',
  entityType = null,
  entityId = null,
  expiresAt = null,
  actorId = null,
  correlationId = null,
}) {
  const companyId = tenantId()
  if (!userId) throw new HttpError(400, 'Notification recipient is required')

  const preference = await db.notificationPreference.findFirst({
    where: { companyId, userId, channel: 'IN_APP' },
    select: { enabled: true },
  })
  if (preference && preference.enabled === false) return null

  const work = () => inTenantTransaction(async (tx, ctx) => {
    const now = new Date()
    const created = await tx.notification.create({
      data: {
        companyId,
        userId,
        category: category || 'SYSTEM',
        title,
        message,
        classification,
        entityType: entityType || null,
        entityId: entityId || null,
        deliveredAt: now,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
    })
    await tx.notificationDelivery.create({
      data: {
        companyId,
        notificationId: created.id,
        channel: 'IN_APP',
        status: 'DELIVERED',
        attempts: 1,
        sentAt: now,
      },
    })
    await emitEvent('NotificationCreated', notificationEventData({
      notificationId: created.id,
      userId,
      category: category || 'SYSTEM',
      classification,
      entityType,
      entityId,
    }), {
      client: tx,
      aggregateType: 'Notification',
      aggregateId: created.id,
      actorId: actorId ?? ctx.actorId ?? null,
    })
    return created
  })

  // A worker without a request can supply its own correlation ID; it is used
  // for the outbox envelope through the tenant context.
  const ctx = getTenantContext() || {}
  const row = correlationId
    ? await withTenant({
      companyId,
      branchId: ctx.branchId,
      actorId: actorId ?? ctx.actorId,
      correlationId,
    }, work)
    : await work()

  return toNotificationDto(row)
}

/** List only the given user's notifications in the current tenant. */
export async function listNotifications(userId, query = {}) {
  const companyId = tenantId()
  const where = {
    companyId,
    userId,
    ...(query.category ? { category: query.category } : {}),
    ...(query.unreadOnly === 'true' ? { readAt: null } : {}),
    ...(query.unreadOnly === 'false' ? { readAt: { not: null } } : {}),
    // Expired notifications are no longer useful in an in-app inbox.
    OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
  }
  const rows = await db.notification.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: query.limit || 50,
  })
  return rows.map(toNotificationDto)
}

/** Mark one notification read. Ownership is enforced in the query itself, so
 *  another user's ID is indistinguishable from a missing notification. */
export async function markNotificationRead(id, userId) {
  const companyId = tenantId()
  const existing = await db.notification.findFirst({
    where: { id, companyId, userId },
  })
  if (!existing) throw new HttpError(404, 'Notification not found')

  if (existing.readAt) return toNotificationDto(existing)

  const updated = await db.notification.update({
    where: { id: existing.id },
    data: { readAt: new Date() },
  })
  await emitEvent('NotificationRead', notificationReadEventData(updated.id, userId), {
    aggregateType: 'Notification',
    aggregateId: updated.id,
    actorId: userId,
  })
  return toNotificationDto(updated)
}

/** Mark all of this user's unread notifications read. Returns the changed count. */
export async function markAllNotificationsRead(userId) {
  const result = await db.notification.updateMany({
    where: { companyId: tenantId(), userId, readAt: null },
    data: { readAt: new Date() },
  })
  return { count: result.count }
}

function toPreferenceDto(row) {
  return {
    channel: row?.channel || 'IN_APP',
    enabled: row?.enabled ?? true,
    digestMinutes: row?.digestMinutes ?? 0,
  }
}

export async function getPreferences(userId) {
  const row = await db.notificationPreference.findFirst({
    where: { companyId: tenantId(), userId, channel: 'IN_APP' },
  })
  return toPreferenceDto(row)
}

export async function updatePreferences(userId, input) {
  const companyId = tenantId()
  const channel = input.channel || 'IN_APP'
  const data = {
    enabled: input.enabled,
    digestMinutes: input.digestMinutes ?? 0,
  }
  const row = await db.notificationPreference.upsert({
    where: { companyId_userId_channel: { companyId, userId, channel } },
    update: data,
    create: { companyId, userId, channel, ...data },
  })
  return toPreferenceDto(row)
}
