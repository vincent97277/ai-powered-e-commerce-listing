ALTER TABLE "merchants" ADD COLUMN "suspended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "suspended_reason" text;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "previous_slug" text;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "low_stock_threshold" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "daily_ai_cost_cents_cap" integer DEFAULT 5000 NOT NULL;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "referral_code" text;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "referred_by_merchant_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "customer_name" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "customer_phone" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "customer_address" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "internal_note" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "tracking_number" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "carrier" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "stock_quantity" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "product_status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "imported_from_url" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "merchants_referral_code_uniq" ON "merchants" USING btree ("referral_code") WHERE "merchants"."referral_code" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "merchants_suspended_idx" ON "merchants" USING btree ("suspended_at") WHERE "merchants"."suspended_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orders_tenant_status_created_idx" ON "orders" USING btree ("tenant_id","status","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "products_tenant_stock_idx" ON "products" USING btree ("tenant_id","stock_quantity");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "products_tenant_import_dedup_unique" ON "products" USING btree ("tenant_id","imported_from_url") WHERE "products"."imported_from_url" IS NOT NULL;