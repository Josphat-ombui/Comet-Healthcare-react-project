# Comet Healthcare

Premium enterprise platform for **Comet Healthcare Pharmaceutical Ltd** — a Kenyan
GMP pharmaceutical manufacturer and CDMO. This site is B2B: it presents products and
services, and turns interest into **consultations with senior in-house experts** and
**tracked inquiries**. Partners/clients are the "patients" and the experts/consultants
are the "providers" — the naming was kept supplier-neutral in the data model.

## Stack

- **Frontend** — React 19, Vite 8, Tailwind CSS 4, React Router 7, lucide-react.
- **Backend** — Express 5 (async routes), Prisma 6, Zod validation, JWT + rotating
  refresh cookies, bcryptjs, Nodemailer. PostgreSQL 16 locally and in production.
- **Dev mail mode** — when `SMTP_HOST` is empty, all outbound email is printed to the
  server console instead of being sent. Set real SMTP/transactional credentials to send.

## Prerequisites

- Node.js ≥ 22 and npm.
- An internet connection for the one-time Prisma client generation.

## Quick start

```bash
npm install
cp .env.example .env
npm run infra:up      # PostgreSQL 16 + Redis 7 via Docker Compose
npm run db:generate   # generate Prisma client
npm run db:deploy     # apply versioned migrations (RLS, roles, audit rules)
npm run db:seed       # tenant, branches, departments, inboxes, demo data
npm run dev           # API on :4000 + Vite on :5173 (Vite proxies /api -> :4000)
npm run dev:erp       # internal ERP shell on :5174
npm run dev:realtime  # Socket.IO server on :4001 (loads Redis if available)
npm run dev:workers   # outbox publisher + BullMQ job workers
```

Open http://localhost:5173. The API runs as the non-owner `comet_app` role from
`DATABASE_URL_APP`; migrations and seeds use the owner `DATABASE_URL`.
The ERP inbox is at http://localhost:5174; it polls the API when the realtime
service is not running.

### Demo accounts (seeded)

| Role  | Email                          | Password       |
| ----- | ------------------------------ | -------------- |
| Admin | admin@comethealthcare.local    | `ChangeMe123!` (or `SEED_ADMIN_PASSWORD`) |
| Staff | staff@comethealthcare.local    | `StaffPass123!` |
| Client| client@comethealthcare.local   | `ClientPass123!` |

Phase 5 does not change the seed accounts or their passwords.

## What's implemented

- **Public site** — Home, Services, Products (catalogue request form), Experts
  directory with live search/filter/pagination, expert profiles, consultation
  **booking flow** (expert → 14-day availability → slot → details → confirmation
  with reference), About / Purpose / Mission / Science / Team / Testimonials,
  Contact with a working inquiry form and WhatsApp handoff.
- **Identity (Phase 3)** — per-tenant email uniqueness, password policy and breach
  check, failed-login lockout, rotating refresh sessions, TOTP + recovery codes,
  optional OIDC SSO, RBAC/ABAC, and a tamper-evident audit trail.
  `POST /api/auth/login` still returns `{ token, user }` for the storefront.
- **Client portal** (`/portal`) — upcoming/past consultations, cancel &
  reschedule, and a list of your submitted inquiries.
- **Admin portal** (`/portal/admin`) — dashboard stats, manage all appointments
  and inquiries (status changes).
- **REST API** — `packages/api/routes/` with Zod validation, auth/role/permission
  guards, tenant-scoped Prisma proxy, rate limiting, and conflict-safe slot
  availability. All endpoints are under `/api`; contract: `docs/openapi/openapi.yaml`.
- **Internal messaging (Phase 4)** — tenant-scoped inboxes, threads, channels,
  internal notes hidden from non-managers, read receipts, recall/edit/reactions,
  routing rules, fail-closed DLP, idempotent sends, and Socket.IO realtime with a
  polling fallback. Messaging never calls SMTP. Contract: `docs/openapi/openapi.yaml`.
- **ERP shell (Phase 4)** — login, sessions, user directory and branches plus a
  working inbox (thread list, composer, internal-note toggle, reactions, recall,
  assign/resolve, presence/typing, offline queue) at http://localhost:5174.
- **Shared services (Phase 5)** — tenant-scoped `FileObject`/`FileVersion` with
  R2 presigned uploads and an AES-256-GCM encrypted local fallback, scan quarantine,
  versions and short-lived download tickets; linear workflow definitions, instances
  and tasks with approve/delegate; in-app-only notifications with user preferences;
  permission-aware PostgreSQL full-text search; queued business document generation
  (quotation, invoice, proforma, SLA, NDA, COA) with PDF storage. All Phase 5 tables
  are RLS-protected and all new events carry IDs/classification only.
  Contract: `docs/openapi/openapi.yaml` (`0.5.0-phase.5`); decision: `docs/decisions/ADR-0010-shared-services.md`.
- **Finance (Phase 6)** — tenant/branch-scoped chart of accounts, parties with encrypted PIN
  references, a versioned statutory-rate register with manual verification, balanced
  double-entry journals, sales/purchase invoices and payments, budgets, trial balance/income/
  balance-sheet/ageing statements, and a ready-only eTIMS payload queue. All money is integer
  cents; rates are taken only from verified statutory rows. The ERP at `:5174` has a Finance tab.
  Contract: `docs/openapi/openapi.yaml` (`0.6.0-phase.6`); decision: `docs/decisions/ADR-0011-finance-and-statutory-rates.md`.
- **Sales (Phase 7)** — tenant/branch-scoped quotes, sales orders, delivery notes and returns with
  explicit status transitions and ID-only audit/events. Quotes convert to draft orders; confirmed
  orders can create finance invoices, but Sales stores only a `taxRateId` reference and never
  calculates or hardcodes tax. All document amounts are integer cents and all dates are strict
  `YYYY-MM-DD`. The ERP at `:5174` has a Sales tab. Contract: `docs/openapi/openapi.yaml`
  (`0.7.0-phase.7`); decision: `docs/decisions/ADR-0012-sales-lifecycle.md`.
- **Inventory (Phase 8)** — tenant/branch-scoped items, warehouses, batches, balances, stock
  movements, transfers and stock counts. Receipts use weighted-average valuation rounded once to
  integer cents; issues, transfers and count variances consume the current balance cost. Only
  RELEASED batches may be issued, and reorder alerts emit on downward threshold crossings. Every
  write is audited and every realtime frame is ID/classification-only. The ERP at `:5174` has an
  Inventory tab. Contract: `docs/openapi/openapi.yaml` (`0.8.0-phase.8`); decision:
  `docs/decisions/ADR-0013-inventory-valuation.md`.
- **Procurement (Phase 9)** — tenant/branch-scoped purchase requisitions, purchase orders, goods
  receipt notes, supplier returns and three-way matching. Requisitions convert to draft orders;
  partial/full receipts post stock through inventory and update ordered/received quantities;
  approved returns issue stock back. Matching uses cent-exact variances and a configurable
  business tolerance in basis points — never a statutory rate. No finance journal or payment is
  created. The ERP at `:5174` has a Procurement tab. Contract: `docs/openapi/openapi.yaml`
  (`0.9.0-phase.9`); decision: `docs/decisions/ADR-0014-procurement-matching.md`.
- **Service (Phase 10)** — tenant/branch-scoped service contracts, SLA tickets, work orders,
  visits and part usage. Contracts and direct-customer tickets carry whole-hour commercial SLA
  targets (defaults 4h response / 48h resolution); SLA state is derived from persisted
  timestamps and never from a statutory rate. Part usage posts through the Phase 8 inventory
  ledger or is flagged for manual issue; optional work-order invoices delegate tax arithmetic
  to finance and require a VERIFIED effective VAT rate. The ERP at `:5174` has a Service tab.
  Contract: `docs/openapi/openapi.yaml` (`0.10.0-phase.10`); decision:
  `docs/decisions/ADR-0015-service-sla.md`.

> **Rate warning:** verify statutory rates against current KRA/Government publications before
> use — fixture rates are `UNVERIFIED`. Sales may reference an unverified rate on a draft, but
> finance rejects invoice issue until a VERIFIED, effective rate exists. eTIMS is a ready-only
> internal queue; it is **not live KRA filing** and never submits to KRA.

### API namespaces

| Namespace | Phase 5/6/7/8/9/10 endpoints (summary) |
| --- | --- |
| `/api/files` | `POST /uploads`, `POST /uploads/:id/confirm`, `GET /?purpose&status&limit`, `GET /:id`, `GET /:id/download`, `POST /:id/versions`, `DELETE /:id`. Local fallback ticket URLs: `/local-upload/:token`, `/local-download/:token`. |
| `/api/workflow` | `GET|POST /definitions`, `GET|POST /instances`, `GET /tasks?mine=1`, `POST /tasks/:id/decide`, `POST /tasks/:id/delegate`. |
| `/api/notifications` | `GET /?unreadOnly&category&limit`, `GET|PUT /preferences`, `POST /:id/read`, `POST /read-all`. |
| `/api/search` | `GET /?q&types&limit` (permission-aware FTS over files, documents, workflows, users). |
| `/api/documents` | `GET /kinds`, `GET /`, `POST /generate`, `GET /jobs/:id`, `GET /:code/download`, `GET /:code`, `GET /:code/pdf`. |
| `/api/finance` | `GET\|POST /accounts`, `GET\|POST /parties`, `GET\|POST /statutory-rates`, `POST /statutory-rates/:id/verify`, `GET\|POST /journals`, `GET /journals/:id`, `POST /journals/:id/post`, `POST /journals/:id/reverse`, `GET\|POST /invoices`, `GET /invoices/:id`, `POST /invoices/:id/issue`, `GET\|POST /payments`, `GET /payments/:id`, `GET\|POST /budgets`, `GET /budgets/:id`, `POST /budgets/:id/approve`, `GET /statements/{trial-balance,income,balance-sheet,ageing}`, `GET /etims/submissions`, `GET /etims/submissions/:id`, `POST /etims/submissions/:id/retry`, `GET /etims/payload/:invoiceId`. |
| `/api/sales` | `GET|POST /quotes`, `GET|PATCH /quotes/:id`, `POST /quotes/:id/convert`, `GET|POST /orders`, `GET|PATCH /orders/:id`, `POST /orders/:id/confirm`, `POST /orders/:id/invoice`, `GET|POST /deliveries`, `GET|PATCH /deliveries/:id`, `POST /deliveries/:id/issue`, `POST /deliveries/:id/deliver`, `GET|POST /returns`, `GET|PATCH /returns/:id`, `POST /returns/:id/approve`, `POST /returns/:id/receive`. |
| `/api/inventory` | `GET|POST /items`, `GET|PATCH /items/:id`, `GET|POST /warehouses`, `GET|PATCH /warehouses/:id`, `GET|POST /batches`, `GET|PATCH /batches/:id`, `GET /balances`, `GET /movements`, `GET /alerts`, `POST /stock/receipts`, `POST /stock/issues`, `POST /stock/adjustments`, `GET|POST /transfers`, `GET /transfers/:id`, `POST /transfers/:id/{approve,receive,cancel}`, `GET|POST /counts`, `GET /counts/:id`, `POST /counts/:id/{record,approve,cancel}`. |
| `/api/procurement` | `GET|POST /requisitions`, `GET /requisitions/:id`, `POST /requisitions/:id/{submit,approve,convert}`, `GET|POST /orders`, `GET /orders/:id`, `POST /orders/:id/{approve,send}`, `GET|POST /receipts`, `GET /receipts/:id`, `POST /receipts/:id/inspect`, `GET|POST /returns`, `GET /returns/:id`, `POST /returns/:id/approve`, `GET|POST /matches`, `GET /matches/:id`, `POST /matches/:id/approve`. |
| `/api/service` | `GET|POST /contracts`, `GET /contracts/:id`, `POST /contracts/:id/{activate,suspend,cancel}`, `GET|POST /tickets`, `GET /tickets/:id`, `POST /tickets/:id/{assign,start,wait,resolve,close,cancel}`, `GET|POST /work-orders`, `GET /work-orders/:id`, `POST /work-orders/:id/{schedule,start,complete,cancel,invoice}`, `GET|POST /visits`, `GET /visits/:id`, `POST /visits/:id/{check-in,complete,cancel}`, `GET|POST /parts`, `GET /parts/:id`. |

`Idempotency-Key` is required only for Phase 4 messaging sends; Phase 5, Phase 6, Phase 7, Phase 8, Phase 9 and Phase 10 writes do not use it.
The `finance.etims.submit` worker queue records `PENDING` submissions for a certified provider and
creates in-app notifications only — no live KRA filing occurs.

## Commands

| Command                  | Purpose                                             |
| ------------------------ | --------------------------------------------------- |
| `npm run dev`            | Run API (`:4000`) + Vite (`:5173`) together         |
| `npm run dev:web`        | Vite only                                           |
| `npm run dev:api`        | Express only (watch)                                |
| `npm run dev:erp`        | ERP shell + inbox on `:5174`                        |
| `npm run dev:realtime`   | Socket.IO + Redis adapter on `:4001`                |
| `npm run dev:workers`    | Outbox publisher + BullMQ workers (scans, notifications, documents, search, retention, `finance.etims.submit`) |
| `npm run build`          | Production build to `packages/web/dist/`            |
| `npm start`              | Production server (serves the web build too)        |
| `npm run lint`           | Oxlint                                              |
| `npm test`               | Backend unit tests (node --test)                    |
| `npm run test:smoke`     | Frontend per-route render smoke tests (vitest)      |
| `npm run infra:up/down`  | Start/stop local Postgres + Redis                   |
| `npm run db:deploy`      | Apply versioned Postgres migrations                 |
| `npm run db:seed`        | Seed demo data (idempotent)                         |

## Configuration (`packages/api/lib/config.js`)

Everything is read from `.env` — see `.env.example` for the annotated list:
`PORT`, `DATABASE_URL` (owner), `DATABASE_URL_APP` (RLS-enforced runtime role),
`REDIS_URL`, R2 settings, `JWT_SECRET`/`JWT_EXPIRES_IN`/`JWT_ACCESS_TTL`, `APP_URL`,
`RESET_TOKEN_TTL_SECONDS`, SMTP settings, and `SEED_ADMIN_PASSWORD`.
Phase 3 also adds `OBJECT_ENCRYPTION_KEY`, `PASSWORD_BREACH_ENFORCE`,
`REFRESH_TOKEN_TTL_SECONDS`, `MAX_CONCURRENT_SESSIONS`, `LOGIN_MAX_ATTEMPTS`,
`LOGIN_WINDOW_SECONDS`, and `OIDC_*`. Phase 4 adds `REALTIME_PORT`,
`REALTIME_TOKEN_TTL`, `REALTIME_CORS_ORIGINS`, `REALTIME_CONSUMER_GROUP`,
`REDIS_EVENT_STREAM`, `OUTBOX_POLL_MS`, `OUTBOX_MAX_ATTEMPTS`, and `DLP_MODE`
(`block` by default; use `flag` only for supervised rollout).
Phase 5 uses the R2 settings already listed in `.env.example` plus
`MAX_UPLOAD_BYTES` (default 25 MB), `SIGNED_URL_TTL_SECONDS` (default 900),
`LOCAL_OBJECT_DIR` (default `storage/objects`), optional `FILE_SCAN_HOOK_URL` with
`FILE_SCAN_TIMEOUT_MS`, and the worker controls `QUEUES_ENABLED`, `BULLMQ_PREFIX`,
`RETENTION_SWEEP_CRON`, `OUTBOX_POLL_MS` and `OUTBOX_MAX_ATTEMPTS`.
Phase 6 adds `ETIMS_PAYLOAD_VERSION` (default `1.0`) and `ETIMS_PROVIDER` (default
`internal-queue`) for the ready-only payload queue; neither enables live KRA filing.
Phase 9 adds `PROCUREMENT_MATCH_TOLERANCE_BPS` (default `0`), a business tolerance in basis
points used only for MATCHED vs DISCREPANCY decisions. It is not a statutory or tax rate.

### Object storage (Phase 5)

- With all four R2 connection values set, uploads return a signed R2 `PUT` URL and
  downloads a signed `GET` URL. Create an R2 bucket and an API token
  with object read/write/delete permissions, then set `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
  `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` and optionally `R2_PUBLIC_BASE_URL`. Do not commit these values.
- Without R2 configuration the API uses the encrypted local fallback. Files are written beneath
  `storage/objects/` relative to the repo root (or `LOCAL_OBJECT_DIR` if overridden) with
  `OBJECT_ENCRYPTION_KEY`; keep this path on persistent storage and back up the key separately.
- Confirm ODPC data-location review before storing real personal data in R2 (see
  `docs/architecture/07-compliance-kenya.md`).

## Project layout

```
packages/
  shared/             Zod event/permission/constant contracts
  api/                Express app: index.js, lib/, routes/, tests/
  web/                Storefront: src/, public/, tests/, Vite config
  cms/                Content Studio workspace scaffold
  erp/                Internal suite: ERP shell + messaging UI + Finance/Sales/Inventory/Procurement tabs (public/, static server)
  realtime/           Socket.IO server, Redis adapter and stream relay (Phase 4)
  workers/            Outbox publisher + BullMQ job processors (Phase 5/6)
prisma/
  schema.prisma       PostgreSQL 16 schema (identity, org, messaging, shared services, finance, sales, inventory, procurement, legacy)
  migrations/         Versioned SQL + RLS/role/audit rules
  seed.js             Tenant, branches, departments, inboxes, demo data
docs/
  architecture/       Phase 1 architecture + Phase 3 ERD
  decisions/          ADRs (0001-0014; finance in ADR-0011, sales in ADR-0012, inventory in ADR-0013, procurement in ADR-0014)
  openapi/            Phase 9 API contract (0.9.0-phase.9)
```

## Production-readiness notes

This codebase is a solid foundation, not a finished compliance deliverable.

- **Not HIPAA compliant** and not suited to storing clinical data without a full
  privacy/security program (encryption at rest, audit logs, BAA, DR, staff
  training, etc.). Don't claim compliance in marketing.
- **Email** needs a real transactional provider and domain verification; reset
  tokens, DMARC/SPF/DKIM, and rate limiting all need production review.
- **Auth hardening** — Phase 3 adds session revocation, IP/device tracking, TOTP
  and OIDC. The storefront still stores its JWT in `localStorage`; production
  should use short `JWT_ACCESS_TTL` and a refresh interceptor.
- **Database** — PostgreSQL 16 with Prisma migrations, RLS, a non-owner runtime
  role, and backups. PII should be minimised/encrypted; logs avoid writing it.
- **Inventory (Phase 8)** — stock valuation stays in the inventory ledger with integer-cent weighted averages; it does **not** post finance journals. A future phase must add an explicit inventory→finance posting policy.
- **Procurement (Phase 9)** — receipts and returns post stock through inventory only. Three-way matching compares integer cents with a configurable business tolerance and never posts finance journals, payments or invoice mutations. A future phase must define procurement→finance posting explicitly.
- **Payments** for consultations/CDMO orders aren't wired; add a provider (e.g.
  M-Pesa Daraja/Stripe) if charging clients. Phase 6 finance payments record ledger
  entries only (including `CARD_TOKEN` references) and never charge a card.
- **CSP/CORS** — tighten CORS origin in production; add security headers.
- The visual design ("Comet Blue" navy/azure + brass) lives in
  `packages/web/src/index.css` as Tailwind `@theme` tokens.

