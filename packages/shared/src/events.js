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
  data: z.record(z.string(), z.unknown())
})

export const MessageSentDataSchema = z.object({
  messageId: z.string(),
  threadId: z.string(),
  inboxId: z.string().nullable().optional(),
  subject: z.string().nullable().optional()
})

export const UserCreatedDataSchema = z.object({
  userId: z.string(),
  email: z.string().email(),
  branchId: z.string().nullable().optional()
})

export const DomainEventSchemas = {
  MessageSent: MessageSentDataSchema,
  UserCreated: UserCreatedDataSchema
}

export function parseEventEnvelope(input) {
  return EventEnvelopeSchema.parse(input)
}
