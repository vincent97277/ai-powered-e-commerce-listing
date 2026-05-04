-- ============================================================
-- prod-roles.template.sql — prod role bootstrap (TEMPLATE)
--
-- Use this against a managed Postgres (Neon / Cloud SQL / Supabase
-- / RDS) when bringing up a new prod environment. Pass the
-- web_anon_password and web_admin_password psql variables from
-- a vault before running.
--
-- Usage (psql variable substitution):
--
--   psql "$DATABASE_URL_OWNER" \
--     --set ON_ERROR_STOP=on \
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
-- Idempotent: if the role already exists, the gexec line is a no-op
-- (the SELECT returns 0 rows). Rotation: use ALTER ROLE separately.
--
-- Why not DO $$ BEGIN ... CREATE ROLE ... END $$;
--   psql variable substitution (:'name') does NOT happen inside
--   dollar-quoted strings — psql substitutes at the SQL level only.
--   The DO block sends the literal `:'web_anon_password'` to the
--   server, which raises a syntax error. Using SELECT + \gexec keeps
--   the substitution at psql level where it works.
-- ============================================================

\set ON_ERROR_STOP on

-- web_anon — RLS-enforced (no BYPASSRLS)
SELECT format('CREATE ROLE web_anon LOGIN PASSWORD %L', :'web_anon_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'web_anon')
\gexec

-- web_admin — BYPASSRLS, scoped via ESLint allowlist (see ARCHITECTURE.md §4.4)
SELECT format('CREATE ROLE web_admin LOGIN PASSWORD %L BYPASSRLS', :'web_admin_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'web_admin')
\gexec

-- Lock down PUBLIC schema (defense-in-depth — Neon's default may differ)
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO web_anon, web_admin;

-- Verify (printed by psql)
SELECT rolname, rolcanlogin, rolbypassrls
FROM pg_roles
WHERE rolname IN ('web_anon', 'web_admin')
ORDER BY rolname;
