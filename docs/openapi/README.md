# OpenAPI Contract

Comet Healthcare Enterprise Platform — public API v1 complete (`1.0.0`)

This directory is the developer-portal seed for the Comet REST and webhook contracts. Phase 1
created the skeleton; Phase 3 added identity/organisation/audit, Phase 4 added messaging and
realtime, Phase 5 completed the shared-services surface (files, workflow, notifications,
search, documents), Phase 6 added the tenant/branch-scoped finance surface under `/api/finance`,
Phase 7 added the sales lifecycle under `/api/sales`, Phase 8 added inventory under
`/api/inventory`, Phase 9 added procurement under `/api/procurement`, Phase 10 added service
under `/api/service`, Phase 11 added HR under `/api/hr`, Phase 12 added projects under
`/api/projects`, Phase 13 added GMP manufacturing under `/api/manufacturing`, Phase 14 added
allow-listed reporting under `/api/reporting`, and Phase 15 completes the public surface with
`/api/public/v1` and `/api/webhooks`.

## Files

- `openapi.yaml` — authoritative source of truth. `info.version` is bumped at each phase gate.
- Generated HTML/TypeScript clients will be added using an OpenJS/permissively licensed generator.

## Phase 5 scope

- `Platform` tag paths: `/api/files` (upload tickets, confirmation, versions, downloads, local
  encrypted fallback), `/api/workflow` (definitions, instances, tasks), `/api/notifications`
  (inbox, preferences, read actions), `/api/search` (permission-aware FTS), and `/api/documents`
  (kinds, list, queued generation, job status, download, metadata, inline PDF).
- Reusable schemas for file/workflow/notification/search/document DTOs and requests live in
  `components.schemas`; Phase 3/4 paths and schemas remain intact.
- Every new endpoint declares `security: [{ bearerAuth: [] }]` and a required shared permission
  via `x-permission`. The two `/api/files/local-*` capability endpoints carry signed tickets
  in the path; the upload endpoint accepts an optional bearer token, the download endpoint requires one.
- `Idempotency-Key` is **not required** for Phase 5. It is scoped to
  `POST /api/messaging/threads/{id}/messages` only (see the top-level `x-idempotency` extension).
- `x-realtime` records the Phase 4 and Phase 5 Socket.IO events. Phase 5 adds
  `notification:new`, `notification:read`, `workflow:started`, `workflow:task`,
  `workflow:completed`, `file:new`, `file:scanned`, `document:generated` and `document:issued`.
  All event and socket payloads carry IDs and classification only; clients refetch content.
- Response envelopes follow the implementation: named collections such as `files`,
  `definitions`, `instances`, `tasks`, `notifications` and `preferences` are used rather than a
  generic `items` key. `GET /api/search` and `GET /api/documents` use `items` as before.

## Phase 15 scope

- `Public API` tag paths (4 paths / 4 operations): `GET /api/public/v1/docs` (static contract,
  no auth), `GET /health`, `GET /finance/summary` and `GET /sales/summary`. The router is
  read-only; any other method receives 405. All values are refetched through this authenticated
  surface, so no private record IDs, titles, line items or free text are exposed.
- Authentication is `Authorization: Bearer <opaque-api-key>` (`apiKeyAuth`). The server stores
  only `SHA-256(key)` on the reused `ApiKey` model; a `PublicClient` links to that key and pins
  the tenant/branch context. A scope must be granted on **both** the key and the client:
  `public:health:read`, `public:finance:read` or `public:sales:read`. The rate limiter is keyed
  by `ApiKey.id` (60 requests/minute by default) and returns `X-RateLimit-Limit`,
  `X-RateLimit-Remaining` and `Retry-After`; it is not just a source-IP limiter.
- Finance summaries accept only `kind=income|ageing` plus typed `from`/`to`/`asOf` dates and
  delegate to the authorised statement service. Sales summaries aggregate `CONFIRMED` and
  `FULFILLED` order integer cents and counts inside the client's branch scope. Unavailable data uses explicit
  `{ dataAvailable: false, reason, reportKey }` metadata — no fabricated zero, rows or source
  error text. All money is safe integer cents and no statutory rate is calculated in the public
  API. See ADR-0020.
- `Webhooks` tag paths (11 paths / 14 operations): static `GET /docs`, unauthenticated
  `POST /callbacks/{clientId}/verify`, plus session-authenticated client register/list/get/revoke,
  subscription create/list/get/update/rotate and delivery list/get/retry. Six permissions apply:
  `public.client.read/write`, `webhook.subscription.read/write`, `webhook.delivery.read/retry`.
- Client registration either links an existing `apiKeyId` or accepts a caller-owned `keyHash`
  and `keyPrefix`. No raw key is accepted or returned by a DTO; the returned prefix is masked.
  Subscription secrets are write-only create/rotate fields, encrypted at rest with AES-GCM and
  accompanied by a SHA-256 lookup hash; DTOs expose only `secretConfigured` and `rotatedAt`.
- Delivery payloads and provider callbacks are strict ID/classification objects signed with
  HMAC-SHA256 over stable JSON (sorted keys) and `x-comet-signature: sha256=<hex>`. The
  `webhook.deliver` BullMQ job receives only IDs; it retries with exponential backoff (default
  5 attempts, 2s base, 60s cap), records `PENDING`/`RETRYING`/`DELIVERED`/`FAILED` and normalised
  reason codes, and never stores a provider response body. Terminal failures emit
  `WebhookDeliveryFailed`.
- Callback verification uses the linked API key's SHA-256 hex digest as the HMAC key, checks the
  signature **before** replay state, enforces a 300-second freshness window and rejects replays
  through the append-only audit ledger plus an in-memory cache. It returns only an opaque event
  ID and truncated replay identifier.
- Domain events are `WebhookSubscriptionCreated`, `WebhookDeliveryFailed` and
  `PublicClientRevoked`. Sockets are `developer:webhook` and `developer:client`; frames carry
  IDs/classification only and are routed to the company room only. Developer lifecycle events
  are excluded from webhook fanout so subscriptions cannot generate recursive deliveries.
- `Idempotency-Key` remains scoped to `POST /api/messaging/threads/{id}/messages` only. No Phase
  15 write consumes it; callback replay uses signature + audit, and delivery de-duplication uses
  the unique `(subscriptionId, eventId)` pair.

## Phase 14 scope

- `Reporting` tag paths (11 paths / 18 operations): `/api/reporting/report-keys`,
  `/definitions` (list/create), `/definitions/{id}` (get/patch/delete), `/runs` (list/create),
  `/runs/{id}` (get), `/runs/{id}/job` (get), `/dashboards` (list/create),
  `/dashboards/{id}` (get/patch), `/dashboards/{id}/summary` (get),
  `/dashboards/{dashboardId}/widgets` (list/create) and `/widgets/{id}` (get/patch/delete).
- All Phase 3–13 paths and schemas remain intact. Every operation declares
  `security: [{ bearerAuth: [] }]` and an `x-permission` from the six-entry `reporting.*` set.
  Strict request schemas reject client-supplied `companyId`, `branchId`, SQL, unknown parameters
  and computed summary fields; free text is DLP-checked and fails closed.
- A definition's `querySpec` is exactly `{ reportKey }` from the fixed nine-key allow-list. There is
  no SQL, table name, field name or `WHERE` clause anywhere in the API. Run parameters are typed per
  key, and collectors call existing authorised module services rather than opening a second
  data-access path. See ADR-0019.
- `resultSummary` either contains safe integer `counts` and integer-cent `totalsCents` with
  `totalsAvailable`, or explicit `{ dataAvailable: false, reason, reportKey }` metadata. Count-only
  sources return `totalsCents: {}` with `totalsAvailable: false`; no zero is fabricated and no
  exception text is returned. Dashboard summaries reuse this shape with `NO_RUN_YET`.
- Runs expose `QUEUED`, `RUNNING`, `COMPLETED` and `FAILED`. `reporting.run` is queued through BullMQ
  with an ID-only payload and a synchronous fallback when queues are disabled; terminal runs are
  never re-executed. `GET /runs/{id}/job` returns opaque IDs and state only.
- Domain events are `ReportRunQueued`, `ReportRunCompleted`, `ReportRunFailed` and `DashboardUpdated`.
  Socket events are `reporting:run` and `reporting:dashboard`. Frames carry IDs/classification only
  and are routed to the company room only — never user, thread, inbox or branch rooms. Clients
  refetch all values through `/api/reporting`; see `x-realtime`.
- `Idempotency-Key` remains scoped to `POST /api/messaging/threads/{id}/messages` only; no
  `/api/reporting` endpoint consumes it. No filing, payment, email or file export is performed.

## Phase 13 scope

- `Manufacturing` tag paths (21 paths / 32 operations): `/api/manufacturing/work-centers`
  (list/create/get/patch/delete), `/boms` (list/create/get/patch) with `/{id}/status`, `/orders`
  (list/create/get/patch) with `/{id}/{release,start,complete,cancel}`, `/batches`
  (list/create/get/patch) with `/{id}/{start,review,reject,issue,release}`, and
  `/batches/{id}/qc-checks` (list/create) plus `/qc-checks/{id}` (get/patch/sign).
- All Phase 3–12 paths and schemas remain intact. Every operation declares
  `security: [{ bearerAuth: [] }]` and an `x-permission` from the 15-entry `manufacturing.*` set.
  Strict request schemas reject client-supplied `companyId`, statuses, signatures, computed costs
  and calculated columns; free text is DLP-checked and fails closed.
- BOM standard cost and per-line cost are computed server-side from integer milli-units with a
  single half-up rounding at the cent boundary. Quantities accept at most three decimals; all money
  is safe integer cents. No statutory, tax or filing constant is present.
- Batch number, manufacturing date and expiry date are mandatory GMP fields. Signatures are
  authenticated user IDs only. Deviation notes and QC result notes are encrypted at rest and appear
  only as `deviationNotesPresent`/`resultNotesPresent` booleans in DTOs, audits and events.
- Release requires REVIEW status, all GMP fields and signatures, at least one mandatory QC check and
  every check PASS. A FAIL blocks release; the QA reviewer cannot be the releaser, and production
  users cannot release their own batch. Material issue and finished-goods receipt delegate to the
  Phase 8 inventory helpers (`issueStock`, `createBatch`, `receiveStock`); no filing, payment or
  email is performed. See ADR-0018.
- Domain events are `BomApproved`, `ProductionOrderReleased`, `BatchRecordOpened`, `QcCheckFailed`
  and `BatchReleased`. Socket events are `manufacturing:bom`, `manufacturing:order`,
  `manufacturing:batch` and `manufacturing:qc`. Frames carry IDs/classification only and are routed
  to the company room only — never user, thread, inbox or branch rooms. Clients refetch through
  `/api/manufacturing`; see `x-realtime`.
- `Idempotency-Key` remains scoped to `POST /api/messaging/threads/{id}/messages` only; no
  `/api/manufacturing` endpoint consumes it.

## Phase 12 scope

- `Projects` tag paths (17 paths / 25 operations): `/api/projects` (list/create), `/{id}`
  (get/patch), `/{id}/status`, `/{id}/members` (list/create), `/{id}/members/{memberId}`
  (get/patch), `/{id}/milestones` (list/create), `/{id}/milestones/{milestoneId}` (get) with
  `/{milestoneId}/status`, `/{id}/tasks` (list/create), `/{id}/tasks/{taskId}` (get/patch) with
  `/{taskId}/status`, `/{id}/time` (list/create), `/{id}/time/{timeId}` (get) with `/decision`
  and `/invoice`, and `/{id}/budget` plus `/{id}/budget/links`.
- All Phase 3–11 paths and schemas remain intact. Every operation declares
  `security: [{ bearerAuth: [] }]` and an `x-permission` from the 14-entry `projects.*` set;
  billing, usage and linking additionally document the required finance permissions. Strict
  request schemas reject client-supplied `companyId`, statuses and calculated columns; free text
  is DLP-checked and fails closed.
- Hours are positive floats rounded once, half-up, to two decimals at the service boundary. All
  money is safe integer cents. `Project.financeInvoiceId` and `TimeEntry.financeInvoiceId` are
  opaque scalar references; finance owns the invoice and all tax arithmetic. Invoice creation
  requires APPROVED + billable + positive amount + customer and resolves a VERIFIED VAT rate
  before any write. See ADR-0017.
- Budget usage is delegated to finance's `getBudgetUsage`. Finance failures yield explicit
  `unavailable` metadata; the projects module never estimates, zeroes or fabricates totals.
- Domain events are `ProjectCreated`, `ProjectTaskCompleted`, `MilestoneMet` and
  `TimeEntryApproved`. Socket events are `projects:project`, `projects:task`,
  `projects:milestone` and `projects:time`. Frames carry IDs/classification only and are routed
  to the company room only — never user, thread, inbox or branch rooms. Clients refetch through
  `/api/projects`; see `x-realtime`.
- `Idempotency-Key` remains scoped to `POST /api/messaging/threads/{id}/messages` only; no
  `/api/projects` endpoint consumes it.

## Phase 11 scope

- `HR` tag paths (21 paths / 28 operations): `/api/hr/employees` (create/list/get/patch),
  `/api/hr/contracts` (create/list/get) with `/{id}/activate`, `/expire`, `/terminate`, `/cancel`,
  `/api/hr/rates` (create/list/get) with `/{id}/verify`, `/api/hr/leave` (create/list/get) with
  `/{id}/decision`, `/api/hr/attendance` (create/list/get), and `/api/hr/payroll/runs`
  (create/list/get) with `/{id}/calculate`, `/approve` and `/post`.
- All Phase 3–10 paths and schemas remain intact. Every HR operation declares
  `security: [{ bearerAuth: [] }]` and an `x-permission` from the 16-entry `hr.*` set; payroll
  posting additionally documents `finance.journal.post` via `x-additional-permission`. Strict
  request schemas reject client-supplied `companyId`, statuses, verification metadata and
  calculated totals; free text is DLP-checked and fails closed.
- Money is integer cents (`*Cents`) and rates are integer basis points in `rateBps`. A new
  `PayrollRate` is always `UNVERIFIED`; the separate verify endpoint stamps the authenticated
  principal. Calculations resolve all five statutory components from the most recent VERIFIED row
  effective on the period end, or fail with 409. No statutory value is hardcoded. See ADR-0016.
- Bank name/number and KRA PIN are encrypted at rest. Employee DTOs expose only presence flags and
  masked suffixes; plaintext and encrypted envelopes are never emitted, audited or put on events.
- Domain events are `EmployeeCreated`, `LeaveApproved`, `PayrollRateVerified`,
  `PayrollRunCalculated` and `PayrollRunApproved`. Phase 11 socket events are `hr:employee`,
  `hr:leave`, `hr:rate` and `hr:payroll`. Frames carry IDs/classification only and are routed to the
  company room only — never user, thread, inbox or branch rooms. Clients refetch through
  `/api/hr`; see `x-realtime` and `x-hr`.
- Payroll posting creates one balanced finance journal with system accounts `EXPENSE`, `AP_CONTROL`
  and `BANK`; it performs no filing, payment, payslip email or bank transfer.
- `Idempotency-Key` remains scoped to `POST /api/messaging/threads/{id}/messages` only; no
  `/api/hr` endpoint consumes it.

## Phase 10 scope

- `Service` tag paths (27 paths / 32 operations): `/api/service/contracts` (create/list/get) with
  `/{id}` activate/suspend/cancel, `/api/service/tickets` (create/list/get) with `/{id}`
  assign/start/wait/resolve/close/cancel, `/api/service/work-orders` (create/list/get) with `/{id}`
  schedule/start/complete/cancel/invoice, `/api/service/visits` (create/list/get) with `/{id}`
  check-in/complete/cancel, and `/api/service/parts` (create/list/get).
- All Phase 3–9 paths and schemas remain intact. Every service operation declares
  `security: [{ bearerAuth: [] }]` and an `x-permission` from the 14-entry `service.*` set. Strict
  request schemas reject client-supplied `companyId`, statuses and calculated columns; free text is
  DLP-checked and fails closed.
- `responseSlaHours` and `resolutionSlaHours` are whole-hour commercial targets, never statutory or
  tax rates. Direct-customer tickets without a contract default to 4-hour response and 48-hour
  resolution. Due dates are persisted at ticket opening; `sla` is derived from timestamps into
  `PENDING`, `AT_RISK`, `MET` or `BREACHED`.
- Work-order `labourCents`, `partsCents` and `totalCents` are safe integer cents. Part usage calls
  the Phase 8 inventory ledger; a business stock conflict is recorded as `manualIssueRequired`
  rather than failing the record, while DLP/validation failures propagate. Optional invoicing
  delegates tax arithmetic to finance and accepts only a VERIFIED, effective VAT rate. See ADR-0015.
- Visits require check-in before completion. All lifecycle writes emit ID-only audits; the six domain
  events are `ServiceContractActivated`, `ServiceTicketOpened`, `ServiceTicketAssigned`,
  `ServiceTicketResolved`, `WorkOrderCompleted` and `ServiceVisitCompleted`.
- Phase 10 socket events are `service:contract`, `service:ticket`, `service:workorder` and
  `service:visit`. Frames carry IDs/classification only and are routed to the company room only —
  never user, thread, inbox or branch rooms. Clients refetch through `/api/service`; see
  `x-realtime` and `x-service`.
- `Idempotency-Key` remains scoped to `POST /api/messaging/threads/{id}/messages` only; no
  `/api/service` endpoint consumes it.

## Phase 9 scope

- `Procurement` tag paths (18 paths / 23 operations): `/api/procurement/requisitions`
  (create/list/get), `/requisitions/{id}` submit/approve/convert, `/orders`
  (create/list/get), `/orders/{id}` approve/send, `/receipts` (create/list/get),
  `/receipts/{id}/inspect`, `/returns` (create/list/get), `/returns/{id}/approve`,
  `/matches` (create/list/get) and `/matches/{id}/approve`.
- All Phase 3–8 paths and schemas remain intact. Every procurement operation declares
  `security: [{ bearerAuth: [] }]` and an `x-permission` from the `procurement.*` set. Strict
  request schemas reject client-supplied `companyId`, statuses and calculated value columns;
  free text is DLP-checked and fails closed.
- Money fields are integer cents (`*Cents`), quantities are positive floats rounded once to
  three decimals, and dates are strict `YYYY-MM-DD`. A requisition converts to a draft order.
  Goods receipts post stock through the Phase 8 inventory ledger and update ordered/received
  quantities on the order; partial and full receipts are supported. Approved supplier returns
  issue stock back through inventory. See ADR-0014.
- `PROCUREMENT_MATCH_TOLERANCE_BPS` is a business tolerance used only to decide MATCHED vs
  DISCREPANCY from cent-exact receipt and invoice variances. It is not a statutory rate and no
  tax percentage is hardcoded. Matching never posts finance journals, payments or invoice
  mutations; `financeInvoiceId` is an amount-comparison reference only.
- Phase 9 socket events are `procurement:requisition`, `procurement:order`,
  `procurement:receipt`, `procurement:return` and `procurement:match`. Domain events and socket
  frames carry IDs/classification only and are routed to the company room only — never user,
  thread, inbox or branch rooms. Clients refetch through `/api/procurement`; see `x-realtime`
  and `x-procurement`.
- `Idempotency-Key` remains scoped to `POST /api/messaging/threads/{id}/messages` only; no
  `/api/procurement` endpoint consumes it.

## Phase 8 scope

- `Inventory` tag paths (22 paths / 30 operations): `/api/inventory/items`, `/batches`,
  `/warehouses`, `/balances`, `/movements`, `/alerts`, `/stock/receipts`, `/stock/issues`,
  `/stock/adjustments`, `/transfers` plus transfer detail/approve/receive/cancel, and `/counts`
  plus count detail/record/approve/cancel.
- All Phase 3/4/5/6/7 paths and schemas remain intact. Every inventory operation declares
  `security: [{ bearerAuth: [] }]` and an `x-permission` from the `inventory.*` set. Strict request
  schemas reject client-supplied `companyId`, statuses and calculated value columns; all free text
  is DLP-checked and fails closed.
- Money fields are integer cents (`*Cents`); quantities are positive floats rounded once to three
  decimals at the service boundary. Receipts use weighted-average valuation: the blended cost is
  rounded once to a whole cent and the balance value is rebuilt from that rounded average. Issues,
  adjustments, transfers and count variances use the balance's current average cost. See ADR-0013.
- `batchId = NULL` means unbatched stock; batch-tracked items require a batch and only `RELEASED`
  batches may be issued or reduced. Transfers move `DRAFT → IN_TRANSIT → RECEIVED`, capturing line
  costs at approval; counts move `DRAFT → COUNTING → APPROVED` and post only non-zero variances.
- Reorder alerts list current breaches and emit `ReorderLevelBreached` on a downward threshold
  crossing. Phase 8 socket events are `inventory:item`, `inventory:stock`, `inventory:transfer`,
  `inventory:count` and `inventory:alert`. Domain events and socket frames carry IDs/classification
  only and are routed to the company room only — never user, thread, inbox or branch rooms. Clients
  refetch through `/api/inventory`; see `x-realtime` and `x-inventory`.
- `Idempotency-Key` remains scoped to `POST /api/messaging/threads/{id}/messages` only; no
  `/api/inventory` endpoint consumes it.

## Phase 7 scope

- `Sales` tag paths (15 paths / 23 operations): `/api/sales/quotes` (create/list), `/quotes/{id}`
  (detail/update), `/quotes/{id}/convert`, `/api/sales/orders` (create/list), `/orders/{id}`
  (detail/update), `/orders/{id}/confirm`, `/orders/{id}/invoice`, `/api/sales/deliveries`
  (create/list), `/deliveries/{id}` (detail/update), `/deliveries/{id}/issue`,
  `/deliveries/{id}/deliver`, `/api/sales/returns` (create/list), `/returns/{id}`
  (detail/update), `/returns/{id}/approve` and `/returns/{id}/receive`.
- All Phase 3/4/5/6 paths and schemas remain intact. Every sales operation declares
  `security: [{ bearerAuth: [] }]` and an `x-permission` from the `sales.*` set. Client-supplied
  `companyId`, status and calculated/rate values are rejected by strict request schemas.
- All document money fields are integer cents (`*Cents`); all dates are strict `YYYY-MM-DD`.
  Sales records `taxRateId` as an intended VAT reference only. It never copies `rateBps` and
  never calculates tax. `POST /api/sales/orders/{id}/invoice` delegates to finance
  `createInvoice` + `issueInvoice`; only a VERIFIED, effective rate may be used. An omitted
  `taxRateId` is valid and finance rejects issue when no verified rate is available.
- Status transitions are explicit and guarded: DRAFT-only edits, quote → order conversion,
  order confirmation before delivery/invoicing, issue before delivery, and approval before
  receipt of a return. Terminal statuses cannot be reopened.
- Free text is DLP-checked and fails closed; findings are reported by type only.
- Phase 7 socket events are `sales:quote`, `sales:order`, `sales:delivery`, `sales:return` and
  `sales:invoice`. Domain events and socket frames carry IDs/classification only and are routed
  to the company room only — never user, thread, inbox or branch rooms. Clients refetch through
  `/api/sales`; see `x-realtime` and `x-sales`.
- `Idempotency-Key` remains scoped to `POST /api/messaging/threads/{id}/messages` only; no
  `/api/sales` endpoint consumes it.

## Phase 6 scope

- `Finance` tag paths (24 paths / 31 operations) covering `/api/finance/accounts`, `/parties`,
  `/statutory-rates` plus `/{id}/verify`, `/journals` plus detail/post/reverse, `/invoices` plus
  detail/issue, `/payments` plus detail, `/budgets` plus detail/approve, the four statement
  endpoints (`trial-balance`, `income`, `balance-sheet`, `ageing`), and eTIMS
  `/submissions`, `/submissions/{id}`, `/submissions/{id}/retry`, `/payload/{invoiceId}`.
- Every finance operation declares `security: [{ bearerAuth: [] }]` and an `x-permission` from
  the `finance.*` set. Tenant/branch scope is derived from the session; clients never send a
  company ID. All Phase 3/4/5 paths and schemas remain intact.
- Money fields are integer cents (`*Cents`). `rateBps` (basis points) comes only from the
  versioned statutory-rate table, and only `VERIFIED`, effective rows may be used for finance
  calculations or invoice issuance. Creating a rate always yields `UNVERIFIED`; verification is
  a separate, named sign-off. The legacy storefront `taxRate` field is outside this table and is
  not used by Phase 6 finance calculations. No rate is hardcoded in application code.
- No plaintext tax PIN or card data is stored or emitted. Parties expose only `hasTaxPin` and
  `taxPinMasked`; `CARD_TOKEN` is a method identifier, not card data. eTIMS payloads carry
  encrypted PIN references only.
- eTIMS is a **ready-only internal queue**, not live filing. The `finance.etims.submit` worker
  records `PENDING` for a certified provider and creates in-app notifications only. Never
  describe these endpoints or events as a KRA submission or filing.
- Phase 6 socket events: `finance:account`, `finance:journal`, `finance:invoice`,
  `finance:payment`, `finance:budget`, `finance:rate`, `finance:etims`, `finance:etims-failed`.
  Payloads carry IDs/classification only; refetch through `/api/finance`. See `x-realtime`.
- `Idempotency-Key` remains scoped to `POST /api/messaging/threads/{id}/messages` only; no
  finance endpoint consumes it.

## Conventions

1. All endpoints are under `/api/<module>`; Phase 5 does not introduce a `/v1` segment.
2. Every request/response includes `X-Correlation-ID`.
3. Tenant context comes from the authenticated session/token, never from a client-supplied `companyId` header.
4. Errors use `application/problem+json` (RFC 9457 style).
5. Request and response DTOs are Zod schemas in `packages/shared` and must match these documents.
6. Webhooks are documented under `webhooks` / `components.webhooks` and tested by contract tests in CI.
7. Breaking changes require a new versioned path or event version.
8. Phase 5 event payload schemas are strict: adding a title, body, checksum or object key is a
   contract violation even if the extra field is otherwise harmless.
9. Phase 6 statement reports share one `FinanceStatement` shape (`title`, `columns`, `rows`,
   `totals`) so clients can render them generically; numeric report values are integer cents.
10. Phase 6 event frames are ID-only. Adding amounts, statuses, PINs, payloads or provider
    responses to a finance socket frame is a contract violation.
11. Phase 7 sales frames are ID/classification-only invalidation signals routed to the company
    room. Adding document numbers, amounts, customer names or free text is a contract violation.
12. Phase 8 inventory frames are ID/classification-only invalidation signals routed to the company
    room. Adding quantities, costs, values, batch numbers, item names or notes is a contract violation.
13. Phase 9 procurement frames are ID/classification-only invalidation signals routed to the company
    room. Adding document numbers, quantities, amounts, variances, statuses, supplier names or notes
    is a contract violation.
14. Phase 10 service frames are ID/classification-only invalidation signals routed to the company
    room. Adding contract/ticket/work-order/visit numbers, subjects, customer names, SLA hours,
    amounts, statuses or notes is a contract violation.
15. Phase 11 HR frames are ID/classification-only invalidation signals routed to the company room.
    Adding employee names, bank or KRA references, pay amounts, rate percentages, leave reasons,
    payroll numbers or statuses is a contract violation.
16. Phase 12 projects frames are ID/classification-only invalidation signals routed to the company
    room. Adding project names, task titles, milestone dates, hours, rates, amounts, statuses,
    notes or finance references is a contract violation.
17. Phase 13 manufacturing frames are ID/classification-only invalidation signals routed to the
    company room. Adding batch numbers, GMP dates, quantities, costs, check codes, observed values,
    statuses, notes, user names or inventory movement details is a contract violation.
18. Phase 14 reporting frames and queue payloads are ID/classification-only invalidation signals
    routed to the company room. Adding report keys, parameters, counts, cent amounts, statuses, file
    IDs, dashboard titles or run results is a contract violation. A result summary must use the
    explicit available/unavailable shapes; zero-valued substitutes are not permitted.
19. Phase 15 DTOs, delivery payloads, callback responses, domain events, sockets and queue jobs
    contain only opaque IDs, normalised classifications/reason codes and explicit availability
    metadata. Adding a raw API key, key hash, encrypted secret envelope, subscription URL,
    signature, provider response body, business content or free text is a contract violation.
    Secret/hash fields in `PublicClientCreate` and `WebhookSubscriptionCreate`/`Rotate` are
    write-only request fields and appear in no response.

## Security schemes

- `bearerAuth` — short-lived access JWT for ERP/CMS users.
- `cookieAuth` — refresh session cookie (`HttpOnly; Secure; SameSite=Strict`).
- `apiKeyAuth` — opaque public API key sent as `Authorization: Bearer <key>`; only its SHA-256 hash is stored, and it is also the HMAC key for provider callbacks.
- `oauth2` — reserved for future client-credentials issuance; Phase 15 uses opaque API keys only.

## Regenerating and verifying

1. Edit `openapi.yaml` in the phase that implements the endpoint; do not hand-edit generated output.
2. Update `packages/shared` contracts and backend contract tests in the same change; add the phase
   entry to `../../CHANGELOG.md`.
3. Verify the YAML parses before review. With Python/PyYAML available:

   ```bash
   python -c "import yaml; yaml.safe_load(open('docs/openapi/openapi.yaml', encoding='utf-8'))"
   ```

   An OpenAPI-aware linter (for example `npx @redocly/cli lint docs/openapi/openapi.yaml`) is
   optional when network access to the generator is available. At the Phase 15 gate the parsed
   document has version `1.0.0`, 260 paths (4 under `/api/public/v1`, 11 under `/api/webhooks`),
   364 schemas, 23 parameters and 1148 `$ref`s resolving with 0 missing; 343 operations total.
   At the Phase 14 gate it had version `0.14.0-phase.14`, 245 paths (11 under `/api/reporting`),
   328 schemas, 22 parameters and 1070 `$ref`s. At the Phase 13 gate it had version
   `0.13.0-phase.13`, 234 paths (21 under `/api/manufacturing`) and 293 schemas. At the Phase 12
   gate it had version `0.12.0-phase.12`, 213 paths (17 under `/api/projects`) and 245 schemas.
   At the Phase 11 gate it had version `0.11.0-phase.11`, 196 paths (21 under `/api/hr`) and 203
   schemas. At the Phase 10 gate it had version `0.10.0-phase.10`, 175 paths and 179 schemas; at
   the Phase 9 gate, 148 paths and 145 schemas; at the Phase 8 gate, 130 paths and 114 schemas.
4. Confirm all `$ref` targets resolve and that no Phase 3–14 path was removed. A local check:

   ```bash
   python - <<'PY'
   import yaml
   doc = yaml.safe_load(open('docs/openapi/openapi.yaml', encoding='utf-8'))
   refs = []
   def walk(node):
       if isinstance(node, dict):
           for k, v in node.items():
               refs.append(v) if k == '$ref' else walk(v)
       elif isinstance(node, list):
           for item in node: walk(item)
   walk(doc)
   for ref in refs:
       cur = doc
       for part in ref.removeprefix('#/').split('/'):
           cur = cur[part]
   print('version', doc['info']['version'], 'paths', len(doc['paths']), 'schemas', len(doc['components']['schemas']), 'refs', len(refs))
   PY
   ```

   Phase 5 contract tests in `packages/api/tests/` cover the shared permission and ID-only
   event rules; Phase 6 finance tests cover verified-rate gating, integer-cent arithmetic and
   eTIMS queue-only behaviour; Phase 7 sales tests cover conversion, status guards, DLP,
    verified-rate enforcement and company-room ID-only events; Phase 8 inventory tests cover
    weighted-average cents, balance movements, transfer/count guards, quarantine, reorder alerts,
    DLP and company-room ID-only events; Phase 9 procurement tests cover conversion, partial/full
    receipts, cent-exact tolerance matching, supplier returns, quarantine guards, DLP, strict
    ID-only events and tenant scope; Phase 10 service tests cover SLA arithmetic, lifecycle
    guards, DLP, strict ID-only events, cent totals, stock-conflict fallback, verified-rate
    invoicing and tenant scope; Phase 11 HR tests cover version selection, verified-rate gating,
    integer-cent payroll math, masked/encrypted DTOs, strict ID-only events and tenant scope;
    Phase 12 projects tests (20) cover lifecycle guards, cent/hours math, DLP, strict ID-only
    events, permission separation, finance delegation/unavailable metadata and tenant scope.
    Phase 13 manufacturing tests (21) cover cent math, lifecycle/QC release guards, GMP fields,
    encrypted notes, strict ID-only events, permission separation, DTO safety and tenant scope.
    Phase 14 reporting tests (16) cover the fixed allow-list, SQL-injection rejection, typed
    parameters, DLP fail-closed, integer-cent/count validation, explicit unavailability, terminal
    status guards, safe DTOs, strict ID-only events, socket routing, permission separation and
    source contracts. Phase 15 public API/webhook tests (26) cover explicit scopes, per-key
    rate limits, read-only allow-listing, integer-cent summaries, HMAC signing, replay rejection,
    secret masking, ID-only payloads, retry/backoff status, strict events, socket routing,
    permission separation and tenant scope. At the Phase 15 gate 1148 refs resolve; at the Phase
    14 gate 1070 refs resolve; at the Phase 13 gate 971 refs resolved; at the Phase 12 gate 842
    refs resolved, and at the Phase 11 gate 721 refs resolved.

## Phase gate requirement

Each phase ending with an API must update `openapi.yaml`, add/adjust contract tests, and record the change in `CHANGELOG.md` before review.

## Open decisions

- Static developer docs now exist at `/api/public/v1/docs` and `/api/webhooks/docs` as the
  portal seed; the final generated documentation host and branding are still to be chosen.
- Exact OIDC issuer and claim mapping after provider selection.
- Certified eTIMS provider selection and any future live-filing integration. Phase 6 fixes the
  payload version via `ETIMS_PAYLOAD_VERSION` (default `1.0`) but performs no live KRA filing.
- Document issuance endpoint and `DocumentIssued` emission are contracted as events; the
  HTTP issue/void surface belongs with the Phase 6+ document management work.
