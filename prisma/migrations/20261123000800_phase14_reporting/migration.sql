-- CreateEnum
CREATE TYPE "ReportFormat" AS ENUM ('JSON', 'CSV', 'PDF_READY');

-- CreateEnum
CREATE TYPE "ReportRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "DashboardWidgetType" AS ENUM ('METRIC', 'TABLE', 'CHART');

-- CreateTable
CREATE TABLE "ReportDefinition" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL DEFAULT 'cmp_comet',
    "branchId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "reportKey" TEXT NOT NULL,
    "querySpec" JSONB NOT NULL,
    "format" "ReportFormat" NOT NULL DEFAULT 'JSON',
    "classification" "DataClassification" NOT NULL DEFAULT 'INTERNAL',
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ReportDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportRun" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL DEFAULT 'cmp_comet',
    "branchId" TEXT,
    "definitionId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "reportKey" TEXT NOT NULL,
    "format" "ReportFormat" NOT NULL DEFAULT 'JSON',
    "status" "ReportRunStatus" NOT NULL DEFAULT 'QUEUED',
    "parameters" JSONB,
    "resultSummary" JSONB,
    "failureReasonCode" TEXT,
    "jobId" TEXT,
    "fileObjectId" TEXT,
    "requestedByUserId" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "classification" "DataClassification" NOT NULL DEFAULT 'INTERNAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dashboard" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL DEFAULT 'cmp_comet',
    "branchId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "classification" "DataClassification" NOT NULL DEFAULT 'INTERNAL',
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Dashboard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DashboardWidget" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL DEFAULT 'cmp_comet',
    "branchId" TEXT,
    "dashboardId" TEXT NOT NULL,
    "definitionId" TEXT,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "DashboardWidgetType" NOT NULL DEFAULT 'METRIC',
    "reportKey" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "classification" "DataClassification" NOT NULL DEFAULT 'INTERNAL',
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "DashboardWidget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReportDefinition_companyId_branchId_idx" ON "ReportDefinition"("companyId", "branchId");

-- CreateIndex
CREATE INDEX "ReportDefinition_companyId_reportKey_idx" ON "ReportDefinition"("companyId", "reportKey");

-- CreateIndex
CREATE UNIQUE INDEX "ReportDefinition_companyId_code_key" ON "ReportDefinition"("companyId", "code");

-- CreateIndex
CREATE INDEX "ReportRun_companyId_definitionId_idx" ON "ReportRun"("companyId", "definitionId");

-- CreateIndex
CREATE INDEX "ReportRun_companyId_status_idx" ON "ReportRun"("companyId", "status");

-- CreateIndex
CREATE INDEX "ReportRun_companyId_reportKey_idx" ON "ReportRun"("companyId", "reportKey");

-- CreateIndex
CREATE UNIQUE INDEX "ReportRun_companyId_number_key" ON "ReportRun"("companyId", "number");

-- CreateIndex
CREATE INDEX "Dashboard_companyId_branchId_idx" ON "Dashboard"("companyId", "branchId");

-- CreateIndex
CREATE UNIQUE INDEX "Dashboard_companyId_code_key" ON "Dashboard"("companyId", "code");

-- CreateIndex
CREATE INDEX "DashboardWidget_companyId_dashboardId_idx" ON "DashboardWidget"("companyId", "dashboardId");

-- CreateIndex
CREATE INDEX "DashboardWidget_companyId_reportKey_idx" ON "DashboardWidget"("companyId", "reportKey");

-- CreateIndex
CREATE UNIQUE INDEX "DashboardWidget_dashboardId_code_key" ON "DashboardWidget"("dashboardId", "code");

-- AddForeignKey
ALTER TABLE "ReportDefinition" ADD CONSTRAINT "ReportDefinition_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportDefinition" ADD CONSTRAINT "ReportDefinition_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportRun" ADD CONSTRAINT "ReportRun_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportRun" ADD CONSTRAINT "ReportRun_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportRun" ADD CONSTRAINT "ReportRun_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "ReportDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dashboard" ADD CONSTRAINT "Dashboard_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dashboard" ADD CONSTRAINT "Dashboard_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DashboardWidget" ADD CONSTRAINT "DashboardWidget_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DashboardWidget" ADD CONSTRAINT "DashboardWidget_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DashboardWidget" ADD CONSTRAINT "DashboardWidget_dashboardId_fkey" FOREIGN KEY ("dashboardId") REFERENCES "Dashboard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DashboardWidget" ADD CONSTRAINT "DashboardWidget_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "ReportDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Phase 14 tenant/branch row-level security.
--
-- The API runs as the non-owner comet_app role with app.company_id and
-- app.branch_id set per request by the tenant middleware. A NULL branchId is
-- visible to every branch of the owning company. The dynamic DO block keeps
-- the policy idempotent and mirrors Phases 6-13.
DO
$$
DECLARE
  t text;
  scope_expr text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
      'ReportDefinition', 'ReportRun', 'Dashboard', 'DashboardWidget'
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


