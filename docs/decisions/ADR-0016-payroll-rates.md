# ADR-0016: Versioned Payroll Rates and HR/Payroll Boundaries

- **Status:** Accepted (Phase 11)
- **Date:** 2026-11-23
- **Deciders:** Principal architect

## Context

Phase 11 adds the HR module to the ERP: employees, employment contracts, leave, attendance and
payroll runs with persisted per-employee lines. Earlier phases established the non-negotiable
boundaries: tenant/branch scope with RLS (ADR-0002, ADR-0006), immutable ID-only audit and event
payloads (ADR-0003, ADR-0008), integer-cent money and an authoritative verified statutory-rate
register in finance (ADR-0011), and fail-closed DLP for free text (ADR-0009).

Payroll is unusually sensitive. Employee bank details, KRA PINs, salary amounts and leave reasons
are personal data under the Kenya Data Protection Act and the ODPC guidance referenced in
`docs/architecture/07-compliance-kenya.md`. A wrong statutory percentage in application code would
silently misstate salaries and deductions. A payroll socket frame containing names or amounts would
duplicate that authority outside RLS. This ADR fixes where statutory rates live, who may verify
them, how calculations fail, and what may cross the API boundary.

## Decision

### Model and scope

- Seven new tenant/branch-scoped tables are appended to the schema: `Employee`,
  `EmploymentContract`, `PayrollRate`, `LeaveRequest`, `AttendanceRecord`, `PayrollRun` and
  `PayrollLine`. Every table carries `companyId`, nullable `branchId`, `classification`,
  `createdById`, timestamps and reverse relations. `branchId = NULL` denotes an organisation-wide
  record visible to any branch of the owning company.
- All domain logic lives in `packages/api/lib/hr.js`. Routes only authenticate, authorise, parse
  strict Zod bodies and audit reads. `companyId`, statuses, verification metadata and calculated
  totals are unknown keys on write schemas and are rejected.
- `PayrollRun.employeeIds` snapshots payroll eligibility when the run is created. Later employee
  status changes do not silently rewrite that population; calculation rechecks eligibility and
  fails with 409 if a snapshotted employee is no longer usable.

### Payroll rate register and verification

- `PayrollRate` is a versioned register with `kind`, `rateBps` (integer basis points, 10000 = 100%),
  `effectiveFrom`, `effectiveTo`, `sourceReference` and a lifecycle status of `UNVERIFIED` or
  `VERIFIED`. The five kinds used by a calculation are `PAYE`, `NSSF_EMPLOYEE`, `NSSF_EMPLOYER`,
  `SHIF` and `HOUSING_LEVY`.
- A new row is **always** created `UNVERIFIED`, even if the caller supplies a verification note.
  There is no create-and-verify shortcut. `verify` is a separate endpoint requiring the dedicated
  `hr.payrollrate.verify` permission, a non-empty note and an authenticated principal; it stamps
  `verifiedById` and `verifiedAt` and emits `PayrollRateVerified`.
- Calculation selects, for each kind, the most recent `VERIFIED` row whose effective interval
  covers the run period end. `UNVERIFIED`, superseded and out-of-interval rows are invisible to
  payroll. Any missing kind fails with **409** before any line or total is written. This is the
  same fail-closed principle as finance's verified-rate guard (ADR-0011).
- No PAYE, NSSF, SHIF or Housing Levy percentage or bracket exists in application code, seed data
  or the ERP UI. The seed supplies a single UNVERIFIED `PAYE` row purely as a fixture; it cannot
  be used for a calculation until explicitly verified.

### Calculation and posting

- All monetary values are safe integer cents. A line's gross is `basicSalaryCents +
  allowancesCents` from the active employment contract. Each statutory component is
  `round(gross * rateBps / 10000)` computed once with `BigInt`, rounding half-up at the component
  boundary. Deductions are the employee-side components; net is gross minus deductions; employer
  cost is gross plus the employer-side NSSF component. BigInt arithmetic prevents overflow before
  the final safe-integer checks on totals.
- Each line stores `rateSnapshot` with the resolved rate IDs and basis points, so a later rate change
  cannot rewrite a historical payslip. A run moves `DRAFT -> CALCULATED -> APPROVED -> POSTED` with
  explicit guards; recalculation is only possible while DRAFT.
- Posting is ledger-only. With both `hr.payroll.post` and `finance.journal.post`, the service creates
  one balanced finance journal using the system accounts `EXPENSE`, `AP_CONTROL` and `BANK`, then
  links `financeJournalId` on the run. It does **not** file returns, pay employees, email payslips or
  initiate bank transfers. Tenant-scoped `db` calls are used instead of a raw Prisma `$transaction`
  array, which would bypass the tenant `set_config` context.

### Sensitive data and separation of duties

- Bank name, bank account and KRA PIN are encrypted at rest with the existing AES-GCM helper.
  Employee DTOs expose only `hasBankDetails`, `hasKraPin` and masked suffixes such as `••••1234`.
  Neither plaintext nor encrypted envelopes are ever returned, audited or emitted on an event.
- HR free text goes through the shared DLP inspector and fails closed. A KRA PIN is permitted only
  as the entire dedicated field; embedded card/secret patterns are always rejected.
- Separation of duties is enforced by permissions. Managers can maintain employees, contracts,
  leave and attendance but cannot verify a rate or post payroll. Compliance can verify rates.
  Posting requires the additional finance journal-posting permission. Administrators retain all
  permissions through the explicit role grant table.
- Domain events are `EmployeeCreated`, `LeaveApproved`, `PayrollRateVerified`,
  `PayrollRunCalculated` and `PayrollRunApproved`. Their strict schemas and the sockets
  `hr:employee`, `hr:leave`, `hr:rate` and `hr:payroll` carry IDs and classification only, routed to
  the company room. ERP handlers ignore frame content and refetch everything through the
  authenticated API. `Idempotency-Key` remains scoped to messaging sends; HR writes are not
  replay-safe.

## Alternatives considered

1. **Hardcode current Kenyan PAYE/NSSF/SHIF/Housing Levy percentages in a constants file** —
   rejected: rates change through legislation and a code deploy is not an auditable source of
   truth; ADR-0011 already established a verified register.
2. **Let the POST /rates caller set status VERIFIED** — rejected: it removes the sign-off boundary
   and would allow any writer to make a rate immediately usable.
3. **Skip a missing rate and calculate the remaining components** — rejected: a partial payslip is
   worse than a blocked run. Fail closed with 409.
4. **Use floating-point arithmetic for cents** — rejected: cumulative rounding drift; BigInt with a
   single half-up rounding per component is deterministic.
5. **Return plaintext bank details to authorised HR roles for convenience** — rejected: it creates
   unnecessary copies, screenshot risk and DLP exposure; masked DTOs satisfy the UI need.
6. **Post payroll from a single raw `$transaction` array for atomicity** — rejected: it bypasses the
   tenant context proxy and RLS; sequential scoped writes preserve tenancy. Cross-run atomicity is a
   future concern for a job/outbox design, not a reason to weaken tenant isolation.
7. **Emit calculated amounts or employee names on socket frames** — rejected: extends DLP/PII
   exposure outside RLS and contradicts ADR-0003.

## Consequences

- Positive: every statutory component is traceable to a verified, effective row and a source
  reference; a rate change cannot silently alter historical payslips.
- Positive: HR personal data is encrypted at rest and masked in every DTO; events and sockets are
  ID-only invalidation signals.
- Positive: verification, approval and posting are distinct permissions, preventing a single
  manager from both setting a rate and releasing payroll.
- Cost: a payroll run is blocked until all five VERIFIED rates exist for the effective date, even if
  only one component is missing.
- Cost: clients must inspect returned statuses before retrying because HR endpoints do not honour
  `Idempotency-Key`.
- Cost: the platform still needs a certified payroll/filing integration before any live statutory
  submission or bank payment; Phase 11 deliberately stops at the internal ledger journal.
