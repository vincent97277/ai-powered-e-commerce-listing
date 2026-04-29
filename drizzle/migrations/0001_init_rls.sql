-- ============================================================
-- 0001_init_rls.sql — RLS + GRANT + POLICY
-- 前置條件:
--   1. 0000_*_initial.sql 已建好 7 張表 (drizzle-kit generate)
--   2. db/init/01-roles.sql 已建好 web_anon + web_admin role
-- ============================================================

-- ─── 1. GRANT 業務表權限給 web_anon (web_admin 是 BYPASSRLS) ───
GRANT SELECT, INSERT, UPDATE, DELETE
  ON products, orders, order_items, merchant_users
  TO web_anon, web_admin;

GRANT SELECT ON merchants TO web_anon;
GRANT ALL ON merchants TO web_admin;

GRANT ALL ON ALL TABLES IN SCHEMA public TO web_admin;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO web_anon, web_admin;

-- 未來新表自動繼承權限
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO web_anon, web_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO web_anon, web_admin;

-- ─── 2. ENABLE + FORCE RLS ───
ALTER TABLE products       ENABLE ROW LEVEL SECURITY;
ALTER TABLE products       FORCE  ROW LEVEL SECURITY;
ALTER TABLE orders         ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders         FORCE  ROW LEVEL SECURITY;
ALTER TABLE order_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items    FORCE  ROW LEVEL SECURITY;
ALTER TABLE merchant_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_users FORCE  ROW LEVEL SECURITY;

-- ─── 3. POLICY — tenant_id = current_setting('app.tenant_id') ───
-- nullif 確保未設 GUC 時回 NULL → false → 0 rows (fail-closed)
CREATE POLICY tenant_isolation ON products
  FOR ALL TO web_anon
  USING      (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY tenant_isolation ON orders
  FOR ALL TO web_anon
  USING      (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY tenant_isolation ON merchant_users
  FOR ALL TO web_anon
  USING      (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- order_items: 用 EXISTS 檢查 parent order
CREATE POLICY tenant_isolation ON order_items
  FOR ALL TO web_anon
  USING (
    tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_items.order_id
        AND o.tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
    )
  )
  WITH CHECK (
    tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_items.order_id
        AND o.tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
    )
  );
