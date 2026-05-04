-- ============================================================
-- 01-roles.sql — LOCAL DEV ONLY (mounted by docker-compose into
-- /docker-entrypoint-initdb.d, runs once on fresh pg volume init).
--
-- ⚠️  DO NOT run this file against a managed Postgres (Neon /
--     Cloud SQL / Supabase / RDS). The passwords below are docker-
--     compose-only defaults. For prod role bootstrap, use
--     db/init/prod-roles.template.sql with values from a vault
--     and execute via psql / migration runner — never via
--     docker-entrypoint-initdb.d (managed Postgres has no such
--     concept anyway).
--
-- BYPASSRLS must be set on the LOGIN role directly — Postgres role
-- inheritance does not propagate this attribute.
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
