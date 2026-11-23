# Changelog

All notable changes to the Comet Healthcare platform are documented here.

The format follows a phase-gate model: each enterprise phase ends with passing tests, an updated OpenAPI contract, updated documentation, and a review stop.

---

## [Unreleased]

### Phase 15 — Public API and webhooks

**Added**

- Read-only versioned public surface at `/api/public/v1` (`1.0.0`) with static `/docs`, then
  API-key authentication, per-key 60-second rate limiting and explicit scopes on every data route.
  An opaque Bearer key is resolved to `SHA-256(key)` on the reused `ApiKey`; a scope must be granted
  on both the key and its linked `PublicClient` (`public:health:read`, `public:finance:read`,
  `public:sales:read`). The router rejects every write verb with 405.
- Allow-listed summaries only: `/health` returns contract metadata and granted scopes;
  `/finance/summary` accepts `income|ageing` and delegates to the authorised `getStatement` service;
  `/sales/summary` aggregates safe integer cents and counts for `CONFIRMED` and `FULFILLED` orders in
  the client's tenant/branch scope. No statement rows, order IDs, customers, free text, hardcoded
  rate or fabricated total is exposed; unavailable data uses explicit `NO_DATA` metadata.
- Tenant/branch-scoped `PublicClient`, `WebhookSubscription` and `WebhookDelivery` models with six
  new permissions (`public.client.read/write`, `webhook.subscription.read/write`,
  `webhook.delivery.read/retry`). Client registration links an existing `apiKeyId` or accepts a
  caller-owned `keyHash`/`keyPrefix`; no raw key is accepted or returned. Revoking a client revokes
  its key and emits `PublicClientRevoked`.
- `/api/webhooks` management and callback surface: register/list/get/revoke clients;
  create/list/get/update/rotate subscriptions; list/get/retry deliveries; verify signed provider
  callbacks. Webhook secrets are write-only whole-field values, stored as AES-GCM envelopes plus a
  SHA-256 lookup hash; DTOs expose only `secretConfigured` and `rotatedAt`. Delivery URLs must be
  public HTTPS, excluding loopback/private addresses.
- HMAC-SHA256 signing over stable sorted-key JSON with `x-comet-signature: sha256=<hex>` and
  ID/classification-only delivery bodies. `webhook.deliver` carries only opaque IDs; the worker
  records `PENDING`/`RETRYING`/`DELIVERED`/`FAILED`, attempts, next-attempt time, HTTP status and
  normalised reason codes, retries with exponential backoff, and never reads or stores a provider
  response body. Terminal failures emit a strict `WebhookDeliveryFailed` event.
- Best-effort fan-out after successful outbox publication, with `(subscriptionId, eventId)`
  de-duplication and developer lifecycle events excluded to prevent recursive deliveries. Callback
  verification checks the signature before replay state, enforces timestamp freshness, and rejects
  replays through the append-only audit ledger plus an in-memory cache.
- Three strict developer event schemas and two company-room-only sockets (`developer:webhook`,
  `developer:client`). ERP Developer/API tab with authenticated refetch and ID-only invalidation.
- Migration `20261123000900_phase15_public_api` with RLS and `tenant_branch_scope` for all three new
  tables. Idempotent, inert `cmp_comet` fixtures: one DISABLED subscription, one FAILED delivery and
  one client linked to an obviously fake API key hash.
- `packages/api/tests/phase15-public-api.test.js` and `phase15-webhooks.test.js` with 26 tests
  covering scopes, per-key limits, read-only allow-listing, integer-cent summaries, canonical HMAC,
  replay rejection, secret masking, ID-only payloads, retry/backoff status, strict events, socket
  routing, permission separation, tenant scope, migrations, fixtures and ERP wiring.
- OpenAPI bumped to `1.0.0` with the Public API and Webhooks tags, 15 paths, schemas and security
  extensions; developer-portal README, root README, `.env.example` and ADR-0020 added.

**Changed**

- `Idempotency-Key` remains scoped to messaging sends. Provider callback replay uses signature +
  freshness + audit ledger, and delivery de-duplication uses the unique `(subscriptionId, eventId)`
  pair. `apiKeyAuth` documents an opaque Bearer key; `oauth2` is reserved and unused.
- No process-wide plaintext signing secret: subscription secrets use `OBJECT_ENCRYPTION_KEY`, and
  callback HMAC uses the linked API key's SHA-256 hash. No live filing, payment, email or external
  provider response storage was introduced.

**Verification**

- `npm test` — 252 passed (26 Phase 15), 0 failed; `npm run test:smoke` — 31 passed (7 files).
- `npm run lint` passes with 21 pre-existing non-blocking warnings and no Phase 15 warnings.
  `npm run build` passes (`✓ built in 2.24s`, 2335 modules transformed).
- `node --check packages/erp/public/app.js` passes; the changed Phase 15 API files and test also
  pass `node --check`.
- OpenAPI YAML parses as `1.0.0`: 260 paths, 343 operations, 4 `/api/public/v1` paths,
  11 `/api/webhooks` paths, 364 schemas, 23 parameters and 1148 `$ref`s resolving with 0 missing.
- Cross-tenant RLS probe with `comet_app`: `cmp_other` sees 0 rows in `PublicClient`,
  `WebhookSubscription` and `WebhookDelivery`; `cmp_comet` sees 1 row in each.
- `npm run db:deploy`, `npm run db:generate` and two consecutive `npm run db:seed` runs pass; seed
  reports `✓ Seeded inert public client, webhook subscription and failed delivery fixtures`.

### Phase 14 — Reporting

**Added**

- Tenant/branch-scoped reporting domain with strict Zod contracts in `packages/api/lib/reporting.js`:
  report definitions, runs, dashboards and widgets. The only accepted query specification is
  `{ reportKey }` from a fixed nine-key allow-list; SQL, table/field names, `where`, `companyId`,
  `branchId` and every unknown parameter field are rejected before persistence.
- `/api/reporting` endpoints for report keys, definitions, runs (including ID-only queue status),
  dashboards, dashboard summaries and widgets. Six `reporting.*` permissions are enforced with
  bearer auth: ADMIN/MANAGER author and run, STAFF is read-only, and COMPLIANCE reads and runs but
  cannot author definitions or dashboards.
- Typed collectors that call the existing authorised finance, sales, inventory, procurement, HR and
  manufacturing services with explicit tenant/branch scope. There is no second SQL surface and no
  report bypasses source-module DLP or validation.
- Explicit result availability: available summaries carry only safe integer counts and integer-cent
  `totalsCents` (with `totalsAvailable`); count-only sources use `{}` and `false` instead of a
  fabricated zero; unavailable summaries expose only `{ dataAvailable: false, reason, reportKey }`.
  Dashboard summaries reuse the same shape with `NO_RUN_YET` for widgets without a completed run.
- Asynchronous `reporting.run` through `JobRecord` + BullMQ with an ID-only payload and a
  synchronous fallback when queues are disabled or enqueueing fails. The worker runs
  `executeReportRun(reportRunId)` under `runWithTenant` with an owner client; terminal runs are
  never re-executed, and terminal state is persisted before the completion event is emitted.
- Migration `20261123000800_phase14_reporting` with four new RLS-protected tables, generated by
  shadow-DB diff and completed with an idempotent dynamic `tenant_branch_scope` DO block. Idempotent
  `cmp_comet`-only fixtures seed one definition, one dashboard and one widget; no runs are seeded.
- ERP Reporting tab with definition/run/dashboard widgets. Socket frames only invalidate the open
  view; all values are refetched through authenticated endpoints.
- Strict shared reporting event schemas and company-room-only sockets: `ReportRunQueued`,
  `ReportRunCompleted`, `ReportRunFailed` and `DashboardUpdated` map to `reporting:run` and
  `reporting:dashboard`. Frames carry IDs/classification only. See ADR-0019.
- `packages/api/tests/phase14-reporting.test.js` with 16 tests covering the allow-list,
  SQL-injection rejection, typed parameters, DLP fail-closed, tenant scope, integer cents,
  count-only and unavailable summaries, terminal transitions, safe DTOs, strict ID-only events,
  socket routing, permission separation and source wiring.

**Changed**

- OpenAPI bumped to `0.14.0-phase.14` with the Reporting tag, 11 paths, schemas, parameters,
  permissions and `x-realtime` mappings; `x-phase-roadmap.phase14` marked complete.
- `Idempotency-Key` remains scoped to messaging sends; reporting writes are not replay-safe.
- No external filing, payment, email or file export is performed; `fileObjectId` is only an opaque
  nullable reference.

**Verification**

- `npm test` — 226 passed (16 Phase 14), 0 failed; `npm run test:smoke` — 31 passed (7 files).
- `npm run lint` passes with 21 pre-existing non-blocking warnings; no Phase 14 warnings.
  `npm run build` passes (`✓ built in 3.64s`, 2335 modules transformed).
- `node --check` passes for `packages/api/lib/reporting.js`, `packages/api/routes/reporting.routes.js`,
  `packages/workers/src/jobs.js`, `packages/shared/src/events.js`,
  `packages/shared/src/permissions.js`, `packages/realtime/src/events.js`,
  `packages/api/lib/validation.js`, `prisma/seed.js`,
  `packages/api/tests/phase14-reporting.test.js` and `packages/erp/public/app.js`.
- OpenAPI YAML parses as `0.14.0-phase.14` with 245 paths (11 paths / 18 operations under
  `/api/reporting`), 328 schemas, 22 parameters and 1070 `$ref`s resolving with 0 missing.
- Cross-tenant RLS probe with `comet_app`: `cmp_other` sees 0 rows in `ReportDefinition`,
  `ReportRun`, `Dashboard` and `DashboardWidget`; `cmp_comet` sees 1 definition, 1 dashboard,
  1 widget and 0 runs.
- `npm run db:deploy` reports no pending migrations; `npm run db:seed` is idempotent and reports
  `✓ Seeded allow-listed report definition, dashboard and widget fixtures (no runs)`.

### Phase 13 — Manufacturing

**Added**

- Tenant/branch-scoped GMP manufacturing domain with strict Zod contracts: work centers, bills of
  materials, production orders, batch records and QC checks in `packages/api/lib/manufacturing.js`.
  BOM line and standard costs are computed server-side from integer milli-units with one half-up
  rounding at the cent boundary; all money stays in safe integer cents and quantities allow at most
  three decimals. No statutory, tax or filing constant is present.
- `/api/manufacturing` endpoints for all seven tables, including BOM approval, order
  release/start/complete/cancel, batch open/review/reject, material issue, batch release and QC
  sign-off. Fifteen new `manufacturing.*` permissions are enforced with bearer auth; client-supplied
  tenant IDs, statuses, signatures, computed costs and timestamps are rejected.
- GMP release guard: batch number and manufacturing/expiry dates are mandatory, signatures are
  authenticated user IDs only, at least one mandatory QC check must PASS, any FAIL blocks release,
  reviewer and releaser must be different users, and production users cannot release their own
  batch. Material issue delegates to `issueStock`; release creates a RELEASED `InventoryBatch` and
  receives finished stock through existing `createBatch`/`receiveStock` helpers. Movement IDs only
  are returned. See ADR-0018.
- Migration `20261123000700_phase13_manufacturing` with seven new RLS-protected tables, generated
  by shadow-DB diff, plus an idempotent dynamic `tenant_branch_scope` DO block. Idempotent
  `cmp_comet`-only fixtures seed a work center, an approved BOM with two lines and a DRAFT
  production order.
- ERP Manufacturing tab with work centers, BOMs, orders, batch records and QC checks. Socket frames
  only invalidate the open view; content is always refetched through the authenticated API.
- Strict shared manufacturing event schemas and company-room-only sockets: `BomApproved`,
  `ProductionOrderReleased`, `BatchRecordOpened`, `QcCheckFailed` and `BatchReleased` map to
  `manufacturing:bom`, `manufacturing:order`, `manufacturing:batch` and `manufacturing:qc`. Frames
  carry IDs/classification only; deviation and result notes are encrypted at rest and never emitted.
  OpenAPI `0.13.0-phase.13`, ADR-0018, README and OpenAPI README updates.
- `packages/api/tests/phase13-manufacturing.test.js` with 21 tests covering cent math, lifecycle
  and QC release guards, GMP fields, DLP fail-closed, strict ID-only events, permission separation,
  DTO safety, socket routing, tenant scope and source contracts.

**Changed**

- Work centers are soft-deleted with `deletedAt` and cannot be removed while referenced by an
  active production order.
- `Idempotency-Key` remains scoped to messaging sends; manufacturing writes are not replay-safe.

**Verification**

- `npm test` — 210 passed (21 Phase 13), 0 failed; `npm run test:smoke` — 31 passed (7 files).
- `npm run lint` passes with 21 pre-existing non-blocking warnings; no Phase 13 warnings.
  `npm run build` passes (`✓ built in 2.46s`, 2335 modules transformed).
- `node --check` passes for `packages/erp/public/app.js`, `packages/api/lib/manufacturing.js`,
  `packages/api/routes/manufacturing.routes.js` and `packages/api/tests/phase13-manufacturing.test.js`.
- OpenAPI YAML parses as `0.13.0-phase.13` with 234 paths (21 paths / 32 operations under
  `/api/manufacturing`), 293 schemas, 18 parameters and 971 `$ref`s resolving with 0 missing.
- Cross-tenant RLS probe with `comet_app`: `cmp_other` sees 0 rows in all seven manufacturing
  tables; `cmp_comet` sees 1 work center / 1 BOM / 2 BOM lines / 1 production order and 0 in the
  remaining three.
- `npm run db:deploy` and `npm run db:generate` pass; `npm run db:seed` is idempotent and reports
  `✓ Seeded active work center, approved BOM and DRAFT production order fixtures`.

### Phase 12 — Projects

**Added**

- Tenant/branch-scoped projects domain with strict Zod contracts and safe integer-cent arithmetic:
  projects, membership, tasks, milestones, time entries and finance budget links in
  `packages/api/lib/projects.js`. Hours are rounded once, half-up, to two decimals at the service
  boundary; all money stays in safe integer cents. Optional client numbers are checked for
  tenant-uniqueness; otherwise the service allocates a sequential number.
- `/api/projects` endpoints for all six tables, including nested child resources, generic status
  transitions, time approval/rejection, time invoicing and budget usage/links. Fourteen new
  `projects.*` permissions are enforced with bearer auth; client-supplied `companyId`, statuses,
  timestamps and calculated columns are rejected. Billing additionally requires
  `finance.invoice.write` and `finance.invoice.issue`; budget usage/links require the matching
  finance read/write permission.
- Budget usage is delegated to finance's `getBudgetUsage`. Finance failures produce explicit
  `unavailable` metadata (`BUDGET_NOT_FOUND`, `FINANCE_CONFLICT`, `FINANCE_UNAVAILABLE`) with no
  lines or totals invented. Invoicing delegates all tax arithmetic and eTIMS queueing to finance,
  requires `APPROVED` + billable + positive amount + customer, and resolves a VERIFIED effective
  VAT rate before any write. See ADR-0017.
- Migration `20261123000600_phase12_projects` with six new RLS-protected tables, 21 indexes and
  an idempotent dynamic `tenant_branch_scope` policy, generated via the shadow-DB method.
  Idempotent `cmp_comet`-only fixtures seed a PLANNED project, milestone and TODO task.
- ERP Projects tab with projects, members, milestones, tasks, time and budget usage, simple forms
  and row actions. Socket frames only invalidate the open view; content is always refetched through
  the authenticated API.
- Strict shared project event schemas and company-room-only sockets: `projects:project`,
  `projects:task`, `projects:milestone` and `projects:time`. Domain events (`ProjectCreated`,
  `ProjectTaskCompleted`, `MilestoneMet`, `TimeEntryApproved`) and socket frames carry IDs and
  classification only. OpenAPI `0.12.0-phase.12`, ADR-0017, README and OpenAPI README updates.
- `packages/api/tests/phase12-projects.test.js` with 20 tests covering lifecycle guards, date and
  tenant scoping, cent/hours math, DLP fail-closed, strict schemas, separation of duties, strict
  ID-only events/sockets, DTO safety and finance delegation/unavailable metadata.

**Changed**

- Optional document numbers are now honoured when supplied and checked for tenant-uniqueness;
  omitted numbers continue to be allocated by the service. This aligns the validation schemas,
  ERP forms and OpenAPI contract.
- `Idempotency-Key` remains scoped to messaging sends; project writes are not replay-safe.

**Verification**

- `npm test` — 189 passed (20 Phase 12), 0 failed; `npm run test:smoke` — 31 passed (7 files).
- `npm run lint` passes with 21 non-blocking warnings, all in pre-existing web/API files; no Phase 12
  warnings. `npm run build` passes (`✓ built in 2.83s`, 2335 modules transformed).
- `node --check` passes for `packages/erp/public/app.js`, `packages/api/lib/projects.js`,
  `packages/api/lib/validation.js`, `packages/api/routes/projects.routes.js` and
  `packages/api/tests/phase12-projects.test.js`.
- OpenAPI YAML parses as `0.12.0-phase.12` with 213 paths (17 / 25 operations under
  `/api/projects`), 245 schemas, 14 parameters and 842 `$ref`s resolving with 0 missing.
- Cross-tenant RLS probe with `comet_app`: `cmp_other` sees 0 rows in all six project tables;
  `cmp_comet` sees 1 project / 1 milestone / 1 task and 0 in the remaining three.
- `npm run db:deploy` and `npm run db:generate` pass; `npm run db:seed` is idempotent and reports
  `✓ Seeded PLANNED project with PLANNED milestone and TODO task fixtures`.

### Phase 11 — HR

**Added**

- Tenant/branch-scoped HR domain with strict Zod contracts and safe integer-cent arithmetic:
  employees, employment contracts, versioned payroll rates, leave requests, attendance and payroll
  runs/lines in `packages/api/lib/hr.js`. Bank name/number and KRA PIN are AES-GCM encrypted at
  rest; DTOs expose only presence flags and masked suffixes.
- `/api/hr` endpoints for all seven tables, including contract transitions, rate verification,
  leave decisions, attendance upsert and payroll calculate/approve/post. Sixteen new `hr.*`
  permissions are enforced with bearer auth; client-supplied `companyId`, statuses, verification
  metadata and calculated totals are rejected. Rate verification and payroll posting are separated
  from record maintenance, and posting also requires `finance.journal.post`.
- Versioned `PayrollRate` register with UNVERIFIED creation, a separate authorised verify action,
  effective-interval selection and fail-closed 409 when any of PAYE, NSSF_EMPLOYEE, NSSF_EMPLOYER,
  SHIF or HOUSING_LEVY is missing. No statutory percentage or amount is hardcoded; BigInt arithmetic
  rounds each component once, stores a per-line rate snapshot and checks totals for safe-integer
  headroom. See ADR-0016.
- Migration `20261123000500_phase11_hr` with seven new RLS-protected tables and an idempotent
  dynamic `tenant_branch_scope` policy, generated via the shadow-DB method. Idempotent
  `cmp_comet`-only fixtures seed an employee with encrypted bank details, an active contract and
  one UNVERIFIED PAYE rate.
- ERP HR tab with employees, contracts, rates, leave, attendance and payroll runs/lines, simple
  forms and row actions. Socket frames only invalidate the open view; content is always refetched
  through the authenticated API.
- Strict shared HR event schemas and company-room-only sockets: `hr:employee`, `hr:leave`,
  `hr:rate` and `hr:payroll`. Domain events (`EmployeeCreated`, `LeaveApproved`,
  `PayrollRateVerified`, `PayrollRunCalculated`, `PayrollRunApproved`) and socket frames carry
  IDs/classification only. OpenAPI `0.11.0-phase.11`, ADR-0016, README and OpenAPI README updates.
- `packages/api/tests/phase11-hr.test.js` with 17 tests covering version selection, verified-rate
  guards, integer-cent math, absence of hardcoded statutory values, encrypted/masked DTOs, strict
  schemas, DLP fail-closed, lifecycle guards, separation of duties, ID-only events/sockets and
  tenant scoping.

**Changed**

- Payroll posting is ledger-only: one balanced finance journal using system accounts `EXPENSE`,
  `AP_CONTROL` and `BANK`. No filing, payment, payslip email or bank transfer is performed.
- Tenant-scoped sequential Prisma calls replace a raw `$transaction` array so RLS `set_config`
  context is never bypassed.
- `Idempotency-Key` remains scoped to messaging sends; HR writes are not replay-safe.

**Verification**

- `npm test` — 169 passed (17 Phase 11), 0 failed; `npm run test:smoke` — 31 passed (7 files).
- `npm run lint` passes with 21 non-blocking warnings, all in pre-existing web/API files; no Phase 11
  warnings. `npm run build` passes (`✓ built in 3.43s`, 2335 modules transformed).
- `node --check packages/erp/public/app.js` passes. OpenAPI YAML parses as `0.11.0-phase.11` with
  196 paths (21 under `/api/hr`), 203 schemas and 721 `$ref`s resolving with 0 missing.
- Cross-tenant RLS probe with `comet_app`: `cmp_other` sees 0 rows in all seven HR tables;
  `cmp_comet` sees 1 employee / 1 contract / 1 rate and 0 in the remaining four. A cross-tenant
  `Employee` insert under `cmp_other` is blocked by `WITH CHECK` (P2010).
- `npm run db:deploy` and `npm run db:generate` pass; `npm run db:seed` is idempotent and reports
  `✓ Seeded HR employee with encrypted bank details, active contract and UNVERIFIED PAYE rate`.

### Phase 10 — Service

**Added**

- Tenant/branch-scoped service domain with strict Zod contracts and integer-cent arithmetic:
  service contracts, SLA tickets, work orders, site visits and part usage in
  `packages/api/lib/service.js`. Contracts and direct-customer tickets carry whole-hour commercial
  SLA targets (defaults 4h response / 48h resolution); due dates are persisted at ticket open and
  SLA state is derived from timestamps into `PENDING`, `AT_RISK`, `MET` and `BREACHED`.
- `/api/service` endpoints for contracts, tickets, work orders, visits and part usage, including
  activate/suspend/cancel, assign/start/wait/resolve/close/cancel, schedule/start/complete/cancel,
  visit check-in/complete/cancel and optional work-order invoicing. Fourteen new `service.*`
  permissions are enforced with bearer auth; client-supplied `companyId`, statuses, SLA dues and
  calculated totals are rejected.
- Part usage delegates stock effects to the Phase 8 inventory ledger with
  `referenceType: 'SERVICE_PART_USAGE'`. Business stock conflicts are recorded as
  `manualIssueRequired` without failing the service record; DLP/validation failures still fail
  closed. Optional invoicing delegates tax arithmetic to finance and accepts only a VERIFIED,
  effective VAT rate; service never copies `rateBps` or hardcodes tax.
- Migration `20261123000400_phase10_service` with seven new RLS-protected tables and an idempotent
  dynamic `tenant_branch_scope` policy, generated via the shadow-DB method. Idempotent
  `cmp_comet`-only service fixtures are seeded against the existing customer, item and warehouse
  records.
- ERP Service tab with contracts, tickets, work orders, visits and part usage, simple forms and row
  actions. Socket frames only invalidate the open view; content is always refetched through the
  authenticated API.
- Strict shared service event schemas and company-room-only sockets: `service:contract`,
  `service:ticket`, `service:workorder` and `service:visit`. Domain events
  (`ServiceContractActivated`, `ServiceTicketOpened`, `ServiceTicketAssigned`,
  `ServiceTicketResolved`, `WorkOrderCompleted`, `ServiceVisitCompleted`) and socket frames carry
  IDs/classification only. OpenAPI `0.10.0-phase.10`, ADR-0015, README and OpenAPI README updates.
- `packages/api/tests/phase10-service.test.js` with 15 tests covering SLA arithmetic/state,
  lifecycle guards, cent totals, strict schemas, DLP fail-closed, DTO redaction, verified-rate
  guards, permissions, ID-only events/sockets and tenant scoping.

**Changed**

- SLA hours are operational commercial targets, never statutory rates or tax percentages. Direct
  tickets without a contract use documented 4h/48h defaults; a contract amendment never rewrites an
  existing ticket's persisted due dates.
- Visits require check-in before completion; `PLANNED -> COMPLETED` is rejected so check-in time
  cannot be fabricated.
- `Idempotency-Key` remains scoped to messaging sends; service writes are not replay-safe.

**Verification**

- `npm test` — 152 passed (15 Phase 10), 0 failed; `npm run test:smoke` — 31 passed (7 files).
- `npm run lint` passes with 21 non-blocking warnings, all in pre-existing web/API files; no Phase 10
  warnings. `npm run build` passes (`✓ built in 6.39s`, 2335 modules transformed).
- `node --check packages/api/lib/service.js` and `node --check packages/erp/public/app.js` pass.
  OpenAPI YAML parses and all refs resolve: version `0.10.0-phase.10`, 175 paths (27 Service paths
  / 32 operations), 179 schemas, 609 refs, 0 missing refs and 0 invalid `required` entries. All Phase
  3–9 paths are retained.
- `npm run db:deploy`, `npm run db:generate` and seed runs pass. Final cross-tenant RLS probe with
  `comet_app`: `cmp_other` sees 0 rows in all seven service tables; `cmp_comet` sees 1/1/1/1/1 contract,
  line, ticket, work order and work-order line rows and 0 visit/part-usage rows. All seven tables
  have the `tenant_branch_scope` policy.

---

### Phase 9 — Procurement

**Added**

- Tenant/branch-scoped procurement domain with strict Zod contracts and integer-cent arithmetic:
  purchase requisitions, purchase orders, goods receipt notes, supplier returns and three-way
  matches in `packages/api/lib/procurement.js`. Requisitions convert to draft orders; approved
  orders can be received partially or fully with ordered/received quantities updated on the order.
- `/api/procurement` endpoints for requisition/order/receipt/return/match lists and creates plus
  submit/approve/convert, approve/send, inspect, approve-return and approve-match actions. New
  `procurement.*` permissions are enforced with bearer auth on every operation; client-supplied
  `companyId`, statuses and calculated columns are rejected.
- Goods receipts post stock through the Phase 8 inventory ledger and reject quarantined batches or
  inactive items. Supplier returns stay DRAFT until approval, which issues stock back through
  inventory. Three-way matching computes cent-exact receipt and invoice variances and uses
  `PROCUREMENT_MATCH_TOLERANCE_BPS` only as a business tolerance. No finance journal, payment or
  invoice mutation occurs.
- Migration `20261123000300_phase9_procurement` with nine new RLS-protected tables and idempotent
  `tenant_branch_scope` policies, generated via the shadow-DB method. Idempotent `cmp_comet`-only
  procurement fixtures are seeded against the existing supplier, inventory items and warehouses.
- ERP Procurement tab with requisitions, orders, receipts, returns and matches, simple forms and
  row actions. Socket frames only invalidate the open view; content is always refetched through
  the authenticated API.
- Strict shared Procurement event schemas and company-room-only sockets: `procurement:requisition`,
  `procurement:order`, `procurement:receipt`, `procurement:return` and `procurement:match`. Domain
  events and socket frames carry IDs/classification only. OpenAPI `0.9.0-phase.9`, ADR-0014,
  README and OpenAPI README updates.
- `packages/api/tests/phase9-procurement.test.js` covering conversion, partial/full receipts,
  cent-exact tolerance matching, supplier return lifecycle, quarantine/inactive-item rejection,
  DLP, strict ID-only events and tenant scope.

**Changed**

- `PROCUREMENT_MATCH_TOLERANCE_BPS` defaults to `0`. It is a business control for discrepancy
  decisions, not a statutory rate; no tax percentage is hardcoded or copied into procurement rows.
- `Idempotency-Key` remains scoped to messaging sends; procurement writes are not replay-safe.

**Verification**

- `npm test` — 137 passed (16 Phase 9), 0 failed; `npm run test:smoke` — 31 passed (7 files).
- `npm run lint` passes with 21 non-blocking warnings, all in pre-existing web/API files; no Phase 9
  warnings. `npm run build` passes (`✓ built in 7.58s`, 2335 modules transformed).
- `node --check packages/erp/public/app.js` passes with no output. OpenAPI YAML parses and all
  refs resolve: version `0.9.0-phase.9`, 148 paths (18 Procurement paths / 23 operations),
  145 schemas, 491 refs.
- `npm run db:deploy`, `npm run db:generate` and two consecutive `npm run db:seed` runs pass.
  Final cross-tenant RLS probe with `comet_app`: `cmp_other` sees 0 rows in all nine Procurement
  tables; `cmp_comet` sees one seeded row in eight tables and zero `ThreeWayMatch` rows. All nine
  tables have the `tenant_branch_scope` policy.

---

### Phase 8 — Inventory

**Added**

- Tenant/branch-scoped inventory domain with strict Zod contracts and deterministic integer-cent
  valuation: items, warehouses, batches, balances, stock movements, transfers and stock counts in
  `packages/api/lib/inventory.js`. Receipts blend existing balance value with receipt value, round
  the weighted average once to whole cents and rebuild the balance value from that rounded average.
- `/api/inventory` endpoints for item/warehouse/batch CRUD, balances, movements, reorder alerts,
  receipts, issues, adjustments, transfer create/approve/receive/cancel and count
  start/record/approve/cancel. New `inventory.*` permissions are enforced with bearer auth on every
  operation; client-supplied `companyId`, statuses and calculated columns are rejected.
- Migration `20261123000200_phase8_inventory` with nine new RLS-protected tables and idempotent
  `tenant_branch_scope` policies, generated via the shadow-DB method. Idempotent `cmp_comet`-only
  inventory fixtures are seeded for released, quarantined, expired and recalled batches.
- ERP Inventory tab with items, warehouses, batches, balances, movements, transfers, counts and
  reorder alerts, plus simple forms and row actions. Socket frames only invalidate the open view;
  content is always refetched through the authenticated API.
- Strict shared Inventory event schemas and company-room-only sockets: `inventory:item`,
  `inventory:stock`, `inventory:transfer`, `inventory:count` and `inventory:alert`. Domain events and
  socket frames carry IDs/classification only. OpenAPI `0.8.0-phase.8`, ADR-0013, README and
  OpenAPI README updates.
- `packages/api/tests/phase8-inventory.test.js` with 17 tests covering weighted-average cents,
  fractional rounding, receipt/issue balance changes, three-decimal quantities, quarantine fail-closed,
  batch requirements, state guards, transfer cost capture, count variance adjustments, reorder
  crossings, DLP rejection, strict schemas, tenant scope, DTO redaction and ID-only events.

**Changed**

- Stock valuation stays in the inventory ledger; no finance journals are posted. A later phase must
  add an explicit inventory→finance posting policy (ADR-0013).
- `batchId = NULL` means unbatched stock. Batch-tracked items require a batch, and only `RELEASED`
  batches may be issued, transferred or reduced by a count.
- `Idempotency-Key` remains scoped to messaging sends; inventory writes are not replay-safe.

**Verification**

- `npm test` — 122 passed (17 Phase 8); `npm run test:smoke` — 31 passed.
- `npm run lint` and `npm run build` pass; `node --check packages/erp/public/app.js` passes.
  Lint reports only pre-existing non-blocking warnings in other files.
- OpenAPI YAML parses: version `0.8.0-phase.8`, 130 paths (22 Inventory), 114 schemas, 383 refs
  resolved; all Phase 3–7 paths are retained.
- `npm run db:deploy`, `npm run db:generate` and two consecutive `npm run db:seed` runs pass. Final cross-tenant RLS probe
  with `comet_app`: `cmp_other` sees 0 rows in all nine inventory tables; `cmp_comet` sees
  2/2/2/2/2/1/1/1/1 rows. All nine tables have `tenant_branch_scope`.

---

### Phase 7 — Sales

**Added**

- Tenant/branch-scoped sales domain with strict Zod contracts and integer-cent arithmetic:
  quotes, sales orders, delivery notes and returns; quote→order conversion; order confirmation;
  delivery issue/deliver; return approve/receive; and `createInvoiceFromOrder(orderId, input, actor)`
  in `packages/api/lib/sales.js`.
- `/api/sales` endpoints for all four document types plus `POST /quotes/:id/convert`,
  `POST /orders/:id/confirm`, `POST /orders/:id/invoice`, `POST /deliveries/:id/issue`,
  `POST /deliveries/:id/deliver`, `POST /returns/:id/approve` and `POST /returns/:id/receive`.
  New `sales.*` permissions are enforced with bearer auth on every operation; client-supplied
  `companyId`, status and rate values are rejected.
- Migration `20261123000100_phase7_sales` with eight new RLS-protected tables, idempotent
  `tenant_branch_scope` policies, generated via the shadow-DB method. Draft quote/order/delivery/
  return fixtures are seeded idempotently and reference the same UNVERIFIED VAT fixture rate.
- ERP Sales tab with four lists, simple create forms and row actions for conversion, confirmation,
  invoice creation, issue/deliver and approve/receive. Socket frames only invalidate the open view;
  content is always refetched through the authenticated API.
- Strict shared Sales event schemas and company-room-only sockets: `sales:quote`, `sales:order`,
  `sales:delivery`, `sales:return` and `sales:invoice`. Domain events and socket frames carry IDs
  and classification only. OpenAPI `0.7.0-phase.7`, ADR-0012, README and OpenAPI README updates.
- `packages/api/tests/phase7-sales.test.js` with 19 tests covering cent arithmetic, DTO redaction,
  state guards, conversion/projections, verified-rate enforcement, strict DLP rejection, ID-only
  events and company-room routing.

**Changed**

- Sales never hardcodes or copies a statutory rate. `taxRateId` is an intended VAT reference only;
  `taxCents` on sales documents stays `0`. Invoice creation delegates `createInvoice` and
  `issueInvoice` to finance, which accepts only VERIFIED, effective rates. `taxRateId` may be
  omitted; finance rejects issue when no verified rate is available.
- `SalesOrder.financeInvoiceId` is a plain scalar link (no circular Prisma relation) and is set
  only after successful invoice creation.
- `Idempotency-Key` remains scoped to messaging sends; sales writes are not replay-safe.

**Verification**

- `npm test` — 105 passed (19 Phase 7); `npm run test:smoke` — 31 passed.
- `npm run lint` and `npm run build` pass; `node --check packages/erp/public/app.js` passes.
- OpenAPI YAML parses: version `0.7.0-phase.7`, 108 paths (15 Sales), 77 schemas, 274 refs
  resolved; all Phase 3–6 paths are retained.
- `npm run db:deploy`, `npm run db:generate` and two consecutive `npm run db:seed` runs pass.
  Cross-tenant RLS probe with `comet_app`: `cmp_comet` sees 1 probe row, `cmp_other` sees 0;
  all eight sales tables have `tenant_branch_scope`.

---

### Phase 6 — Finance

**Added**

- Tenant/branch-scoped finance domain: versioned statutory rates with UNVERIFIED → VERIFIED
  sign-off, chart of accounts, encrypted-PIN parties, balanced double-entry journals, sales and
  purchase invoices/credit notes, incoming/outgoing payments with allocations, budgets, and
  trial balance / income / balance sheet / ageing statements. All money is integer cents and all
  rates come from verified statutory rows; fixture rates remain UNVERIFIED.
- `/api/finance` endpoints for accounts, parties, statutory rates (including `/verify`), journals
  (detail, post, reverse), invoices (detail, issue), payments (detail), budgets (detail, approve),
  statements and the ready-only eTIMS queue (submissions, detail, retry, payload). New `finance.*`
  permissions and bearer auth on every finance operation.
- ERP Finance tab: rates table plus manual verify form, accounts, parties, invoices with per-row
  Issue, payments with invoice allocation, budgets with approve, generic statement renderer and
  eTIMS submission/payload/retry controls. Verification and PCI warnings are shown in the UI.
- `finance.etims.submit` worker queue: provider-agnostic payloads with encrypted PIN references,
  PENDING records for a certified provider and in-app notifications only. This is **not** live
  KRA filing; `ETIMS_PAYLOAD_VERSION` (default `1.0`) and `ETIMS_PROVIDER` (default
  `internal-queue`) are documented in `.env.example`.
- Phase 6 socket events (`finance:account`, `finance:journal`, `finance:invoice`,
  `finance:payment`, `finance:budget`, `finance:rate`, `finance:etims`, `finance:etims-failed`)
  carrying IDs/classification only; clients refetch through `/api/finance`.
- OpenAPI `0.6.0-phase.6` (24 new paths, 31 operations, 11+ reusable finance schemas), ADR-0011,
  README and OpenAPI README updates.

**Changed**

- Finance calculations never use hardcoded rates or the legacy storefront `taxRate`; that field
  remains outside the statutory-rate table and is not used by Phase 6 finance (ADR-0011).
- Tax PINs are encrypted at rest and only `hasTaxPin`/`taxPinMasked` are emitted; no PAN, card
  number or CVV field exists in any finance request or response. `Idempotency-Key` remains scoped
  to messaging sends only, so finance writes are not replay-safe.
- eTIMS endpoints and events are described strictly as an internal ready-only queue; no claim of
  KRA submission or filing is made.

**Verification**

- `node --check packages/erp/public/app.js` passes.
- OpenAPI YAML parses with Python `yaml.safe_load` (version `0.6.0-phase.6`, 93 paths,
  51 schemas); every `$ref` resolves and all Phase 3/4/5 paths remain.
- `npm run lint` checked for the owned ERP/documentation files; final test count recorded at
  phase-gate review.
- Final Phase 6 test, migration, RLS and runtime smoke counts are recorded at the phase-gate
  review.

---

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
