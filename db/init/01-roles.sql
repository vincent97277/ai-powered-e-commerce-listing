-- ============================================================
-- 01-roles.sql — local Postgres setup (idempotent)
-- 簡化版: 不用 inherited NOLOGIN base role，直接 web_anon + web_admin
-- 重要: BYPASSRLS 必須直接 set 在 LOGIN role 上，inherit 沒用
-- ============================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'web_anon') THEN
    CREATE ROLE web_anon LOGIN PASSWORD 'web_anon_pass';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'web_admin') THEN
    CREATE ROLE web_admin LOGIN PASSWORD 'web_admin_pass' BYPASSRLS;
  END IF;
END $$;

-- 鎖死 PUBLIC schema
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO web_anon, web_admin;
