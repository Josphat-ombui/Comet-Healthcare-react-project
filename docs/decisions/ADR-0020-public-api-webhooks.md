# ADR-0020: Versioned Public API and Signed Webhooks

- **Status:** Accepted (Phase 15)
- **Date:** 2026-11-23
- **Deciders:** Principal architect

## Context

Phases 3–14 created a large authenticated ERP surface with tenant/branch RLS, ID-only
audits/events, integer-cent money and authoritative module services. External partners now need a
small, stable integration surface without gaining access to the ERP session model, private record
IDs, free text or configuration secrets.

Two risks dominate this phase. First, a public API must not become a second query language or a way
to bypass RLS and statutory/finance guards. Second, webhooks must not leak secrets or business
content into DTOs, events, sockets, queue payloads or delivery response bodies, and a callback must
not be replayable.

This ADR fixes the public contract, credential storage, scope model, webhook delivery lifecycle and
event boundary for Phase 15.

## Decision

### Versioned, read-only public surface

- The public surface is `/api/public/v1`, pinned to contract version `1.0.0`. Only `GET /docs` is
  unauthenticated; it returns static contract metadata and no tenant data.
- Every other route requires `Authorization: Bearer <opaque-api-key>`, a `public:*:read` scope on
  **both** the reused `ApiKey` and the linked `PublicClient`, and per-key rate limiting. Unknown,
  expired or revoked keys fail with a generic 401. A valid key cannot turn the surface into a write
  API: every unmatched verb returns 405.
- Three explicit scopes exist: `public:health:read`, `public:finance:read` and `public:sales:read`.
  The server grants the intersection of key scopes and client scopes filtered to this allow-list;
  an empty intersection is a 403.
- `GET /health` returns service/contract metadata and only the scopes actually granted. No key ID,
  key prefix, company ID, secret or tenant data is returned.
- `GET /finance/summary` accepts only `kind=income|ageing` plus strict `YYYY-MM-DD` bounds and
  delegates to the Phase 6 `getStatement` service. It returns safe integer-cent totals and counts,
  or explicit `NO_DATA` metadata; it never returns statement rows, account identifiers, statutory
  rates or exception text.
- `GET /sales/summary` aggregates only `CONFIRMED` and `FULFILLED` orders in the client's
  tenant/branch scope, with integer-cent `subtotalCents`, `taxCents` and `totalCents`. Draft and
  cancelled orders, order IDs and customer data are excluded. Any non-safe-integer accumulation
  produces explicit `NO_DATA` rather than a wrapped or truncated total.
- Rate limits are applied per API key ID (not source IP) over a 60-second in-memory sliding window,
  with `X-RateLimit-Limit`, `X-RateLimit-Remaining` and `Retry-After` headers. This is adequate for
  a single process; horizontal deployments require a shared limiter (see Consequences).

### Credentials and registered clients

- `ApiKey` remains the only key store. It keeps `keyHash = SHA-256(rawKey)`, a display `keyPrefix`,
  `scopes`, `rateLimit`, `expiresAt` and `revokedAt`. The raw key is never generated, accepted or
  returned by a DTO.
- Client registration either links an existing `apiKeyId` or accepts a caller-supplied `keyHash`
  plus `keyPrefix`; the latter path creates the `ApiKey` with a default limit of 60 requests/minute.
  The strict Zod schema rejects a `key` field, malformed digests and partial hash/prefix pairs. One
  API key may be linked to at most one active public client per company.
- `PublicClient.apiKeyId` links the two records; revoking a client revokes its key and emits a
  strict `PublicClientRevoked` event. `branchId = NULL` means organisation-wide within the company.
- All client reads use the tenant-scoped Prisma proxy. The one privileged lookup resolves a bearer
  hash to key metadata before tenant context exists; it selects IDs/scope metadata only and never
  business data.

### Webhook lifecycle and permissions

- Three tenant/branch-scoped models are added: `PublicClient`, `WebhookSubscription` and
  `WebhookDelivery`. All have RLS plus the dynamic `tenant_branch_scope` policy.
- Six permissions enforce separation of duties:
  `public.client.read/write`, `webhook.subscription.read/write`, `webhook.delivery.read/retry`.
  ADMIN has all six; MANAGER may register/revoke clients, manage subscriptions and retry deliveries;
  STAFF and COMPLIANCE are read-only for client/subscription/delivery data.
- A subscription accepts a public HTTPS destination and at least one allow-listed event type from
  `InvoiceIssued`, `PaymentRecorded`, `SalesOrderConfirmed`, `DeliveryNoteIssued`,
  `ReportRunCompleted`, `DashboardUpdated` and `BatchReleased`. Loopback and private/link-local
  addresses are rejected to limit SSRF exposure.
- A subscription secret is accepted only as a whole-field write value (`secret` on create/rotate),
  must be 32–128 URL-safe characters, and is stored as an AES-GCM envelope plus a SHA-256 lookup
  hash. DTOs expose only `secretConfigured: boolean`; no DTO, event, socket, queue job, audit or log
  contains the plaintext, envelope or hash. Rotation requires a different secret and updates
  `rotatedAt`.
- The delivery ledger records status (`PENDING`, `RETRYING`, `DELIVERED`, `FAILED`), attempts,
  `nextAttemptAt`, HTTP status and a normalised reason code only. Response headers and bodies are
  never read into storage, events or logs. Manual retry resets a non-delivered record to `PENDING`
  and enqueues a fresh ID-only job.

### Signing, fan-out and retries

- Outbound POSTs sign stable JSON with HMAC-SHA256. Object keys are sorted at every level, the
  signature header is `x-comet-signature: sha256=<64 lowercase hex characters>`, and delivery/event
  IDs plus a timestamp are sent in dedicated headers.
- The body is a strict ID/classification-only payload: `eventId`, `eventType`, `entityType`,
  `entityId`, `occurredAt`, optional `correlationId` and `classification`. No titles, money, URLs,
  secrets or record bodies cross the boundary. Payload sanitisation runs again in the worker.
- Fan-out happens in the outbox publisher **after** an event is successfully marked `PUBLISHED`.
  It is best-effort: subscription/queue failures are logged and never roll back or relabel the
  published outbox event. Duplicate `(subscriptionId, eventId)` pairs are skipped.
- Developer lifecycle events (`WebhookSubscriptionCreated`, `WebhookDeliveryFailed`,
  `PublicClientRevoked`) are never fanned out, preventing recursive delivery generation.
- `webhook.deliver` carries only opaque IDs and classification. BullMQ applies `WEBHOOK_MAX_ATTEMPTS`
  attempts with exponential backoff from `WEBHOOK_RETRY_BACKOFF_MS` (capped at 60s) and a
  `WEBHOOK_DELIVERY_TIMEOUT_MS` POST timeout. Retryable failures set `RETRYING` and throw so BullMQ
  controls the next attempt; terminal failures set `FAILED` and emit one strict
  `WebhookDeliveryFailed` event. Delivered jobs record only the HTTP status.

### Provider callbacks and replay safety

- `POST /api/webhooks/callbacks/:clientId/verify` is unauthenticated by session. The provider
  proves possession of the linked API key secret by HMAC-SHA256 over the same canonical sorted-key
  JSON, using the key's SHA-256 hash as the HMAC key. Verification uses a timing-safe comparison and
  happens before any replay lookup, so unsigned requests cannot probe replay state.
- The callback body is strict and ID-only: `eventId`, `eventType`, `entityType`, `entityId`,
  `occurredAt` and `timestamp`. Both timestamps must be within the configured freshness window
  (`WEBHOOK_CALLBACK_TTL_SECONDS`, default 300s, minimum 30s).
- Replay identity is a SHA-256 digest of `companyId|clientId|eventId|timestamp`. Acceptance is
  rejected by an append-only `AuditLog` entry (`webhook.callback.accepted`) plus an in-memory cache.
  A replay returns 409; stale or bad signatures return 400/401. No key hash or signature is returned
  to the caller, and the response contains only `accepted`, `eventId` and a short verification ID.

### Events, sockets and developer UI

- The three strict shared event schemas carry opaque IDs, entity types and normalised classification
  or reason codes only. URLs, secrets, hashes, signatures, payloads and response bodies are
  structurally rejected.
- Realtime routing is company-room-only. `developer:webhook` carries subscription/delivery
  invalidation signals; `developer:client` carries client revocation signals. Frames are ignored as
  data and the ERP Developer/API tab refetches through authenticated endpoints.
- Six developer permissions, three event schemas, two socket channels, the public contract and the
  webhook contract are all documented in OpenAPI `1.0.0`. `apiKeyAuth` is an opaque Bearer key; the
  `oauth2` scheme remains reserved and unused. `Idempotency-Key` stays scoped to messaging sends;
  Phase 15 writes and callbacks are not idempotent by header.

## Alternatives considered

1. **Reuse the ERP session/JWT model for partners** — rejected: it would expose the full internal
   surface and couple external integrations to user sessions and RBAC.
2. **Issue a new raw secret per request and store it in a new key table** — rejected: the existing
   `ApiKey` already provides hashes, scopes, limits and revocation; duplication would weaken key
   lifecycle control.
3. **Accept or return raw keys/secrets from DTOs** — rejected: plaintext could leak into logs,
   audits, events, sockets and queue payloads.
4. **Let partners supply SQL, report keys or arbitrary statement names** — rejected: a second query
   surface bypasses RLS and module guards. Allow-listed summaries delegate to authorised services.
5. **Include business data in webhook payloads** — rejected: secrets, money and free text would
   escape RLS and the ID-only event/DLP boundary. Receivers refetch through authorised APIs.
6. **Fan out before outbox publication or inside the request transaction** — rejected: a delivery
   failure could roll back or misstate a committed business event.
7. **Use a static process-wide signing secret** — rejected: rotation and per-client revocation would
   require redeployment; per-subscription encrypted secrets are independently rotatable.
8. **Verify callbacks before checking the HMAC** — rejected: it creates a replay-state oracle for
   unauthenticated callers.

## Consequences

- Positive: external integrations have a small, versioned, read-only contract with explicit scopes
  and per-key limits, while all data access stays inside RLS and authorised module services.
- Positive: no plaintext secret, key hash, signature, response body or business payload enters a
  DTO, audit, event, socket or queue job.
- Positive: signed ID-only deliveries and signature-first replay checks give providers a verifiable
  callback protocol without exposing internal records.
- Cost: adding a public endpoint or webhook event requires a code change, an allow-list entry,
  tests and an OpenAPI update.
- Cost: rate-limit buckets and callback replay caches are per-process. Multi-instance deployments
  need a shared limiter and shared replay store before horizontal scaling; the append-only audit
  ledger still catches cross-instance replays after the fact.
- Cost: providers must refetch details through authenticated APIs after receiving an ID-only
  webhook, and must rotate secrets through the developer API rather than reading them back.
