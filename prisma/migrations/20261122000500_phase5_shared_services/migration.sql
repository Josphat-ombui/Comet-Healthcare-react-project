-- CreateEnum
CREATE TYPE "FileStatus" AS ENUM ('PENDING', 'CLEAN', 'INFECTED', 'QUARANTINED');

-- CreateEnum
CREATE TYPE "StorageProvider" AS ENUM ('R2', 'LOCAL');

-- CreateEnum
CREATE TYPE "NotificationCategory" AS ENUM ('MESSAGE', 'WORKFLOW', 'DOCUMENT', 'FILE', 'SYSTEM');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP');

-- CreateEnum
CREATE TYPE "WorkflowStatus" AS ENUM ('RUNNING', 'COMPLETED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WorkflowTaskStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'DELEGATED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "FileObject" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL DEFAULT 'cmp_comet',
    "branchId" TEXT,
    "uploadedById" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "checksum" TEXT,
    "classification" "DataClassification" NOT NULL DEFAULT 'INTERNAL',
    "status" "FileStatus" NOT NULL DEFAULT 'PENDING',
    "storageProvider" "StorageProvider" NOT NULL DEFAULT 'LOCAL',
    "version" INTEGER NOT NULL DEFAULT 1,
    "folder" TEXT,
    "purpose" TEXT NOT NULL DEFAULT 'GENERAL',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FileObject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FileVersion" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL DEFAULT 'cmp_comet',
    "fileId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "objectKey" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "checksum" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL DEFAULT 'cmp_comet',
    "userId" TEXT NOT NULL,
    "category" "NotificationCategory" NOT NULL DEFAULT 'SYSTEM',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "classification" "DataClassification" NOT NULL DEFAULT 'INTERNAL',
    "entityType" TEXT,
    "entityId" TEXT,
    "readAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL DEFAULT 'cmp_comet',
    "userId" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'IN_APP',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "digestMinutes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationDelivery" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL DEFAULT 'cmp_comet',
    "notificationId" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'IN_APP',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowDefinition" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL DEFAULT 'cmp_comet',
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "steps" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "classification" "DataClassification" NOT NULL DEFAULT 'INTERNAL',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowInstance" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL DEFAULT 'cmp_comet',
    "branchId" TEXT,
    "definitionId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "status" "WorkflowStatus" NOT NULL DEFAULT 'RUNNING',
    "currentStep" TEXT,
    "context" JSONB,
    "requestedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "WorkflowInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowTask" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL DEFAULT 'cmp_comet',
    "instanceId" TEXT NOT NULL,
    "stepKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "assigneeId" TEXT,
    "delegatedFromId" TEXT,
    "status" "WorkflowTaskStatus" NOT NULL DEFAULT 'PENDING',
    "decision" TEXT,
    "comment" TEXT,
    "dueAt" TIMESTAMP(3),
    "actedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchDocument" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL DEFAULT 'cmp_comet',
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "classification" "DataClassification" NOT NULL DEFAULT 'INTERNAL',
    "branchId" TEXT,
    "allowedUserIds" JSONB,
    "allowedRoleCodes" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SearchDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobRecord" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL DEFAULT 'cmp_comet',
    "queue" TEXT NOT NULL,
    "jobId" TEXT,
    "type" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "payload" JSONB,
    "result" JSONB,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FileObject_objectKey_key" ON "FileObject"("objectKey");

-- CreateIndex
CREATE INDEX "FileObject_companyId_status_idx" ON "FileObject"("companyId", "status");

-- CreateIndex
CREATE INDEX "FileObject_companyId_uploadedById_idx" ON "FileObject"("companyId", "uploadedById");

-- CreateIndex
CREATE INDEX "FileObject_companyId_purpose_idx" ON "FileObject"("companyId", "purpose");

-- CreateIndex
CREATE UNIQUE INDEX "FileVersion_objectKey_key" ON "FileVersion"("objectKey");

-- CreateIndex
CREATE UNIQUE INDEX "FileVersion_fileId_version_key" ON "FileVersion"("fileId", "version");

-- CreateIndex
CREATE INDEX "Notification_companyId_userId_readAt_idx" ON "Notification"("companyId", "userId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_companyId_category_idx" ON "Notification"("companyId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_companyId_userId_channel_key" ON "NotificationPreference"("companyId", "userId", "channel");

-- CreateIndex
CREATE INDEX "NotificationDelivery_companyId_notificationId_idx" ON "NotificationDelivery"("companyId", "notificationId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowDefinition_companyId_code_version_key" ON "WorkflowDefinition"("companyId", "code", "version");

-- CreateIndex
CREATE INDEX "WorkflowInstance_companyId_status_idx" ON "WorkflowInstance"("companyId", "status");

-- CreateIndex
CREATE INDEX "WorkflowInstance_companyId_entityType_entityId_idx" ON "WorkflowInstance"("companyId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "WorkflowTask_companyId_assigneeId_status_idx" ON "WorkflowTask"("companyId", "assigneeId", "status");

-- CreateIndex
CREATE INDEX "WorkflowTask_companyId_instanceId_idx" ON "WorkflowTask"("companyId", "instanceId");

-- CreateIndex
CREATE INDEX "SearchDocument_companyId_entityType_idx" ON "SearchDocument"("companyId", "entityType");

-- CreateIndex
CREATE UNIQUE INDEX "SearchDocument_companyId_entityType_entityId_key" ON "SearchDocument"("companyId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "JobRecord_companyId_queue_status_idx" ON "JobRecord"("companyId", "queue", "status");

-- AddForeignKey
ALTER TABLE "FileObject" ADD CONSTRAINT "FileObject_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileObject" ADD CONSTRAINT "FileObject_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileObject" ADD CONSTRAINT "FileObject_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileVersion" ADD CONSTRAINT "FileVersion_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileVersion" ADD CONSTRAINT "FileVersion_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "FileObject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileVersion" ADD CONSTRAINT "FileVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowDefinition" ADD CONSTRAINT "WorkflowDefinition_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowDefinition" ADD CONSTRAINT "WorkflowDefinition_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowInstance" ADD CONSTRAINT "WorkflowInstance_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowInstance" ADD CONSTRAINT "WorkflowInstance_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowInstance" ADD CONSTRAINT "WorkflowInstance_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "WorkflowDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowInstance" ADD CONSTRAINT "WorkflowInstance_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowTask" ADD CONSTRAINT "WorkflowTask_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowTask" ADD CONSTRAINT "WorkflowTask_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "WorkflowInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowTask" ADD CONSTRAINT "WorkflowTask_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowTask" ADD CONSTRAINT "WorkflowTask_delegatedFromId_fkey" FOREIGN KEY ("delegatedFromId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchDocument" ADD CONSTRAINT "SearchDocument_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobRecord" ADD CONSTRAINT "JobRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Phase 5 row-level security and full-text search projection
-- ---------------------------------------------------------------------------

-- New business tables inherit the same tenant/branch scope as Phase 2-4
-- tables. The loop is idempotent so re-applying the migration is harmless.
DO $$
DECLARE
  t text;
  has_branch boolean;
  scope_expr text;
BEGIN
  FOR t IN
    SELECT DISTINCT c.table_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.column_name = 'companyId'
      AND c.table_name IN (
        'FileObject', 'FileVersion', 'Notification', 'NotificationPreference',
        'NotificationDelivery', 'WorkflowDefinition', 'WorkflowInstance',
        'WorkflowTask', 'SearchDocument', 'JobRecord'
      )
  LOOP
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = t AND c.column_name = 'branchId'
    ) INTO has_branch;

    scope_expr := '"companyId" = current_setting(''app.company_id'', true)';
    IF has_branch THEN
      scope_expr := scope_expr || ' AND ("branchId" IS NULL OR NULLIF(current_setting(''app.branch_id'', true), '''') IS NULL OR "branchId" = current_setting(''app.branch_id'', true))';
    END IF;

    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_branch_scope ON %I', t);
    EXECUTE format('CREATE POLICY tenant_branch_scope ON %I USING (%s) WITH CHECK (%s)', t, scope_expr, scope_expr);
  END LOOP;
END
$$;

-- Search projections are rebuilt from trusted domain data. `simple` keeps both
-- English and Kiswahili tokens searchable without locale-specific stemming.
CREATE INDEX "SearchDocument_fts_idx"
  ON "SearchDocument" USING GIN (to_tsvector('simple', coalesce("title", '') || ' ' || coalesce("summary", '')));
