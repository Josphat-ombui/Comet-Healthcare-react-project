# ADR-0013: Inventory Valuation and Stock Movement Guards

- **Status:** Accepted (Phase 8)
- **Date:** 2026-11-23
- **Deciders:** Principal architect

## Context

Phase 8 adds the stock ledger to the ERP: inventory items, warehouses, batches, balances,
movements, transfers and stock counts. The platform already requires tenant/branch isolation,
integer-cent money, strict dates, fail-closed DLP, ID-only audit/event payloads and company-room
realtime routing (ADR-0002, ADR-0003, ADR-0006, ADR-0008, ADR-0011, ADR-0012).

Inventory needs a single, deterministic valuation rule. A perpetual-FIFO implementation would need
layer consumption metadata and would make receipt/issue/count/transfer behaviour depend on insertion
order, complicating audit and reconciliation. Floating-point money would also risk accumulating
rounding drift. The module must stay consistent with Finance, where all amounts are integer cents,
without writing to the finance ledger in this phase.

## Decision

### Model and scope

- Nine new tenant/branch-scoped tables are appended to the schema: `InventoryItem`, `Warehouse`,
  `InventoryBatch`, `StockBalance`, `StockMovement`, `StockTransfer`, `StockTransferLine`,
  `StockCount` and `StockCountLine`. Every table has `companyId`, nullable `branchId`,
  `classification`, `createdById`, timestamps and reverse relations.
- `branchId = NULL` denotes an organisation-wide record visible to any branch. `batchId = NULL`
  denotes unbatched stock. An item with `trackBatches = true` requires a batch for every stock
  write; a non-tracked item rejects a batch reference.
- `StockBalance` is unique per company + item + warehouse + batch. All balance transitions and
  movement postings live in `packages/api/lib/inventory.js`; routes only validate, authorise and
  audit.

### Weighted-average valuation

- Receipts blend the existing balance value with the incoming receipt value:

  `averageCents = round((existingQty × existingUnitCostCents) + (receiptQty × receiptUnitCostCents)) / (existingQty + receiptQty))`

- The blended average is rounded **once**, to a whole cent, using half-up rounding. The balance's
  `totalValueCents` is then rebuilt as `round(quantity × averageCents)` so the stored average and
  stored value never disagree. No fractional cents are persisted and no separate FIFO layers exist.
- Issues, outgoing adjustments, transfer-out lines and count losses consume stock at the balance's
  current rounded average cost. Transfer approval captures that cost on each line; transfer receipt
  posts the destination `TRANSFER_IN` at the captured cost, so value is conserved across warehouses.
- Count approval snapshots expected quantity and unit cost. Only non-zero variances post balancing
  `COUNT_GAIN` / `COUNT_LOSS` movements; zero-variance lines are left untouched. Gains use a
  zero-cost valuation path that still preserves the existing average on a zero-valued balance.
- Quantities are positive finite floats rounded to three decimals once at the service boundary.
  Money fields remain safe integer cents. `0.001` is the smallest persisted quantity increment.

### Movement and state guards

- Movement types are explicit: `RECEIPT`, `ISSUE`, `TRANSFER_IN`, `TRANSFER_OUT`,
  `ADJUSTMENT_IN`, `ADJUSTMENT_OUT`, `COUNT_GAIN`, `COUNT_LOSS`, `RETURN_IN`, `RETURN_OUT`,
  `PRODUCTION_ISSUE` and `PRODUCTION_RECEIPT`.
- Only `RELEASED` batches may be issued, consumed by a transfer or reduced by a stock count.
  `QUARANTINE`, `EXPIRED` and `RECALLED` fail closed; new batches default to `QUARANTINE`.
- Insufficient stock is rejected before any write. Transitions are guarded: a transfer must be
  `DRAFT` to approve, `IN_TRANSIT` to receive and `DRAFT` to cancel; a count must be `DRAFT` to
  record, `COUNTING`/`DRAFT` to approve and open to cancel. Terminal states cannot be reopened.
- Reorder alerts are computed from active items with `reorderLevel > 0`. A downward threshold
  crossing emits `ReorderLevelBreached`; the alert query also lists existing breaches, so a
  restarted client does not miss one.

### Validation, tenancy, audit and realtime

- Write schemas are strict: `companyId`, statuses, computed totals and tenancy fields are unknown
  keys and are rejected. All free text goes through the shared DLP inspector and fails closed;
  findings are reported by type only.
- Tenant context always comes from the authenticated principal. Reads and writes use company +
  branch scope through the tenant-aware Prisma client, backed by idempotent `tenant_branch_scope`
  RLS policies on all nine tables.
- Every write is audited with ID-only metadata (IDs, parent IDs, document links and classification).
  No quantity, cost, value, batch number, note or item name is placed in audit metadata.
- Domain events are `InventoryItemCreated`, `StockReceived`, `StockIssued`, `StockAdjusted`,
  `StockTransferApproved`, `StockCountApproved` and `ReorderLevelBreached`. Their schemas are
  strict and permit only IDs and classification.
- Sockets are `inventory:item`, `inventory:stock`, `inventory:transfer`, `inventory:count` and
  `inventory:alert`, routed only to `company:{companyId}`. ERP handlers ignore frame content and
  refetch through the authenticated API. `Idempotency-Key` remains scoped to messaging sends;
  inventory writes are not replay-safe.

## Alternatives considered

1. **FIFO or LIFO layers** — rejected: requires layer consumption tables and ordering rules,
   complicates reconciliation and is not needed for the current GMP traceability requirement
   (batch numbers still provide lot identity).
2. **Floating-point currency fields** — rejected: cumulative rounding drift; Finance already
   standardises on integer cents.
3. **Persist fractional cents or re-round on every read** — rejected: stored average and stored
   balance value would disagree; rounding once on write is deterministic.
4. **Allow issuing from QUARANTINE with a warning** — rejected: GMP release status must fail closed.
5. **Emit quantities or values in socket frames** — rejected: duplicates authority outside RLS
   and expands DLP/PII exposure; extends ADR-0003's ID-only rule to inventory.
6. **Write finance journals from stock movements in Phase 8** — rejected: keeps the finance ledger
   boundary explicit; a later phase can add an inventory→finance posting policy deliberately.

## Consequences

- Positive: valuation is deterministic, integer-cent safe and reproducible from the movement log.
- Positive: transfers preserve captured cost across warehouses, and quarantined stock cannot be
  silently consumed.
- Cost: rounding the average to a whole cent can leave a small residual difference versus an
  unrounded theoretical average; the balance value is authoritative, and the ADR records why.
- Cost: clients must inspect returned statuses and balances before retrying writes because
  inventory endpoints do not honour `Idempotency-Key`.
- Cost: batch-tracked items cannot be written until a batch is created and released, so seed data
  must include released batches for the demo items.
