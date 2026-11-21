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
npm run db:generate   # generate Prisma client (needs .env / DATABASE_URL)
npm run db:push       # create the DB and tables
npm run db:seed       # demo experts, admin, client, testimonials, inquiries
npm run dev           # API on :4000 + Vite on :5173 (Vite proxies /api -> :4000)
```

Open http://localhost:5173.

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
- **REST API** — `server/routes/` with Zod validation, auth/role guards, rate
  limiting, and conflict-safe slot availability in `server/lib/slots.js`.
  All endpoints are under `/api`. See the routes directory for details.

## Commands

| Command                  | Purpose                                             |
| ------------------------ | --------------------------------------------------- |
| `npm run dev`            | Run API (`:4000`) + Vite (`:5173`) together         |
| `npm run dev:client`     | Vite only                                           |
| `npm run dev:server`     | Express only (watch)                                |
| `npm run build`          | Production build to `dist/`                         |
| `npm start`              | Production server (serves `dist/` too)              |
| `npm run lint`           | Oxlint                                              |
| `npm test`               | Backend unit tests (node --test)                    |
| `npm run test:smoke`     | Frontend per-route render smoke tests (vitest)      |
| `npm run db:push/reset`  | Create / reset the schema                           |
| `npm run db:seed`        | Seed demo data (idempotent)                         |

## Configuration (`server/lib/config.js`)

Everything is read from `.env` — see `.env.example` for the annotated list:
`PORT`, `DATABASE_URL`, `JWT_SECRET`/`JWT_EXPIRES_IN`, `APP_URL`,
`RESET_TOKEN_TTL_SECONDS`, SMTP settings, and `SEED_ADMIN_PASSWORD`.

## Project layout

```
server/
  index.js            Express app (CORS, rate limit, routes, errors, static)
  lib/                config, prisma, auth (JWT/reset), mailer, validation,
                      slots (availability engine), util
  routes/             auth, providers, appointments, inquiries, content, admin
  prisma/
    schema.prisma     models: User, Provider, ProviderSchedule, Appointment,
                      Inquiry, Testimonial
    seed.js           demo data
  tests/              13 unit tests (slots + auth)
src/
  pages/              public + auth + portal pages (lazy-loaded routes)
  components/         shell (Navbar/Footer) + UI kit (Button, Field, Alert,
                      Modal, Badge, SmartImage…)
  lib/                api client + date helpers
  context/            auth + toasts
tests/                13 route smoke tests (vitest + Testing Library)
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
- **Database** — ship with PostgreSQL + migrations (`prisma migrate dev`) and
  backups. PII (names, emails, messages) should be minimized/encrypted and logs
  already avoid writing it.
- **Payments** for consultations/CDMO orders aren't wired; add a provider (e.g.
  M-Pesa Daraja/Stripe) if charging clients.
- **CSP/CORS** — tighten CORS origin in production; add security headers.
- The visual design ("Comet Blue" navy/azure + brass, Fraunces/Inter) lives in
  `src/index.css` as Tailwind `@theme` tokens."# Comet-Healthcare-react-project" 
"# Comet-Healthcare-react-project" 
