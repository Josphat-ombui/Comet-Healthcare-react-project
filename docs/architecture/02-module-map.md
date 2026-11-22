# Module Map

Comet Healthcare Enterprise Platform — Phase 1  
Version 1.0 · 2026-11-22

---

## 1. Package layout (target)

```
comet-healthcare/
├── packages/
│   ├── shared/       # schemas, permissions, events, constants, i18n
│   ├── api/          # Express gateway + module routers/services
│   ├── realtime/     # Socket.IO server + Redis adapter
│   ├── workers/      # BullMQ workers + scheduled jobs
│   ├── web/          # public storefront (current src/)
│   ├── cms/          # Content Studio (current portal CMS)
│   └── erp/          # internal business suite
├── prisma/           # schema + migrations + RLS SQL + seeds
├── docs/
│   ├── architecture/
│   ├── decisions/
│   ├── openapi/
│   └── runbooks/
└── CHANGELOG.md
```

Migration to npm workspaces happens in **Phase 2** with no feature change. Current `server/` and `src/` are moved, not rewritten.

---

## 2. API namespaces

| Namespace | Module | Phase |
|---|---|---|
| `/api/auth` | Local auth, sessions, MFA, OIDC callback | 3 |
| `/api/identity` | Users, groups, roles, policies, API keys | 3 |
| `/api/org` | Companies, branches, departments, titles, org chart | 3 |
| `/api/audit` | Audit log search (compliance roles only) | 3 |
| `/api/messaging` | Inboxes, threads, messages, channels, routing | 4 |
| `/api/files` | Uploads, versions, signed URLs, scan status | 5 |
| `/api/workflow` | Definitions, instances, tasks, delegation | 5 |
| `/api/notifications` | Centre, preferences, digests, delivery log | 5 |
| `/api/search` | Permission-aware global search | 5 |
| `/api/documents` | Generation, numbering, templates | 5 |
| `/api/finance` | GL, AP/AR, invoices, payments, budgets, reports | 6 |
| `/api/sales` | Leads, deals, quotations, orders, loyalty | 7 |
| `/api/inventory` | SKUs, stock, transfers, stocktake, valuation | 8 |
| `/api/procurement` | Suppliers, requisitions, RFQs, POs, matching | 9 |
| `/api/service` | Repair tickets, SLA, technician jobs | 10 |
| `/api/hr` | Employees, leave, attendance, payroll inputs | 11 |
| `/api/projects` | Projects, tasks, time, dependencies | 12 |
| `/api/manufacturing` | BOM, work orders, MRP, QC/CAPA, traceability | 13 |
| `/api/reporting` | Reports, KPIs, scheduled delivery | 14 |
| `/api/public/v1` | External REST API (OAuth2 / API keys) | 15 |
| `/api/webhooks` | Inbound provider webhooks | 15 |
| `/api/health` | Liveness, readiness, dependencies | 1/2 |

---

## 3. Internal module anatomy

Every business module follows the same shape:

```
modules/finance/
├── finance.routes.js       # HTTP only: validate, authorise, call service
├── finance.service.js      # business rules + transaction boundary
├── finance.repository.js   # Prisma queries, tenant/branch scoping
├── finance.events.js       # emit/subscribe typed domain events
├── finance.permissions.js  # RBAC + ABAC policy declarations
├── finance.schema.js       # shared Zod DTOs imported by packages/shared
└── finance.test.js         # unit/business-rule tests
```

Rules:

- Routes never contain business logic.
- Services never parse HTTP requests.
- Repositories never emit events; services do.
- Cross-module access goes through `modules/<name>/public.js` or a domain event.

---

## 4. Request lifecycle

```mermaid
sequenceDiagram
    participant C as Client (web/cms/erp)
    participant G as API gateway
    participant A as Auth middleware
    participant T as Tenant context
    participant S as Module service
    participant D as PostgreSQL (RLS)
    participant E as Redis Streams

    C->>G: HTTPS request + JWT/API key
    G->>A: Verify signature, scopes, session
    A->>T: Set companyId, branchId, actorId
    T->>D: BEGIN; SET LOCAL app.company_id, app.branch_id
    S->>D: Scoped query/write
    S->>E: Publish domain event (same transaction outbox)
    D->>G: COMMIT
    G->>C: DTO response + correlation ID
```

---

## 5. Frontend applications

| App | Users | Notes |
|---|---|---|
| `web` | Public visitors, partners/clients | Existing storefront, booking, inquiries, CMS-driven content |
| `cms` | Marketing/content admins | Existing Content Studio, media registry, content publishing |
| `erp` | Staff, managers, compliance | Internal suite; first screens are inbox and directory |
| `realtime` client | All authenticated users | Socket.IO client library shared by `erp` and `cms` |

The ERP shell is designed mobile-first for workshop/stores use and ships as an offline-capable PWA from Phase 5 onward.

---

## 6. Background workers

| Worker | Queue | Phase |
|---|---|---|
| Event projector | `events.*` | 2 |
| Audit hash-chain writer | `audit.write` | 3 |
| Notification delivery | `notifications.*` | 5 |
| Document generation | `documents.generate` | 5 |
| File virus scan + thumbnail | `files.scan` | 5 |
| Report delivery | `reports.schedule` | 14 |
| Retention / legal hold | `retention.sweep` | 5 |
| Backup verification | `backup.verify` | 17 |

---

## 7. Observability wiring

- Every request receives `correlationId` (header `X-Correlation-ID`).
- The same ID is attached to logs, events, queue jobs, and error reports.
- Prometheus scrapes `/metrics` from `api`, `realtime`, and `workers`.
- Loki receives structured JSON logs from all containers.
- Alerts route to the **Management/IT internal inbox** by default, not external email.
