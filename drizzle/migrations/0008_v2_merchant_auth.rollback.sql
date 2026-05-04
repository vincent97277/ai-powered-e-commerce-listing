-- Rollback 0008_v2_merchant_auth.sql
-- Order matters: drop FK-bearing table → index → columns
DROP TABLE IF EXISTS merchant_sessions;
DROP INDEX IF EXISTS merchants_email_unique_idx;
ALTER TABLE merchants DROP COLUMN IF EXISTS password_hash;
ALTER TABLE merchants DROP COLUMN IF EXISTS email;
