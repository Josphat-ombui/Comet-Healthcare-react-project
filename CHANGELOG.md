# Changelog

All notable changes to the Comet Healthcare platform are documented here.

The format follows a phase-gate model: each enterprise phase ends with passing tests, an updated OpenAPI contract, updated documentation, and a review stop.

---

## [Unreleased]

### Phase 3 — Identity, Organisation, and Audit

**Added**

- `packages/shared/src/identity.js`: provider/MFA interfaces, password/session/MFA policies.
- Expanded shared permissions and event contracts (`UserDisabled`, `RoleAssigned`, `SessionRevoked`, `BranchCreated`, `DepartmentCreated`).
- API libraries: tenant context (`AsyncLocalStorage` + scoped Prisma proxy), AES-256-GCM encryption, TOTP/recovery codes, password policy + HIBP k-anonymity, rotating sessions, OIDC code flow, RBAC/ABAC authorizer, transactional outbox, hash-chained audit.
- Routes: rewritten `auth.routes.js` plus new `identity.routes.js`, `org.routes.js`, `audit.routes.js`; mounted principal resolution and tenant context middleware globally in `packages/api/index.js`.
- Migration `20261122000200_identity_auth`: per-tenant email uniqueness, OIDC/lockout/password-change columns, password history table with RLS.
- Seed baseline: permissions, roles, role-permission links, admin assignment, demo staff account.
- Minimal ERP shell (`packages/erp/public/`) with login, MFA challenge handling, active sessions, user directory, and branches.
- Phase 3 OpenAPI paths/schemas, ADR-0007, ADR-0008, ERD and README updates.
- Backend unit tests for TOTP, recovery codes, password policy, audit hash chain, OIDC state, and role permissions.

**Changed**

- `User.email` is unique per `(companyId, email)`; all auth lookups are tenant-scoped.
- Login issues access JWT + rotating HttpOnly refresh cookie; `POST /api/auth/login` still returns `{ token, user }`.
- Emails are globally unique no longer; OIDC endpoints return 503 until configured.
- Default access-token TTL remains the legacy value; `JWT_ACCESS_TTL` opts into short tokens.

**New dependencies / licences**

- None. Uses Node `crypto`/`fetch` and existing Express, Prisma, Zod, bcryptjs, JWT, and Nodemailer.

**Verification**

- `npm test` — 29 passed.
- `npm run test:smoke` — 31 passed (7 files).
- `npm run lint` — warnings only (no errors).
- `npm run build` — passed (`packages/web/dist/`).
- OpenAPI YAML parsed successfully with a YAML 1.2 loader.
- Migrations applied cleanly via `npm run db:deploy` (identity + role-enum corrective migration); seed idempotent via `npm run db:seed`.
- RLS verified with the `comet_app` role: `cmp_comet` sees 3 users / 2 branches; `cmp_other` sees 0 / 0; password-history policy is scoped to the new table.
- Runtime API smoke: admin login returns `{ token, user, sessionId }`; `/auth/me`, `/identity/users`, `/org/branches`, `/auth/sessions`, `/audit/logs`, and `/audit/verify` all return 200; audit chain reports `valid`.
- Refresh rotation verified: a new cookie revokes the previous session hash and replay of the old cookie returns 401.
- OIDC start returns 503 while unconfigured; staff token lacking `identity.user.write` receives 403.
- Audit hashing canonicalises JSON before SHA-256 because PostgreSQL `jsonb` normalises key order; development entries created before the fix were cleared.

---

### Phase 2 — Workspaces, PostgreSQL schema, ERD, and first migrations

**Added**

- npm workspaces: `packages/shared`, `api`, `web`, `cms`, `erp`, `realtime`, `workers`.
- `packages/shared` contracts for constants, event envelopes, and permission declarations.
- `prisma/schema.prisma` for PostgreSQL 16 covering Organisation, Identity, Messaging, Outbox, Audit, and legacy storefront models with `company_id` throughout.
- `prisma/migrations/20261122000000_init/migration.sql` with the full schema, `comet_app` runtime role, grants, and append-only audit rules.
- `prisma/migrations/20261122000100_fix_rls_column_names/migration.sql` — corrective tenant/branch RLS policies for Prisma's camelCase columns.
- `docs/architecture/08-erd.md` and `docs/decisions/ADR-0006-tenant-context.md`.
- `docker-compose.dev.yml` + PgBouncer config for local Postgres/Redis.
- `/api/health/live` and `/api/health/ready` aligned with the OpenAPI skeleton.

**Changed**

- Moved storefront from `src/` to `packages/web/src/` and API from `server/` to `packages/api/`.
- Root scripts now delegate to workspaces; build output is `packages/web/dist/`.
- `.env.example` documents owner vs RLS-enforced runtime database URLs, Redis, and R2 settings.
- README updated for the workspace layout and Postgres workflow.

**Database changes**

- SQLite → PostgreSQL 16.
- New tenant/branch-scoped tables for Identity, Organisation, Messaging, Retention, Legal Hold, Outbox, and Audit.
- Existing storefront tables now carry `company_id`.
- Raw SQL: RLS, roles/grants, audit immutability.

**New dependencies / licences**

- None. Docker images used: PostgreSQL 16, Redis 7, PgBouncer (permissive OSS).

**Verification**

- `npm test` — 23 passed.
- `npm run test:smoke` — 31 passed.
- `npm run lint` — warnings only (no errors).
- `npm run build` — passed (`packages/web/dist/`).
- Migrations applied cleanly via `npm run db:deploy`; seed idempotent via `npm run db:seed`.
- RLS verified: default tenant sees 2 users / 1 thread / 10 inboxes; switching `app.company_id` to `cmp_other` returns 0 for each.
- Runtime health endpoints and static SPA smoke check passed.

---

### Phase 1 — Enterprise architecture (documentation only)

**Added**

- `docs/architecture/00-overview.md` — baseline, target architecture, system context, package map.
- `docs/architecture/01-bounded-contexts.md` — context ownership, events, dependency rules.
- `docs/architecture/02-module-map.md` — workspace layout, API namespaces, request lifecycle.
- `docs/architecture/03-deployment-topology.md` — single VPS + Docker Compose topology, sizing, backup and deploy strategy.
- `docs/architecture/04-security-architecture.md` — trust boundaries, RLS, encryption, audit, DLP, PCI scope.
- `docs/architecture/05-data-flows.md` — Mermaid diagrams for API, messaging, files, webhooks, reporting, backups.
- `docs/architecture/06-cost-estimate.md` — launch/staging/k3s/Lightsail cost bands and licensing posture.
- `docs/architecture/07-compliance-kenya.md` — ODPC, KRA/eTIMS, statutory-rate, PCI, and GMP-boundary notes.
- `docs/decisions/ADR-0001-modular-monolith.md` through `ADR-0005-auth-strategy.md`.
- `docs/openapi/README.md` and `docs/openapi/openapi.yaml` — Phase 1 contract skeleton.
- `CHANGELOG.md` — phase gate history.

**Changed**

- No application source code changed in Phase 1.

**Database changes**

- None.

**New dependencies / licences**

- None. Mermaid diagrams are Markdown source.

**Decisions recorded**

- Product identity: Comet Healthcare (the “Crown Appliances” brief name was a placeholder).
- Hosting: single VPS with Docker Compose.
- Data access: PostgreSQL 16, Prisma CRUD plus raw SQL for RLS/partitions.
- Object storage: Cloudflare R2, gated by ODPC data-location review.
- Auth: local + TOTP + OIDC in Phase 3; SAML/LDAP/WebAuthn deferred behind interfaces.
- Manufacturing: included as Phase 13.

**Verification**

- `npm test` — 23 passed.
- `npm run test:smoke` — 31 passed.
- `npm run lint` — warnings only (pre-existing).
- `npm run build` — passed.
- `docs/openapi/openapi.yaml` — parsed successfully as OpenAPI 3.1.0.

---

## [0.1.0] - 2026-11-22

### Homepage and content enhancements

**Added**

- Blue-led palette tokens and local hero readability scrim behind copy.
- QuickLinks CTA band and additional homepage CTAs.
- Redesigned FinalCTA/CTASection and CMS defaults.
- Optimized WebP gallery media serving and tests (separate workspace commit).

**Changed**

- Hero photo veil reduced to approximately 50% transparency.
- Hero copy/photo balance and CTA hierarchy refined.
