# ADR-0015: Service Contracts, SLA Tickets and Work Orders

- **Status:** Accepted (Phase 10)
- **Date:** 2026-11-23
- **Deciders:** Principal architect

## Context

Phase 10 adds the after-sales service desk to the ERP: customer contracts with commercial response
and resolution targets, SLA tickets, technician work orders, site visits and part usage. Phases 2–9
already define the non-negotiable boundaries: tenant/branch scope with RLS, integer-cent money,
strict dates, fail-closed DLP, ID-only audit/event payloads and company-room realtime routing
(ADR-0002, ADR-0003, ADR-0006, ADR-0008, ADR-0009, ADR-0011, ADR-0012, ADR-0013).

Service must not become a second source of financial or stock truth. Finance remains authoritative
for statutory rates and invoice arithmetic (ADR-0011), and inventory remains authoritative for stock
valuation and movement postings (ADR-0013). An SLA target is an operational promise made to a
customer; it is not a tax percentage, a statutory rate or a regulatory deadline. Conflating the two
would make SLA state change whenever a statutory rate changes and would put PII or amounts into
invalidation frames.

## Decision

### Model and scope

- Seven new tenant/branch-scoped tables are appended to the schema: `ServiceContract`,
  `ServiceContractLine`, `ServiceTicket`, `WorkOrder`, `WorkOrderLine`, `ServiceVisit` and
  `ServicePartUsage`. Every table has `companyId`, nullable `branchId`, `classification`,
  `createdById`, timestamps and reverse relations.
- `branchId = NULL` denotes an organisation-wide record visible to any branch of the owning
  company. Customers link to existing FinanceParty `CUSTOMER` rows; lines and part usage link to
  active InventoryItem rows and optional Warehouse/InventoryBatch rows.
- All lifecycle logic lives in `packages/api/lib/service.js`. Routes only authenticate, authorise,
  parse strict Zod bodies and audit reads. Money is stored as safe integer cents; fractional
  quantities are scaled to thousandths and rounded once to a whole cent at the line boundary.
- Direct-customer tickets with no contract use documented defaults of **4 hours** for response and
  **48 hours** for resolution. These are commercial targets, not statutory rates.

### SLA calculation

- Contract and ticket SLA fields are whole hours (`responseSlaHours`, `resolutionSlaHours`).
  Contract values are copied to the ticket at opening time, together with persisted
  `openedAt`, `responseDueAt` and `resolutionDueAt`. A later contract amendment cannot retroactively
  rewrite an existing ticket's deadlines.
- `ServiceTicket.sla` is derived on every read from persisted timestamps: `respondedAt` and
  `resolvedAt` compared with the corresponding due date produce `MET` or `BREACHED`; an incomplete
  target is `BREACHED` when now is past due, `AT_RISK` in the final quarter of the target window,
  otherwise `PENDING`. `sla.breached` is the OR of both components.
- The quarter-window rule is a presentation/alerting heuristic. It is not persisted, is not used for
  billing, and never changes the due date itself.

### Lifecycle guards

- Contract: `DRAFT -> ACTIVE/SUSPENDED/CANCELLED/EXPIRED`; `SUSPENDED -> ACTIVE/EXPIRED/CANCELLED`.
  Terminal states cannot be reopened.
- Ticket: `OPEN -> ASSIGNED/IN_PROGRESS/CANCELLED`; assignment and start/wait/resolve paths follow
  the explicit transition table; `RESOLVED -> CLOSED/IN_PROGRESS`. Resolving stamps `resolvedAt`, which
  freezes the resolution SLA state. Close and cancellation are terminal.
- Work order: `DRAFT -> SCHEDULED/IN_PROGRESS/CANCELLED`; `SCHEDULED -> IN_PROGRESS/CANCELLED`;
  `IN_PROGRESS -> COMPLETED/CANCELLED`. Completion stamps `completedAt`, requires at least one
  billable line or part usage before invoicing, and sets `labourCents`, `partsCents` and `totalCents`
  from persisted lines in safe integer cents.
- Visit: `PLANNED -> IN_PROGRESS/CANCELLED -> COMPLETED`. A visit must be checked in before it can be
  completed; `PLANNED -> COMPLETED` is rejected so check-in time cannot be silently invented.
- Every write is audited with IDs, parent links, action and classification only. Resolution notes and
  other free text never appear in audit metadata or domain events.

### Finance and inventory boundary

- Part usage calls the Phase 8 `issueStock` helper with `referenceType: 'SERVICE_PART_USAGE'` when
  stock is available. A business stock conflict (missing balance, inactive item, quarantined/expired
  batch, insufficient quantity) is recorded as `inventoryIssued: false` and
  `manualIssueRequired: true` so service work is not blocked, while DLP/validation failures still
  fail closed and leave no service record.
- An optional invoice from a `COMPLETED` work order delegates all tax arithmetic to finance
  `createInvoice` + `issueInvoice`. A supplied `taxRateId` must resolve via `resolveVerifiedRate` to
  an effective `VAT` row with status `VERIFIED`; an omitted rate is allowed and finance rejects
  issuance if no verified rate is available. Service never copies `rateBps` and never calculates tax.
- Invoice lines are generated from work-order labour lines and recorded part usage. The work order
  stores `financeInvoiceId` as a reference only; service does not post finance journals, payments or
  receipts.

### Validation, tenancy, audit and realtime

- Write schemas are strict: `companyId`, statuses, SLA due dates, totals and calculated columns are
  unknown keys and are rejected. All free text goes through the shared DLP inspector and fails
  closed; findings are reported by type only.
- Tenant context always comes from the authenticated principal. Reads and writes use company +
  branch scope through the tenant-aware Prisma client, backed by idempotent `tenant_branch_scope`
  RLS policies on all seven tables. Fourteen `service.*` permissions gate the HTTP surface; clients
  cannot escalate role at runtime.
- Domain events are `ServiceContractActivated`, `ServiceTicketOpened`, `ServiceTicketAssigned`,
  `ServiceTicketResolved`, `WorkOrderCompleted` and `ServiceVisitCompleted`. Their schemas are strict
  and permit only IDs and classification.
- Sockets are `service:contract`, `service:ticket`, `service:workorder` and `service:visit`, routed
  only to `company:{companyId}`. ERP handlers ignore frame content and refetch through the
  authenticated API. `Idempotency-Key` remains scoped to messaging sends; service writes are not
  replay-safe.

## Alternatives considered

1. **Derive SLA deadlines from the active VAT table or a statutory clock** — rejected: a commercial
   target is not a statutory rate and must not change when rates change.
2. **Store SLA state as a mutable column** — rejected: it would drift from the persisted timestamps
   and require background recomputation; deriving on read is reproducible.
3. **Fail the whole service record when stock cannot be issued** — rejected: field engineers must
   still record work; a manual-issue flag preserves the gap visibly without pretending stock moved.
4. **Silently skip a visit check-in when completing** — rejected: it fabricates a timestamp and
   removes the distinction between planned and actual work.
5. **Let service calculate and store VAT amounts** — rejected: finance owns verified rates and all
   tax arithmetic (ADR-0011).
6. **Emit amounts, subjects, customer names or notes in socket frames** — rejected: duplicates
   authority outside RLS and expands DLP/PII exposure; extends ADR-0003's ID-only rule to service.

## Consequences

- Positive: SLA state is reproducible from immutable timestamps and cannot be confused with VAT or
  regulatory rates.
- Positive: stock and tax gaps are explicit (`manualIssueRequired`, verified-rate guard) instead of
  being hidden in service records.
- Positive: every realtime frame is an ID-only invalidation signal routed to the company room.
- Cost: a field engineer must reconcile any part usage marked for manual issue in inventory.
- Cost: invoice creation requires a VERIFIED effective VAT rate or finance will reject issuance.
- Cost: clients must inspect returned document statuses before retrying because service endpoints
  do not honour `Idempotency-Key`.
