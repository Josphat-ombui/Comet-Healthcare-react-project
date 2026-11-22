# ADR-0006: Tenant Context and RLS Enforcement

- **Status:** Accepted (Phase 2)
- **Date:** 2026-11-22
- **Deciders:** Principal architect

## Context

Phase 2 introduces PostgreSQL RLS. If the application connects as the table owner, PostgreSQL bypasses RLS by default, which would make tenant isolation ineffective. Phase 3 will set tenant context per request, but Phase 2 must keep the existing application working while establishing safe defaults.

## Decision

- Create a non-owner login role `comet_app` for application connections.
- Grant only DML/sequence privileges to `comet_app`; migrations and seeds use the owner role.
- Enable RLS on every table with `company_id`.
- Set a role-level default `app.company_id = 'cmp_comet'` so the current single-tenant application continues to work.
- From Phase 3, API middleware sets `app.company_id` and `app.branch_id` with `SET LOCAL` per transaction, overriding the role default.
- Tables with `branch_id` also evaluate a branch policy when `app.branch_id` is non-empty.

## Consequences

### Positive

- RLS is effective from the first Postgres migration.
- Existing app continues to function during the workspace transition.
- Per-request tenant switching can be added without schema changes.

### Negative

- Forgotten per-request context in Phase 3 would silently scope queries to the default tenant; integration tests must assert correct tenant switching.
- Seed/admin scripts must use the owner connection, not `comet_app`.

## Review triggers

- Phase 3 integration tests reveal missing tenant context.
- Multi-tenant onboarding begins; default tenant GUC must be removed at that point.
