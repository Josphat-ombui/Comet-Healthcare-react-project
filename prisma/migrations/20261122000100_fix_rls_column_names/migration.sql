-- Prisma maps `companyId` / `branchId` to camelCase columns by default.
-- The first migration looked for snake_case names, so it created no RLS policies.
-- This corrective migration creates the intended tenant/branch policies.

DO $$
DECLARE
  t text;
  has_branch boolean;
  scope_expr text;
BEGIN
  FOR t IN
    SELECT DISTINCT c.table_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.column_name = 'companyId'
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
