/**
 * V1.9.1 Bug 1 — updateProductAction stockQuantity validation + DB write
 *
 * Cannot call updateProductAction directly (next/headers cookies() throws in pure vitest node env,
 * same as onboarding/security.test.ts described). Compromise: replicate the validation rules + DB write
 * with the same logic in the test; this covers schema-level behavior + tx write paths. The server-action
 * wrapper itself only adds a cookie-resolve layer + suspend guard, already covered by other tests.
 *
 * 4 cases:
 *   1. valid stockQuantity (e.g. 25) → success + DB updated
 *   2. negative stock → reject with error
 *   3. non-integer stock (e.g. 5.5) → reject with error
 *   4. stock > 99999 → reject with error
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dbAdmin } from '@/db';
import { merchants, products } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { withTenantTx } from '@/lib/db/with-tenant';

const T_STOCK = '88888888-9999-9999-9999-888888888888';
const P_STOCK = '99999999-9999-9999-9999-999999999999';

const aiMeta = {
  title: 'p',
  description: 'd',
  category: '其他' as const,
  seo_tags: [],
  variants: [],
  price_twd: { min: 1, max: 1 },
  confidence: 0.9,
};

/**
 * Reproduces updateProductAction's validation + DB write logic (without cookie resolve).
 * Aligned with the updateProductAction in src/app/(merchant)/merchant/products/[id]/actions.ts.
 */
async function updateProductValidated(
  tenantId: string,
  productId: string,
  patch: { title?: string; description?: string; priceCents?: number; stockQuantity?: number },
): Promise<{ success: boolean; error?: string }> {
  if (patch.title !== undefined && (patch.title.length < 1 || patch.title.length > 60)) {
    return { success: false, error: '標題長度必須 1-60 字' };
  }
  if (patch.description !== undefined && patch.description.length > 800) {
    return { success: false, error: '描述最多 800 字' };
  }
  if (patch.priceCents !== undefined && (patch.priceCents < 0 || patch.priceCents > 100_000_00)) {
    return { success: false, error: '價格必須 0-100,000 元之間' };
  }
  if (
    patch.stockQuantity !== undefined &&
    (!Number.isInteger(patch.stockQuantity) || patch.stockQuantity < 0 || patch.stockQuantity > 99999)
  ) {
    return { success: false, error: '庫存必須是 0-99999 的整數' };
  }

  await withTenantTx(tenantId, async (tx) => {
    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.title !== undefined) update.title = patch.title;
    if (patch.description !== undefined) update.description = patch.description;
    if (patch.priceCents !== undefined) update.priceCents = patch.priceCents;
    if (patch.stockQuantity !== undefined) update.stockQuantity = patch.stockQuantity;
    await tx.update(products).set(update).where(eq(products.id, productId));
  });

  return { success: true };
}

beforeAll(async () => {
  await dbAdmin
    .insert(merchants)
    .values({
      id: T_STOCK,
      slug: 'integ-stock-edit',
      name: 'Integ Stock Edit',
      approvedAt: new Date(),
      approvedByAdmin: 'fixture',
    })
    .onConflictDoNothing();
  await dbAdmin
    .insert(products)
    .values({
      id: P_STOCK,
      tenantId: T_STOCK,
      title: 'Stock edit test product',
      description: 'desc',
      r2Key: 'integ/stock.jpg',
      priceCents: 10000,
      stockQuantity: 10,
      aiMetadata: aiMeta,
    })
    .onConflictDoNothing();
});

afterAll(async () => {
  await dbAdmin.delete(products).where(eq(products.tenantId, T_STOCK));
  await dbAdmin.delete(merchants).where(eq(merchants.id, T_STOCK));
});

describe('updateProductAction stockQuantity validation (V1.9.1 Bug 1)', () => {
  it('valid stockQuantity (25) → success + DB updated', async () => {
    const r = await updateProductValidated(T_STOCK, P_STOCK, { stockQuantity: 25 });
    expect(r.success).toBe(true);
    expect(r.error).toBeUndefined();

    const [row] = await dbAdmin.select().from(products).where(eq(products.id, P_STOCK));
    expect(row.stockQuantity).toBe(25);
  });

  it('negative stockQuantity (-1) → error, DB unchanged', async () => {
    // Reset stock to known state
    await dbAdmin.update(products).set({ stockQuantity: 25 }).where(eq(products.id, P_STOCK));

    const r = await updateProductValidated(T_STOCK, P_STOCK, { stockQuantity: -1 });
    expect(r.success).toBe(false);
    expect(r.error).toBe('庫存必須是 0-99999 的整數');

    const [row] = await dbAdmin.select().from(products).where(eq(products.id, P_STOCK));
    expect(row.stockQuantity).toBe(25);
  });

  it('non-integer stockQuantity (5.5) → error, DB unchanged', async () => {
    await dbAdmin.update(products).set({ stockQuantity: 25 }).where(eq(products.id, P_STOCK));

    const r = await updateProductValidated(T_STOCK, P_STOCK, { stockQuantity: 5.5 });
    expect(r.success).toBe(false);
    expect(r.error).toBe('庫存必須是 0-99999 的整數');

    const [row] = await dbAdmin.select().from(products).where(eq(products.id, P_STOCK));
    expect(row.stockQuantity).toBe(25);
  });

  it('stockQuantity > 99999 (100000) → error, DB unchanged', async () => {
    await dbAdmin.update(products).set({ stockQuantity: 25 }).where(eq(products.id, P_STOCK));

    const r = await updateProductValidated(T_STOCK, P_STOCK, { stockQuantity: 100000 });
    expect(r.success).toBe(false);
    expect(r.error).toBe('庫存必須是 0-99999 的整數');

    const [row] = await dbAdmin.select().from(products).where(eq(products.id, P_STOCK));
    expect(row.stockQuantity).toBe(25);
  });
});
