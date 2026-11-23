-- CreateEnum
CREATE TYPE "ServiceContractStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SUSPENDED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ServiceTicketStatus" AS ENUM ('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING', 'RESOLVED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ServiceTicketPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "WorkOrderStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ServiceVisitStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "ServiceContract" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL DEFAULT 'cmp_comet',
    "branchId" TEXT,
    "number" TEXT NOT NULL,
    "status" "ServiceContractStatus" NOT NULL DEFAULT 'DRAFT',
    "customerId" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "monthlyFeeCents" INTEGER NOT NULL DEFAULT 0,
    "responseSlaHours" INTEGER NOT NULL,
    "resolutionSlaHours" INTEGER NOT NULL,
    "notes" TEXT,
    "classification" "DataClassification" NOT NULL DEFAULT 'INTERNAL',
    "activatedAt" TIMESTAMP(3),
    "suspendedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceContractLine" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL DEFAULT 'cmp_comet',
    "branchId" TEXT,
    "contractId" TEXT NOT NULL,
    "itemId" TEXT,
    "description" TEXT NOT NULL,
    "coverageQty" INTEGER NOT NULL DEFAULT 1,
    "unitPriceCents" INTEGER NOT NULL DEFAULT 0,
    "position" INTEGER NOT NULL DEFAULT 0,
    "classification" "DataClassification" NOT NULL DEFAULT 'INTERNAL',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceContractLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceTicket" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL DEFAULT 'cmp_comet',
    "branchId" TEXT,
    "number" TEXT NOT NULL,
    "status" "ServiceTicketStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "ServiceTicketPriority" NOT NULL DEFAULT 'MEDIUM',
    "contractId" TEXT,
    "customerId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL,
    "responseDueAt" TIMESTAMP(3) NOT NULL,
    "resolutionDueAt" TIMESTAMP(3) NOT NULL,
    "assignedToId" TEXT,
    "assignedAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "resolutionNotes" TEXT,
    "closedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "classification" "DataClassification" NOT NULL DEFAULT 'INTERNAL',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkOrder" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL DEFAULT 'cmp_comet',
    "branchId" TEXT,
    "number" TEXT NOT NULL,
    "status" "WorkOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "ticketId" TEXT NOT NULL,
    "technicianId" TEXT,
    "summary" TEXT NOT NULL,
    "labourCents" INTEGER NOT NULL DEFAULT 0,
    "partsCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "scheduledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "notes" TEXT,
    "classification" "DataClassification" NOT NULL DEFAULT 'INTERNAL',
    "financeInvoiceId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkOrderLine" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL DEFAULT 'cmp_comet',
    "branchId" TEXT,
    "workOrderId" TEXT NOT NULL,
    "itemId" TEXT,
    "description" TEXT NOT NULL,
    "qty" DOUBLE PRECISION NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "classification" "DataClassification" NOT NULL DEFAULT 'INTERNAL',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceVisit" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL DEFAULT 'cmp_comet',
    "branchId" TEXT,
    "number" TEXT NOT NULL,
    "status" "ServiceVisitStatus" NOT NULL DEFAULT 'PLANNED',
    "workOrderId" TEXT NOT NULL,
    "ticketId" TEXT,
    "technicianId" TEXT,
    "plannedAt" TIMESTAMP(3) NOT NULL,
    "checkInAt" TIMESTAMP(3),
    "checkOutAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "notes" TEXT,
    "classification" "DataClassification" NOT NULL DEFAULT 'INTERNAL',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServicePartUsage" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL DEFAULT 'cmp_comet',
    "branchId" TEXT,
    "workOrderId" TEXT NOT NULL,
    "ticketId" TEXT,
    "itemId" TEXT NOT NULL,
    "warehouseId" TEXT,
    "batchId" TEXT,
    "qty" DOUBLE PRECISION NOT NULL,
    "unitCostCents" INTEGER NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "inventoryIssued" BOOLEAN NOT NULL DEFAULT false,
    "manualIssueRequired" BOOLEAN NOT NULL DEFAULT true,
    "issuedMovementId" TEXT,
    "notes" TEXT,
    "classification" "DataClassification" NOT NULL DEFAULT 'INTERNAL',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServicePartUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServiceContract_companyId_status_startDate_idx" ON "ServiceContract"("companyId", "status", "startDate");

-- CreateIndex
CREATE INDEX "ServiceContract_companyId_customerId_idx" ON "ServiceContract"("companyId", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceContract_companyId_number_key" ON "ServiceContract"("companyId", "number");

-- CreateIndex
CREATE INDEX "ServiceContractLine_contractId_idx" ON "ServiceContractLine"("contractId");

-- CreateIndex
CREATE INDEX "ServiceContractLine_companyId_itemId_idx" ON "ServiceContractLine"("companyId", "itemId");

-- CreateIndex
CREATE INDEX "ServiceTicket_companyId_status_priority_idx" ON "ServiceTicket"("companyId", "status", "priority");

-- CreateIndex
CREATE INDEX "ServiceTicket_companyId_contractId_idx" ON "ServiceTicket"("companyId", "contractId");

-- CreateIndex
CREATE INDEX "ServiceTicket_companyId_assignedToId_idx" ON "ServiceTicket"("companyId", "assignedToId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceTicket_companyId_number_key" ON "ServiceTicket"("companyId", "number");

-- CreateIndex
CREATE INDEX "WorkOrder_companyId_status_scheduledAt_idx" ON "WorkOrder"("companyId", "status", "scheduledAt");

-- CreateIndex
CREATE INDEX "WorkOrder_companyId_ticketId_idx" ON "WorkOrder"("companyId", "ticketId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrder_companyId_number_key" ON "WorkOrder"("companyId", "number");

-- CreateIndex
CREATE INDEX "WorkOrderLine_workOrderId_idx" ON "WorkOrderLine"("workOrderId");

-- CreateIndex
CREATE INDEX "WorkOrderLine_companyId_itemId_idx" ON "WorkOrderLine"("companyId", "itemId");

-- CreateIndex
CREATE INDEX "ServiceVisit_companyId_status_plannedAt_idx" ON "ServiceVisit"("companyId", "status", "plannedAt");

-- CreateIndex
CREATE INDEX "ServiceVisit_companyId_workOrderId_idx" ON "ServiceVisit"("companyId", "workOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceVisit_companyId_number_key" ON "ServiceVisit"("companyId", "number");

-- CreateIndex
CREATE INDEX "ServicePartUsage_workOrderId_idx" ON "ServicePartUsage"("workOrderId");

-- CreateIndex
CREATE INDEX "ServicePartUsage_companyId_itemId_idx" ON "ServicePartUsage"("companyId", "itemId");

-- CreateIndex
CREATE INDEX "ServicePartUsage_companyId_inventoryIssued_idx" ON "ServicePartUsage"("companyId", "inventoryIssued");

-- AddForeignKey
ALTER TABLE "ServiceContract" ADD CONSTRAINT "ServiceContract_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceContract" ADD CONSTRAINT "ServiceContract_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceContract" ADD CONSTRAINT "ServiceContract_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "FinanceParty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceContract" ADD CONSTRAINT "ServiceContract_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceContractLine" ADD CONSTRAINT "ServiceContractLine_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceContractLine" ADD CONSTRAINT "ServiceContractLine_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceContractLine" ADD CONSTRAINT "ServiceContractLine_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "ServiceContract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceContractLine" ADD CONSTRAINT "ServiceContractLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceContractLine" ADD CONSTRAINT "ServiceContractLine_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceTicket" ADD CONSTRAINT "ServiceTicket_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceTicket" ADD CONSTRAINT "ServiceTicket_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceTicket" ADD CONSTRAINT "ServiceTicket_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "ServiceContract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceTicket" ADD CONSTRAINT "ServiceTicket_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "FinanceParty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceTicket" ADD CONSTRAINT "ServiceTicket_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceTicket" ADD CONSTRAINT "ServiceTicket_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "ServiceTicket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_financeInvoiceId_fkey" FOREIGN KEY ("financeInvoiceId") REFERENCES "FinanceInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderLine" ADD CONSTRAINT "WorkOrderLine_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderLine" ADD CONSTRAINT "WorkOrderLine_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderLine" ADD CONSTRAINT "WorkOrderLine_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderLine" ADD CONSTRAINT "WorkOrderLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderLine" ADD CONSTRAINT "WorkOrderLine_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceVisit" ADD CONSTRAINT "ServiceVisit_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceVisit" ADD CONSTRAINT "ServiceVisit_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceVisit" ADD CONSTRAINT "ServiceVisit_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceVisit" ADD CONSTRAINT "ServiceVisit_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "ServiceTicket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceVisit" ADD CONSTRAINT "ServiceVisit_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceVisit" ADD CONSTRAINT "ServiceVisit_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServicePartUsage" ADD CONSTRAINT "ServicePartUsage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServicePartUsage" ADD CONSTRAINT "ServicePartUsage_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServicePartUsage" ADD CONSTRAINT "ServicePartUsage_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServicePartUsage" ADD CONSTRAINT "ServicePartUsage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "ServiceTicket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServicePartUsage" ADD CONSTRAINT "ServicePartUsage_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServicePartUsage" ADD CONSTRAINT "ServicePartUsage_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServicePartUsage" ADD CONSTRAINT "ServicePartUsage_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "InventoryBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServicePartUsage" ADD CONSTRAINT "ServicePartUsage_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Phase 10 tenant/branch row-level security.
--
-- The app runs as the non-owner comet_app role. The tenant middleware sets
-- app.company_id and app.branch_id on every request. A NULL branchId row is
-- visible to every branch of the owning company. The policy is created in a
-- dynamic DO block so the migration stays idempotent and mirrors Phase 6-9.
DO
$$
DECLARE
  t text;
  scope_expr text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
      'ServiceContract', 'ServiceContractLine',
      'ServiceTicket', 'WorkOrder', 'WorkOrderLine',
      'ServiceVisit', 'ServicePartUsage'
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

