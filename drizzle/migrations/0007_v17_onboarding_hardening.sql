-- ============================================================
-- 0007_v17_onboarding_hardening.sql — V1.7 D1 onboarding security hardening
--
-- Why:
--   /onboarding's prior V1 simplified version had no email verification,
--   no captcha, no IP rate limit, no reserved slug list, and set cookies
--   directly into the merchant dashboard. Codex flagged it as the largest
--   security debt in both V1.5 and V1.6 reviews.
--
--   V1.7 D1 achieves "safe by default" without pulling in third parties
--   (Resend / hCaptcha):
--     1. Admin approval queue: new merchants get approved_at=NULL → admin must approve before they run.
--     2. Reserved slug list: blocked in the application layer (admin/api/store/...).
--     3. IP rate limit (DB-backed, no Redis): 1 success per IP / 24h.
--     4. Honeypot: hidden field filled by a bot → fake success, wasting bot time.
--
-- This migration covers items 1 + 3 (schema portion):
--   - merchants gets approved_at + approved_by_admin
--   - Existing merchants are backfilled: approved_at = created_at, approved_by_admin = 'legacy'
--   - New table onboarding_attempts tracks IP + slug + result (admin observability)
--
-- RLS pattern (aligned with 0001/0003/0006):
--   - onboarding_attempts is granted to web_admin only (cross-tenant observability); web_anon not granted.
--   - ENABLE RLS, no policy = deny-all-to-non-superuser (web_admin BYPASSRLS passes through).
-- ============================================================

-- ─── 1. merchants approval columns ───
ALTER TABLE merchants
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

ALTER TABLE merchants
  ADD COLUMN IF NOT EXISTS approved_by_admin text;
  -- nullable, V1 admin session id (uuid) or 'legacy' for V1/V1.6 backfill or 'system' for seed

-- Backfill: existing merchants (V1 demo + pre-V1.6 self-signup) are all treated as approved,
-- otherwise the storefront would immediately 404 / show suspended.
UPDATE merchants
   SET approved_at = created_at,
       approved_by_admin = 'legacy'
 WHERE approved_at IS NULL;

-- For admin queue: speeds up filtering unapproved merchants
CREATE INDEX IF NOT EXISTS merchants_pending_approval_idx
  ON merchants (created_at DESC)
  WHERE approved_at IS NULL;

-- ─── 2. onboarding_attempts ───
CREATE TABLE IF NOT EXISTS onboarding_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address text NOT NULL,
  slug_attempted text NOT NULL,
  result text NOT NULL CHECK (
    result IN ('success', 'rate_limited', 'invalid_slug', 'reserved_slug', 'honeypot', 'duplicate_slug')
  ),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS onboarding_attempts_ip_created_idx
  ON onboarding_attempts (ip_address, created_at DESC);

-- ─── 3. RLS: deny all to web_anon, web_admin only (admin observability) ───
ALTER TABLE onboarding_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_attempts FORCE  ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON onboarding_attempts TO web_admin;
-- Deliberately NOT granted to web_anon; combined with RLS ENABLE this equals deny-all.
