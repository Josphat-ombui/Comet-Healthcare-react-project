-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE', 'PROBATION', 'ON_LEAVE', 'SUSPENDED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('PERMANENT', 'CONTRACT', 'INTERN', 'CASUAL');

-- CreateEnum
CREATE TYPE "EmploymentContractStatus" AS ENUM ('DRAFT', 'ACTIVE', 'EXPIRED', 'TERMINATED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LeaveType" AS ENUM ('ANNUAL', 'SICK', 'MATERNITY', 'PATERNITY', 'UNPAID', 'COMPASSIONATE');

-- CreateEnum
CREATE TYPE "LeaveStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'TAKEN', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PayrollRateKind" AS ENUM ('PAYE', 'NSSF_EMPLOYEE', 'NSSF_EMPLOYER', 'SHIF', 'HOUSING_LEVY');

-- CreateEnum
CREATE TYPE "PayrollRateStatus" AS ENUM ('UNVERIFIED', 'VERIFIED');

-- CreateEnum
CREATE TYPE "PayrollRunStatus" AS ENUM ('DRAFT', 'CALCULATED', 'APPROVED', 'POSTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL DEFAULT 'cmp_comet',
    "branchId" TEXT,
    "employeeNumber" TEXT NOT NULL,
    "userId" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "status" "EmployeeStatus" NOT NULL DEFAULT 'PROBATION',
    "employmentType" "EmploymentType" NOT NULL DEFAULT 'PERMANENT',
    "departmentId" TEXT,
    "jobTitleId" TEXT,
    "hiredAt" TIMESTAMP(3) NOT NULL,
    "terminatedAt" TIMESTAMP(3),
    "annualLeaveBalanceDays" INTEGER NOT NULL DEFAULT 0,
    "bankNameEncrypted" TEXT,
    "bankAccountEncrypted" TEXT,
    "kraPinEncrypted" TEXT,
    "notes" TEXT,
    "classification" "DataClassification" NOT NULL DEFAULT 'CONFIDENTIAL',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmploymentContract" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL DEFAULT 'cmp_comet',
    "branchId" TEXT,
    "employeeId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "status" "EmploymentContractStatus" NOT NULL DEFAULT 'DRAFT',
    "employmentType" "EmploymentType" NOT NULL DEFAULT 'PERMANENT',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "basicSalaryCents" INTEGER NOT NULL,
    "allowancesCents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "notes" TEXT,
    "classification" "DataClassification" NOT NULL DEFAULT 'CONFIDENTIAL',
    "activatedAt" TIMESTAMP(3),
    "terminatedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmploymentContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollRate" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL DEFAULT 'cmp_comet',
    "branchId" TEXT,
    "kind" "PayrollRateKind" NOT NULL,
    "rateBps" INTEGER NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "sourceReference" TEXT NOT NULL,
    "verificationNote" TEXT,
    "status" "PayrollRateStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "classification" "DataClassification" NOT NULL DEFAULT 'CONFIDENTIAL',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollRun" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL DEFAULT 'cmp_comet',
    "branchId" TEXT,
    "number" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "employeeIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "PayrollRunStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "grossCents" INTEGER NOT NULL DEFAULT 0,
    "deductionsCents" INTEGER NOT NULL DEFAULT 0,
    "employerCostCents" INTEGER NOT NULL DEFAULT 0,
    "netCents" INTEGER NOT NULL DEFAULT 0,
    "calculatedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "postedById" TEXT,
    "postedAt" TIMESTAMP(3),
    "financeJournalId" TEXT,
    "notes" TEXT,
    "classification" "DataClassification" NOT NULL DEFAULT 'CONFIDENTIAL',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollLine" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL DEFAULT 'cmp_comet',
    "branchId" TEXT,
    "runId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "basicCents" INTEGER NOT NULL,
    "allowancesCents" INTEGER NOT NULL DEFAULT 0,
    "grossCents" INTEGER NOT NULL,
    "payeCents" INTEGER NOT NULL DEFAULT 0,
    "nssfEmployeeCents" INTEGER NOT NULL DEFAULT 0,
    "nssfEmployerCents" INTEGER NOT NULL DEFAULT 0,
    "shifCents" INTEGER NOT NULL DEFAULT 0,
    "housingLevyCents" INTEGER NOT NULL DEFAULT 0,
    "deductionsCents" INTEGER NOT NULL DEFAULT 0,
    "netCents" INTEGER NOT NULL,
    "rateSnapshot" JSONB NOT NULL,
    "classification" "DataClassification" NOT NULL DEFAULT 'CONFIDENTIAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveRequest" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL DEFAULT 'cmp_comet',
    "branchId" TEXT,
    "employeeId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "type" "LeaveType" NOT NULL,
    "status" "LeaveStatus" NOT NULL DEFAULT 'DRAFT',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "days" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "takenAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "classification" "DataClassification" NOT NULL DEFAULT 'CONFIDENTIAL',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceRecord" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL DEFAULT 'cmp_comet',
    "branchId" TEXT,
    "employeeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "hoursWorkedMinutes" INTEGER NOT NULL DEFAULT 0,
    "checkInAt" TIMESTAMP(3),
    "checkOutAt" TIMESTAMP(3),
    "notes" TEXT,
    "classification" "DataClassification" NOT NULL DEFAULT 'CONFIDENTIAL',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Employee_companyId_status_idx" ON "Employee"("companyId", "status");

-- CreateIndex
CREATE INDEX "Employee_companyId_branchId_idx" ON "Employee"("companyId", "branchId");

-- CreateIndex
CREATE INDEX "Employee_companyId_departmentId_idx" ON "Employee"("companyId", "departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_companyId_employeeNumber_key" ON "Employee"("companyId", "employeeNumber");

-- CreateIndex
CREATE INDEX "EmploymentContract_companyId_employeeId_idx" ON "EmploymentContract"("companyId", "employeeId");

-- CreateIndex
CREATE INDEX "EmploymentContract_companyId_status_idx" ON "EmploymentContract"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "EmploymentContract_companyId_number_key" ON "EmploymentContract"("companyId", "number");

-- CreateIndex
CREATE INDEX "PayrollRate_companyId_kind_status_effectiveFrom_idx" ON "PayrollRate"("companyId", "kind", "status", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollRate_companyId_kind_effectiveFrom_key" ON "PayrollRate"("companyId", "kind", "effectiveFrom");

-- CreateIndex
CREATE INDEX "PayrollRun_companyId_status_periodStart_idx" ON "PayrollRun"("companyId", "status", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollRun_companyId_number_key" ON "PayrollRun"("companyId", "number");

-- CreateIndex
CREATE INDEX "PayrollLine_companyId_employeeId_idx" ON "PayrollLine"("companyId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollLine_runId_employeeId_key" ON "PayrollLine"("runId", "employeeId");

-- CreateIndex
CREATE INDEX "LeaveRequest_companyId_employeeId_status_idx" ON "LeaveRequest"("companyId", "employeeId", "status");

-- CreateIndex
CREATE INDEX "LeaveRequest_companyId_status_startDate_idx" ON "LeaveRequest"("companyId", "status", "startDate");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveRequest_companyId_number_key" ON "LeaveRequest"("companyId", "number");

-- CreateIndex
CREATE INDEX "AttendanceRecord_companyId_date_idx" ON "AttendanceRecord"("companyId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceRecord_companyId_employeeId_date_key" ON "AttendanceRecord"("companyId", "employeeId", "date");

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_jobTitleId_fkey" FOREIGN KEY ("jobTitleId") REFERENCES "JobTitle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmploymentContract" ADD CONSTRAINT "EmploymentContract_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmploymentContract" ADD CONSTRAINT "EmploymentContract_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmploymentContract" ADD CONSTRAINT "EmploymentContract_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmploymentContract" ADD CONSTRAINT "EmploymentContract_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRate" ADD CONSTRAINT "PayrollRate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRate" ADD CONSTRAINT "PayrollRate_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRate" ADD CONSTRAINT "PayrollRate_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRate" ADD CONSTRAINT "PayrollRate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_postedById_fkey" FOREIGN KEY ("postedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_financeJournalId_fkey" FOREIGN KEY ("financeJournalId") REFERENCES "FinanceJournal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollLine" ADD CONSTRAINT "PayrollLine_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollLine" ADD CONSTRAINT "PayrollLine_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollLine" ADD CONSTRAINT "PayrollLine_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PayrollRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollLine" ADD CONSTRAINT "PayrollLine_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Phase 11 tenant/branch row-level security.
--
-- The app runs as the non-owner comet_app role. The tenant middleware sets
-- app.company_id and app.branch_id on every request. A NULL branchId row is
-- visible to every branch of the owning company. The policy is created in a
-- dynamic DO block so the migration stays idempotent and mirrors Phase 6-10.
DO
$$
DECLARE
  t text;
  scope_expr text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
      'Employee', 'EmploymentContract', 'PayrollRate', 'PayrollRun',
      'PayrollLine', 'LeaveRequest', 'AttendanceRecord'
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
