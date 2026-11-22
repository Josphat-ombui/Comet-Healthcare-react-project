# OpenAPI Contract

Comet Healthcare Enterprise Platform — Phase 5 contract complete (`0.5.0-phase.5`)

This directory holds the versioned REST and webhook contracts. Phase 1 created the skeleton;
Phase 3 added identity/organisation/audit, Phase 4 added messaging and realtime, and Phase 5
completes the shared-services surface (files, workflow, notifications, search, documents).

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
   optional when network access to the generator is available.
4. Confirm all `$ref` targets resolve and that no Phase 3/4 path was removed. Phase 5 contract
   tests in `packages/api/tests/` cover the shared permission and ID-only event rules.

## Phase gate requirement

Each phase ending with an API must update `openapi.yaml`, add/adjust contract tests, and record the change in `CHANGELOG.md` before review.

## Open decisions

- Final generated documentation host (internal only vs developer portal in Phase 15).
- Exact OIDC issuer and claim mapping after provider selection.
- eTIMS payload schema version after current KRA verification.
- Document issuance endpoint and `DocumentIssued` emission are contracted as events; the
  HTTP issue/void surface belongs with the Phase 6+ document management work.
