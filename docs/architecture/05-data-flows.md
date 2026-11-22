# Data Flows

Comet Healthcare Enterprise Platform — Phase 1  
Version 1.0 · 2026-11-22 · Status: Draft for review

All diagrams are Mermaid source in Markdown; no renderer dependency is added.

---

## 1. Standard API request with tenant context

```mermaid
sequenceDiagram
    participant C as ERP/web/cms client
    participant G as Caddy + API gateway
    participant A as Auth + policy
    participant S as Module service
    participant DB as PostgreSQL + PgBouncer
    participant E as Redis Streams/outbox

    C->>G: HTTPS + JWT/API key + X-Correlation-ID
    G->>A: Verify token, session, scopes
    A->>A: Load companyId, branchIds, roles, ABAC attrs
    A->>S: Authorised command/query
    S->>DB: BEGIN; SET LOCAL app.company_id / app.branch_id
    S->>DB: RLS-scoped read/write
    S->>E: Insert outbox event in same transaction
    DB-->>S: Commit
    E-->>Workers: Async publish after commit
    G-->>C: DTO + correlation ID
```

---

## 2. Internal message send → realtime delivery

```mermaid
sequenceDiagram
    participant U as Sender ERP
    participant API as Messaging API
    participant PG as PostgreSQL
    participant Redis as Redis Streams + adapter
    participant RT as Realtime server
    participant R as Recipient ERP
    participant W as Notification worker

    U->>API: POST /api/messaging/threads/:id/messages
    API->>API: Validate internal recipients + DLP + permissions
    API->>PG: Insert message + outbox event (transaction)
    API-->>U: 201 Created
    PG-->>Redis: Outbox publisher emits MessageSent
    Redis-->>RT: Event + room targets
    RT-->>R: socket.io message:new (online user)
    Redis-->>W: Notification job
    W->>PG: Write in-app notification
    W-->>R: Push/SMS/WhatsApp only if opted in
    R->>API: Mark read receipt
    API->>PG: Update receipt + audit event
```

Offline users receive the message on reconnect; the client queues the send locally and replays with an idempotency key. Read receipts are never sent for internal notes.

---

## 3. Website repair/form → department inbox routing

```mermaid
flowchart LR
    Form[Public storefront form] --> API[POST /api/inquiries or repair intake]
    API --> Validate[Zod validation + rate limit]
    Validate --> Event[FormSubmitted event]
    Rule[Routing rules<br/>keyword/form type/branch] --> Event
    Event --> Worker[Routing worker]
    Worker --> Inbox[(Repairs / Sales shared inbox)]
    Worker --> Assign[Auto-assign by branch + skill]
    Assign --> Notify[In-app notification]
```

No external email is used for staff handoff. External confirmation to the customer goes through the separate external mail gateway.

---

## 4. File upload, scan, and signed download

```mermaid
sequenceDiagram
    participant U as User
    participant API as API
    participant R2 as Cloudflare R2
    participant Q as BullMQ scan queue
    participant AV as Virus-scan hook
    participant DB as PostgreSQL metadata

    U->>API: Request upload URL (name, MIME, size, tenant)
    API->>API: Check quota, MIME policy, purpose
    API-->>U: Signed PUT URL + object key
    U->>R2: PUT encrypted object
    U->>API: Confirm upload
    API->>DB: Insert file metadata (status: scanning)
    API->>Q: Enqueue scan + magic-number verify
    Q->>AV: Scan stream
    AV-->>Q: clean / infected
    Q->>DB: Update scan status; quarantine if infected
    U->>API: Request download URL
    API->>DB: Authorise + log access
    API-->>U: Short-lived signed GET URL
```

---

## 5. Domain event → audit, search, notification

```mermaid
flowchart LR
    S[Module service] --> O[(Outbox table)]
    O --> P[Outbox publisher]
    P --> ES[(Redis Streams)]
    ES --> A[Audit projector<br/>hash chain]
    ES --> SE[Search projector]
    ES --> N[Notification projector]
    ES --> R[Reporting read model]
    A --> DB[(PostgreSQL)]
    SE --> DB
    N --> DB
    R --> DW[(Analytics schema / read replica)]
```

Consumers are idempotent by `eventId`. Failed consumers retry with backoff and then move to a dead-letter stream with an alert to the Management/IT inbox.

---

## 6. M-Pesa / payment webhook

```mermaid
sequenceDiagram
    participant P as Payment provider
    participant G as Caddy
    participant API as Webhook receiver
    participant DB as PostgreSQL
    participant Q as Queue

    P->>G: POST /api/webhooks/mpesa
    G->>API: Forward raw body + signature
    API->>API: Verify signature/IP + timestamp
    API->>DB: INSERT callback with unique provider ref (idempotency)
    alt duplicate
      API-->>P: 200 OK (no side effects)
    else new
      API->>Q: Enqueue payment reconciliation
      API-->>P: 200 OK
      Q->>DB: Post payment + emit PaymentReceived
    end
```

Card data never enters this flow; only opaque gateway references are stored.

---

## 7. Scheduled report delivery to internal inbox

```mermaid
flowchart LR
    S[Schedule in reporting DB] --> W[BullMQ reports.schedule]
    W --> R[Run query against read model]
    R --> D[Generate PDF/XLSX via Document Services]
    D --> O[(R2 object + signed URL)]
    O --> M[Messaging API: send to user/department inbox]
    M --> N[In-app notification]
```

Reports are never sent to external email by default. Delivery is logged with report ID, scope, and recipient.

---

## 8. Payroll/statutory calculation data flow (future phase)

```mermaid
flowchart LR
    HR[HR payroll inputs] --> Rate[(Versioned statutory rate table)]
    Verify[Verification status:<br/>UNVERIFIED / VERIFIED_BY / EFFECTIVE_FROM] --> Rate
    Rate --> Calc[Calculation service]
    Calc --> Payslip[Secure payslip PDF]
    Payslip --> Inbox[Employee internal inbox]
    Calc --> GL[Finance journal draft<br/>on approval]
```

> Statutory rates are configuration, not code constants. PAYE, NSSF, SHIF, Housing Levy, and VAT/eTIMS payload rules must be verified against current KRA and government publications and signed off before use.

---

## 9. Backup and data-subject flows

```mermaid
flowchart LR
    PG[PostgreSQL] --> B[Hourly WAL + daily full backup]
    B --> Enc[restic AES-256 encryption]
    Enc --> R2[(Off-site R2 repository)]
    R2 --> Drill[Quarterly restore drill]

    DS[Data subject request] --> API[/api/privacy/requests]
    API --> Audit[Logged request + verification]
    Audit --> Export[Scoped export or deletion job]
    Export --> Review[Compliance approval]
    Review --> DS
```

---

## 10. Data classification applied to flows

| Class | Examples | Flow rule |
|---|---|---|
| Public | Storefront content | No auth required; cached at edge |
| Internal | Messages, stock levels, org chart | Authenticated staff; tenant + branch scoped |
| Confidential | Invoices, salaries, customer details | Role + ABAC required; audit reads |
| Restricted | National ID, KRA PIN, bank accounts, medical notes, card data | Encrypted columns; never in events/logs; explicit permission + audit; card data not stored at all |
