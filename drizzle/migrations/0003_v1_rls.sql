-- ============================================================
-- 0003_v1_rls.sql — RLS for V1 new tables (#38, #39, #40, #41)
-- Prereq: 0002_low_wonder_man.sql has CREATE TABLE'd them
-- Pattern: nullif(...) fail-closed (same as 0001_init_rls.sql)
-- ============================================================

-- ─── 1. GRANT to web_anon (web_admin is BYPASSRLS, already ALTER DEFAULT) ───
-- order_status_history / import_sessions: web_anon goes through RLS
-- admin_action_history / admin_sessions: admin-only tables; revoke web_anon writes
GRANT SELECT, INSERT, UPDATE, DELETE
  ON order_status_history, import_sessions
  TO web_anon, web_admin;

REVOKE ALL ON admin_action_history, admin_sessions FROM web_anon;
GRANT ALL ON admin_action_history, admin_sessions TO web_admin;

-- ─── 2. ENABLE + FORCE RLS (all 4 new tables) ───
ALTER TABLE order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_status_history FORCE  ROW LEVEL SECURITY;

ALTER TABLE import_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_sessions FORCE  ROW LEVEL SECURITY;

-- admin_action_history / admin_sessions: ENABLE but no policy = deny-all (RA2 defense-in-depth)
ALTER TABLE admin_action_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_action_history FORCE  ROW LEVEL SECURITY;

ALTER TABLE admin_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_sessions FORCE  ROW LEVEL SECURITY;

-- ─── 3. POLICY ───

-- order_status_history: RLS via JOIN to orders.tenant_id (ENG D3, RA7)
-- USING + WITH CHECK use the same condition (prevents INSERT into someone else's order)
CREATE POLICY tenant_isolation_via_orders ON order_status_history
  FOR ALL TO web_anon
  USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_status_history.order_id
        AND orders.tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_status_history.order_id
        AND orders.tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
    )
  );

-- import_sessions: merchant_id IS tenant_id (RA18, no redundant tenant_id column)
CREATE POLICY tenant_isolation ON import_sessions
  FOR ALL TO web_anon
  USING      (merchant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (merchant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- admin_action_history / admin_sessions: no policy = web_anon fully denied
-- web_admin BYPASSRLS, unaffected
