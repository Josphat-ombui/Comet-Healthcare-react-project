-- CreateEnum
CREATE TYPE "SalesQuoteStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'CONVERTED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SalesOrderStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'FULFILLED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DeliveryNoteStatus" AS ENUM ('DRAFT', 'ISSUED', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SalesReturnStatus" AS ENUM ('DRAFT', 'APPROVED', 'RECEIVED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "SalesQuote" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL DEFAULT 'cmp_comet',
    "branchId" TEXT,
    "number" TEXT NOT NULL,
    "status" "SalesQuoteStatus" NOT NULL DEFAULT 'DRAFT',
    "partyId" TEXT NOT NULL,
    "quoteDate" TEXT NOT NULL,
    "validUntil" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "taxRateId" TEXT,
    "subtotalCents" INTEGER NOT NULL DEFAULT 0,
    "taxCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "classification" "DataClassification" NOT NULL DEFAULT 'INTERNAL',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesQuoteLine" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL DEFAULT 'cmp_comet',
    "branchId" TEXT,
    "quoteId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "qty" DOUBLE PRECISION NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "netCents" INTEGER NOT NULL DEFAULT 0,
    "taxCents" INTEGER NOT NULL DEFAULT 0,
    "grossCents" INTEGER NOT NULL DEFAULT 0,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesQuoteLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesOrder" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL DEFAULT 'cmp_comet',
    "branchId" TEXT,
    "number" TEXT NOT NULL,
    "status" "SalesOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "partyId" TEXT NOT NULL,
    "quoteId" TEXT,
    "orderDate" TEXT NOT NULL,
    "requestedDate" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "taxRateId" TEXT,
    "subtotalCents" INTEGER NOT NULL DEFAULT 0,
    "taxCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "classification" "DataClassification" NOT NULL DEFAULT 'INTERNAL',
    "financeInvoiceId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesOrderLine" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL DEFAULT 'cmp_comet',
    "branchId" TEXT,
    "orderId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "qty" DOUBLE PRECISION NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "netCents" INTEGER NOT NULL DEFAULT 0,
    "taxCents" INTEGER NOT NULL DEFAULT 0,
    "grossCents" INTEGER NOT NULL DEFAULT 0,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryNote" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL DEFAULT 'cmp_comet',
    "branchId" TEXT,
    "number" TEXT NOT NULL,
    "status" "DeliveryNoteStatus" NOT NULL DEFAULT 'DRAFT',
    "partyId" TEXT NOT NULL,
    "orderId" TEXT,
    "deliveryDate" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "subtotalCents" INTEGER NOT NULL DEFAULT 0,
    "taxCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "classification" "DataClassification" NOT NULL DEFAULT 'INTERNAL',
    "issuedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryNoteLine" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL DEFAULT 'cmp_comet',
    "branchId" TEXT,
    "deliveryNoteId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "qty" DOUBLE PRECISION NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "netCents" INTEGER NOT NULL DEFAULT 0,
    "taxCents" INTEGER NOT NULL DEFAULT 0,
    "grossCents" INTEGER NOT NULL DEFAULT 0,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryNoteLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesReturn" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL DEFAULT 'cmp_comet',
    "branchId" TEXT,
    "number" TEXT NOT NULL,
    "status" "SalesReturnStatus" NOT NULL DEFAULT 'DRAFT',
    "partyId" TEXT NOT NULL,
    "orderId" TEXT,
    "deliveryNoteId" TEXT,
    "returnDate" TEXT NOT NULL,
    "reason" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "subtotalCents" INTEGER NOT NULL DEFAULT 0,
    "taxCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "classification" "DataClassification" NOT NULL DEFAULT 'INTERNAL',
    "approvedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesReturnLine" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL DEFAULT 'cmp_comet',
    "branchId" TEXT,
    "returnId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "qty" DOUBLE PRECISION NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "netCents" INTEGER NOT NULL DEFAULT 0,
    "taxCents" INTEGER NOT NULL DEFAULT 0,
    "grossCents" INTEGER NOT NULL DEFAULT 0,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesReturnLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SalesQuote_companyId_status_quoteDate_idx" ON "SalesQuote"("companyId", "status", "quoteDate");

-- CreateIndex
CREATE INDEX "SalesQuote_companyId_partyId_idx" ON "SalesQuote"("companyId", "partyId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesQuote_companyId_number_key" ON "SalesQuote"("companyId", "number");

-- CreateIndex
CREATE INDEX "SalesQuoteLine_quoteId_idx" ON "SalesQuoteLine"("quoteId");

-- CreateIndex
CREATE INDEX "SalesQuoteLine_companyId_idx" ON "SalesQuoteLine"("companyId");

-- CreateIndex
CREATE INDEX "SalesOrder_companyId_status_orderDate_idx" ON "SalesOrder"("companyId", "status", "orderDate");

-- CreateIndex
CREATE INDEX "SalesOrder_companyId_partyId_idx" ON "SalesOrder"("companyId", "partyId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesOrder_companyId_number_key" ON "SalesOrder"("companyId", "number");

-- CreateIndex
CREATE INDEX "SalesOrderLine_orderId_idx" ON "SalesOrderLine"("orderId");

-- CreateIndex
CREATE INDEX "SalesOrderLine_companyId_idx" ON "SalesOrderLine"("companyId");

-- CreateIndex
CREATE INDEX "DeliveryNote_companyId_status_deliveryDate_idx" ON "DeliveryNote"("companyId", "status", "deliveryDate");

-- CreateIndex
CREATE INDEX "DeliveryNote_companyId_partyId_idx" ON "DeliveryNote"("companyId", "partyId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryNote_companyId_number_key" ON "DeliveryNote"("companyId", "number");

-- CreateIndex
CREATE INDEX "DeliveryNoteLine_deliveryNoteId_idx" ON "DeliveryNoteLine"("deliveryNoteId");

-- CreateIndex
CREATE INDEX "DeliveryNoteLine_companyId_idx" ON "DeliveryNoteLine"("companyId");

-- CreateIndex
CREATE INDEX "SalesReturn_companyId_status_returnDate_idx" ON "SalesReturn"("companyId", "status", "returnDate");

-- CreateIndex
CREATE INDEX "SalesReturn_companyId_partyId_idx" ON "SalesReturn"("companyId", "partyId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesReturn_companyId_number_key" ON "SalesReturn"("companyId", "number");

-- CreateIndex
CREATE INDEX "SalesReturnLine_returnId_idx" ON "SalesReturnLine"("returnId");

-- CreateIndex
CREATE INDEX "SalesReturnLine_companyId_idx" ON "SalesReturnLine"("companyId");

-- AddForeignKey
ALTER TABLE "SalesQuote" ADD CONSTRAINT "SalesQuote_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesQuote" ADD CONSTRAINT "SalesQuote_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesQuote" ADD CONSTRAINT "SalesQuote_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "FinanceParty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesQuote" ADD CONSTRAINT "SalesQuote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesQuoteLine" ADD CONSTRAINT "SalesQuoteLine_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesQuoteLine" ADD CONSTRAINT "SalesQuoteLine_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesQuoteLine" ADD CONSTRAINT "SalesQuoteLine_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "SalesQuote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "FinanceParty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrderLine" ADD CONSTRAINT "SalesOrderLine_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrderLine" ADD CONSTRAINT "SalesOrderLine_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrderLine" ADD CONSTRAINT "SalesOrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "SalesOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryNote" ADD CONSTRAINT "DeliveryNote_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryNote" ADD CONSTRAINT "DeliveryNote_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryNote" ADD CONSTRAINT "DeliveryNote_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "FinanceParty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryNote" ADD CONSTRAINT "DeliveryNote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryNoteLine" ADD CONSTRAINT "DeliveryNoteLine_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryNoteLine" ADD CONSTRAINT "DeliveryNoteLine_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryNoteLine" ADD CONSTRAINT "DeliveryNoteLine_deliveryNoteId_fkey" FOREIGN KEY ("deliveryNoteId") REFERENCES "DeliveryNote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesReturn" ADD CONSTRAINT "SalesReturn_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesReturn" ADD CONSTRAINT "SalesReturn_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesReturn" ADD CONSTRAINT "SalesReturn_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "FinanceParty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesReturn" ADD CONSTRAINT "SalesReturn_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesReturnLine" ADD CONSTRAINT "SalesReturnLine_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesReturnLine" ADD CONSTRAINT "SalesReturnLine_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesReturnLine" ADD CONSTRAINT "SalesReturnLine_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "SalesReturn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Phase 7 row-level security
-- ---------------------------------------------------------------------------

-- All sales tables carry companyId and (on addressable tables) branchId. The
-- loop mirrors the Phase 6 policy: organisation-wide rows (branchId NULL) are
-- visible to every branch, and an empty branch context sees the whole company.
-- Idempotent so a replay of the migration cannot duplicate policies.
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
        'SalesQuote', 'SalesQuoteLine', 'SalesOrder', 'SalesOrderLine',
        'DeliveryNote', 'DeliveryNoteLine', 'SalesReturn', 'SalesReturnLine'
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