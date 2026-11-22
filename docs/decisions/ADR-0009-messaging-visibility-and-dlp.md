# ADR-0009: Internal Messaging Visibility, DLP, and Realtime Delivery

- **Status:** Accepted (Phase 4)
- **Date:** 2026-11-22
- **Deciders:** Principal architect

## Context

Comet Healthcare needs a self-contained internal communication system that works without external email. Staff discuss customer, supplier, and financial matters in threads, and some of those discussions must remain visible only to the author and the shared-inbox managers who handle the case. Restricted identifiers (payment cards, Kenyan national IDs, KRA PINs, credentials) must not leak into logs, events, sockets, or exports. A further constraint is that the value of a realtime notification is the *fact* that something changed; sending message bodies over a socket would multiply the number of places where visibility has to be enforced.

## Decision

### Internal-only delivery

- Internal messaging resolves recipients exclusively to tenant-local users, inboxes, or `department:` / `role:` / `branch:` aliases. Any address containing a dotted external domain is rejected with 422 before lookup. SMTP is never called from the messaging path; external mail remains confined to password resets and other external recipients.
- Aliases are expanded into concrete `MessageRecipient` rows at send time. Partial unique indexes enforce one row per message per user/inbox while leaving alias dimensions nullable.

### Visibility and internal notes

- `visibility=RECIPIENT` messages are delivered to resolved recipients. `visibility=INTERNAL` notes are visible only to the author and managers/agents of the thread's shared inbox.
- Internal notes are filtered out of thread message DTOs, receipt lists, reaction and edit views, Socket.IO payloads, event payloads, and search/export surfaces. Read receipts are never recorded for them.
- Recipient DTOs hide BCC targets from everyone except the sender. Recalled messages render a placeholder rather than the original body.
- Thread access combines RBAC/ABAC permissions with actual participation: inbox membership, ownership, assignment, or a direct `MessageRecipient` row. Cross-tenant and cross-branch access is denied by RLS plus explicit service checks.

### DLP

- Detection patterns live in `packages/shared/src/dlp.js`; the API applies them in `packages/api/lib/dlp.js`. Findings carry only a type and character offsets — never the matched value.
- `DLP_MODE=block` is the default and fails closed: a finding rejects the request with 422 and a list of finding types. `DLP_MODE=flag` accepts the message and records types only, for a supervised rollout.
- Redacted previews are used for logs; full restricted values are never written to audit metadata or events.

### Realtime and event payloads

- Socket.IO 4 with the Redis adapter is introduced in Phase 4. Clients obtain a short-lived `scope=realtime` JWT from `GET /api/messaging/realtime-token`; the token includes an explicit room allow-list computed from the same access checks as the REST API, and every room must be under the token's tenant.
- Domain events are written to the transactional outbox, published to a Redis Stream by `packages/workers`, and relayed to authorised rooms by `packages/realtime`.
- Event and socket payloads contain message/thread IDs, visibility, classification, and recipient IDs only — no subject, body, or recipient address. Clients refetch content through authenticated APIs, which recheck visibility and tenant/branch scope.
- Presence and typing signals are ephemeral, in-process only, and carry user IDs with no content.
- The ERP shell loads the client bundle served by the realtime service and falls back to authenticated polling if sockets are unavailable. Outbound sends use an `Idempotency-Key`; failed sends while offline are queued locally and replayed safely.

## Consequences

### Positive

- Messaging is usable standalone: no external mail provider is involved in delivery.
- Removing bodies from events and sockets creates one enforcement point for content visibility: the message API.
- Fail-closed DLP prevents accidental leakage of regulated identifiers; findings are safe to log.
- Idempotent sends make offline queues and socket retries safe.

### Negative

- Every notification causes an authenticated refetch, so the REST endpoints must stay fast.
- In-process presence is per realtime instance; horizontal scaling needs a Redis-backed presence store later.
- Pattern-based DLP has false positives and will need tuneable rules and a review workflow.
- Retention and legal hold are enforced in the service layer only in Phase 4; database-level retention jobs come later.

## Review triggers

- Internal notes appear for a principal without inbox manager access.
- A restricted value appears in a log, audit entry, event, socket frame, or export.
- Realtime fan-out p95 exceeds one second at 500 concurrent users.
- The DLP false-positive rate disrupts normal operations.
