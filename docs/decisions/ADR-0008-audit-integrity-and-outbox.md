# ADR-0008: Tamper-Evident Audit Log and Transactional Outbox

- **Status:** Accepted (Phase 3)
- **Date:** 2026-11-22
- **Deciders:** Principal architect

## Context

Privileged identity and organisation actions must be attributable and tamper-evident, and other modules need to react to events without directly querying another context's tables. Phase 2 already made `AuditLog` immutable at the database level via revoked `UPDATE`/`DELETE` grants.

## Decision

- Every audit entry carries the previous entry's SHA-256 hash and its own hash computed over `(previousHash, canonical body)`. The first entry uses `GENESIS`. Object keys are sorted recursively before hashing because PostgreSQL `jsonb` normalises key order.
- `GET /api/audit/verify` recomputes the chain and reports the first broken entry.
- Audit metadata is redacted recursively for credential-like keys before storage.
- Domain events are validated against Zod schemas in `packages/shared`, then written to `OutboxEvent` in the same tenant context as the business change. Redis Streams publishing is deferred to Phase 5.
- Events carry opaque IDs, correlation IDs, tenant and branch context; personal data and restricted values are excluded.

## Consequences

### Positive

- Deletion or alteration of an audit row breaks verification even if database grants are misconfigured later.
- Event consumers can be added without changing the producing transaction.
- Correlation IDs tie logs, audit entries, and events for incident investigation.

### Negative

- The chain check is O(n) and bounded to 2,000 entries by default; large deployments need checkpoint hashes.
- Outbox rows need a retention/archival job before Phase 5 go-live.

## Review triggers

- Audit verification reports a break without an obvious maintenance action.
- Outbox volume outgrows the single-VPS Postgres budget.
- Regulators require WORM storage or external timestamping.
