# ADR-0002: PostgreSQL 16 with Prisma CRUD and Raw SQL RLS

- **Status:** Accepted (Phase 1, pending architecture review)
- **Date:** 2026-11-22
- **Deciders:** Product owner, principal architect

## Context

The existing app uses SQLite via Prisma 6. The target requires multi-tenancy (`company_id` on every record), branch scoping, partitioning of large tables, PITR backups, and defence-in-depth tenant isolation. SQLite cannot provide the required RLS, partitioning, and operational model.

Prisma is productive for application CRUD and already in use, but security-sensitive database objects need explicit SQL control.

## Decision

- Use **PostgreSQL 16** for all non-local environments; SQLite may remain only for fast local app tests until Phase 2 migration.
- Keep **Prisma** for schema shape, generated client CRUD, and migrations that do not need advanced SQL.
- Add **reviewed raw SQL migrations** for:
  - `company_id` / `branch_id` RLS policies,
  - grants and roles,
  - table partitioning for messages, audit logs, and stock movements,
  - security-sensitive functions/triggers, including audit hash chaining.
- Set `app.company_id` and `app.branch_id` with `SET LOCAL` at transaction start.
- Use PgBouncer in transaction mode.

## Consequences

### Positive

- Tenant isolation enforced by the database even if application queries are wrong.
- Clear audit trail of policy changes through migration history.
- Partitioning supports message/audit growth.
- Prisma productivity retained for most data access.

### Negative

- Two migration styles require review discipline and ordering rules.
- RLS must be considered in every test seed and admin script.
- Some Prisma operations need raw SQL escape hatches.

## Alternatives considered

| Alternative | Why not |
|---|---|
| Stay on SQLite | No RLS/partitioning/PITR suitable for production |
| Drizzle ORM | SQL-first but a larger rewrite from existing Prisma code |
| Kysely + raw SQL | More control but higher manual mapping cost |
| Prisma only | Awkward for advanced policies/partitioning |

## Review triggers

- Prisma gains first-class policy/partition support sufficient for our needs.
- Multi-region or sharded tenancy requires a different isolation model.
