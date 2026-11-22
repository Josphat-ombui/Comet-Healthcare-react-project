# ADR-0003: Socket.IO + Redis Adapter, Redis Streams Events, BullMQ Jobs

- **Status:** Accepted (Phase 1, pending architecture review)
- **Date:** 2026-11-22
- **Deciders:** Product owner, principal architect

## Context

Requirements include real-time message delivery under 1 second, typing indicators, read receipts, presence, polling fallback, offline queueing, domain events for decoupled modules, scheduled jobs, and horizontal scaling headroom. The launch hosting target is a single VPS with Redis available in Docker Compose.

## Decision

- Use **Socket.IO** with the **Redis adapter** for WebSocket transport, rooms, presence, typing, and receipts.
- Use **Redis Streams** as the internal domain event bus for module-to-module events.
- Use **BullMQ** for background jobs, scheduled reports, retries, digests, scans, and document generation.
- Persist the source of truth in PostgreSQL; publish events using a transactional outbox.
- Provide polling with exponential backoff and client-side offline queue with idempotency keys.

## Consequences

### Positive

- Familiar, maintained libraries with permissive licences (MIT).
- Redis adapter allows multiple realtime processes later.
- Outbox avoids lost events between DB commit and publish.
- Idempotent consumers tolerate retries and replay.

### Negative

- Redis becomes a critical dependency; degradation must be handled explicitly.
- Socket.IO rooms need careful tenant/branch authorization.
- Stream consumers need monitoring for lag and dead-letter handling.

## Alternatives considered

| Alternative | Why not now |
|---|---|
| Native WebSocket only | More custom code for reconnection, rooms, fallback, and scaling |
| RabbitMQ/Kafka | More infrastructure than needed for launch; stronger ordering/throughput not yet required |
| Polling only | Cannot meet real-time UX requirements |
| Redis Pub/Sub only | No persistence/replay; unsuitable as sole event log |

## Review triggers

- Need for cross-region event replication or long-term event retention beyond the outbox window.
- Consumer lag or event volume exceeding Redis Streams comfortable limits.
- Requirement for strict ordered delivery across partitions.
