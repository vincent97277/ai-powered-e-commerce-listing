-- ============================================================
-- prod-roles.template.sql — prod role bootstrap (TEMPLATE)
--
-- Use this against a managed Postgres (Neon / Cloud SQL / Supabase
-- / RDS) when bringing up a new prod environment. Replace the
-- :"web_anon_password" and :"web_admin_password" psql variables
-- with values from your secrets vault before running.
--
-- Usage (psql variable substitution):
--
--   psql "$DATABASE_URL_OWNER" \
--     -v "web_anon_password=$(openssl rand -base64 24)" \
--     -v "web_admin_password=$(openssl rand -base64 24)" \
--     -f db/init/prod-roles.template.sql
--
-- Then immediately:
--   1. Save the generated passwords to your vault (1Password / age-
--      encrypted file). They are not retrievable afterwards.
--   2. Build DATABASE_URL_USER and DATABASE_URL_ADMIN connection
--      strings using these passwords + sslmode=require.
--   3. Set those as production secrets in Vercel / Cloud Run.
--   4. Discard the .sql file from your shell history.
--
-- BYPASSRLS must be set on the LOGIN role directly — Postgres role
-- inheritance does not propagate this attribute.
--
-- Idempotent: re-running with the same passwords is a no-op for
-- role creation. To rotate, use ALTER ROLE separately.
-- ============================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'web_anon') THEN
    EXECUTE format('CREATE ROLE web_anon LOGIN PASSWORD %L', :'web_anon_password');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'web_admin') THEN
    EXECUTE format('CREATE ROLE web_admin LOGIN PASSWORD %L BYPASSRLS', :'web_admin_password');
  END IF;
END $$;

-- Lock down PUBLIC schema (defence-in-depth — Neon's default may differ)
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO web_anon, web_admin;

-- Verify (will print to stdout if run via psql -f)
SELECT rolname, rolcanlogin, rolbypassrls
FROM pg_roles
WHERE rolname IN ('web_anon', 'web_admin')
ORDER BY rolname;
