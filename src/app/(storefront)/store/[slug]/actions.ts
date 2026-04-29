'use server';

/**
 * Storefront 顧客結帳 — Hackathon mock 版
 * 顧客送出表單 → 寫 orders + order_items → 回傳 order id 給 client redirect
 *
 * 顧客身分: email 字串 (不 auth)
 * 金流: 完全 mock，order status 直接設 'paid'
 */
import { resolveStorefrontMeta } from '@/lib/tenant/resolver';
import { withTenantTx } from '@/lib/db/with-tenant';
import { orders, orderItems, products } from '@/db/schema';
import { inArray } from 'drizzle-orm';

export type CheckoutItem = { productId: string; quantity: number };

export type PlaceOrderResult =
  | { success: true; orderId: string }
  | { success: false; error: string };

export async function placeOrderAction(opts: {
  slug: string;
  customerEmail: string;
  items: CheckoutItem[];
}): Promise<PlaceOrderResult> {
  const meta = await resolveStorefrontMeta(opts.slug);
  if (!meta) return { success: false, error: '找不到這家店' };

  if (!opts.customerEmail || !opts.customerEmail.includes('@')) {
    return { success: false, error: 'Email 格式不對' };
  }
  if (opts.items.length === 0) {
    return { success: false, error: '購物車是空的' };
  }

  const productIds = opts.items.map((i) => i.productId);

  try {
    const orderId = await withTenantTx(meta.tenantId, async (tx) => {
      // 撈商品真實價格 (不能信前端傳來的)
      const rows = await tx
        .select({ id: products.id, priceCents: products.priceCents, title: products.title, isPublished: products.isPublished })
        .from(products)
        .where(inArray(products.id, productIds));

      const priceMap = new Map(rows.map((r) => [r.id, r]));
      const validItems = opts.items.filter((i) => {
        const p = priceMap.get(i.productId);
        return p && p.isPublished;
      });

      if (validItems.length === 0) {
        throw new Error('購物車內沒有可購買的商品 (可能已下架)');
      }

      const totalCents = validItems.reduce((sum, i) => {
        const p = priceMap.get(i.productId)!;
        return sum + p.priceCents * i.quantity;
      }, 0);

      // 建 order
      const [insertedOrder] = await tx
        .insert(orders)
        .values({
          tenantId: meta.tenantId,
          customerEmail: opts.customerEmail,
          totalCents,
          status: 'paid', // mock — 假裝信用卡刷過
        })
        .returning({ id: orders.id });

      // 建 order_items
      await tx.insert(orderItems).values(
        validItems.map((i) => ({
          tenantId: meta.tenantId,
          orderId: insertedOrder.id,
          productId: i.productId,
          quantity: i.quantity,
          unitPriceCents: priceMap.get(i.productId)!.priceCents,
        })),
      );

      return insertedOrder.id;
    });

    return { success: true, orderId };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : '結帳失敗' };
  }
}
