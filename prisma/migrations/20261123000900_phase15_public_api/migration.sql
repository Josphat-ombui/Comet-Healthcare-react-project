-- CreateEnum
CREATE TYPE "PublicClientStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "WebhookStatus" AS ENUM ('ACTIVE', 'DISABLED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "WebhookDeliveryStatus" AS ENUM ('PENDING', 'DELIVERED', 'FAILED', 'RETRYING');

-- CreateTable
CREATE TABLE "PublicClient" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL DEFAULT 'cmp_comet',
    "branchId" TEXT,
    "apiKeyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "PublicClientStatus" NOT NULL DEFAULT 'ACTIVE',
    "scopes" JSONB NOT NULL,
    "createdByUserId" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublicClient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookSubscription" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL DEFAULT 'cmp_comet',
    "branchId" TEXT,
    "clientId" TEXT,
    "url" TEXT NOT NULL,
    "eventTypes" JSONB NOT NULL,
    "secretEncrypted" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "status" "WebhookStatus" NOT NULL DEFAULT 'ACTIVE',
    "rotatedAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookDelivery" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL DEFAULT 'cmp_comet',
    "branchId" TEXT,
    "subscriptionId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "WebhookDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "responseStatus" INTEGER,
    "lastError" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PublicClient_companyId_status_idx" ON "PublicClient"("companyId", "status");

-- CreateIndex
CREATE INDEX "PublicClient_companyId_branchId_idx" ON "PublicClient"("companyId", "branchId");

-- CreateIndex
CREATE UNIQUE INDEX "PublicClient_companyId_apiKeyId_key" ON "PublicClient"("companyId", "apiKeyId");

-- CreateIndex
CREATE INDEX "WebhookSubscription_companyId_status_idx" ON "WebhookSubscription"("companyId", "status");

-- CreateIndex
CREATE INDEX "WebhookSubscription_companyId_clientId_idx" ON "WebhookSubscription"("companyId", "clientId");

-- CreateIndex
CREATE INDEX "WebhookSubscription_companyId_branchId_idx" ON "WebhookSubscription"("companyId", "branchId");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookSubscription_companyId_secretHash_key" ON "WebhookSubscription"("companyId", "secretHash");

-- CreateIndex
CREATE INDEX "WebhookDelivery_companyId_status_nextAttemptAt_idx" ON "WebhookDelivery"("companyId", "status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "WebhookDelivery_companyId_eventType_idx" ON "WebhookDelivery"("companyId", "eventType");

-- CreateIndex
CREATE INDEX "WebhookDelivery_companyId_branchId_idx" ON "WebhookDelivery"("companyId", "branchId");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookDelivery_subscriptionId_eventId_key" ON "WebhookDelivery"("subscriptionId", "eventId");

-- AddForeignKey
ALTER TABLE "PublicClient" ADD CONSTRAINT "PublicClient_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicClient" ADD CONSTRAINT "PublicClient_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicClient" ADD CONSTRAINT "PublicClient_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "ApiKey"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicClient" ADD CONSTRAINT "PublicClient_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookSubscription" ADD CONSTRAINT "WebhookSubscription_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookSubscription" ADD CONSTRAINT "WebhookSubscription_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookSubscription" ADD CONSTRAINT "WebhookSubscription_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "PublicClient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookSubscription" ADD CONSTRAINT "WebhookSubscription_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "WebhookSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Phase 15 tenant/branch row-level security.
--
-- The API runs as the non-owner comet_app role with app.company_id and
-- app.branch_id set per request by the tenant middleware. A NULL branchId is
-- visible to every branch of the owning company. The dynamic DO block keeps
-- the policy idempotent and mirrors Phases 6-14. No role ever reads secrets or
-- signatures from these tables through a DTO; the policies guard the whole row.
DO
$$
DECLARE
  t text;
  scope_expr text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
      'PublicClient', 'WebhookSubscription', 'WebhookDelivery'
    ]
  LOOP
    scope_expr := '"companyId" = current_setting(''app.company_id'', true)'
      || ' AND ("branchId" IS NULL OR NULLIF(current_setting(''app.branch_id'', true), '''') IS NULL OR "branchId" = current_setting(''app.branch_id'', true))';

    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_branch_scope ON %I', t);
    EXECUTE format('CREATE POLICY tenant_branch_scope ON %I USING (%s) WITH CHECK (%s)', t, scope_expr, scope_expr);
  END LOOP;
END
$$;

