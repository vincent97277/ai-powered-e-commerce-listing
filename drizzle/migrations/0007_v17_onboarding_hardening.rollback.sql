-- Rollback 0007_v17_onboarding_hardening.sql
DROP TABLE IF EXISTS onboarding_attempts;
DROP INDEX IF EXISTS merchants_pending_approval_idx;
ALTER TABLE merchants DROP COLUMN IF EXISTS approved_by_admin;
ALTER TABLE merchants DROP COLUMN IF EXISTS approved_at;
