/**
 * Drizzle schema — V1 schema (7 tables)
 * RLS is handled by 0001a_init_rls.sql; this file only defines structure.
 * tenant_id column = pool-model multi-tenant key, required on all tenant-scoped tables.
 */
import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
  boolean,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { relations, sql, type InferSelectModel, type InferInsertModel } from 'drizzle-orm';

/* ─────────────────────────── 1. merchants ─────────────────────────── */
/** Merchant (tenant) itself — slug is the URL routing key */
export const merchants = pgTable(
  'merchants',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    brandVoice: text('brand_voice'),
    themeVars: jsonb('theme_vars').$type<Record<string, string>>().default({}).notNull(),
    /** V1 admin actions */
    suspendedAt: timestamp('suspended_at', { withTimezone: true }),
    suspendedReason: text('suspended_reason'),
    previousSlug: text('previous_slug'),
    /** V2 per-merchant auth (task 102 schema, task 103 lib).
     *  email: lowercase-unique via functional partial index merchants_email_unique_idx.
     *  password_hash: bcrypt $2a$10$… (60 chars). Both nullable until backfill via
     *  scripts/seed-merchant-auth.ts. NOT NULL constraint deferred to V2.1 once
     *  every merchant has logged in & set credentials. */
    email: text('email'),
    passwordHash: text('password_hash'),
    /** V1.7 D1 onboarding hardening — admin approval queue.
     *  approved_at IS NULL = pending approval (storefront blocked, merchant backend banner) */
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    /** admin session id (UUID) | 'legacy' (V1.6 backfill) | 'system' (seed). nullable when pending. */
    approvedByAdmin: text('approved_by_admin'),
    /** V1 merchant settings */
    lowStockThreshold: integer('low_stock_threshold').notNull().default(5),
    dailyAiCostCentsCap: integer('daily_ai_cost_cents_cap').notNull().default(5000),
    /** V1 schema pre-seeded (referral UI lands in V2, columns added now to avoid future migrate) */
    referralCode: text('referral_code'),
    referredByMerchantId: uuid('referred_by_merchant_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    slugUnique: uniqueIndex('merchants_slug_unique').on(t.slug),
    /** RA8: partial unique index expresses intent (multi-NULL OK, non-null must be unique) */
    referralCodeUnique: uniqueIndex('merchants_referral_code_uniq')
      .on(t.referralCode)
      .where(sql`${t.referralCode} IS NOT NULL`),
    /** Used by admin to list suspended merchants */
    suspendedIdx: index('merchants_suspended_idx')
      .on(t.suspendedAt)
      .where(sql`${t.suspendedAt} IS NOT NULL`),
    /** V1.7 D1: admin approval queue fetches pending merchants */
    pendingApprovalIdx: index('merchants_pending_approval_idx')
      .on(t.createdAt)
      .where(sql`${t.approvedAt} IS NULL`),
  }),
);

/* ─────────────────────────── 2. merchant_users ─────────────────────────── */
/** Users under a merchant (owner / staff) */
export const merchantUsers = pgTable(
  'merchant_users',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => merchants.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: text('role', { enum: ['owner', 'staff'] }).notNull().default('owner'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    tenantIdx: index('merchant_users_tenant_idx').on(t.tenantId),
    emailUnique: uniqueIndex('merchant_users_email_unique').on(t.email),
  }),
);

/* ─────────────────────────── 3. platform_admins ─────────────────────────── */
/** Platform super admin — does not belong to any tenant */
export const platformAdmins = pgTable(
  'platform_admins',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    email: text('email').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    emailUnique: uniqueIndex('platform_admins_email_unique').on(t.email),
  }),
);

/* ─────────────────────────── 4. products ─────────────────────────── */
/** AI-generated products — ai_metadata corresponds to §2.2 Zod schema */
export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => merchants.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description').notNull(),
    aiMetadata: jsonb('ai_metadata').$type<ProductAiMetadata>().notNull(),
    r2Key: text('r2_key').notNull(),
    priceCents: integer('price_cents').notNull().default(0),
    /** V1 stock (A4) */
    stockQuantity: integer('stock_quantity').notNull().default(0),
    /** V1 needs_review status for AI failure fallback (RA20) */
    productStatus: text('product_status', {
      enum: ['active', 'needs_review', 'archived'],
    })
      .notNull()
      .default('active'),
    isPublished: boolean('is_published').notNull().default(false),
    /** V1 IG/Shopee import source (RA18 dedup, A6) */
    importedFromUrl: text('imported_from_url'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    tenantIdx: index('products_tenant_idx').on(t.tenantId),
    tenantCreatedIdx: index('products_tenant_created_idx').on(t.tenantId, t.createdAt),
    /** A5 callout: used for counting low-stock */
    tenantStockIdx: index('products_tenant_stock_idx').on(t.tenantId, t.stockQuantity),
    /** A6 dedup: same merchant cannot import the same product URL twice (per ENG D3 / final review #9) */
    importDedupUnique: uniqueIndex('products_tenant_import_dedup_unique')
      .on(t.tenantId, t.importedFromUrl)
      .where(sql`${t.importedFromUrl} IS NOT NULL`),
  }),
);

/** §2.2 ai_metadata payload type — persisted after Zod validation (aligned with src/lib/ai/schema.ts) */
export type ProductAiMetadata = {
  title: string;
  description: string;
  category: '服飾配件' | '美妝保養' | '食品飲料' | '居家生活' | '3C 周邊' | '文具書籍' | '運動戶外' | '其他';
  seo_tags: string[];
  variants: Array<{ name: string; options: string[] }>;
  price_twd: { min: number; max: number };
  confidence: number;
  status?: 'success' | 'failed';
  error?: string;
  attempts?: number;
  /**
   * V2.2.5: original storage key the user uploaded (before sharp processing).
   * Used by /api/products/generate/status to correlate the async vision result
   * back to the upload that triggered it. Worker fills this in; route polls by it.
   */
  source_key?: string;
};

/* ─────────────────────────── 5. orders ─────────────────────────── */
export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => merchants.id, { onDelete: 'cascade' }),
    customerEmail: text('customer_email').notNull(),
    /** V1 used in order detail display (#37 enum expansion + #54 detail page) */
    customerName: text('customer_name'),
    customerPhone: text('customer_phone'),
    customerAddress: text('customer_address'),
    /** Merchant-private */
    internalNote: text('internal_note'),
    totalCents: integer('total_cents').notNull(),
    /** V1 status flow: pending → paid → shipped → completed; any → refunded (dead-end) */
    status: text('status', {
      enum: ['pending', 'paid', 'shipped', 'completed', 'failed', 'refunded'],
    })
      .notNull()
      .default('pending'),
    /** V1 shipping record (written on #55 status flip) */
    trackingNumber: text('tracking_number'),
    carrier: text('carrier'),
    ecpayTradeNo: text('ecpay_trade_no'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    tenantIdx: index('orders_tenant_idx').on(t.tenantId),
    ecpayUnique: uniqueIndex('orders_ecpay_trade_no_unique').on(t.ecpayTradeNo),
    /** A5 callout query speedup (count by status per tenant) */
    tenantStatusCreatedIdx: index('orders_tenant_status_created_idx').on(
      t.tenantId,
      t.status,
      t.createdAt,
    ),
  }),
);

/* ─────────────────────────── 6. order_items ─────────────────────────── */
export const orderItems = pgTable(
  'order_items',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => merchants.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    quantity: integer('quantity').notNull().default(1),
    unitPriceCents: integer('unit_price_cents').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    tenantIdx: index('order_items_tenant_idx').on(t.tenantId),
    orderIdx: index('order_items_order_idx').on(t.orderId),
  }),
);

/* ─────────────────────────── 7. order_status_history ─────────────────────────── */
/**
 * Order status transition audit log (V1 #38, ENG D3 decision)
 * RLS via JOIN orders.tenant_id — no redundant tenant_id column; always aligned with orders, no leak possible
 * RLS policy written in 0002_v1_rls.sql (USING + WITH CHECK same condition)
 */
export const orderStatusHistory = pgTable(
  'order_status_history',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    fromStatus: text('from_status').notNull(),
    toStatus: text('to_status').notNull(),
    changedBy: text('changed_by', { enum: ['merchant', 'admin', 'system'] }).notNull(),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    orderCreatedIdx: index('order_status_history_order_created_idx').on(t.orderId, t.createdAt),
  }),
);

/* ─────────────────────────── 8. payment_webhooks ─────────────────────────── */
/** ECPay webhook idempotency — (provider, external_id) prevents duplicate processing */
export const paymentWebhooks = pgTable(
  'payment_webhooks',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    provider: text('provider').notNull(),
    externalId: text('external_id').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    providerExternalUnique: uniqueIndex('payment_webhooks_provider_external_unique').on(
      t.provider,
      t.externalId,
    ),
  }),
);

/* ─────────────────────────── 9. admin_action_history ─────────────────────────── */
/**
 * Audit log of actions platform admin performs on merchants (V1 #39)
 * RLS = DENY ALL TO web_anon (defense-in-depth, RA2). web_admin BYPASSRLS passes through automatically
 * actor column not stored in V1 (single-user model, A0 password gate). Added when real auth lands in V2
 */
export const adminActionHistory = pgTable(
  'admin_action_history',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    targetMerchantId: uuid('target_merchant_id')
      .notNull()
      .references(() => merchants.id, { onDelete: 'cascade' }),
    action: text('action', {
      enum: ['suspend', 'activate', 'rename_slug', 'approve_merchant'],
    }).notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    targetCreatedIdx: index('admin_action_history_target_created_idx').on(
      t.targetMerchantId,
      t.createdAt,
    ),
  }),
);

/* ─────────────────────────── 10. import_sessions ─────────────────────────── */
/**
 * IG/Shopee import progress tracking (V1 #40)
 * RLS via JOIN merchants — no redundant tenant_id (RA18, same pattern as order_status_history)
 * RLS policy written in 0002_v1_rls.sql (USING + WITH CHECK)
 * V1 does not write cron to clean orphan pending sessions; mark-failed-after-7-days is a V2 task
 */
export const importSessions = pgTable(
  'import_sessions',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    merchantId: uuid('merchant_id')
      .notNull()
      .references(() => merchants.id, { onDelete: 'cascade' }),
    sourceUrl: text('source_url').notNull(),
    sourceType: text('source_type', { enum: ['ig', 'shopee'] }).notNull(),
    status: text('status', {
      enum: ['pending', 'fetching', 'importing', 'completed', 'failed'],
    })
      .notNull()
      .default('pending'),
    totalItems: integer('total_items').notNull().default(0),
    completedItems: integer('completed_items').notNull().default(0),
    /** errors[]: { itemIndex, sourceItemUrl, message } */
    errors: jsonb('errors').$type<Array<Record<string, unknown>>>().notNull().default([]),
    /** RA13 cost cap accumulator */
    tokensIn: integer('tokens_in').notNull().default(0),
    tokensOut: integer('tokens_out').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    merchantCreatedIdx: index('import_sessions_merchant_created_idx').on(
      t.merchantId,
      t.createdAt,
    ),
  }),
);

/* ─────────────────────────── 10b. ai_usage_events ─────────────────────────── */
/**
 * Fine-grained per-AI-call token usage (V1.5 smoke fix)
 *
 * Why it exists (alongside import_sessions.tokens_in/out):
 *   - import_sessions only covers IG/Shopee batch import (worker path)
 *   - Synchronous photo upload (/api/products/generate) has no import session
 *     → before V1.5 sync-call token usage was never persisted, DailyCostChip always NT$0
 *   - New table only records the sync path; batch import still writes import_sessions
 *   - getDailyCostCents sums both tables
 *
 * Append-only audit log: INSERT only, no UPDATE/DELETE
 * RLS: tenant_id = current_setting('app.tenant_id') (same pattern as products)
 */
export const aiUsageEvents = pgTable(
  'ai_usage_events',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => merchants.id, { onDelete: 'cascade' }),
    tokensIn: integer('tokens_in').notNull().default(0),
    tokensOut: integer('tokens_out').notNull().default(0),
    /** 'photo_upload' | 'ig_import' | 'shopee_import' | other (text not enum, so V2 can add new sources) */
    source: text('source').notNull(),
    /** V1.5 hardcoded gpt-4o-2024-11-20; multi-model lands in V2 */
    model: text('model').notNull().default('gpt-4o-2024-11-20'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    tenantCreatedIdx: index('ai_usage_events_tenant_created_idx').on(
      t.tenantId,
      t.createdAt,
    ),
  }),
);

/* ─────────────────────────── 10c. onboarding_attempts ─────────────────────────── */
/**
 * V1.7 D1 onboarding hardening — IP rate limit + abuse log.
 *
 * Every /onboarding POST writes a row (including success / various rejection branches);
 * uses ip_address + created_at idx to count 1 attempt per IP per 24h.
 * RLS = web_admin only (cross-tenant observability).
 *
 * Append-only log; no UPDATE/DELETE.
 */
export const onboardingAttempts = pgTable(
  'onboarding_attempts',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    /** x-forwarded-for first hop (raw text — IPv4 or IPv6, not normalized) */
    ipAddress: text('ip_address').notNull(),
    /** Attempted slug — stored even if rejected, so admin can see abuse pattern */
    slugAttempted: text('slug_attempted').notNull(),
    /** success / rate_limited / invalid_slug / reserved_slug / honeypot / duplicate_slug */
    result: text('result', {
      enum: [
        'success',
        'rate_limited',
        'invalid_slug',
        'reserved_slug',
        'honeypot',
        'duplicate_slug',
      ],
    }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    ipCreatedIdx: index('onboarding_attempts_ip_created_idx').on(t.ipAddress, t.createdAt),
  }),
);

/* ─────────────────────────── 11. admin_sessions ─────────────────────────── */
/**
 * Admin login HMAC-bound session (V1 #41, RA11)
 * Pairs with password gate — HMAC cookie binds session.id, revoke = DELETE row
 * No RLS — pure dbAdmin/web_admin read/write
 */
export const adminSessions = pgTable(
  'admin_sessions',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ip: text('ip'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    expiresIdx: index('admin_sessions_expires_idx').on(t.expiresAt),
  }),
);

/* ─────────────────────────── 12. merchant_sessions ─────────────────────────── */
/**
 * V2 per-merchant auth — HMAC-bound session (task 102 schema, task 103 lib).
 *
 * Mirror admin_sessions (V1 #41, RA11): cookie value = `{sessionId}.{HMAC-SHA256(sessionId, secret)}`,
 * server validates signature + DB row exists + expires_at > now() + revoked_at IS NULL.
 *
 * Differences from admin_sessions:
 *   - merchant_id FK (NOT NULL, ON DELETE CASCADE) — one merchant can have many sessions (multiple devices)
 *   - revoked_at: V2.1 wants to support a "log out everywhere" button; UPDATE revoked_at = now() audits better than DELETE
 *
 * RLS: ENABLE + FORCE, web_admin only. web_anon not GRANTed.
 */
export const merchantSessions = pgTable(
  'merchant_sessions',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    merchantId: uuid('merchant_id')
      .notNull()
      .references(() => merchants.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ip: text('ip'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => ({
    merchantIdx: index('merchant_sessions_merchant_idx').on(t.merchantId, t.expiresAt.desc()),
  }),
);

/* ─────────────────────────── Relations ─────────────────────────── */
export const merchantsRelations = relations(merchants, ({ many }) => ({
  users: many(merchantUsers),
  products: many(products),
  orders: many(orders),
  sessions: many(merchantSessions),
}));

export const merchantSessionsRelations = relations(merchantSessions, ({ one }) => ({
  merchant: one(merchants, { fields: [merchantSessions.merchantId], references: [merchants.id] }),
}));

export const merchantUsersRelations = relations(merchantUsers, ({ one }) => ({
  tenant: one(merchants, { fields: [merchantUsers.tenantId], references: [merchants.id] }),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  tenant: one(merchants, { fields: [products.tenantId], references: [merchants.id] }),
  orderItems: many(orderItems),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  tenant: one(merchants, { fields: [orders.tenantId], references: [merchants.id] }),
  items: many(orderItems),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  product: one(products, { fields: [orderItems.productId], references: [products.id] }),
}));

export const orderStatusHistoryRelations = relations(orderStatusHistory, ({ one }) => ({
  order: one(orders, { fields: [orderStatusHistory.orderId], references: [orders.id] }),
}));

export const adminActionHistoryRelations = relations(adminActionHistory, ({ one }) => ({
  targetMerchant: one(merchants, {
    fields: [adminActionHistory.targetMerchantId],
    references: [merchants.id],
  }),
}));

export const importSessionsRelations = relations(importSessions, ({ one }) => ({
  merchant: one(merchants, { fields: [importSessions.merchantId], references: [merchants.id] }),
}));

export const aiUsageEventsRelations = relations(aiUsageEvents, ({ one }) => ({
  tenant: one(merchants, { fields: [aiUsageEvents.tenantId], references: [merchants.id] }),
}));

/* ─────────────────────────── TS Types Export ─────────────────────────── */
export type Merchant = InferSelectModel<typeof merchants>;
export type NewMerchant = InferInsertModel<typeof merchants>;
export type MerchantUser = InferSelectModel<typeof merchantUsers>;
export type NewMerchantUser = InferInsertModel<typeof merchantUsers>;
export type PlatformAdmin = InferSelectModel<typeof platformAdmins>;
export type Product = InferSelectModel<typeof products>;
export type NewProduct = InferInsertModel<typeof products>;
export type Order = InferSelectModel<typeof orders>;
export type NewOrder = InferInsertModel<typeof orders>;
export type OrderItem = InferSelectModel<typeof orderItems>;
export type NewOrderItem = InferInsertModel<typeof orderItems>;
export type PaymentWebhook = InferSelectModel<typeof paymentWebhooks>;
export type NewPaymentWebhook = InferInsertModel<typeof paymentWebhooks>;
export type OrderStatusHistory = InferSelectModel<typeof orderStatusHistory>;
export type NewOrderStatusHistory = InferInsertModel<typeof orderStatusHistory>;
export type AdminActionHistory = InferSelectModel<typeof adminActionHistory>;
export type NewAdminActionHistory = InferInsertModel<typeof adminActionHistory>;
export type ImportSession = InferSelectModel<typeof importSessions>;
export type NewImportSession = InferInsertModel<typeof importSessions>;
export type AiUsageEvent = InferSelectModel<typeof aiUsageEvents>;
export type NewAiUsageEvent = InferInsertModel<typeof aiUsageEvents>;
export type AdminSession = InferSelectModel<typeof adminSessions>;
export type NewAdminSession = InferInsertModel<typeof adminSessions>;
export type OnboardingAttempt = InferSelectModel<typeof onboardingAttempts>;
export type NewOnboardingAttempt = InferInsertModel<typeof onboardingAttempts>;
export type MerchantSession = InferSelectModel<typeof merchantSessions>;
export type NewMerchantSession = InferInsertModel<typeof merchantSessions>;
