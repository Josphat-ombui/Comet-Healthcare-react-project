# ADR-0017: Project Budget Links and Finance Boundary

- **Status:** Accepted (Phase 12)
- **Date:** 2026-11-23
- **Deciders:** Principal architect

## Context

Phase 12 adds projects to the ERP: projects, membership, tasks, milestones, time entries and
finance budget links. Earlier phases established the non-negotiable boundaries: tenant/branch
scope with RLS (ADR-0002, ADR-0006), immutable ID-only audit and event payloads (ADR-0003,
ADR-0008), integer-cent money and an authoritative verified statutory-rate register in finance
(ADR-0011), and fail-closed DLP for free text (ADR-0009).

Projects need two connections to Phase 6 finance: budget usage and customer invoices. Budget usage
is a derived, authoritative calculation owned by finance; invoice tax arithmetic and eTIMS
queueing are likewise owned by finance. If the projects module recomputed either, a second source
of truth would drift from the ledger and could silently misstate project profitability or issue an
invoice with an unverified rate. A socket frame containing project names, hours, rates or amounts
would duplicate data outside RLS. This ADR fixes where those values live, how failures behave and
what may cross the API boundary.

## Decision

### Model and scope

- Six new tenant/branch-scoped tables are appended to the schema: `Project`, `ProjectMember`,
  `Milestone`, `ProjectTask`, `TimeEntry` and `ProjectBudgetLink`. Every table carries
  `companyId`, nullable `branchId`, `classification`, `createdById`, timestamps and reverse
  relations. `branchId = NULL` denotes an organisation-wide record visible to any branch of the
  owning company. RLS and the `tenant_branch_scope` policy are enabled for all six tables.
- All domain logic lives in `packages/api/lib/projects.js`. Routes only authenticate, authorise,
  parse strict Zod bodies and audit reads. `companyId`, statuses and calculated columns are unknown
  keys on write schemas and are rejected.
- Customer, sales-order, task, milestone, member and budget references are tenant-scoped relations
  resolved before writes. `Project.financeInvoiceId` and `TimeEntry.financeInvoiceId` are opaque
  scalar references to finance-owned invoices; the projects module never mutates invoice rows
  directly.

### Hours, money and budget usage

- Hours are `Float` values rounded once, half-up, to two decimals at the service boundary. A time
  amount is the rounded hundredths of an hour multiplied by an integer cents-per-hour rate, with a
  single half-up cent rounding step. All money fields remain safe integer cents.
- `ProjectBudgetLink` stores only `projectId`, `budgetId` and classification. Only an APPROVED
  finance budget may be linked, and a project/budget pair is unique per project.
- Budget usage is loaded **only** through finance's `getBudgetUsage`. Its `lines` and `totals` are
  copied verbatim into the API response. If finance throws, fails tenant scope or is otherwise
  unavailable, the response carries explicit `unavailable` metadata (`BUDGET_NOT_FOUND`,
  `FINANCE_CONFLICT` or `FINANCE_UNAVAILABLE`) with `usage: null`. The projects module never
  estimates, substitutes zeroes or invents totals. A future change must not add a fallback
  calculation here; it belongs in finance.

### Invoicing from time

- `POST /api/projects/{id}/time/{timeId}/invoice` requires an APPROVED, billable entry with a
  positive amount and a project with a customer. A supplied `taxRateId` must resolve to a
  VERIFIED, effective VAT rate before any invoice write; when absent, finance's verified-rate
  guard still applies. The service delegates all tax arithmetic and eTIMS queueing to finance's
  `createInvoice` and `issueInvoice`, then marks the time entry BILLED with the opaque invoice ID.
- The route requires `projects.time.bill` plus `finance.invoice.write` and
  `finance.invoice.issue`, so a project manager cannot create a customer invoice without the
  finance permissions. No live filing, payment or email is performed.

### Events, audits and permissions

- Lifecycle guards for projects, milestones, tasks and time decisions are pure functions in
  `projects.js`, shared with contract tests. Terminal statuses cannot be reopened.
- Free text goes through the shared DLP inspector and fails closed; findings are reported by type
  only. Audit metadata and domain events contain opaque IDs and classification only.
- Permissions are separate: `projects.project.read/write`, `projects.member.read/write`,
  `projects.task.read/write`, `projects.milestone.read/write`, `projects.time.read/write/approve/bill`
  and `projects.budget.read/link`. Managers cannot bill time; compliance is read-only; staff can
  read and write tasks/time but cannot approve, bill or link budgets.
- Domain events are `ProjectCreated`, `ProjectTaskCompleted`, `MilestoneMet` and
  `TimeEntryApproved`. Their strict schemas and the sockets `projects:project`, `projects:task`,
  `projects:milestone` and `projects:time` carry IDs and classification only, routed to the company
  room. ERP handlers ignore frame content and refetch everything through the authenticated API.
  `Idempotency-Key` remains scoped to messaging sends; Phase 12 writes are not replay-safe.

## Alternatives considered

1. **Store full budget line items and totals on ProjectBudgetLink** — rejected: duplicates finance
   data that changes with postings and would drift from the ledger.
2. **Compute variance from project.budgetCents and finance totals locally** — rejected: a second
   source of truth with different rounding and scope rules; unavailable finance data must be
   explicit, not inferred.
3. **Return zeroed totals when finance is unavailable** — rejected: silently misrepresents an
   unavailable service as a zero-variance budget and could hide errors.
4. **Let project workers issue invoices with only `projects.time.bill`** — rejected: removes the
   finance separation of duties and the verified-rate boundary.
5. **Use a raw Prisma `$transaction` array across project and invoice writes** — rejected: bypasses
   the tenant context proxy and RLS. Sequential scoped writes preserve tenancy.
6. **Emit project names, hours, rates or amounts on socket frames** — rejected: extends DLP exposure
   outside RLS and contradicts ADR-0003.

## Consequences

- Positive: budget usage and invoice tax always have one authoritative owner in finance; a failure
  is visible to the caller instead of being masked by fabricated numbers.
- Positive: project event frames and audits are ID-only invalidation signals, so RLS is always
  reapplied when the ERP refetches content.
- Positive: billing, approval and budget linking are distinct permissions, preserving separation of
  duties between project delivery and finance.
- Cost: a finance outage or a missing VERIFIED VAT rate blocks the affected project read/billing
  path rather than returning a plausible-looking number or invoice.
- Cost: clients must inspect returned statuses before retrying because Phase 12 endpoints do not
  honour `Idempotency-Key`.
