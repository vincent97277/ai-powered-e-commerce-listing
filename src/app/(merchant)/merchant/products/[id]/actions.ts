'use server';

/**
 * 商家商品 CRUD server actions
 */
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { withTenantTx } from '@/lib/db/with-tenant';
import { products, type ProductAiMetadata } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { resolveMerchantFromCookie } from '@/lib/storage/resolve-merchant';
import { assertNotSuspended } from '@/lib/merchant/suspend-guard';

async function resolveTenantIdFromCookie(): Promise<string> {
  const c = await cookies();
  const m = await resolveMerchantFromCookie(c.get('demo-merchant-id')?.value);
  return m.tenantId;
}

/** V1 #53: 商家被平台停權時所有 write 拒絕 (但容許 togglePublish 為 false 也擋住, 不能下架後再上架) */
async function resolveTenantAndCheckSuspend(): Promise<string> {
  const tenantId = await resolveTenantIdFromCookie();
  await assertNotSuspended(tenantId);
  return tenantId;
}

/** 上架 / 下架 */
export async function togglePublishAction(productId: string, publish: boolean): Promise<{ success: boolean; error?: string }> {
  try {
    const tenantId = await resolveTenantAndCheckSuspend();
    await withTenantTx(tenantId, async (tx) => {
      await tx.update(products).set({ isPublished: publish }).where(eq(products.id, productId));
    });
    revalidatePath(`/merchant/products/${productId}`);
    revalidatePath('/merchant/products');
    revalidatePath('/merchant');
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : '操作失敗' };
  }
}

/** 編輯商品 (商家手動微調 AI 結果) */
export async function updateProductAction(
  productId: string,
  patch: { title?: string; description?: string; priceCents?: number; stockQuantity?: number },
): Promise<{ success: boolean; error?: string }> {
  try {
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

    const tenantId = await resolveTenantAndCheckSuspend();
    await withTenantTx(tenantId, async (tx) => {
      const update: Record<string, unknown> = { updatedAt: new Date() };
      if (patch.title !== undefined) update.title = patch.title;
      if (patch.description !== undefined) update.description = patch.description;
      if (patch.priceCents !== undefined) update.priceCents = patch.priceCents;
      if (patch.stockQuantity !== undefined) update.stockQuantity = patch.stockQuantity;
      await tx.update(products).set(update).where(eq(products.id, productId));
    });

    revalidatePath(`/merchant/products/${productId}`);
    revalidatePath('/merchant/products');
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : '更新失敗' };
  }
}

/** 刪除商品 */
export async function deleteProductAction(productId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const tenantId = await resolveTenantAndCheckSuspend();
    await withTenantTx(tenantId, async (tx) => {
      await tx.delete(products).where(eq(products.id, productId));
    });
    revalidatePath('/merchant/products');
    revalidatePath('/merchant');
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : '刪除失敗' };
  }
  redirect('/merchant/products');
}

/** Seed 假資料供新商家快速體驗 */
export async function seedDemoProductAction(opts: { fixtureSlug: 'teacup' | 'phonecase' | 'sauce' }): Promise<{ success: boolean; productId?: string; error?: string }> {
  try {
    const tenantId = await resolveTenantAndCheckSuspend();
    const fixtureRes = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/fixtures/products/${opts.fixtureSlug}.json`,
    );
    const fixture = await fixtureRes.json();

    const productId = await withTenantTx(tenantId, async (tx) => {
      const [inserted] = await tx
        .insert(products)
        .values({
          tenantId,
          title: fixture.title,
          description: fixture.description,
          r2Key: `${tenantId}/fixtures/${opts.fixtureSlug}.png`,
          priceCents: fixture.price_twd.min * 100,
          isPublished: false,
          aiMetadata: { ...fixture, status: 'success' } satisfies ProductAiMetadata,
        })
        .returning({ id: products.id });
      return inserted.id;
    });

    revalidatePath('/merchant/products');
    revalidatePath('/merchant');
    return { success: true, productId };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Seed 失敗' };
  }
}
