-- ============================================================
-- Rollback for 0001_confused_stone_men.sql
-- Reverse order: drop indexes first, then columns
-- ============================================================

DROP INDEX IF EXISTS "products_tenant_import_dedup_unique";
DROP INDEX IF EXISTS "products_tenant_stock_idx";
DROP INDEX IF EXISTS "orders_tenant_status_created_idx";
DROP INDEX IF EXISTS "merchants_suspended_idx";
DROP INDEX IF EXISTS "merchants_referral_code_uniq";

ALTER TABLE "products" DROP COLUMN IF EXISTS "imported_from_url";
ALTER TABLE "products" DROP COLUMN IF EXISTS "product_status";
ALTER TABLE "products" DROP COLUMN IF EXISTS "stock_quantity";

ALTER TABLE "orders" DROP COLUMN IF EXISTS "carrier";
ALTER TABLE "orders" DROP COLUMN IF EXISTS "tracking_number";
ALTER TABLE "orders" DROP COLUMN IF EXISTS "internal_note";
ALTER TABLE "orders" DROP COLUMN IF EXISTS "customer_address";
ALTER TABLE "orders" DROP COLUMN IF EXISTS "customer_phone";
ALTER TABLE "orders" DROP COLUMN IF EXISTS "customer_name";

ALTER TABLE "merchants" DROP COLUMN IF EXISTS "referred_by_merchant_id";
ALTER TABLE "merchants" DROP COLUMN IF EXISTS "referral_code";
ALTER TABLE "merchants" DROP COLUMN IF EXISTS "daily_ai_cost_cents_cap";
ALTER TABLE "merchants" DROP COLUMN IF EXISTS "low_stock_threshold";
ALTER TABLE "merchants" DROP COLUMN IF EXISTS "previous_slug";
ALTER TABLE "merchants" DROP COLUMN IF EXISTS "suspended_reason";
ALTER TABLE "merchants" DROP COLUMN IF EXISTS "suspended_at";
