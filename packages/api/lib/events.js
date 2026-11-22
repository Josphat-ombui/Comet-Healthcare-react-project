// Transactional outbox for domain events. Events are validated against the
// shared contracts and written with the request's tenant context. A later
// worker publishes them to Redis Streams (Phase 5).

import { randomUUID } from 'node:crypto'
import { parseEventEnvelope, DomainEventSchemas } from '../../shared/src/events.js'
import { DEFAULT_COMPANY_ID } from '../../shared/src/constants.js'
import { db, getTenantContext } from './tenant.js'

export async function emitEvent(type, data, options = {}) {
  const schema = DomainEventSchemas[type]
  if (schema) schema.parse(data)

  const ctx = getTenantContext() || {}
  const envelope = parseEventEnvelope({
    id: `evt_${randomUUID()}`,
    type,
    version: 1,
    occurredAt: new Date().toISOString(),
    correlationId: ctx.correlationId || `cor_${randomUUID()}`,
    causationId: options.causationId || null,
    companyId: options.companyId || ctx.companyId || DEFAULT_COMPANY_ID,
    branchId: options.branchId ?? ctx.branchId ?? null,
    actorId: options.actorId ?? ctx.actorId ?? null,
    data,
  })

  return db.outboxEvent.create({
    data: {
      companyId: envelope.companyId,
      eventType: envelope.type,
      version: envelope.version,
      aggregateType: options.aggregateType || 'Identity',
      aggregateId: options.aggregateId || data.userId || data.branchId || data.departmentId || envelope.id,
      payload: envelope,
      correlationId: envelope.correlationId,
      branchId: envelope.branchId,
      status: 'PENDING',
    },
  })
}
