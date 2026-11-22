// Redis Streams → Socket.IO fan-out. Event envelopes carry IDs only; clients
// fetch message content through the authenticated API, which rechecks
// visibility, DLP and tenant/branch scope.

import { config } from './config.js'

function unique(values) {
  return [...new Set(values.filter(Boolean))]
}

function eventRooms(event) {
  const prefix = `company:${event.companyId}`
  const data = event.data || {}
  const threadRoom = data.threadId ? `${prefix}:thread:${data.threadId}` : null

  if (event.type === 'MessageSent') {
    return unique([
      threadRoom,
      ...(data.recipientUserIds || []).map((id) => `${prefix}:user:${id}`),
      ...(data.recipientInboxIds || []).map((id) => `${prefix}:inbox:${id}`),
    ])
  }
  if (event.type === 'MessageRecalled') {
    return unique([
      threadRoom,
      ...(data.recipientUserIds || []).map((id) => `${prefix}:user:${id}`),
      ...(data.recipientInboxIds || []).map((id) => `${prefix}:inbox:${id}`),
    ])
  }
  if (event.type === 'ThreadAssigned') {
    return unique([threadRoom, data.assignedToId ? `${prefix}:user:${data.assignedToId}` : null])
  }
  if (event.type === 'ThreadResolved') {
    return unique([threadRoom, `${prefix}:user:${data.resolvedById}`])
  }
  if (event.type === 'ReactionAdded') {
    return unique([threadRoom])
  }

  // ------------------------------------------------ phase 5 shared services
  const userRoom = (id) => (id ? `${prefix}:user:${id}` : null)
  if (event.type === 'NotificationCreated' || event.type === 'NotificationRead') {
    return unique([userRoom(data.userId)])
  }
  if (event.type === 'WorkflowTaskAssigned') {
    return unique([userRoom(data.assigneeId)])
  }
  if (event.type === 'WorkflowInstanceStarted') {
    return unique([userRoom(data.requestedById)])
  }
  if (event.type === 'WorkflowCompleted') {
    return unique([prefix, userRoom(data.requestedById)])
  }
  if (event.type === 'FileUploaded' || event.type === 'FileScanned') {
    return unique([prefix, userRoom(data.uploadedById)])
  }
  if (event.type === 'DocumentGenerated' || event.type === 'DocumentIssued') {
    return unique([prefix, userRoom(data.createdById)])
  }
  return []
}

function socketEventFor(type) {
  return {
    MessageSent: 'message:new',
    MessageRecalled: 'message:recalled',
    ThreadAssigned: 'thread:assigned',
    ThreadResolved: 'thread:resolved',
    ReactionAdded: 'reaction:added',
    NotificationCreated: 'notification:new',
    NotificationRead: 'notification:read',
    WorkflowInstanceStarted: 'workflow:started',
    WorkflowTaskAssigned: 'workflow:task',
    WorkflowCompleted: 'workflow:completed',
    FileUploaded: 'file:new',
    FileScanned: 'file:scanned',
    DocumentGenerated: 'document:generated',
    DocumentIssued: 'document:issued',
  }[type] || null
}

export function dispatchEvent(io, event) {
  const socketEvent = socketEventFor(event.type)
  if (!socketEvent) return 0
  const rooms = eventRooms(event)
  const payload = {
    eventId: event.id,
    type: event.type,
    occurredAt: event.occurredAt,
    correlationId: event.correlationId,
    data: event.data || {},
  }
  for (const room of rooms) io.to(room).emit(socketEvent, payload)
  return rooms.length
}

/** Start a consumer group loop. Resumes pending events on restart. */
export async function startEventRelay(io, subscriber) {
  const stream = config.stream
  const group = config.consumerGroup
  const consumer = `realtime_${process.pid}_${Math.random().toString(36).slice(2, 8)}`

  try {
    await subscriber.xGroupCreate(stream, group, '0', { MKSTREAM: true })
  } catch (error) {
    if (!String(error?.message || '').includes('BUSYGROUP')) throw error
  }

  let stopped = false
  async function loop() {
    if (stopped) return
    try {
      const batches = await subscriber.xReadGroup(
        group,
        consumer,
        { key: stream, id: '>' },
        { COUNT: 25, BLOCK: 1000 }
      )
      for (const batch of batches || []) {
        for (const message of batch.messages || []) {
          try {
            const raw = message.message?.event
            if (raw) dispatchEvent(io, typeof raw === 'string' ? JSON.parse(raw) : raw)
          } catch (error) {
            console.error('Realtime event dispatch failed:', error.message)
          }
          await subscriber.xAck(stream, group, message.id)
        }
      }
    } catch (error) {
      if (!stopped) console.error('Realtime stream read failed:', error.message)
    }
    setImmediate(loop)
  }

  loop()
  return () => { stopped = true }
}
