# ADR-0010: Shared Services — Files, Notifications, Workflow, Search, and Workers

- **Status:** Accepted (Phase 5)
- **Date:** 2026-11-22
- **Deciders:** Principal architect

## Context

Phase 4 delivered tenant-scoped messaging, DLP and realtime events. Several modules now need the
same capabilities: attachments and generated PDFs need durable storage with short-lived access;
workflow decisions need to reach the requester; staff need to find documents, files and work items
without an external search service; and scanning, delivery, rendering, indexing and retention need
to run outside the request path. Building these independently per module would multiply storage
keys, notification channels, ACL implementations and background runners — and would create new
places where restricted content could leak.

The platform already has RLS, a transactional outbox, an ID-only event contract and a fail-closed
DLP policy. Phase 5 must reuse those controls rather than route around them. It also has to work
offline for local development and demos, where R2 credentials are unavailable.

## Decision

### Object storage: R2 presigned uploads with encrypted local fallback

- Use Cloudflare R2 (ADR-0004) when `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`
  and `R2_BUCKET` are all present. SigV4 signing is implemented locally so no heavyweight AWS SDK
  is needed. Uploads use short-lived `PUT` URLs and downloads use short-lived `GET` URLs
  (`SIGNED_URL_TTL_SECONDS`, default 900).
- When R2 is not configured, fall back to encrypted local objects under `LOCAL_OBJECT_DIR`
  (default `storage/objects`). The API returns `provider=LOCAL`, `method=POST` and a signed
  `/api/files/local-upload/{token}` capability URL; downloads use a signed
  `/api/files/local-download/{token}` URL with a bearer token required. Local objects are
  AES-256-GCM encrypted with `OBJECT_ENCRYPTION_KEY`; the key is never stored in the database.
- Metadata (name, classification, purpose, version, scan status, audit references) lives in
  PostgreSQL `FileObject`/`FileVersion` rows with RLS. Public DTOs omit `objectKey`, `checksum`
  and `companyId`.
- `MAX_UPLOAD_BYTES` (default 25 MB) and an allow-list of MIME types are enforced at the edge;
  magic bytes are checked on receipt. Confirmation records the checksum and enqueues scanning.
- A failing external scan hook (`FILE_SCAN_HOOK_URL`, timeout `FILE_SCAN_TIMEOUT_MS`) quarantines
  the file rather than silently marking it clean. Retention is a scheduled job, not a request-path
  side effect.

### Notifications: in-app only

- `Notification`, `NotificationPreference` and `NotificationDelivery` are tenant-scoped and
  RLS-protected. The only delivery channel is `IN_APP`; SMTP, push and SMS are never used for
  internal notifications. External email remains limited to password resets and genuinely
  external correspondence.
- Notifications are addressed by user ID. Titles, messages and entity content are returned only
  by the authenticated `GET /api/notifications` endpoint, so visibility is rechecked at read time.
  `NotificationCreated` and `NotificationRead` events carry opaque IDs only.
- Users can disable in-app notifications per tenant; a disabled preference suppresses creation
  entirely. Expired notifications are filtered from the inbox, and the retention job expires old
  read notifications.

### Search: PostgreSQL full-text with permission-aware projections

- `SearchDocument` is a tenant-scoped projection table with a GIN full-text index. Only titles,
  summaries, classification, branch and allow lists are indexed — never message bodies, file
  bytes, object keys or secrets.
- `GET /api/search` uses bound parameters and `plainto_tsquery`; the raw query text is never
  audited. Visibility is enforced twice: in SQL (tenant, branch, classification, user/role allow
  lists) and again with a pure projection check in the service layer.
- `ADMIN`/`COMPLIANCE` with no branch scope may see across branches, and may include
  `RESTRICTED` results. Privileged roles still obey a document's explicit allow lists.
- No external search cluster is introduced in Phase 5. Index updates are asynchronous via the
  `search.index` queue, and `SearchIndexUpdated` events carry entity IDs only.

### Workflow and workers

- Workflow definitions hold an ordered step list with role/user assignees. Starting an instance
  resolves the first step's assignees and creates one task each; decisions advance linearly or
  terminate the instance. Delegation marks the original task `DELEGATED` and creates a replacement
  `PENDING` task, preserving the audit trail.
- BullMQ workers handle `files.scan`, `notifications.dispatch`, `documents.generate`,
  `search.index` and `retention.sweep`. Jobs are recorded in tenant-scoped `JobRecord` rows;
  failures are recorded and retried with backoff. Workers use the owner Prisma connection by
  design (cross-tenant systems), but write only ID-based outbox events.
- `QUEUES_ENABLED=false` keeps enqueues inert for offline development; the outbox → Redis Streams
  publisher from Phase 4 continues independently and is controlled by `OUTBOX_POLL_MS` /
  `OUTBOX_MAX_ATTEMPTS`. `BULLMQ_PREFIX` and `RETENTION_SWEEP_CRON` configure the queue namespace
  and sweep schedule.
- `Idempotency-Key` remains scoped to messaging sends in Phase 4. Phase 5 writes are not
  automatically de-duplicated; clients must not blindly retry an upload confirmation, workflow
  decision or generation request.
- DLP stays fail-closed (`DLP_MODE=block`) and unchanged. Shared services do not add an alternate
  path that could bypass messaging DLP, visibility rules, RLS or the audit trail.

### Events and realtime

- Phase 5 adds `FileUploaded`, `FileScanned`, `NotificationCreated`, `NotificationRead`,
  `WorkflowInstanceStarted`, `WorkflowTaskAssigned`, `WorkflowCompleted`, `DocumentGenerated`,
  `DocumentIssued` and `SearchIndexUpdated`, all with strict ID/classification-only payload
  schemas. Extra content fields are rejected rather than silently stripped.
- Socket.IO frames (`notification:new`, `notification:read`, `workflow:started`, `workflow:task`,
  `workflow:completed`, `file:new`, `file:scanned`, `document:generated`, `document:issued`) are
  fan-out from the same stream relay as Phase 4 and target tenant/user rooms derived from the
  event. `SearchIndexUpdated` is internal maintenance and has no socket frame.

## Consequences

### Positive

- One storage abstraction keeps provider-specific signing out of business modules, and local
  development works without cloud credentials.
- One authenticated read path per content type keeps visibility checks central; events, sockets,
  logs and audits never carry restricted text or object locations.
- Permission-aware FTS avoids operating a separate search cluster while reusing tenant, branch and
  classification rules already enforced elsewhere.
- Background work is observable (`JobRecord`), retryable and isolated from request latency.
- Fail-closed scanning and unchanged DLP mean a new service cannot quietly weaken Phase 4 controls.

### Negative

- Local fallback objects depend on the process having a writable, persisted `LOCAL_OBJECT_DIR`
  and on `OBJECT_ENCRYPTION_KEY` remaining stable; losing either makes objects unreadable.
- Every socket notification requires an authenticated refetch, so list/detail endpoints must stay fast.
- PostgreSQL FTS ranking is basic; typo tolerance, language-specific stemming and large-corpus
  performance will need review before they are promised.
- Linear workflows cannot represent parallel approvals, loops or conditional branches yet.
- More queues mean more operational surface: Redis availability, stuck jobs and retention sweeps
  need monitoring.

## Alternatives considered

| Alternative | Why not selected |
|---|---|
| Store files as `bytea` in PostgreSQL | Large rows, backup bloat and no signed URL delivery; R2 is already approved in ADR-0004. |
| Require R2 for all environments | Blocks offline development and demos; local encrypted fallback keeps the demo path working. |
| SMTP or push notifications | External delivery is out of scope for internal notices and would duplicate Phase 4's no-SMTP rule. |
| Elasticsearch/OpenSearch for search | Extra cluster, ingest pipeline and ACL sync for a corpus that PostgreSQL FTS already covers. |
| In-process timers for scans and generation | Work would be lost on restart and would block requests; BullMQ gives retries and visibility. |
| Content-rich event payloads | Multiply the places where visibility, DLP and tenant scope must be enforced. |
| Relaxing `DLP_MODE` default to `flag` | Would allow restricted identifiers into new surfaces; fail-closed is retained. |

## Review triggers

- R2 region/processor terms fail the ODPC review in `docs/architecture/07-compliance-kenya.md`.
- A restricted value appears in an event, socket frame, audit entry, search projection or log.
- Permission-aware search returns a document the caller cannot open through its authenticated API.
- Scan-hook failures exceed an acceptable quarantine rate, or jobs repeatedly stall in one queue.
- Object encryption key rotation or local storage loss makes existing objects unreadable.
