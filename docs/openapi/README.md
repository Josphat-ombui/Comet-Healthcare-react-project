# OpenAPI Contract

Comet Healthcare Enterprise Platform — Phase 10 contract complete (`0.10.0-phase.10`)

This directory holds the versioned REST and webhook contracts. Phase 1 created the skeleton;
Phase 3 added identity/organisation/audit, Phase 4 added messaging and realtime, Phase 5
completed the shared-services surface (files, workflow, notifications, search, documents),
Phase 6 added the tenant/branch-scoped finance surface under `/api/finance`, Phase 7 added
the sales lifecycle under `/api/sales`, Phase 8 added inventory under `/api/inventory`,
Phase 9 added procurement under `/api/procurement`, and Phase 10 adds service under `/api/service`.

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

## Security schemes

- `bearerAuth` — short-lived access JWT for ERP/CMS users.
- `cookieAuth` — refresh session cookie (`HttpOnly; Secure; SameSite=Strict`).
- `apiKeyAuth` — scoped public API key header `X-API-Key`.
- `oauth2` — client credentials for external integrations.

## Regenerating and verifying

1. Edit `openapi.yaml` in the phase that implements the endpoint; do not hand-edit generated output.
2. Update `packages/shared` contracts and backend contract tests in the same change; add the phase
   entry to `../../CHANGELOG.md`.
3. Verify the YAML parses before review. With Python/PyYAML available:

   ```bash
   python -c "import yaml; yaml.safe_load(open('docs/openapi/openapi.yaml', encoding='utf-8'))"
   ```

   An OpenAPI-aware linter (for example `npx @redocly/cli lint docs/openapi/openapi.yaml`) is
   optional when network access to the generator is available. At the Phase 10 gate the parsed
   document has version `0.10.0-phase.10`, 175 paths (27 under `/api/service`) and 179 schemas.
   At the Phase 9 gate it had version `0.9.0-phase.9`, 148 paths and 145 schemas; at the Phase 8
   gate, 130 paths and 114 schemas.
4. Confirm all `$ref` targets resolve and that no Phase 3/4/5/6/7/8/9 path was removed. A local check:

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
    invoicing and tenant scope. At the Phase 10 gate 609 refs resolve.

## Phase gate requirement

Each phase ending with an API must update `openapi.yaml`, add/adjust contract tests, and record the change in `CHANGELOG.md` before review.

## Open decisions

- Final generated documentation host (internal only vs developer portal in Phase 15).
- Exact OIDC issuer and claim mapping after provider selection.
- Certified eTIMS provider selection and any future live-filing integration. Phase 6 fixes the
  payload version via `ETIMS_PAYLOAD_VERSION` (default `1.0`) but performs no live KRA filing.
- Document issuance endpoint and `DocumentIssued` emission are contracted as events; the
  HTTP issue/void surface belongs with the Phase 6+ document management work.
