-- ============================================================
-- 0001_init_rls.sql — RLS + GRANT + POLICY
-- Prereqs:
--   1. 0000_*_initial.sql has created the 7 tables (drizzle-kit generate)
--   2. db/init/01-roles.sql has created the web_anon + web_admin roles
-- ============================================================

-- ─── 1. GRANT business-table privileges to web_anon (web_admin is BYPASSRLS) ───
GRANT SELECT, INSERT, UPDATE, DELETE
  ON products, orders, order_items, merchant_users
  TO web_anon, web_admin;

GRANT SELECT ON merchants TO web_anon;
GRANT ALL ON merchants TO web_admin;

GRANT ALL ON ALL TABLES IN SCHEMA public TO web_admin;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO web_anon, web_admin;

-- Future tables inherit privileges automatically
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
-- nullif ensures unset GUC returns NULL → false → 0 rows (fail-closed)
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

-- order_items: use EXISTS to check parent order
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
