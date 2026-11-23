# ADR-0018: GMP Batch Records and Manufacturing Boundaries

- **Status:** Accepted (Phase 13)
- **Date:** 2026-11-23
- **Deciders:** Principal architect

## Context

Phase 13 adds manufacturing to the ERP: work centers, bills of materials, production orders, GMP
batch records and QC checks. Earlier phases established the non-negotiable boundaries: tenant/branch
scope with RLS (ADR-0002, ADR-0006), immutable ID-only audit and event payloads (ADR-0003,
ADR-0008), integer-cent money and a single authoritative stock ledger (ADR-0011, ADR-0013), and
fail-closed DLP for free text (ADR-0009).

A batch record is a regulated quality document, not a generic task. It must retain an immutable
batch number, manufacturing date and expiry date, and the identity of each signatory. Deviation and
QC result notes can contain sensitive information and must not be duplicated into audits, events or
socket frames. Releasing a batch creates finished goods in inventory; the manufacturing module must
not invent its own stock balances or bypass inventory valuation. A QC FAIL must stop release even if
other checks pass. This ADR fixes where those values live, who may sign them and what crosses the
API boundary.

## Decision

### Model and scope

- Seven new tenant/branch-scoped tables are appended to the schema: `WorkCenter`, `Bom`, `BomLine`,
  `ProductionOrder`, `ProductionOrderLine`, `BatchRecord` and `QcCheck`. Every table carries
  `companyId`, nullable `branchId`, `classification`, timestamps and reverse relations.
  `branchId = NULL` denotes an organisation-wide record visible to any branch of the owning
  company. RLS and the dynamic `tenant_branch_scope` policy are enabled for all seven tables.
- All domain logic lives in `packages/api/lib/manufacturing.js`. Routes only authenticate, authorise,
  parse strict Zod bodies and audit reads. `companyId`, statuses, signatures and computed costs are
  unknown keys on write schemas and are rejected.
- Work centers are soft-deleted with `deletedAt`. A work center referenced by an active production
  order cannot be deleted.

### BOM cost arithmetic

- Quantities accept at most three decimals and are converted to integer milli-units. A line cost is
  `quantity(milli) * unitCostCents` with one half-up rounding at the cent boundary; the BOM standard
  cost is the sum of those whole-cent line costs. No floating-point value enters a `*Cents` column.
- `standardCostCents` and `lineCostCents` are computed only by the server and are never accepted from
  a client. Unit costs are non-negative integer cents.
- No statutory, tax, exchange-rate or filing constant exists in the manufacturing module.

### GMP fields, signatures and release guard

- `BatchRecord` requires `batchNumber`, `manufacturingDate` and `expiryDate`. Expiry must not precede
  manufacture. Review and release timestamps are server-generated.
- Signatures (`createdByUserId`, `reviewedByUserId`, `releasedByUserId`, `signedByUserId`) are opaque
  authenticated user IDs only. Names, emails, titles and free-text signatures are never accepted or
  emitted.
- Deviation notes and QC result notes pass through the shared DLP inspector and are encrypted at
  rest. DTOs expose only `deviationNotesPresent` / `resultNotesPresent`; plaintext, ciphertext and
  key IDs never appear in DTOs, audit metadata, events or socket frames.
- Release is allowed only when the batch is in `REVIEW`, all GMP fields and required signatures are
  present, at least one mandatory QC check exists and **every** QC check is `PASS`. Any `FAIL`,
  `PENDING` or `REVIEW` check blocks release. A released batch cannot be reopened.
- The QA/compliance reviewer cannot release the same batch, and production users cannot release their
  own batch. BOM approval is likewise separate from BOM authorship.

### Inventory boundary

- Material issue uses the Phase 8 `issueStock` helper with `PRODUCTION_ISSUE` movements and records
  only order-line IDs and movement IDs. The manufacturing service never writes stock balances
  directly.
- Batch release creates a RELEASED `InventoryBatch` through `createBatch` and receives finished stock
  through `receiveStock` with `PRODUCTION_RECEIPT` movements. Unit cost defaults to the BOM standard
  cost but must be a positive integer cents value. `BatchRecord.inventoryBatchId` is an opaque link;
  no stock quantity or valuation is duplicated onto the batch DTO.
- No finance journal, regulatory filing, label generation, payment or email is performed.

### Events, audits and permissions

- Lifecycle guards for BOMs, orders, batches and QC checks are pure functions in `manufacturing.js`,
  shared with contract tests. Terminal statuses cannot be reopened.
- The 15 permissions are `manufacturing.workcenter.read/write`,
  `manufacturing.bom.read/write/approve`, `manufacturing.order.read/write/release/complete`,
  `manufacturing.batch.read/write/review/release` and `manufacturing.qc.read/write`. Management owns
  order release/complete and production writes; QA/compliance owns BOM approval, batch
  review/release and QC sign-off; staff are read-only.
- Domain events are `BomApproved`, `ProductionOrderReleased`, `BatchRecordOpened`, `QcCheckFailed`
  and `BatchReleased`. Their strict schemas and the sockets `manufacturing:bom`,
  `manufacturing:order`, `manufacturing:batch` and `manufacturing:qc` carry IDs and classification
  only, routed to the company room. ERP handlers ignore frame content and refetch everything through
  the authenticated API. `Idempotency-Key` remains scoped to messaging sends; Phase 13 writes are
  not replay-safe.

## Alternatives considered

1. **Let clients submit `standardCostCents`** — rejected: a second source of truth with different
   rounding could misstate finished-goods value; the server owns the calculation.
2. **Use floats for quantities and multiply without milli-units** — rejected: binary drift could
   change a cent at the boundary; integer milli-units give one deterministic half-up rounding.
3. **Treat GMP fields as optional free text** — rejected: batch identity and dates are mandatory for
   traceability and expiry control.
4. **Allow a batch to be released by its reviewer or producer** — rejected: removes separation of
   duties and creates self-approval.
5. **Release despite a FAIL when other checks pass** — rejected: a single failed quality check must
   block the batch; averaging or majority voting is unsafe.
6. **Emit deviation notes, observed values or batch numbers on socket frames** — rejected: extends
   DLP exposure outside RLS and contradicts ADR-0003.
7. **Write stock balances and movements directly from manufacturing** — rejected: bypasses inventory
   valuation, quarantine and audit rules; the Phase 8 ledger is authoritative.

## Consequences

- Positive: batch identity, dates and signatures are always present and traceable to authenticated
  user IDs; QA release is blocked by any failed check.
- Positive: encrypted notes and ID-only event frames keep sensitive text inside RLS-protected
  authenticated endpoints.
- Positive: finished goods enter stock only through the existing inventory ledger, preserving one
  valuation and movement history.
- Cost: a missing mandatory QC check or an unavailable QA reviewer blocks release until resolved.
- Cost: manufacturing fixtures deliberately stop at a DRAFT production order; no batch, QC result or
  stock movement is implied by seed data.
- Cost: production still needs a reviewed key-rotation and retention policy before real GMP batch
  records are stored, and this module is not a certified GMP compliance deliverable.
