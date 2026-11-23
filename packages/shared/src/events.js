import { z } from 'zod'

export const EventEnvelopeSchema = z.object({
  id: z.string(),
  type: z.string(),
  version: z.number().int().positive(),
  occurredAt: z.iso.datetime(),
  correlationId: z.string(),
  causationId: z.string().nullable().optional(),
  companyId: z.string(),
  branchId: z.string().nullable().optional(),
  actorId: z.string().nullable().optional(),
  data: z.record(z.string(), z.unknown()),
})

// Event payloads carry opaque IDs and classification only. Message bodies and
// subjects never enter the event bus — subscribers fetch content through the
// authenticated API so visibility and DLP rules are always rechecked.
const VisibilitySchema = z.enum(['RECIPIENT', 'INTERNAL'])
const ClassificationSchema = z.enum(['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED'])

export const MessageSentDataSchema = z.object({
  messageId: z.string(),
  threadId: z.string(),
  inboxId: z.string().nullable().optional(),
  channelId: z.string().nullable().optional(),
  visibility: VisibilitySchema,
  classification: ClassificationSchema,
  recipientUserIds: z.array(z.string()),
  recipientInboxIds: z.array(z.string()),
})

export const ThreadAssignedDataSchema = z.object({
  threadId: z.string(),
  inboxId: z.string().nullable().optional(),
  assignedToId: z.string().nullable(),
  assignedById: z.string(),
})

export const ThreadResolvedDataSchema = z.object({
  threadId: z.string(),
  inboxId: z.string().nullable().optional(),
  status: z.enum(['OPEN', 'PENDING', 'RESOLVED', 'CLOSED']),
  resolvedById: z.string(),
})

export const MessageRecalledDataSchema = z.object({
  messageId: z.string(),
  threadId: z.string(),
  recalledById: z.string(),
  recipientUserIds: z.array(z.string()),
  recipientInboxIds: z.array(z.string()),
})

export const ReactionAddedDataSchema = z.object({
  messageId: z.string(),
  threadId: z.string(),
  userId: z.string(),
  emoji: z.string().max(16),
})

export const UserCreatedDataSchema = z.object({
  userId: z.string(),
  email: z.string().email(),
  branchId: z.string().nullable().optional(),
})

// Phase 3 identity and organisation events. Values are opaque IDs only; no
// restricted personal data belongs in an event payload.
export const UserDisabledDataSchema = z.object({
  userId: z.string(),
  reason: z.string().max(200).nullable().optional(),
})

export const RoleAssignedDataSchema = z.object({
  userId: z.string(),
  roleId: z.string(),
  roleCode: z.string(),
})

export const SessionRevokedDataSchema = z.object({
  userId: z.string(),
  sessionId: z.string(),
  reason: z.string().max(200).nullable().optional(),
})

export const BranchCreatedDataSchema = z.object({
  branchId: z.string(),
  code: z.string(),
  name: z.string(),
})

export const DepartmentCreatedDataSchema = z.object({
  departmentId: z.string(),
  code: z.string(),
  name: z.string(),
})

// Phase 5 shared-service events. As with messaging, payloads carry opaque IDs
// and classification only — never titles, bodies, checksums or object keys in
// a form that could leak restricted content through the event bus.
const EntityRefSchema = z.object({
  entityType: z.string().max(40),
  entityId: z.string().max(80).nullable().optional(),
})

// Strict schemas are intentional: an unexpected `title`, `body`, `objectKey`
// or checksum is a contract violation rather than a value to silently strip.
export const FileUploadedDataSchema = EntityRefSchema.extend({
  fileId: z.string(),
  uploadedById: z.string(),
  classification: ClassificationSchema,
  size: z.number().int().nonnegative(),
}).strict()

export const FileScannedDataSchema = EntityRefSchema.extend({
  fileId: z.string(),
  status: z.enum(['PENDING', 'CLEAN', 'INFECTED', 'QUARANTINED']),
  classification: ClassificationSchema,
  uploadedById: z.string(),
}).strict()

export const NotificationCreatedDataSchema = EntityRefSchema.extend({
  notificationId: z.string(),
  userId: z.string(),
  category: z.enum(['MESSAGE', 'WORKFLOW', 'DOCUMENT', 'FILE', 'SYSTEM']),
  classification: ClassificationSchema,
}).strict()

export const NotificationReadDataSchema = z.object({
  notificationId: z.string(),
  userId: z.string(),
}).strict()

export const WorkflowInstanceStartedDataSchema = EntityRefSchema.extend({
  instanceId: z.string(),
  definitionId: z.string(),
  requestedById: z.string(),
  classification: ClassificationSchema,
}).strict()

export const WorkflowTaskAssignedDataSchema = EntityRefSchema.extend({
  taskId: z.string(),
  instanceId: z.string(),
  stepKey: z.string().max(80),
  assigneeId: z.string(),
  classification: ClassificationSchema,
}).strict()

export const WorkflowCompletedDataSchema = EntityRefSchema.extend({
  instanceId: z.string(),
  definitionId: z.string(),
  decision: z.enum(['APPROVED', 'REJECTED']),
  requestedById: z.string(),
  classification: ClassificationSchema,
}).strict()

export const DocumentGeneratedDataSchema = z.object({
  documentId: z.string(),
  kind: z.string().max(40),
  status: z.enum(['DRAFT', 'ISSUED', 'VOID']),
  createdById: z.string().nullable().optional(),
  classification: ClassificationSchema,
}).strict()

export const DocumentIssuedDataSchema = DocumentGeneratedDataSchema

export const SearchIndexUpdatedDataSchema = EntityRefSchema.extend({
  classification: ClassificationSchema,
}).strict()

// Phase 6 finance events. As with the shared-service payloads, these are
// strictly ID/status only: invoice lines, amounts, tax pins and eTIMS payloads
// stay behind the authenticated API and never enter the event bus.
export const FinanceAccountCreatedDataSchema = EntityRefSchema.extend({
  accountId: z.string(),
  code: z.string(),
  type: z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE']),
  classification: ClassificationSchema,
}).strict()

export const JournalPostedDataSchema = EntityRefSchema.extend({
  journalId: z.string(),
  number: z.string(),
  status: z.literal('POSTED'),
  lineCount: z.number().int().nonnegative(),
  classification: ClassificationSchema,
}).strict()

export const InvoiceIssuedDataSchema = EntityRefSchema.extend({
  invoiceId: z.string(),
  number: z.string(),
  direction: z.enum(['SALES', 'PURCHASE']),
  type: z.enum(['INVOICE', 'CREDIT_NOTE']),
  status: z.enum(['ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED']),
  classification: ClassificationSchema,
}).strict()

export const PaymentRecordedDataSchema = EntityRefSchema.extend({
  paymentId: z.string(),
  number: z.string(),
  direction: z.enum(['INCOMING', 'OUTGOING']),
  method: z.enum(['BANK_TRANSFER', 'MPESA', 'CASH', 'CHEQUE', 'CARD_TOKEN', 'OTHER']),
  classification: ClassificationSchema,
}).strict()

export const BudgetApprovedDataSchema = EntityRefSchema.extend({
  budgetId: z.string(),
  code: z.string(),
  classification: ClassificationSchema,
}).strict()

export const StatutoryRateVerifiedDataSchema = EntityRefSchema.extend({
  rateId: z.string(),
  code: z.string(),
  kind: z.literal('VAT'),
  effectiveFrom: z.string(),
  classification: ClassificationSchema,
}).strict()

export const EtimsSubmissionQueuedDataSchema = EntityRefSchema.extend({
  submissionId: z.string(),
  invoiceId: z.string(),
  status: z.enum(['QUEUED', 'PENDING', 'SUBMITTED', 'FAILED']),
  classification: ClassificationSchema,
}).strict()

export const EtimsSubmissionFailedDataSchema = EntityRefSchema.extend({
  submissionId: z.string(),
  invoiceId: z.string(),
  reasonCode: z.string().max(80),
  classification: ClassificationSchema,
}).strict()

// Phase 7 sales events are strict and ID/classification-only. Document numbers,
// amounts, statuses, customer names and free text must be fetched through the
// authenticated API; they never enter the event bus or a socket frame.
const SalesEntityRefSchema = z.object({
  entityType: z.enum(['SALES_QUOTE', 'SALES_ORDER', 'DELIVERY_NOTE', 'SALES_RETURN', 'FINANCE_INVOICE']),
  entityId: z.string(),
})

export const SalesQuoteCreatedDataSchema = SalesEntityRefSchema.extend({
  quoteId: z.string(),
  classification: ClassificationSchema,
}).strict()

export const SalesOrderConfirmedDataSchema = SalesEntityRefSchema.extend({
  orderId: z.string(),
  quoteId: z.string().optional(),
  classification: ClassificationSchema,
}).strict()

export const DeliveryNoteIssuedDataSchema = SalesEntityRefSchema.extend({
  deliveryNoteId: z.string(),
  orderId: z.string().optional(),
  classification: ClassificationSchema,
}).strict()

export const SalesReturnApprovedDataSchema = SalesEntityRefSchema.extend({
  returnId: z.string(),
  deliveryNoteId: z.string().optional(),
  orderId: z.string().optional(),
  classification: ClassificationSchema,
}).strict()

export const SalesInvoiceCreatedDataSchema = SalesEntityRefSchema.extend({
  invoiceId: z.string(),
  orderId: z.string(),
  classification: ClassificationSchema,
}).strict()

// Phase 8 inventory events are strict ID/classification-only invalidation
// signals. Quantities, unit costs, movement totals, document numbers, batch
// references in free-text form and notes never enter the event bus.
const InventoryEntityRefSchema = z.object({
  entityType: z.enum([
    'INVENTORY_ITEM', 'INVENTORY_BATCH', 'STOCK_MOVEMENT',
    'STOCK_TRANSFER', 'STOCK_COUNT',
  ]),
  entityId: z.string(),
})

export const InventoryItemCreatedDataSchema = InventoryEntityRefSchema.extend({
  itemId: z.string(),
  classification: ClassificationSchema,
}).strict()

export const StockReceivedDataSchema = InventoryEntityRefSchema.extend({
  movementId: z.string(),
  itemId: z.string(),
  warehouseId: z.string(),
  batchId: z.string().nullable().optional(),
  classification: ClassificationSchema,
}).strict()

export const StockIssuedDataSchema = StockReceivedDataSchema

export const StockAdjustedDataSchema = StockReceivedDataSchema

export const StockTransferApprovedDataSchema = InventoryEntityRefSchema.extend({
  transferId: z.string(),
  sourceWarehouseId: z.string(),
  destinationWarehouseId: z.string(),
  classification: ClassificationSchema,
}).strict()

export const StockCountApprovedDataSchema = InventoryEntityRefSchema.extend({
  countId: z.string(),
  warehouseId: z.string(),
  classification: ClassificationSchema,
}).strict()

export const ReorderLevelBreachedDataSchema = InventoryEntityRefSchema.extend({
  itemId: z.string(),
  warehouseId: z.string(),
  batchId: z.string().nullable().optional(),
  classification: ClassificationSchema,
}).strict()

// Phase 9 procurement events are strict ID/classification-only invalidation
// signals. Document numbers, quantities, amounts, variances, statuses, supplier
// names and notes stay in the authenticated /api/procurement responses.
const ProcurementEntityRefSchema = z.object({
  entityType: z.enum([
    'PURCHASE_REQUISITION', 'PURCHASE_ORDER', 'GOODS_RECEIPT',
    'SUPPLIER_RETURN', 'THREE_WAY_MATCH',
  ]),
  entityId: z.string(),
})

export const PurchaseRequisitionApprovedDataSchema = ProcurementEntityRefSchema.extend({
  requisitionId: z.string(),
  classification: ClassificationSchema,
}).strict()

export const PurchaseOrderApprovedDataSchema = ProcurementEntityRefSchema.extend({
  orderId: z.string(),
  requisitionId: z.string().optional(),
  classification: ClassificationSchema,
}).strict()

export const GoodsReceiptReceivedDataSchema = ProcurementEntityRefSchema.extend({
  receiptId: z.string(),
  orderId: z.string(),
  classification: ClassificationSchema,
}).strict()

export const SupplierReturnApprovedDataSchema = ProcurementEntityRefSchema.extend({
  returnId: z.string(),
  receiptId: z.string().optional(),
  orderId: z.string().optional(),
  classification: ClassificationSchema,
}).strict()

export const ThreeWayMatchFlaggedDataSchema = ProcurementEntityRefSchema.extend({
  matchId: z.string(),
  orderId: z.string(),
  receiptId: z.string().optional(),
  classification: ClassificationSchema,
}).strict()

// Phase 10 service events are strict ID/classification-only invalidation
// signals. Contract/ticket numbers, subjects, SLA hours or breach states,
// technician names, visit notes, part quantities, prices, finance invoice
// references and any free text stay behind the authenticated /api/service API.
const ServiceEntityRefSchema = z.object({
  entityType: z.enum([
    'SERVICE_CONTRACT', 'SERVICE_TICKET', 'WORK_ORDER', 'SERVICE_VISIT',
  ]),
  entityId: z.string(),
})

export const ServiceContractActivatedDataSchema = ServiceEntityRefSchema.extend({
  contractId: z.string(),
  customerId: z.string(),
  classification: ClassificationSchema,
}).strict()

export const ServiceTicketOpenedDataSchema = ServiceEntityRefSchema.extend({
  ticketId: z.string(),
  contractId: z.string().optional(),
  customerId: z.string(),
  classification: ClassificationSchema,
}).strict()

export const ServiceTicketAssignedDataSchema = ServiceEntityRefSchema.extend({
  ticketId: z.string(),
  assigneeId: z.string(),
  classification: ClassificationSchema,
}).strict()

export const ServiceTicketResolvedDataSchema = ServiceEntityRefSchema.extend({
  ticketId: z.string(),
  workOrderId: z.string().optional(),
  classification: ClassificationSchema,
}).strict()

export const WorkOrderCompletedDataSchema = ServiceEntityRefSchema.extend({
  workOrderId: z.string(),
  ticketId: z.string(),
  classification: ClassificationSchema,
}).strict()

export const ServiceVisitCompletedDataSchema = ServiceEntityRefSchema.extend({
  visitId: z.string(),
  workOrderId: z.string(),
  classification: ClassificationSchema,
}).strict()

// Phase 11 HR events are strict ID/classification-only invalidation signals.
// Employee names, bank or tax-PIN references, pay amounts, rate percentages,
// source references, verification notes and leave reasons never enter events.
const HrEntityRefSchema = z.object({
  entityType: z.enum(['EMPLOYEE', 'LEAVE_REQUEST', 'PAYROLL_RATE', 'PAYROLL_RUN']),
  entityId: z.string(),
})

export const EmployeeCreatedDataSchema = HrEntityRefSchema.extend({
  employeeId: z.string(),
  classification: ClassificationSchema,
}).strict()

export const LeaveApprovedDataSchema = HrEntityRefSchema.extend({
  leaveRequestId: z.string(),
  employeeId: z.string(),
  classification: ClassificationSchema,
}).strict()

export const PayrollRateVerifiedDataSchema = HrEntityRefSchema.extend({
  payrollRateId: z.string(),
  classification: ClassificationSchema,
}).strict()

export const PayrollRunCalculatedDataSchema = HrEntityRefSchema.extend({
  payrollRunId: z.string(),
  classification: ClassificationSchema,
}).strict()

export const PayrollRunApprovedDataSchema = HrEntityRefSchema.extend({
  payrollRunId: z.string(),
  classification: ClassificationSchema,
}).strict()

export const DomainEventSchemas = {
  MessageSent: MessageSentDataSchema,
  ThreadAssigned: ThreadAssignedDataSchema,
  ThreadResolved: ThreadResolvedDataSchema,
  MessageRecalled: MessageRecalledDataSchema,
  ReactionAdded: ReactionAddedDataSchema,
  UserCreated: UserCreatedDataSchema,
  UserDisabled: UserDisabledDataSchema,
  RoleAssigned: RoleAssignedDataSchema,
  SessionRevoked: SessionRevokedDataSchema,
  BranchCreated: BranchCreatedDataSchema,
  DepartmentCreated: DepartmentCreatedDataSchema,
  FileUploaded: FileUploadedDataSchema,
  FileScanned: FileScannedDataSchema,
  NotificationCreated: NotificationCreatedDataSchema,
  NotificationRead: NotificationReadDataSchema,
  WorkflowInstanceStarted: WorkflowInstanceStartedDataSchema,
  WorkflowTaskAssigned: WorkflowTaskAssignedDataSchema,
  WorkflowCompleted: WorkflowCompletedDataSchema,
  DocumentGenerated: DocumentGeneratedDataSchema,
  DocumentIssued: DocumentIssuedDataSchema,
  SearchIndexUpdated: SearchIndexUpdatedDataSchema,
  FinanceAccountCreated: FinanceAccountCreatedDataSchema,
  JournalPosted: JournalPostedDataSchema,
  InvoiceIssued: InvoiceIssuedDataSchema,
  PaymentRecorded: PaymentRecordedDataSchema,
  BudgetApproved: BudgetApprovedDataSchema,
  StatutoryRateVerified: StatutoryRateVerifiedDataSchema,
  EtimsSubmissionQueued: EtimsSubmissionQueuedDataSchema,
  EtimsSubmissionFailed: EtimsSubmissionFailedDataSchema,
  SalesQuoteCreated: SalesQuoteCreatedDataSchema,
  SalesOrderConfirmed: SalesOrderConfirmedDataSchema,
  DeliveryNoteIssued: DeliveryNoteIssuedDataSchema,
  SalesReturnApproved: SalesReturnApprovedDataSchema,
  SalesInvoiceCreated: SalesInvoiceCreatedDataSchema,
  InventoryItemCreated: InventoryItemCreatedDataSchema,
  StockReceived: StockReceivedDataSchema,
  StockIssued: StockIssuedDataSchema,
  StockAdjusted: StockAdjustedDataSchema,
  StockTransferApproved: StockTransferApprovedDataSchema,
  StockCountApproved: StockCountApprovedDataSchema,
  ReorderLevelBreached: ReorderLevelBreachedDataSchema,
  PurchaseRequisitionApproved: PurchaseRequisitionApprovedDataSchema,
  PurchaseOrderApproved: PurchaseOrderApprovedDataSchema,
  GoodsReceiptReceived: GoodsReceiptReceivedDataSchema,
  SupplierReturnApproved: SupplierReturnApprovedDataSchema,
  ThreeWayMatchFlagged: ThreeWayMatchFlaggedDataSchema,
  ServiceContractActivated: ServiceContractActivatedDataSchema,
  ServiceTicketOpened: ServiceTicketOpenedDataSchema,
  ServiceTicketAssigned: ServiceTicketAssignedDataSchema,
  ServiceTicketResolved: ServiceTicketResolvedDataSchema,
  WorkOrderCompleted: WorkOrderCompletedDataSchema,
  ServiceVisitCompleted: ServiceVisitCompletedDataSchema,
  EmployeeCreated: EmployeeCreatedDataSchema,
  LeaveApproved: LeaveApprovedDataSchema,
  PayrollRateVerified: PayrollRateVerifiedDataSchema,
  PayrollRunCalculated: PayrollRunCalculatedDataSchema,
  PayrollRunApproved: PayrollRunApprovedDataSchema,
}

export function parseEventEnvelope(input) {
  return EventEnvelopeSchema.parse(input)
}
