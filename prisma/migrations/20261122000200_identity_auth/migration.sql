-- Phase 3: tenant-scoped identity, lockout, OIDC linkage and password history.
-- Emails are unique per company; every lookup must carry tenant context.

DROP INDEX IF EXISTS "User_email_key";

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "identityProvider" TEXT NOT NULL DEFAULT 'local',
  ADD COLUMN IF NOT EXISTS "externalId" TEXT,
  ADD COLUMN IF NOT EXISTS "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "lastFailedLoginAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lockoutUntil" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "passwordChangedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "User_companyId_email_key" ON "User"("companyId", "email");
CREATE UNIQUE INDEX IF NOT EXISTS "User_companyId_identityProvider_externalId_key"
  ON "User"("companyId", "identityProvider", "externalId");

CREATE TABLE IF NOT EXISTS "PasswordHistory" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL DEFAULT 'cmp_comet',
  "userId" TEXT NOT NULL,
  "hash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PasswordHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PasswordHistory_companyId_userId_createdAt_idx"
  ON "PasswordHistory"("companyId", "userId", "createdAt");

ALTER TABLE "PasswordHistory"
  ADD CONSTRAINT "PasswordHistory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PasswordHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Apply the same tenant RLS policy used by the rest of the schema.
ALTER TABLE "PasswordHistory" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_branch_scope ON "PasswordHistory";
CREATE POLICY tenant_branch_scope ON "PasswordHistory"
  USING ("companyId" = current_setting('app.company_id', true))
  WITH CHECK ("companyId" = current_setting('app.company_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON "PasswordHistory" TO comet_app;
