# ADR-0019: Allow-listed Reporting and Explicit Data Availability

- **Status:** Accepted (Phase 14)
- **Date:** 2026-11-23
- **Deciders:** Principal architect

## Context

Phase 14 adds a Reporting tab to the ERP: report definitions, runs, dashboards and widgets. Reporting
is used across finance, sales, inventory, procurement, HR and manufacturing, so it is the easiest
place to accidentally create a second data-access path. Earlier phases established non-negotiable
boundaries: tenant/branch scope with RLS and a non-owner runtime role (ADR-0002, ADR-0006), ID-only
audits and events (ADR-0003, ADR-0008), integer-cent money and authoritative module services
(ADR-0011 through ADR-0018), and fail-closed DLP for free text (ADR-0009).

A report must never become an SQL injection surface, a way to cross tenants, or a place where missing
data is silently replaced with zero. Consumers need to distinguish "there are no rows", "the source
is unavailable" and "this source has no money columns". This ADR fixes the contract, the execution
path and the event boundary for reporting.

## Decision

### Fixed allow-list and strict query specification

- Exactly nine `reportKey` values exist: `finance.trial-balance`, `finance.income-statement`,
  `finance.balance-sheet`, `finance.receivables-ageing`, `sales.orders`, `inventory.stock-value`,
  `procurement.purchase-orders`, `hr.payroll-runs` and `manufacturing.production-orders`.
- A definition's `querySpec` is exactly `{ reportKey }` with an allow-listed value. It is not a query
  language. SQL keywords, semicolons, comments, table names, field names, `sql`, `query`, `where`,
  `companyId` and `branchId` are rejected by Zod and by the service-level guard before persistence.
- Run parameters are typed per key (`from`, `to`, `asOf`, `direction`, `status`). Unknown, tenant,
  SQL-like and cross-key fields are rejected. Parameters are values for a named collector, never
  fragments of a query.
- `GET /api/reporting/report-keys` returns the static contract list; it has no query capability.

### Execution and data availability

- Each key maps to one server-side collector in `packages/api/lib/reporting.js`. Finance keys call
  the Phase 6 statement service; sales, inventory, procurement, HR and manufacturing keys call their
  own authorised services with explicit tenant/branch scope. Reporting never builds SQL from client
  input and never bypasses the source module's guards or DLP rules.
- All money in a result summary is a safe integer in `totalsCents`; keys must end in `Cents`. Counts
  are safe non-negative integers. Decimals, strings, `NaN`, prototype-polluting keys and unknown
  summary fields are rejected before persistence.
- An available summary is `{ dataAvailable: true, reportKey, counts, totalsCents, totalsAvailable,
  generatedAt }`. A count-only source such as production orders returns `totalsCents: {}` and
  `totalsAvailable: false` — never a fabricated `0` cent total.
- An unavailable summary is `{ dataAvailable: false, reason, reportKey }` with a fixed reason code.
  It carries no counts, totals, exception text or source error. Dashboard widgets with no completed
  run report `NO_RUN_YET` through the same shape.
- A run has `QUEUED`, `RUNNING`, `COMPLETED` or `FAILED` status. Terminal runs are never re-executed.
  The terminal status and result summary are persisted before the completion event is emitted, so a
  failed outbox write cannot relabel a completed run.

### Queue, events and permissions

- `POST /api/reporting/runs` enqueues `reporting.run` through BullMQ when queues are enabled. The
  job payload, `JobRecord.payload` and worker result contain only opaque IDs and classification;
  no report key, parameter, count, cent amount, status or file ID crosses the queue boundary. When
  queues are disabled or enqueueing fails, the API executes the run synchronously in the same
  tenant scope and still records the run status.
- The worker obtains an owner Prisma client, wraps execution in `runWithTenant`, passes an explicit
  `companyId`, and calls `executeReportRun(reportRunId)`. It never receives collector parameters or
  a result summary.
- The six permissions are `reporting.definition.read/write`, `reporting.run.read/write` and
  `reporting.dashboard.read/write`. ADMIN and MANAGER may author definitions/dashboards and queue
  runs; STAFF is read-only; COMPLIANCE may read reports and queue runs but cannot author definitions
  or dashboards.
- Domain events are `ReportRunQueued`, `ReportRunCompleted`, `ReportRunFailed` and `DashboardUpdated`.
  Their strict schemas and sockets `reporting:run` / `reporting:dashboard` carry IDs and
  classification only, routed to the company room — never user, branch, thread or inbox rooms. ERP
  handlers ignore frame data and refetch through authenticated endpoints. `Idempotency-Key` remains
  scoped to messaging sends; reporting writes are not replay-safe.

### Boundaries

- Four new tenant/branch-scoped tables (`ReportDefinition`, `ReportRun`, `Dashboard`,
  `DashboardWidget`) carry RLS and the dynamic `tenant_branch_scope` policy. `branchId = NULL` means
  organisation-wide within the company.
- No report execution performs an external filing, payment, email or file export. `fileObjectId` is
  an opaque nullable reference for future work, not proof that a file exists.

## Alternatives considered

1. **Store client SQL in `querySpec`** — rejected: direct SQL injection surface and bypass of RLS,
   source-module guards and DLP.
2. **Accept an arbitrary report key with a free-form parameter map** — rejected: unvalidated keys and
   values reach collectors, weakening tenant and field-level guarantees.
3. **Return `0` for unavailable totals** — rejected: indistinguishable from a real zero and likely to
   misstate financial position.
4. **Encode summary JSON in events so clients need no refetch** — rejected: leaks counts and money
   outside RLS and breaks the ID-only event contract.
5. **Execute runs only inside the HTTP request** — rejected: long source calls block API workers;
   BullMQ with an ID-only payload keeps execution observable and tenant-scoped.
6. **Grant all roles the same reporting permissions** — rejected: definition/dashboard authoring and
   run execution are separate duties, particularly for COMPLIANCE.

## Consequences

- Positive: reporting has no SQL surface; every value comes from an existing authorised module.
- Positive: clients can render real integer counts/cents or show explicit unavailability, with no
  fabricated zeros.
- Positive: queue jobs and socket frames carry no report content, so DLP and tenant visibility remain
  enforced at the authenticated API boundary.
- Cost: adding a new report requires a code change, a new allow-listed key, a collector and tests.
- Cost: count-only sources cannot be rendered as money charts without an explicit product decision.
- Cost: asynchronous runs require clients to poll the run or wait for the ID-only `reporting:run`
  invalidation signal before reading `resultSummary`.
