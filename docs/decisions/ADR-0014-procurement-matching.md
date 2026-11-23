# ADR-0014: Procurement Lifecycle and Three-Way Matching

- **Status:** Accepted (Phase 9)
- **Date:** 2026-11-23
- **Deciders:** Principal architect

## Context

Phase 9 adds the buying side of the ERP: purchase requisitions, purchase orders, goods receipt
notes, supplier returns and three-way matching. Phases 6–8 already establish the required
boundaries: tenant/branch scope with RLS, integer-cent money, strict dates, fail-closed DLP,
ID-only audit/event payloads and company-room realtime routing (ADR-0002, ADR-0003, ADR-0006,
ADR-0008, ADR-0011, ADR-0012, ADR-0013).

Procurement must not silently mutate the finance ledger. Finance invoices are already authoritative
for posted amounts and statutory rates (ADR-0011), and inventory owns stock valuation and movement
postings (ADR-0013). A three-way match therefore needs to be a read-only comparison with explicit,
reproducible cent arithmetic. Any tolerance must be a business control chosen by the operator, not
a tax or statutory percentage inferred from a rate table or hardcoded in application code.

## Decision

### Model and scope

- Nine new tenant/branch-scoped tables are appended to the schema: `PurchaseRequisition`,
  `PurchaseRequisitionLine`, `PurchaseOrder`, `PurchaseOrderLine`, `GoodsReceipt`,
  `GoodsReceiptLine`, `SupplierReturn`, `SupplierReturnLine` and `ThreeWayMatch`. Every table has
  `companyId`, nullable `branchId`, `classification`, `createdById`, timestamps and reverse
  relations.
- `branchId = NULL` denotes an organisation-wide document visible to any branch. Suppliers link to
  existing FinanceParty rows with `type = SUPPLIER`; lines link to InventoryItem and an optional
  Warehouse. `PurchaseOrder.financeInvoiceId`, `GoodsReceipt.financeInvoiceId` and
  `ThreeWayMatch.financeInvoiceId` are optional references to FinanceInvoice for comparison only.
- All state changes live in `packages/api/lib/procurement.js`. Routes only validate, authorise and
  audit. Money fields are safe integer cents; quantities are positive floats rounded once to three
  decimals at the service boundary. Dates are strict `YYYY-MM-DD`.

### Lifecycle guards

- Requisition: `DRAFT -> SUBMITTED -> APPROVED -> CONVERTED`. Conversion creates a draft purchase
  order from requisition lines and records the source requisition ID. A requisition converts once.
- Order: `DRAFT -> APPROVED -> SENT`; a sent order becomes `PARTIALLY_RECEIVED` or `RECEIVED` as
  receipts post. Only sent/open orders may be received; over-receipt is rejected.
- Receipt: each line's `receivedQty` and status are updated on the source order line. Receipts post
  stock through `receiveStock` in the inventory ledger. `batchId = NULL` means unbatched stock;
  batch-tracked items require a batch, and only `RELEASED` batches may be consumed. Inactive items,
  quarantined/expired/recalled batches and over-receipt fail closed.
- Receipt inspection is a named action (`ACCEPT` -> `INSPECTED`, `REJECT` -> `REJECTED`). Rejection
  does not reverse the stock movement automatically; a supplier return is the explicit reversal
  path so reversals remain auditable.
- Return: `DRAFT -> APPROVED/REJECTED`. Creating a return never moves stock. Approval issues stock
  back through `issueStock` with movement type `RETURN_OUT` and records the receipt link.
- Terminal states cannot be reopened. Every write is audited with IDs, parent/document links and
  classification only.

### Matching arithmetic

- Expected value is `sum(receipt line quantity × matching order line unit cost)` in integer cents,
  rounded once to a whole cent per line. The receipt's actual value is the sum of its posted line
  totals. The linked finance invoice's `totalCents` is used only when present.
- `receiptVarianceCents = receiptActualCents - expectedCents` and
  `invoiceVarianceCents = invoiceActualCents - expectedCents`. Both are signed integer cents, so
  a one-cent difference is visible and reproducible.
- `PROCUREMENT_MATCH_TOLERANCE_BPS` (default `0`) is read once from configuration. The absolute
  variance must be within `expectedCents * toleranceBps / 10000`, floor-rounded to whole cents,
  for every supplied amount; otherwise the match is `DISCREPANCY`. A missing invoice is ignored for
  tolerance purposes, not treated as zero.
- The tolerance is a business threshold for operational noise. It is never derived from
  `StatutoryRate.rateBps`, never stored on a procurement row, and no tax percentage is hardcoded.
- Matching never creates a finance journal, payment, invoice or inventory movement. Approval of a
  match only records the decision; any posting policy belongs to a later, explicit phase.

### Validation, tenancy, audit and realtime

- Write schemas are strict: `companyId`, statuses, computed totals and tenancy fields are unknown
  keys and are rejected. All free text goes through the shared DLP inspector and fails closed;
  findings are reported by type only.
- Tenant context always comes from the authenticated principal. Reads and writes use company +
  branch scope through the tenant-aware Prisma client, backed by idempotent `tenant_branch_scope`
  RLS policies on all nine tables.
- Domain events are `PurchaseRequisitionApproved`, `PurchaseOrderApproved`, `GoodsReceiptReceived`,
  `SupplierReturnApproved` and `ThreeWayMatchFlagged`. Their schemas are strict and permit only IDs
  and classification.
- Sockets are `procurement:requisition`, `procurement:order`, `procurement:receipt`,
  `procurement:return` and `procurement:match`, routed only to `company:{companyId}`. ERP handlers
  ignore frame content and refetch through the authenticated API. `Idempotency-Key` remains scoped
  to messaging sends; procurement writes are not replay-safe.

## Alternatives considered

1. **Derive tolerance from the active VAT rate** — rejected: conflates a statutory rate with an
   operational business control and would change match decisions when rates change.
2. **Hardcode a one-percent tolerance** — rejected: not configurable, not auditable and easy to
   confuse with a tax percentage.
3. **Post finance journals automatically on match approval** — rejected: finance owns posting and
   the rate guard; this phase keeps the boundary explicit.
4. **Reverse a rejected receipt with a negative stock movement in the inspect action** — rejected:
   inspection and return are distinct business events; an explicit return preserves traceability.
5. **Allow receipts from any order state with a warning** — rejected: buying controls require an
   approved and sent order before goods are expected.
6. **Emit amounts or statuses in socket frames** — rejected: duplicates authority outside RLS and
   expands DLP/PII exposure; extends ADR-0003's ID-only rule to procurement.

## Consequences

- Positive: match results are deterministic, cent-exact and reproducible from order, receipt and
  invoice records.
- Positive: a configurable business tolerance cannot be mistaken for a statutory rate because it
  has its own name, default and documentation.
- Positive: stock effects occur only in named receipt/return actions and remain in the inventory
  ledger.
- Cost: a rejected receipt still requires a separate supplier return before stock is removed.
- Cost: clients must inspect returned document statuses before retrying because procurement
  endpoints do not honour `Idempotency-Key`.
