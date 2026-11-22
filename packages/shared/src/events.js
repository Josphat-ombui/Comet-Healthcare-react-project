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
}

export function parseEventEnvelope(input) {
  return EventEnvelopeSchema.parse(input)
}
