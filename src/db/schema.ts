/**
 * Drizzle schema — Hackathon 7 張表 (繁中註解)
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
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    slugUnique: uniqueIndex('merchants_slug_unique').on(t.slug),
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
    isPublished: boolean('is_published').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    tenantIdx: index('products_tenant_idx').on(t.tenantId),
    tenantCreatedIdx: index('products_tenant_created_idx').on(t.tenantId, t.createdAt),
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
    totalCents: integer('total_cents').notNull(),
    status: text('status', {
      enum: ['pending', 'paid', 'failed', 'refunded'],
    })
      .notNull()
      .default('pending'),
    ecpayTradeNo: text('ecpay_trade_no'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    tenantIdx: index('orders_tenant_idx').on(t.tenantId),
    ecpayUnique: uniqueIndex('orders_ecpay_trade_no_unique').on(t.ecpayTradeNo),
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

/* ─────────────────────────── 7. payment_webhooks ─────────────────────────── */
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
