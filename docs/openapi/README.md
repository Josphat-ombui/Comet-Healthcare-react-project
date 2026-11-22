# OpenAPI Contract

Comet Healthcare Enterprise Platform — Phase 6 contract complete (`0.6.0-phase.6`)

This directory holds the versioned REST and webhook contracts. Phase 1 created the skeleton;
Phase 3 added identity/organisation/audit, Phase 4 added messaging and realtime, Phase 5
completed the shared-services surface (files, workflow, notifications, search, documents),
and Phase 6 adds the tenant/branch-scoped finance surface under `/api/finance`.

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
   optional when network access to the generator is available. At the Phase 6 gate the parsed
   document has version `0.6.0-phase.6`, 93 paths (24 under `/api/finance`) and 51 schemas.
4. Confirm all `$ref` targets resolve and that no Phase 3/4/5 path was removed. A local check:

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
   eTIMS queue-only behaviour.

## Phase gate requirement

Each phase ending with an API must update `openapi.yaml`, add/adjust contract tests, and record the change in `CHANGELOG.md` before review.

## Open decisions

- Final generated documentation host (internal only vs developer portal in Phase 15).
- Exact OIDC issuer and claim mapping after provider selection.
- Certified eTIMS provider selection and any future live-filing integration. Phase 6 fixes the
  payload version via `ETIMS_PAYLOAD_VERSION` (default `1.0`) but performs no live KRA filing.
- Document issuance endpoint and `DocumentIssued` emission are contracted as events; the
  HTTP issue/void surface belongs with the Phase 6+ document management work.
