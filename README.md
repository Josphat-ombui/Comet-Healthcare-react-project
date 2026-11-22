# Comet Healthcare

Premium enterprise platform for **Comet Healthcare Pharmaceutical Ltd** — a Kenyan
GMP pharmaceutical manufacturer and CDMO. This site is B2B: it presents products and
services, and turns interest into **consultations with senior in-house experts** and
**tracked inquiries**. Partners/clients are the "patients" and the experts/consultants
are the "providers" — the naming was kept supplier-neutral in the data model.

## Stack

- **Frontend** — React 19, Vite 8, Tailwind CSS 4, React Router 7, lucide-react.
- **Backend** — Express 5 (async routes), Prisma 6, Zod validation, JSON Web Tokens
  (bcryptjs), Nodemailer. SQLite locally, PostgreSQL in production.
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
```

Open http://localhost:5173. The API runs as the non-owner `comet_app` role from
`DATABASE_URL_APP`; migrations and seeds use the owner `DATABASE_URL`.

### Demo accounts (seeded)

| Role  | Email                          | Password       |
| ----- | ------------------------------ | -------------- |
| Admin | admin@comethealthcare.local    | `ChangeMe123!` (or `SEED_ADMIN_PASSWORD`) |
| Client| client@comethealthcare.local   | `ClientPass123!` |

## What's implemented

- **Public site** — Home, Services, Products (catalogue request form), Experts
  directory with live search/filter/pagination, expert profiles, consultation
  **booking flow** (expert → 14-day availability → slot → details → confirmation
  with reference), About / Purpose / Mission / Science / Team / Testimonials,
  Contact with a working inquiry form and WhatsApp handoff.
- **Auth** — register, sign in, forgot/reset password (hashed, emailed links),
  JWT in localStorage.
- **Client portal** (`/portal`) — upcoming/past consultations, cancel &
  reschedule, and a list of your submitted inquiries.
- **Admin portal** (`/portal/admin`) — dashboard stats, manage all appointments
  and inquiries (status changes).
- **REST API** — `packages/api/routes/` with Zod validation, auth/role guards,
  rate limiting, and conflict-safe slot availability in `packages/api/lib/slots.js`.
  All endpoints are under `/api`. Contract skeleton: `docs/openapi/openapi.yaml`.

## Commands

| Command                  | Purpose                                             |
| ------------------------ | --------------------------------------------------- |
| `npm run dev`            | Run API (`:4000`) + Vite (`:5173`) together         |
| `npm run dev:web`        | Vite only                                           |
| `npm run dev:api`        | Express only (watch)                                |
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
`REDIS_URL`, R2 settings, `JWT_SECRET`/`JWT_EXPIRES_IN`, `APP_URL`,
`RESET_TOKEN_TTL_SECONDS`, SMTP settings, and `SEED_ADMIN_PASSWORD`.

## Project layout

```
packages/
  shared/             Zod event/permission/constant contracts
  api/                Express app: index.js, lib/, routes/, tests/
  web/                Storefront: src/, public/, tests/, Vite config
  cms/                Content Studio workspace scaffold
  erp/                Internal business suite scaffold
  realtime/           Socket.IO server scaffold (Phase 4)
  workers/            BullMQ consumers scaffold (Phase 5)
prisma/
  schema.prisma       PostgreSQL 16 schema (identity, org, messaging, legacy)
  migrations/         Versioned SQL + RLS/role/audit rules
  seed.js             Tenant, branches, departments, inboxes, demo data
docs/
  architecture/       Phase 1 architecture + Phase 2 ERD
  decisions/          ADRs
  openapi/            API contract skeleton
```

## Production-readiness notes

This codebase is a solid foundation, not a finished compliance deliverable.

- **Not HIPAA compliant** and not suited to storing clinical data without a full
  privacy/security program (encryption at rest, audit logs, BAA, DR, staff
  training, etc.). Don't claim compliance in marketing.
- **Email** needs a real transactional provider and domain verification; reset
  tokens, DMARC/SPF/DKIM, and rate limiting all need production review.
- **Auth hardening** — session revocation, IP/device tracking, and 2FA would be
  sensible before public launch. JWT is currently stored client-side in
  `localStorage`.
- **Database** — PostgreSQL 16 with Prisma migrations, RLS, a non-owner runtime
  role, and backups. PII should be minimised/encrypted; logs avoid writing it.
- **Payments** for consultations/CDMO orders aren't wired; add a provider (e.g.
  M-Pesa Daraja/Stripe) if charging clients.
- **CSP/CORS** — tighten CORS origin in production; add security headers.
- The visual design ("Comet Blue" navy/azure + brass) lives in
  `packages/web/src/index.css` as Tailwind `@theme` tokens.

