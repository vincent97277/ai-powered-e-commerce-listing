-- ============================================================
-- 0008_v2_merchant_auth.sql — V2 per-merchant authentication schema
--
-- Why:
--   V1.7 review side-find: "the merchant dashboard should have per-merchant auth,
--   not a shared demo-merchant-id cookie". V1's demo-merchant-id cookie was
--   forgeable by anyone — equivalent to no auth, just a slug→tenant lookup,
--   not identity verification.
--
--   The V2 rework is four steps; this migration only does the schema piece (task 102):
--     1. (this file) merchants gets email + password_hash columns
--     2. New table merchant_sessions (mirrors admin_sessions, V1 #41 RA11 pattern)
--     3. RLS: web_admin only (same pattern as admin_sessions, onboarding_attempts)
--     4. Don't backfill in this migration — use scripts/seed-merchant-auth.ts
--        (avoids hardcoding bcrypt cost / hash format in SQL; auth lib is task 103's call)
--
-- Out of scope (task 103 onward):
--   - HMAC session cookie signing logic (mirror src/lib/admin-session.ts)
--   - bcrypt verify / login UI / middleware DB liveness check
--   - Migrating all existing demo-merchant-id consumers to query merchant_sessions
-- ============================================================

-- ─── 1. merchants auth columns ───
-- email: nullable because the existing 6+ demo merchants don't have emails yet;
--        scripts/seed-merchant-auth.ts backfills them.
-- password_hash: nullable (same reason). bcrypt $2a$10$… is 60 chars; text imposes no length cap.
ALTER TABLE merchants
  ADD COLUMN IF NOT EXISTS email text;

ALTER TABLE merchants
  ADD COLUMN IF NOT EXISTS password_hash text;

-- Email must be unique (when present) and case-insensitive — use a functional unique index.
-- Partial: WHERE email IS NOT NULL allows multi-NULL (existing demo merchants haven't filled it).
-- Same pattern as merchants_referral_code_uniq (RA8 partial unique).
CREATE UNIQUE INDEX IF NOT EXISTS merchants_email_unique_idx
  ON merchants (lower(email))
  WHERE email IS NOT NULL;

-- ─── 2. merchant_sessions ───
-- Mirrors admin_sessions (0002_low_wonder_man.sql) — same HMAC cookie + DB liveness check.
-- Adds merchant_id FK + revoked_at (admin_sessions V1 didn't have these, but V2 wants to support
-- "log out all devices"; revoke audits better than DELETE).
CREATE TABLE IF NOT EXISTS merchant_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

-- Index for a merchant listing their own active sessions / revoking them (settings page V2.1).
-- DESC because the UI always shows the newest session at the top.
CREATE INDEX IF NOT EXISTS merchant_sessions_merchant_idx
  ON merchant_sessions (merchant_id, expires_at DESC);

-- ─── 3. RLS: deny all to web_anon, web_admin only ───
-- Same pattern as onboarding_attempts (0007) / admin_sessions:
--   - ENABLE + FORCE RLS, no policy = deny-all-to-non-superuser
--   - web_admin BYPASSRLS passes through automatically (admin observability)
--   - web_anon deliberately not granted (defense in depth — middleware shouldn't query this,
--     but even if misused it cannot leak data)
ALTER TABLE merchant_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_sessions FORCE  ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON merchant_sessions TO web_admin;
-- Deliberately NOT granted to web_anon.
