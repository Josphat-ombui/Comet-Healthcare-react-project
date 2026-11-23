-- CreateEnum
CREATE TYPE "WorkCenterStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "BomStatus" AS ENUM ('DRAFT', 'APPROVED', 'OBSOLETE');

-- CreateEnum
CREATE TYPE "ProductionOrderStatus" AS ENUM ('DRAFT', 'RELEASED', 'IN_PROGRESS', 'QUALITY_HOLD', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BatchRecordStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'REVIEW', 'RELEASED', 'REJECTED');

-- CreateEnum
CREATE TYPE "QcCheckStatus" AS ENUM ('PENDING', 'REVIEW', 'PASS', 'FAIL');

-- CreateTable
CREATE TABLE "WorkCenter" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL DEFAULT 'cmp_comet',
    "branchId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "WorkCenterStatus" NOT NULL DEFAULT 'ACTIVE',
    "capacityPerDay" DECIMAL(14,3),
    "classification" "DataClassification" NOT NULL DEFAULT 'INTERNAL',
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "WorkCenter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bom" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL DEFAULT 'cmp_comet',
    "branchId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "productItemId" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT '1',
    "status" "BomStatus" NOT NULL DEFAULT 'DRAFT',
    "standardCostCents" INTEGER NOT NULL DEFAULT 0,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "classification" "DataClassification" NOT NULL DEFAULT 'INTERNAL',
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Bom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BomLine" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL DEFAULT 'cmp_comet',
    "branchId" TEXT,
    "bomId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "uom" TEXT NOT NULL DEFAULT 'EA',
    "unitCostCents" INTEGER NOT NULL DEFAULT 0,
    "isCritical" BOOLEAN NOT NULL DEFAULT false,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "classification" "DataClassification" NOT NULL DEFAULT 'INTERNAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BomLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionOrder" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL DEFAULT 'cmp_comet',
    "branchId" TEXT,
    "orderNumber" TEXT NOT NULL,
    "bomId" TEXT NOT NULL,
    "workCenterId" TEXT NOT NULL,
    "productItemId" TEXT NOT NULL,
    "quantityPlanned" DECIMAL(14,3) NOT NULL,
    "quantityProduced" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "uom" TEXT NOT NULL DEFAULT 'EA',
    "status" "ProductionOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "plannedStartDate" TIMESTAMP(3),
    "plannedEndDate" TIMESTAMP(3),
    "releasedByUserId" TEXT,
    "releasedAt" TIMESTAMP(3),
    "startedByUserId" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedByUserId" TEXT,
    "completedAt" TIMESTAMP(3),
    "classification" "DataClassification" NOT NULL DEFAULT 'INTERNAL',
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ProductionOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionOrderLine" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL DEFAULT 'cmp_comet',
    "branchId" TEXT,
    "orderId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantityRequired" DECIMAL(14,3) NOT NULL,
    "quantityIssued" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "uom" TEXT NOT NULL DEFAULT 'EA',
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "classification" "DataClassification" NOT NULL DEFAULT 'INTERNAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BatchRecord" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL DEFAULT 'cmp_comet',
    "branchId" TEXT,
    "batchNumber" TEXT NOT NULL,
    "productionOrderId" TEXT NOT NULL,
    "bomId" TEXT NOT NULL,
    "productItemId" TEXT NOT NULL,
    "workCenterId" TEXT,
    "inventoryBatchId" TEXT,
    "quantityProduced" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "uom" TEXT NOT NULL DEFAULT 'EA',
    "status" "BatchRecordStatus" NOT NULL DEFAULT 'OPEN',
    "manufacturingDate" DATE,
    "expiryDate" DATE,
    "deviationNotesEncrypted" TEXT,
    "deviationNotesKeyId" TEXT,
    "openedByUserId" TEXT NOT NULL,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "releasedByUserId" TEXT,
    "releasedAt" TIMESTAMP(3),
    "rejectedReason" TEXT,
    "classification" "DataClassification" NOT NULL DEFAULT 'RESTRICTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BatchRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QcCheck" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL DEFAULT 'cmp_comet',
    "branchId" TEXT,
    "batchId" TEXT NOT NULL,
    "checkCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isMandatory" BOOLEAN NOT NULL DEFAULT true,
    "status" "QcCheckStatus" NOT NULL DEFAULT 'PENDING',
    "observedValue" TEXT,
    "resultNotesEncrypted" TEXT,
    "resultNotesKeyId" TEXT,
    "signedByUserId" TEXT,
    "signedAt" TIMESTAMP(3),
    "classification" "DataClassification" NOT NULL DEFAULT 'CONFIDENTIAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QcCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkCenter_companyId_branchId_idx" ON "WorkCenter"("companyId", "branchId");

-- CreateIndex
CREATE INDEX "WorkCenter_companyId_status_idx" ON "WorkCenter"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WorkCenter_companyId_code_key" ON "WorkCenter"("companyId", "code");

-- CreateIndex
CREATE INDEX "Bom_companyId_branchId_idx" ON "Bom"("companyId", "branchId");

-- CreateIndex
CREATE INDEX "Bom_companyId_status_idx" ON "Bom"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Bom_companyId_code_key" ON "Bom"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Bom_companyId_productItemId_version_key" ON "Bom"("companyId", "productItemId", "version");

-- CreateIndex
CREATE INDEX "BomLine_companyId_bomId_idx" ON "BomLine"("companyId", "bomId");

-- CreateIndex
CREATE UNIQUE INDEX "BomLine_bomId_itemId_key" ON "BomLine"("bomId", "itemId");

-- CreateIndex
CREATE INDEX "ProductionOrder_companyId_branchId_idx" ON "ProductionOrder"("companyId", "branchId");

-- CreateIndex
CREATE INDEX "ProductionOrder_companyId_status_idx" ON "ProductionOrder"("companyId", "status");

-- CreateIndex
CREATE INDEX "ProductionOrder_companyId_workCenterId_idx" ON "ProductionOrder"("companyId", "workCenterId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionOrder_companyId_orderNumber_key" ON "ProductionOrder"("companyId", "orderNumber");

-- CreateIndex
CREATE INDEX "ProductionOrderLine_companyId_orderId_idx" ON "ProductionOrderLine"("companyId", "orderId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionOrderLine_orderId_itemId_key" ON "ProductionOrderLine"("orderId", "itemId");

-- CreateIndex
CREATE INDEX "BatchRecord_companyId_productionOrderId_idx" ON "BatchRecord"("companyId", "productionOrderId");

-- CreateIndex
CREATE INDEX "BatchRecord_companyId_status_idx" ON "BatchRecord"("companyId", "status");

-- CreateIndex
CREATE INDEX "BatchRecord_companyId_expiryDate_idx" ON "BatchRecord"("companyId", "expiryDate");

-- CreateIndex
CREATE UNIQUE INDEX "BatchRecord_companyId_batchNumber_key" ON "BatchRecord"("companyId", "batchNumber");

-- CreateIndex
CREATE INDEX "QcCheck_companyId_batchId_idx" ON "QcCheck"("companyId", "batchId");

-- CreateIndex
CREATE INDEX "QcCheck_companyId_status_idx" ON "QcCheck"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "QcCheck_batchId_checkCode_key" ON "QcCheck"("batchId", "checkCode");

-- AddForeignKey
ALTER TABLE "WorkCenter" ADD CONSTRAINT "WorkCenter_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkCenter" ADD CONSTRAINT "WorkCenter_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bom" ADD CONSTRAINT "Bom_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bom" ADD CONSTRAINT "Bom_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BomLine" ADD CONSTRAINT "BomLine_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BomLine" ADD CONSTRAINT "BomLine_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BomLine" ADD CONSTRAINT "BomLine_bomId_fkey" FOREIGN KEY ("bomId") REFERENCES "Bom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_bomId_fkey" FOREIGN KEY ("bomId") REFERENCES "Bom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_workCenterId_fkey" FOREIGN KEY ("workCenterId") REFERENCES "WorkCenter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionOrderLine" ADD CONSTRAINT "ProductionOrderLine_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionOrderLine" ADD CONSTRAINT "ProductionOrderLine_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionOrderLine" ADD CONSTRAINT "ProductionOrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ProductionOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchRecord" ADD CONSTRAINT "BatchRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchRecord" ADD CONSTRAINT "BatchRecord_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatchRecord" ADD CONSTRAINT "BatchRecord_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "ProductionOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QcCheck" ADD CONSTRAINT "QcCheck_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QcCheck" ADD CONSTRAINT "QcCheck_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QcCheck" ADD CONSTRAINT "QcCheck_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "BatchRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Phase 13 tenant/branch row-level security.
--
-- The app runs as the non-owner comet_app role. The tenant middleware sets
-- app.company_id and app.branch_id on every request. A NULL branchId row is
-- visible to every branch of the owning company. The policy is created in a
-- dynamic DO block so the migration stays idempotent and mirrors Phases 6-12.
DO
$$
DECLARE
  t text;
  scope_expr text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
      'WorkCenter', 'Bom', 'BomLine', 'ProductionOrder',
      'ProductionOrderLine', 'BatchRecord', 'QcCheck'
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