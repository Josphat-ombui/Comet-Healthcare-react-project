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
}

export function parseEventEnvelope(input) {
  return EventEnvelopeSchema.parse(input)
}
