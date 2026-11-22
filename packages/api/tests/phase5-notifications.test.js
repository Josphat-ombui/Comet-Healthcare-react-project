import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  toNotificationDto, notificationEventData, notificationReadEventData,
} from '../lib/notifications.js'
import { NotificationCreatedDataSchema, NotificationReadDataSchema } from '../../shared/src/events.js'

test('notification DTO exposes content but no tenant internals', () => {
  const dto = toNotificationDto({
    id: 'ntf_1',
    companyId: 'cmp_secret',
    tenant: { id: 'cmp_secret', code: 'COMET' },
    userId: 'usr_1',
    category: 'WORKFLOW',
    title: 'Workflow update',
    message: 'Workflow PURCHASE-1 was approved',
    classification: 'CONFIDENTIAL',
    entityType: 'WORKFLOW',
    entityId: 'wfi_1',
    readAt: null,
    deliveredAt: new Date('2026-01-01T00:00:00Z'),
    expiresAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    deliveries: [{ id: 'd_1', channel: 'IN_APP' }],
  })

  assert.equal(dto.id, 'ntf_1')
  assert.equal(dto.category, 'WORKFLOW')
  assert.equal(dto.title, 'Workflow update')
  assert.equal(dto.message, 'Workflow PURCHASE-1 was approved')
  assert.equal('companyId' in dto, false)
  assert.equal('tenant' in dto, false)
  assert.equal('deliveries' in dto, false)
  assert.ok(!JSON.stringify(dto).includes('cmp_secret'))
})

test('notification event data is ID-only and ignores content fields', () => {
  const data = notificationEventData({
    notificationId: 'ntf_2',
    userId: 'usr_2',
    category: 'MESSAGE',
    classification: 'CONFIDENTIAL',
    entityType: 'MESSAGE',
    entityId: 'msg_2',
    title: 'Never publish this title',
    message: 'Never publish this body',
    objectKey: 'objects/secret.pdf',
    password: 'hunter2',
  })

  assert.deepEqual(Object.keys(data).sort(), [
    'notificationId', 'userId', 'category', 'classification', 'entityType', 'entityId',
  ].sort())
  assert.deepEqual(NotificationCreatedDataSchema.parse(data), data)
  assert.equal(JSON.stringify(data).includes('Never publish'), false)
  assert.equal(JSON.stringify(data).includes('objects/secret'), false)
  assert.equal(JSON.stringify(data).includes('hunter2'), false)

  const fallback = notificationEventData({
    notificationId: 'ntf_3', userId: 'usr_3', category: 'SYSTEM',
  })
  assert.equal(fallback.entityType, 'SYSTEM')
  assert.equal(fallback.entityId, null)
})

test('notification read event carries only opaque IDs', () => {
  const data = notificationReadEventData('ntf_4', 'usr_4')
  assert.deepEqual(data, { notificationId: 'ntf_4', userId: 'usr_4' })
  assert.deepEqual(NotificationReadDataSchema.parse(data), data)
})
