-- ============================================================
-- Rollback for 0003_v1_rls.sql
-- Order: drop policies, then revoke grants
-- Note: 0002 rollback DROPs the tables, which cascades policy drops.
-- This file is only used in the "do not drop tables but reset RLS" scenario.
-- ============================================================

DROP POLICY IF EXISTS "tenant_isolation" ON "import_sessions";
DROP POLICY IF EXISTS "tenant_isolation_via_orders" ON "order_status_history";

ALTER TABLE "admin_sessions" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "admin_action_history" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "import_sessions" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "order_status_history" DISABLE ROW LEVEL SECURITY;

REVOKE ALL ON "order_status_history", "import_sessions" FROM web_anon, web_admin;
REVOKE ALL ON "admin_action_history", "admin_sessions" FROM web_admin;
