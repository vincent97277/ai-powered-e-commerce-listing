-- ============================================================
-- 0001_init_rls.sql — RLS + ROLE + GRANT + POLICY
-- 前置條件：0000_*_initial.sql 已建好 7 張表
-- 對應 engineering-handoff-specs §1.1
-- ============================================================

-- ─── 1. 建立兩個 NOLOGIN base role ───
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'platform_admin') THEN
    CREATE ROLE platform_admin NOLOGIN BYPASSRLS;
  END IF;
END $$;

-- ─── 2. 建立兩個 LOGIN role 並繼承權限 ───
-- 密碼由 Neon console 在 web 介面設定後，連線字串自動帶入
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'web_anon') THEN
    CREATE ROLE web_anon LOGIN PASSWORD 'CHANGE_ME_VIA_NEON_CONSOLE' IN ROLE app_user;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'web_admin') THEN
    CREATE ROLE web_admin LOGIN PASSWORD 'CHANGE_ME_VIA_NEON_CONSOLE' IN ROLE platform_admin;
  END IF;
END $$;

-- ─── 3. GRANT schema + table 權限 ───
GRANT USAGE ON SCHEMA public TO app_user, platform_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user, platform_admin;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user, platform_admin;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user, platform_admin;

-- ─── 4. 啟用 RLS (FORCE 連 owner 也擋) ───
ALTER TABLE products       ENABLE ROW LEVEL SECURITY;
ALTER TABLE products       FORCE  ROW LEVEL SECURITY;
ALTER TABLE orders         ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders         FORCE  ROW LEVEL SECURITY;
ALTER TABLE order_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items    FORCE  ROW LEVEL SECURITY;
ALTER TABLE merchant_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_users FORCE  ROW LEVEL SECURITY;

-- ─── 5. POLICY — tenant_id = current_setting('app.tenant_id') ───
CREATE POLICY tenant_isolation ON products
  FOR ALL TO app_user
  USING      (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY tenant_isolation ON orders
  FOR ALL TO app_user
  USING      (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY tenant_isolation ON merchant_users
  FOR ALL TO app_user
  USING      (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- order_items：用 EXISTS 檢查 parent order 的 tenant_id (防 row-level forge)
CREATE POLICY tenant_isolation ON order_items
  FOR ALL TO app_user
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
