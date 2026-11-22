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

export const MessageSentDataSchema = z.object({
  messageId: z.string(),
  threadId: z.string(),
  inboxId: z.string().nullable().optional(),
  subject: z.string().nullable().optional(),
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
