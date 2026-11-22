# ADR-0001: Modular Monolith First

- **Status:** Accepted (Phase 1, pending architecture review)
- **Date:** 2026-11-22
- **Deciders:** Product owner, principal architect

## Context

The target platform spans identity, messaging, finance, sales, inventory, procurement, service, HR, projects, manufacturing, reporting, public APIs, and platform services. Launch target is 500 concurrent users on a single VPS with Docker Compose. Microservices would introduce distributed transactions, network partitions, independent deploy pipelines, and duplicated observability before load justifies them.

The existing codebase is a single Express API plus React/Vite frontend. A full rewrite into independent services would delay the messaging-first goal.

## Decision

Build a **modular monolith** first:

- One API process with strict internal module boundaries.
- One PostgreSQL database, tenant-isolated with RLS.
- Async work through Redis Streams and BullMQ workers.
- Shared contracts in `packages/shared` (Zod schemas, permissions, events).
- Modules expose `public.js` interfaces or domain events; no cross-module table joins.
- Frontend is split into `web`, `cms`, and `erp` workspaces but consumes the same API.

## Consequences

### Positive

- Simple local development, testing, deployment, and transaction handling.
- Easier enforcement of tenant context and audit outbox in one process.
- Lower infrastructure cost and operational load.
- Clear extraction path: replace an in-process `public.js` call with an API/event call.

### Negative

- A bad deployment can affect all modules.
- Large codebase requires discipline to keep boundaries intact.
- Horizontal scaling scales the whole monolith until extraction.

## Alternatives considered

| Alternative | Why not now |
|---|---|
| Microservices from day one | Premature operational complexity at 500 users |
| Single-tier app with no modules | Would create tangled code and block later extraction |
| Serverless functions | Unsuitable for long-lived WebSocket/worker needs and VPS target |

## Review triggers

- Sustained >800 concurrent users or module-specific resource contention.
- Independent compliance boundary requiring a separate deployment.
- Team size large enough that shared deploy cadence becomes a bottleneck.
