# ADR-0012: Sales Lifecycle and the Finance Invoice Boundary

- **Status:** Accepted (Phase 7)
- **Date:** 2026-11-23
- **Deciders:** Principal architect

## Context

Phase 7 adds the sell-side operating documents to the ERP: sales quotes, sales orders,
delivery notes and sales returns. These documents must preserve tenant/branch isolation, explicit
status history, integer-cent amounts, strict dates, DLP-safe text, auditable writes and ID-only
realtime events, following the controls already established in Phases 4–6.

Phase 6 introduced the authoritative finance ledger and its versioned statutory-rate register.
A tempting shortcut would be to copy a rate value onto sales documents and compute tax there, but
that would duplicate rate governance, silently diverge when a Finance Act changes a rate, and make
historical documents depend on stale copied values. Invoice creation also needs to be a deliberate
finance action: sales users must not be able to bypass rate verification or post directly to the
ledger.

## Decision

### Document model and status transitions

- Eight new tenant/branch-scoped tables are appended to the schema: `SalesQuote`,
  `SalesQuoteLine`, `SalesOrder`, `SalesOrderLine`, `DeliveryNote`, `DeliveryNoteLine`,
  `SalesReturn` and `SalesReturnLine`. Header documents are numbered per company (`QUO`, `ORD`,
  `DN`, `RET`). `SalesOrder.financeInvoiceId` is a plain scalar link, not a Prisma relation, so
  finance remains the owner of the invoice aggregate and there is no circular dependency.
- Guarded transitions:
  - Quote: `DRAFT → SENT → ACCEPTED → CONVERTED`; rejection, expiry and cancellation are terminal
    branches. Only `DRAFT` quote fields are editable.
  - Order: `DRAFT → CONFIRMED → FULFILLED`; cancellation is a terminal branch. Confirmation is
    required before delivery or invoicing.
  - Delivery note: `DRAFT → ISSUED → IN_TRANSIT → DELIVERED` (with `ISSUED → DELIVERED` allowed);
    cancellation is terminal.
  - Return: `DRAFT → APPROVED → RECEIVED`, with `DRAFT|APPROVED → REJECTED` as a terminal branch.
- Conversion and projection helpers copy party IDs, line descriptions, quantities, unit cents and
  calculated totals. They never copy a rate value. A confirmed order can issue a delivery note;
  a delivery note can seed a return.

### Money, dates and rates

- Every sales amount is an integer number of cents (`*Cents`) and every document date is a strict
  ISO `YYYY-MM-DD` string. `calculateSalesTotals` sums whole cents and reports `taxCents: 0`.
- `taxRateId` is an **intended VAT reference only**. It must identify a VAT rate in the caller's
  tenant, but an `UNVERIFIED` rate may be stored on a draft document. No `rateBps` column or rate
  value is added to any sales table, request or response.
- `createInvoiceFromOrder` first checks that the order is `CONFIRMED` and not already invoiced,
  then calls finance `createInvoice` and `issueInvoice`. The rate is resolved through finance's
  VERIFIED/effective guard. A supplied `taxRateId` must be a verified VAT row; if it is omitted,
  finance selects the effective verified VAT rate or rejects with 409. The order receives
  `financeInvoiceId` only after both finance calls succeed.

### Validation, tenancy and audit

- Request schemas are strict: `companyId`, statuses, computed totals and rate values are unknown
  keys and are rejected. Free text is checked with the shared DLP patterns and fails closed;
  findings are reported by type only.
- Tenant context always comes from the authenticated principal through the tenant-scoped Prisma
  proxy. Reads and writes use company + branch scope, with organisation-wide (`branchId = NULL`)
  rows visible to any branch. All eight tables have idempotent `tenant_branch_scope` RLS policies.
- Every write is audited with "ID-only" metadata: document IDs, parent ID links and classification.
  No party name, amount, note or rate value is written to audit metadata.

### Realtime

- Domain events are `SalesQuoteCreated`, `SalesOrderConfirmed`, `DeliveryNoteIssued`,
  `SalesReturnApproved` and `SalesInvoiceCreated`. Their schemas are strict and permit only IDs
  and classification.
- Sockets are `sales:quote`, `sales:order`, `sales:delivery`, `sales:return` and `sales:invoice`.
  They are routed to `company:{companyId}` only — never to user, thread, inbox or branch rooms.
  ERP handlers ignore frame content and refetch through `/api/sales` over the authenticated API.
- `Idempotency-Key` remains scoped to messaging sends; sales transitions and invoice creation are
  not replay-safe.

## Alternatives considered

1. **Store `rateBps` or calculated tax on sales documents** — rejected: duplicates statutory
   governance, risks stale rates, and blurs the finance ledger boundary.
2. **Allow clients to send `companyId` or status on create** — rejected: cross-tenant writes and
   lifecycle bypasses; tenant context must come only from the bearer principal.
3. **Reuse messaging thread/inbox rooms for sales sockets** — rejected: leaks sales activity into
   unrelated conversations and weakens room-level isolation.
4. **Emit document numbers/totals in socket frames** — rejected: duplicates authority outside RLS
   and expands DLP/PII exposure. ADR-0003's ID-only rule is extended to sales.
5. **Add a Prisma relation from order to invoice** — rejected: creates a circular module dependency;
   a plain scalar link preserves finance ownership and simpler migrations.

## Consequences

- Positive: sales lifecycle is explicit and reviewable, tenant isolation is enforced in both the
  API and database, and auditable writes/events never expose document content.
- Positive: statutory rate changes require only finance verification; sales documents remain
  reproducible because they reference a rate rather than copy its value.
- Cost: invoice creation can legitimately fail with 409 when no VERIFIED effective rate exists;
  the ERP must surface that error instead of silently defaulting to a rate.
- Cost: clients must inspect returned statuses before retrying writes because sales endpoints do
  not honour `Idempotency-Key`.
