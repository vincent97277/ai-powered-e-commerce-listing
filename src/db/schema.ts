/**
 * Drizzle schema — V1 schema (7 張表) (繁中註解)
 * RLS 由 0001_init_rls.sql 負責，本檔只定義結構。
 * tenant_id 欄位 = pool model 多租戶 key，所有 tenant-scoped 表必備。
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
/** 商家 (tenant) 自身 — slug 為 URL 路由 key */
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
    /** V1.7 D1 onboarding hardening — admin approval queue.
     *  approved_at IS NULL = pending approval (storefront blocked, merchant backend banner) */
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    /** admin session id (UUID) | 'legacy' (V1.6 backfill) | 'system' (seed). nullable when pending. */
    approvedByAdmin: text('approved_by_admin'),
    /** V1 商家設定 */
    lowStockThreshold: integer('low_stock_threshold').notNull().default(5),
    dailyAiCostCentsCap: integer('daily_ai_cost_cents_cap').notNull().default(5000),
    /** V1 schema 預埋 (referral V2 才上 UI, 欄位先進來避免未來再 migrate) */
    referralCode: text('referral_code'),
    referredByMerchantId: uuid('referred_by_merchant_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    slugUnique: uniqueIndex('merchants_slug_unique').on(t.slug),
    /** RA8: 用 partial unique index 表達意圖 (multi-NULL OK, non-null 必須 unique) */
    referralCodeUnique: uniqueIndex('merchants_referral_code_uniq')
      .on(t.referralCode)
      .where(sql`${t.referralCode} IS NOT NULL`),
    /** Admin 列停權商家用 */
    suspendedIdx: index('merchants_suspended_idx')
      .on(t.suspendedAt)
      .where(sql`${t.suspendedAt} IS NOT NULL`),
    /** V1.7 D1: admin approval queue 撈 pending merchants */
    pendingApprovalIdx: index('merchants_pending_approval_idx')
      .on(t.createdAt)
      .where(sql`${t.approvedAt} IS NULL`),
  }),
);

/* ─────────────────────────── 2. merchant_users ─────────────────────────── */
/** 商家底下的使用者 (owner / staff) */
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
/** 平台 super admin — 不屬於任何 tenant */
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
/** AI 生成商品 — ai_metadata 對應 §2.2 Zod schema */
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
    /** V1 庫存 (A4) */
    stockQuantity: integer('stock_quantity').notNull().default(0),
    /** V1 needs_review status for AI 失敗 fallback (RA20) */
    productStatus: text('product_status', {
      enum: ['active', 'needs_review', 'archived'],
    })
      .notNull()
      .default('active'),
    isPublished: boolean('is_published').notNull().default(false),
    /** V1 IG/蝦皮 import 來源 (RA18 dedup, A6) */
    importedFromUrl: text('imported_from_url'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    tenantIdx: index('products_tenant_idx').on(t.tenantId),
    tenantCreatedIdx: index('products_tenant_created_idx').on(t.tenantId, t.createdAt),
    /** A5 callout: count low-stock 用 */
    tenantStockIdx: index('products_tenant_stock_idx').on(t.tenantId, t.stockQuantity),
    /** A6 dedup: 同一商家不可 import 同一商品 URL 兩次 (per ENG D3 / final review #9) */
    importDedupUnique: uniqueIndex('products_tenant_import_dedup_unique')
      .on(t.tenantId, t.importedFromUrl)
      .where(sql`${t.importedFromUrl} IS NOT NULL`),
  }),
);

/** §2.2 ai_metadata payload type — Zod 驗證後落盤 (對齊 src/lib/ai/schema.ts) */
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
    /** V1 訂單 detail 顯示用 (#37 enum 擴 + #54 detail page) */
    customerName: text('customer_name'),
    customerPhone: text('customer_phone'),
    customerAddress: text('customer_address'),
    /** 商家私用 */
    internalNote: text('internal_note'),
    totalCents: integer('total_cents').notNull(),
    /** V1 status flow: pending → paid → shipped → completed; 任何 → refunded (dead-end) */
    status: text('status', {
      enum: ['pending', 'paid', 'shipped', 'completed', 'failed', 'refunded'],
    })
      .notNull()
      .default('pending'),
    /** V1 出貨記錄 (#55 status flip 寫入) */
    trackingNumber: text('tracking_number'),
    carrier: text('carrier'),
    ecpayTradeNo: text('ecpay_trade_no'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    tenantIdx: index('orders_tenant_idx').on(t.tenantId),
    ecpayUnique: uniqueIndex('orders_ecpay_trade_no_unique').on(t.ecpayTradeNo),
    /** A5 callout query 加速 (count by status per tenant) */
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
 * 訂單狀態流轉 audit log (V1 #38, ENG D3 決議)
 * RLS via JOIN orders.tenant_id - 不冗餘存 tenant_id 欄位, 永遠跟 orders 對齊不可能 leak
 * RLS policy 在 0002_v1_rls.sql 寫 (USING + WITH CHECK 同條件)
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
/** 綠界 webhook idempotency — (provider, external_id) 防止重複處理 */
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
 * 平台 admin 對商家做的動作 audit log (V1 #39)
 * RLS = DENY ALL TO web_anon (defense-in-depth, RA2). web_admin BYPASSRLS 自動穿透
 * actor 欄位 V1 不存 (single-user 模型, A0 password gate). V2 真 auth 進來時補
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
 * IG/蝦皮 import 進度追蹤 (V1 #40)
 * RLS via JOIN merchants - 不冗餘存 tenant_id (RA18, 跟 order_status_history 同 pattern)
 * RLS policy 在 0002_v1_rls.sql 寫 (USING + WITH CHECK)
 * V1 不寫 cron 清 orphan pending sessions, 7 天後 mark failed 是 V2 工作
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
 * 每次 AI 呼叫的細粒度 token 用量 (V1.5 smoke fix)
 *
 * 為什麼存在 (跟 import_sessions.tokens_in/out 並列):
 *   - import_sessions 只覆蓋 IG/蝦皮 batch import (worker path)
 *   - 同步 photo upload (/api/products/generate) 沒有 import session
 *     → V1.5 之前同步呼叫的 token 用量完全沒落盤, DailyCostChip 永遠 NT$0
 *   - 新表只記錄 sync path; batch import 仍寫 import_sessions
 *   - getDailyCostCents 加總兩張表
 *
 * Append-only audit log: 只 INSERT, 不 UPDATE/DELETE
 * RLS: tenant_id = current_setting('app.tenant_id') (跟 products 同 pattern)
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
    /** 'photo_upload' | 'ig_import' | 'shopee_import' | other (text 不上 enum, V2 可加新 source) */
    source: text('source').notNull(),
    /** V1.5 寫死 gpt-4o-2024-11-20, multi-model V2 才用 */
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
 * 每次 /onboarding POST 寫一行 (含 success / 各種拒絕分支), 用 ip_address + created_at idx
 * 算 1 attempt per IP per 24h. RLS = web_admin only (cross-tenant observability).
 *
 * Append-only log; 不 UPDATE/DELETE.
 */
export const onboardingAttempts = pgTable(
  'onboarding_attempts',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    /** x-forwarded-for first hop (raw text — IPv4 or IPv6, 不 normalize) */
    ipAddress: text('ip_address').notNull(),
    /** 嘗試的 slug — 即使被拒也存, 給 admin 看 abuse pattern */
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
 * 跟 password gate 配合 - HMAC cookie 綁 session.id, revoke = DELETE row
 * 沒 RLS - 純 dbAdmin/web_admin 寫讀
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

/* ─────────────────────────── Relations ─────────────────────────── */
export const merchantsRelations = relations(merchants, ({ many }) => ({
  users: many(merchantUsers),
  products: many(products),
  orders: many(orders),
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
