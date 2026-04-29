-- ============================================================
-- 0003_v1_rls.sql — RLS for V1 new tables (#38, #39, #40, #41)
-- 前置條件: 0002_low_wonder_man.sql 已 CREATE TABLE
-- Pattern: nullif(...) fail-closed (跟 0001_init_rls.sql 同)
-- ============================================================

-- ─── 1. GRANT 給 web_anon (web_admin 是 BYPASSRLS, 已 ALTER DEFAULT) ───
-- order_status_history / import_sessions: web_anon 走 RLS
-- admin_action_history / admin_sessions: 純 admin 表, 拿掉 web_anon 寫權限
GRANT SELECT, INSERT, UPDATE, DELETE
  ON order_status_history, import_sessions
  TO web_anon, web_admin;

REVOKE ALL ON admin_action_history, admin_sessions FROM web_anon;
GRANT ALL ON admin_action_history, admin_sessions TO web_admin;

-- ─── 2. ENABLE + FORCE RLS (4 張新表全開) ───
ALTER TABLE order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_status_history FORCE  ROW LEVEL SECURITY;

ALTER TABLE import_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_sessions FORCE  ROW LEVEL SECURITY;

-- admin_action_history / admin_sessions: ENABLE 但無 policy = deny-all (RA2 defense-in-depth)
ALTER TABLE admin_action_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_action_history FORCE  ROW LEVEL SECURITY;

ALTER TABLE admin_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_sessions FORCE  ROW LEVEL SECURITY;

-- ─── 3. POLICY ───

-- order_status_history: RLS 走 JOIN orders.tenant_id (ENG D3, RA7)
-- USING + WITH CHECK 同條件 (防止 INSERT 寫到別人的 order)
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

-- import_sessions: merchant_id IS tenant_id (RA18, 不冗餘存 tenant_id)
CREATE POLICY tenant_isolation ON import_sessions
  FOR ALL TO web_anon
  USING      (merchant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (merchant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- admin_action_history / admin_sessions: 沒有 policy = web_anon 全部 deny
-- web_admin BYPASSRLS, 不受影響
