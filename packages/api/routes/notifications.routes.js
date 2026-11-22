// In-app notification HTTP surface. Routes validate, authorise and audit;
// business rules live in lib/notifications.js.

import { Router } from 'express'
import { requireAuth } from '../lib/auth.js'
import { requirePermission } from '../lib/authorize.js'
import { recordRequestAudit } from '../lib/audit.js'
import { notificationQuerySchema, notificationPreferenceSchema } from '../lib/validation.js'
import {
  listNotifications,
  getPreferences,
  updatePreferences,
  markNotificationRead,
  markAllNotificationsRead,
} from '../lib/notifications.js'

export const notificationsRouter = Router()

notificationsRouter.use(requireAuth)

function audit(req, action, resourceType, resourceId, metadata = {}) {
  return recordRequestAudit(req, { action, resourceType, resourceId, metadata })
}

// Static paths must be registered before /:id/read.
notificationsRouter.get('/', requirePermission('notifications.read'), async (req, res) => {
  const query = notificationQuerySchema.parse(req.query)
  return res.json({
    notifications: await listNotifications(req.auth.userId, query),
  })
})

notificationsRouter.get('/preferences', requirePermission('notifications.manage'), async (req, res) => {
  return res.json({ preferences: await getPreferences(req.auth.userId) })
})

notificationsRouter.put('/preferences', requirePermission('notifications.manage'), async (req, res) => {
  const body = notificationPreferenceSchema.parse(req.body)
  const preferences = await updatePreferences(req.auth.userId, body)
  await audit(req, 'notification.preferences.update', 'NotificationPreference', req.auth.userId, {
    channel: preferences.channel,
    enabled: preferences.enabled,
  })
  return res.json({ preferences })
})

notificationsRouter.post('/read-all', requirePermission('notifications.read'), async (req, res) => {
  const result = await markAllNotificationsRead(req.auth.userId)
  await audit(req, 'notification.read_all', 'Notification', 'all', { count: result.count })
  return res.json(result)
})

notificationsRouter.post('/:id/read', requirePermission('notifications.read'), async (req, res) => {
  const notification = await markNotificationRead(req.params.id, req.auth.userId)
  await audit(req, 'notification.read', 'Notification', notification.id, {
    category: notification.category,
  })
  return res.json({ notification })
})
