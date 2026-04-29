-- ============================================================
-- Rollback for 0003_v1_rls.sql
-- 順序: drop policies → revoke grants
-- 注: 因 0002 rollback 會 DROP TABLE, policies 會 cascade 自動 drop
-- 此 file 只在「不 drop tables 但要 reset RLS」場景用
-- ============================================================

DROP POLICY IF EXISTS "tenant_isolation" ON "import_sessions";
DROP POLICY IF EXISTS "tenant_isolation_via_orders" ON "order_status_history";

ALTER TABLE "admin_sessions" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "admin_action_history" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "import_sessions" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "order_status_history" DISABLE ROW LEVEL SECURITY;

REVOKE ALL ON "order_status_history", "import_sessions" FROM web_anon, web_admin;
REVOKE ALL ON "admin_action_history", "admin_sessions" FROM web_admin;
