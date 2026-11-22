# Bounded Contexts

Comet Healthcare Enterprise Platform — Phase 1  
Version 1.0 · 2026-11-22

Bounded contexts are the ownership boundary for data, business rules, permissions, and events. A context may use another context’s **public event contracts** or **API client**, but must never join another context’s tables directly.

---

## Context catalogue

| Context | Owns | Emits | Consumes | Phase |
|---|---|---|---|---|
| **Identity & Access** | Users, credentials, sessions, MFA, groups, roles, policies, API keys, OAuth clients | `UserCreated`, `UserDisabled`, `RoleAssigned`, `SessionRevoked` | `EmployeeCreated`, `BranchCreated` | 3 |
| **Organisation** | Companies, branches, departments, job titles, reporting lines, working hours | `CompanyCreated`, `BranchCreated`, `DepartmentCreated`, `EmployeeAssigned` | `UserCreated` | 3 |
| **Messaging** | Inboxes, threads, messages, assignments, channels, reactions, attachments metadata, retention states | `MessageSent`, `ThreadAssigned`, `ThreadResolved`, `MessageRecalled`, `ReactionAdded` | `FormSubmitted`, `ApprovalRequested`, `StockLow`, `TicketBreached`, `ReportReady` | 4 |
| **Workflow & Approvals** | Workflow definitions, chains, instances, tasks, escalation, delegation | `ApprovalRequested`, `ApprovalApproved`, `ApprovalRejected`, `ApprovalEscalated` | Document events from all business contexts | 5 |
| **Document Services** | Templates, generated PDFs, numbering, version snapshots | `DocumentGenerated` | Business record events | 5 |
| **File Storage** | Object metadata, versions, check-in/out, scan status, signed URLs | `FileUploaded`, `FileScanned`, `FileVersionCreated` | Messaging, HR, Service, Procurement uploads | 5 |
| **Search** | Search index projections, saved searches | `SearchIndexUpdated` | All published domain events | 5 |
| **Notifications** | Preferences, quiet hours, digests, delivery attempts | `NotificationQueued`, `NotificationDelivered` | Almost all events | 5 |
| **Finance** | Chart of accounts, GL, journals, AP/AR, invoices, payments, budgets, statements | `InvoiceIssued`, `PaymentReceived`, `ExpenseApproved`, `JournalPosted` | `OrderConfirmed`, `DeliveryNoteCreated`, `POApproved` | 6 |
| **Sales / CRM** | Leads, contacts, companies, deals, quotations, orders, loyalty, warranty registration | `LeadCreated`, `QuotationIssued`, `OrderConfirmed`, `WarrantyRegistered` | `PaymentReceived`, `MessageReceived` | 7 |
| **Inventory** | SKUs, batches, serials, bins, stock movements, transfers, stocktake, valuation | `StockReceived`, `StockTransferred`, `StockLow`, `StockAdjusted` | `POCreated`, `DeliveryNoteCreated`, `WorkOrderCompleted` | 8 |
| **Procurement** | Suppliers, requisitions, RFQs, POs, three-way match, supplier documents | `RequisitionRaised`, `POApproved`, `POReceived`, `SupplierInvoiceMatched` | `StockLow`, `MRPGenerated` | 9 |
| **Service / Repairs** | Tickets, diagnosis, parts, labour, technician jobs, SLA timers, sign-off | `TicketCreated`, `TicketAssigned`, `SLABreached`, `TicketClosed` | `WebsiteRepairForm`, `WarrantyRegistered` | 10 |
| **Manufacturing** | BOM, variants, work orders, MRP, shop-floor events, QC/CAPA, maintenance, traceability | `WorkOrderCreated`, `MaterialConsumed`, `BatchCompleted`, `QCFailed`, `CAPAOpened` | `StockReceived`, `POReceived`, `SalesOrderConfirmed` | 13 |
| **HR** | Employee records, leave, attendance, payroll inputs, recruitment, training, documents | `EmployeeCreated`, `LeaveApproved`, `PayslipReady`, `CertificateExpiring` | `UserCreated`, `ApprovalApproved` | 11 |
| **Projects & Tasks** | Projects, milestones, tasks, dependencies, time entries, Kanban/Gantt | `ProjectCreated`, `TaskCompleted`, `MilestoneAtRisk` | `MessageSent`, `FileUploaded` | 12 |
| **Content / CMS** | Site content, media registry, pages, careers posts | `ContentPublished`, `CareerPostPublished` | — | Existing → 2 |
| **Reporting & Analytics** | Report definitions, scheduled deliveries, KPI projections, warehouse schema | `ReportReady` | All events via read-model projectors | 14 |
| **Platform Services** | Settings, feature flags, i18n, scheduled jobs, system health | `SettingChanged`, `FeatureFlagChanged` | — | 1/5 |

---

## Context rules

### 1. No shared mutable tables
A context owns its tables. Other contexts read through:
- a published REST endpoint, or
- a read-model projection maintained from events.

### 2. Events are contracts
Events live in `packages/shared/events` with Zod schemas and semantic versioning. Consumers must tolerate unknown fields. Breaking changes require a new event version.

### 3. Tenant and branch context travel with every event
Every event envelope contains:
```json
{
  "id": "evt_...",
  "type": "MessageSent",
  "version": 1,
  "occurredAt": "2026-11-22T10:00:00Z",
  "correlationId": "cor_...",
  "causationId": "evt_...",
  "companyId": "cmp_comet",
  "branchId": "br_machakos",
  "actorId": "usr_...",
  "data": {}
}
```

### 4. Sensitive data minimisation
Events must not carry restricted column values (national ID, KRA PIN, bank account, card data, medical notes). They carry opaque IDs; authorised services fetch details through scoped APIs.

### 5. Internal notes vs external messages
Messaging distinguishes `visibility: internal | recipient`. Internal notes and audit records are never returned in recipient-facing API responses or exports.

---

## Dependency direction

Allowed high-level dependency direction:

```
Identity / Organisation
        ↓
   Shared Services (Workflow, Files, Notifications, Search)
        ↓
 Business Contexts (Finance, Sales, Inventory, Procurement, Service, HR, Projects, Manufacturing)
        ↓
      Reporting
```

Business contexts may emit upward to Shared Services; they must not depend on each other’s internals.
