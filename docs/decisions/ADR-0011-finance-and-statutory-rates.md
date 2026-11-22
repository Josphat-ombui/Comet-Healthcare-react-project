# ADR-0011: Finance, Statutory Rates, and eTIMS Queue

- **Status:** Accepted (Phase 6)
- **Date:** 2026-11-22
- **Deciders:** Principal architect

## Context

Phase 6 adds a finance ledger to the ERP: chart of accounts, customers/suppliers, VAT rates,
double-entry journals, invoices, payments, budgets and statements. Comet Healthcare operates in
Kenya, so VAT must follow current KRA/Government publications, and eTIMS integration is expected
by partners. The platform also accepts card-token references for payments and stores KRA PINs for
business parties, which brings PCI and personal-data scope into the design.

Several failure modes must be designed out from the start:

- Floating-point money arithmetic and mixed currency units produce rounding drift and are hard to
  audit.
- Hardcoded or copied rates silently become wrong when a Finance Act or KRA notice changes a rate.
- A "real-looking" eTIMS integration can be mistaken for live filing to KRA before a certified
  provider and authorisation exist.
- Card numbers/CVV or plaintext PINs in forms, DTOs, logs, events or sockets expand PCI/ODPC scope
  and leak through the most convenient path (often realtime payloads).

Existing platform controls are RLS with a non-owner runtime role, tenant context from the
authenticated session, a transactional outbox with ID-only events, permission-based RBAC/ABAC,
in-app-only notifications, and a fail-closed DLP policy for messaging. Phase 6 must reuse these
rather than create a finance-specific security path.

## Decision

### Money and arithmetic

- All monetary values in the API, database and reports are **integer cents** (`*Cents`).
  Percentages are integer basis points (`rateBps`, 10000 = 100%). Rounding is explicit and
  server-side; clients never send computed tax totals.
- Each finance record carries `currency` (default `KES`); no implicit cross-currency conversion
  is performed. Statements expose integer-cent amounts in `rows` and `totals`.

### Statutory rates

- Rates live in a versioned, tenant-scoped `StatutoryRate` table keyed by `(code, effectiveFrom)`
  with `kind`, `label`, `rateBps`, `effectiveTo`, `sourceReference`, `status`, and sign-off
  metadata (`verifiedBy`, `verifiedAt`, `verificationNote`).
- New rows are created as `UNVERIFIED` from a publication reference. They become `VERIFIED` only
  through a separate authenticated action with a named reviewer and a note. Superseded rows are
  retained rather than deleted so historical documents remain reproducible.
- **No hardcoded rates.** Invoice creation, issuance and reports take `rateBps` only from a
  `VERIFIED` row that is effective on the relevant date. An attempt to issue against an
  unverified or out-of-range rate returns 409; the client never auto-verifies it.
- The UI shows a standing warning to verify fixture rates against current KRA/Government
  publications. Fixture rates shipped for demos are `UNVERIFIED`.

### Ledger

- Invoices (sales and purchase, including credit notes) and payments (incoming and outgoing,
  with invoice allocations) generate **balanced double-entry journals** in integer cents.
  Journals are `DRAFT` until explicitly posted; posting checks debits equal credits. Reversals
  create a linked balancing journal instead of mutating history.
- Period statements (trial balance, income, balance sheet, ageing) are derived from posted
  journals, never from a mutable summary column.

### eTIMS: ready-only queue

- eTIMS support is a **provider-agnostic payload queue**. The `finance.etims.submit` worker records
  `PENDING` submissions for a certified provider, stores the generated payload and emits
  in-app notifications on progress/failure. It is **not live filing** and never submits to KRA.
  No endpoint or event may be described as a KRA submission or filing receipt.
- `ETIMS_PAYLOAD_VERSION` (default `1.0`) versions the payload; `ETIMS_PROVIDER` (default
  `internal-queue`) labels the target without selecting a live integration. Payloads contain
  encrypted PIN references only.

### Sensitive data, events, and access control

- Party tax PINs are encrypted at rest. Public DTOs expose `hasTaxPin` and a masked reference
  (`taxPinMasked`) only; plaintext values are never emitted, logged or placed on a socket.
- Payments accept a `CARD_TOKEN` *method identifier*. There is no PAN/card-number/CVV field in
  any request or response. Token handling, when introduced, stays outside this API's PCI scope.
- Finance socket events (`finance:account`, `finance:journal`, `finance:invoice`,
  `finance:payment`, `finance:budget`, `finance:rate`, `finance:etims`, `finance:etims-failed`)
  carry IDs and classification only. Clients always refetch authoritative records via
  `GET /api/finance/...`; event data is never rendered directly.
- All finance tables are tenant/branch RLS-protected and endpoints require `finance.*`
  permissions in addition to bearer auth. `Idempotency-Key` stays scoped to messaging sends;
  finance writes are not replay-safe.

### Legacy boundary

- The legacy storefront `taxRate` field on `BusinessDocument` and any catalogue-level tax
  percentage **remain outside this statutory-rate table and are not used by Phase 6 finance
  calculations**. They exist for pre-Phase-6 document rendering only. Finance code must not read,
  copy or seed rates from them.

## Alternatives considered

1. **Floating-point currency and client-side tax totals** — rejected: rounding drift, currency
   mixing, and unauditable client authority.
2. **A `RATE_VAT_16` constant or environment variable** — rejected: changes to Kenyan statute
   would require a code deploy and would lose effective dates and source evidence.
3. **Auto-verifying fixture rates on first use** — rejected: removes the human sign-off that
   makes a rate usable and hides unverified data from the UI.
4. **Calling a KRA/eTIMS endpoint directly from the API** — rejected for this phase: no certified
   provider or filing authorisation exists, and a silent live call is a compliance risk.
5. **Including amounts/statuses/PIN references in realtime frames** — rejected: duplicates
   authority outside RLS and expands PCI/ODPC scope.
6. **Reusing the storefront `taxRate` as the finance rate source** — rejected: it has no version,
   source reference, sign-off or effective interval, and is not tenant-governed.

## Consequences

- Positive: auditable integer-cent arithmetic, dated and sourced rates with explicit sign-off,
  no hidden hardcoded tax logic, PCI/PIN scope kept out of API payloads and sockets, and an
  eTIMS path that cannot be mistaken for live filing.
- Positive: historical invoices remain reproducible because rate rows are versioned rather
  than updated in place, and reversed journals preserve an audit trail.
- Cost: an extra verification step is required before any fixture rate can be issued against,
  and UI/API must surface 409s instead of silently proceeding.
- Cost: provider selection and any genuine filing integration remain a later decision with its
  own certification, authorisation, reconciliation and audit requirements.
- Cost: finance clients must implement their own retry discipline because `Idempotency-Key` is
  deliberately not honoured on `/api/finance`.
