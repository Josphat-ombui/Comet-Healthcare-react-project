# Changelog

All notable changes to the Comet Healthcare platform are documented here.

The format follows a phase-gate model: each enterprise phase ends with passing tests, an updated OpenAPI contract, updated documentation, and a review stop.

---

## [Unreleased]

### Phase 5 — Shared Services

**Added**

- Ten new Prisma models with tenant/branch RLS in migration `20261122000500_phase5_shared_services`:
  `FileObject`, `FileVersion`, `Notification`, `NotificationPreference`, `NotificationDelivery`,
  `WorkflowDefinition`, `WorkflowInstance`, `WorkflowTask`, `SearchDocument` and `JobRecord`.
  The migration also adds a GIN full-text index on `SearchDocument`.
- Shared permissions (`files.object.read/write/delete`, `workflow.definition.read/write`,
  `workflow.instance.read`, `workflow.task.approve/delegate`, `notifications.read/manage`,
  `search.read`, `documents.read/write/issue`) and strict ID-only event contracts: `FileUploaded`,
  `FileScanned`, `NotificationCreated`, `NotificationRead`, `WorkflowInstanceStarted`,
  `WorkflowTaskAssigned`, `WorkflowCompleted`, `DocumentGenerated`, `DocumentIssued` and
  `SearchIndexUpdated`.
- Object storage service with R2 SigV4 presigned uploads/downloads and an AES-256-GCM encrypted
  local fallback (`storage/objects` by default), MIME/magic-byte checks, size limits, confirmation,
  versions, scan statuses and short-lived capability tickets. Public DTOs never expose object keys,
  checksums or tenant IDs.
- `/api/files` (upload tickets, confirm, list, detail, download, versions, soft delete),
  `/api/workflow` (definitions, instances, tasks, decide/delegate), `/api/notifications`
  (inbox, preferences, read/read-all), `/api/search` (permission-aware PostgreSQL FTS with
  bound parameters and a second ACL check) and queued `/api/documents/generate` with job status
  and stored-PDF download; existing document kinds/list/metadata/PDF endpoints remain.
- BullMQ workers for `files.scan` (fail-closed quarantine on hook failure),
  `notifications.dispatch` (in-app only), `documents.generate`, `search.index` and a scheduled
  `retention.sweep`; `JobRecord` rows track queued work. The Phase 4 outbox → Redis Streams
  publisher continues alongside them.
- Phase 5 Socket.IO fan-out: `notification:new`, `notification:read`, `workflow:started`,
  `workflow:task`, `workflow:completed`, `file:new`, `file:scanned`, `document:generated` and
  `document:issued`, all carrying IDs/classification only.
- Phase 5 OpenAPI paths/schemas (`0.5.0-phase.5`), ADR-0010, README and `.env.example` updates.
- Backend phase5 contract tests for file DTO redaction/access rules and generated-document naming;
  the Phase 4 ERP inbox UI is unchanged.

**Changed**

- `Idempotency-Key` remains scoped to messaging sends; no Phase 5 endpoint requires it and Phase 5
  writes are not de-duplicated by the server.
- DLP stays fail-closed (`DLP_MODE=block`); shared services add no path around messaging DLP,
  RLS, visibility checks or the audit trail.
- Existing `/api/documents` endpoints now coexist with queued generation and signed PDF downloads;
  a download requested before generation completes returns 409.

**New dependencies / licences**

- No new first-party dependency. `bullmq` (MIT) and `pdfkit` (MIT) are used from the root workspace;
  R2 signing uses Node `crypto` only.

**Verification**

- Baseline: `npm test` — 36 passed at Phase 4 (29 Phase 1–3 + 7 Phase 4); this phase adds Phase 5
  contract tests, with the final count to be recorded at the phase-gate review.
- OpenAPI YAML parsed successfully with a YAML 1.2 loader; all Phase 3/4 paths retained.
- R2 fallback, worker queues and retention cron are configurable entirely from `.env` with safe
  defaults; local development needs no cloud credentials.

---

### Phase 4 — Messaging and Realtime

**Added**

- `packages/shared/src/dlp.js`: shared detection patterns for card numbers, Kenyan national IDs, KRA PINs and secrets; findings expose type and offsets only, plus redaction helpers.
- Expanded `packages/shared/src/permissions.js` and `packages/shared/src/events.js` with messaging permissions and ID-only event contracts (`MessageSent`, `ThreadAssigned`, `ThreadResolved`, `MessageRecalled`, `ReactionAdded`).
- API libraries `dlp.js`, `messaging-repository.js` and `messaging.js`: inbox/thread access checks, internal aliases, internal-note visibility, read receipts, recall/edit/reactions, routing evaluation, DLP and realtime room tokens.
- `packages/api/routes/messaging.routes.js` mounted at `/api/messaging`: inboxes, members, threads, messages, channels, routing and realtime token endpoints. Sends require `Idempotency-Key`.
- `packages/realtime`: Socket.IO server with Redis adapter, scope-limited room tokens, presence/typing, and a Redis Streams consumer that fans events out to authorised rooms.
- `packages/workers`: transactional outbox → Redis Streams publisher with retry/backoff; BullMQ remains deferred to Phase 5.
- Migration `20261122000400_messaging_phase4`: channel-linked threads, partial unique recipient indexes, outbox publish index.
- ERP inbox at `:5174`: thread list, message pane, composer, internal-note toggle, reactions, recall, assign/resolve, presence/typing, server-served Socket.IO client, polling fallback and an offline queue replayed with idempotency keys.
- Phase 4 OpenAPI paths/schemas, ADR-0009, README and `.env.example` updates.
- Backend tests for DLP detection/redaction, DLP policy mode, event contracts, messaging permissions, realtime token scope and event fan-out.

**Changed**

- RBAC/ABAC now resolves `departmentId` so department inboxes are accessible without widening roles.
- `emitEvent` accepts a transaction client so business writes and outbox rows commit together.
- `HttpError` is serialised centrally with status and safe extra fields (finding types, invalid recipients).
- `COMPLIANCE` retains audit-only reads and is not granted messaging send rights.
- Socket and event payloads carry IDs and classification only — message bodies and subjects are always fetched from the authenticated API.

**New dependencies / licences**

- `@socket.io/redis-adapter` (MIT), `socket.io` (MIT), `jsonwebtoken` (MIT) and `redis` (MIT) in the realtime/workers workspaces.

**Verification**

- `npm test` — 36 passed (29 Phase 1–3 + 7 Phase 4).
- `npm run test:smoke` — 31 passed (7 files). One initial flaky document-title assertion passed on rerun; no web code changed in this phase.
- `npm run lint` — warnings only (no errors).
- `npm run build` — passed (`packages/web/dist/`).
- OpenAPI YAML parsed successfully with a YAML 1.2 loader.
- Migrations applied cleanly via `npm run db:deploy`; seed is idempotent via `npm run db:seed`.
- RLS verified with the `comet_app` role: `cmp_comet` sees 2 threads / 3 messages / 3 recipients; `cmp_other` sees 0 / 0 / 0.
- Runtime smoke — 26/26 checks passed: admin/staff login, thread and message reads, manager visibility of internal notes with empty receipts, RBAC denial for a non-messaging principal, DLP block without echoing the value, required `Idempotency-Key`, idempotent replay, external-address rejection, cross-tenant denial, short-lived realtime tokens, two authenticated sockets with presence and `message:new` fan-out, ID-only socket payloads, outbox event `PUBLISHED` with no body, and Redis Stream delivery.
- Fixed during verification: `Channel.members` relation name in channel listing/creation and `ownerUserId` in the inbox select used by access checks.

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
