-- Phase 4 messaging: channel-linked threads and deterministic recipient rows.
-- Tenant/branch RLS from 20261122000100 already covers every table with companyId.

ALTER TABLE "Thread" ADD COLUMN "channelId" TEXT;

ALTER TABLE "Thread" ADD CONSTRAINT "Thread_channelId_fkey"
  FOREIGN KEY ("channelId") REFERENCES "Channel"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Thread_companyId_channelId_lastMessageAt_idx"
  ON "Thread"("companyId", "channelId", "lastMessageAt");

-- A recipient is stored once per message per concrete target. NULL columns are
-- excluded so role/department/branch aliases remain allowed without colliding.
CREATE UNIQUE INDEX "MessageRecipient_messageId_userId_key"
  ON "MessageRecipient"("messageId", "userId") WHERE "userId" IS NOT NULL;

CREATE UNIQUE INDEX "MessageRecipient_messageId_inboxId_key"
  ON "MessageRecipient"("messageId", "inboxId") WHERE "inboxId" IS NOT NULL;

CREATE INDEX "MessageRecipient_messageId_idx" ON "MessageRecipient"("messageId");

CREATE INDEX "OutboxEvent_status_availableAt_id_idx"
  ON "OutboxEvent"("status", "availableAt", "id");
