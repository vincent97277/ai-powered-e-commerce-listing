'use server';

/**
 * 商家上架/下架 server action
 */
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { withTenantTx } from '@/lib/db/with-tenant';
import { products } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { DEMO_MERCHANT_COOKIE, getMerchantFromCookie } from '@/lib/storage/demo-merchants';
import { dbAdmin } from '@/db/admin-only';
import { merchants } from '@/db/schema';

async function resolveTenantIdFromCookie(): Promise<string> {
  const c = await cookies();
  const cookieValue = c.get(DEMO_MERCHANT_COOKIE)?.value;

  // 若 cookie 是 hardcode demo merchant slug (akami / afen)，走 demo-merchants map
  if (cookieValue === 'akami' || cookieValue === 'afen') {
    return getMerchantFromCookie(cookieValue).tenantId;
  }

  // 否則 cookie 直接是 tenant uuid (來自 onboarding)
  if (cookieValue && /^[0-9a-f-]{36}$/i.test(cookieValue)) {
    // verify exists
    const [m] = await dbAdmin
      .select({ id: merchants.id })
      .from(merchants)
      .where(eq(merchants.id, cookieValue))
      .limit(1);
    if (m) return m.id;
  }

  // fallback to akami
  return getMerchantFromCookie('akami').tenantId;
}

export async function togglePublishAction(productId: string, publish: boolean): Promise<{ success: boolean; error?: string }> {
  try {
    const tenantId = await resolveTenantIdFromCookie();
    await withTenantTx(tenantId, async (tx) => {
      await tx
        .update(products)
        .set({ isPublished: publish })
        .where(eq(products.id, productId));
    });
    revalidatePath(`/merchant/products/${productId}`);
    revalidatePath('/merchant');
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : '操作失敗' };
  }
}

/** 給 demo seed 用 — 拿 demo product 假資料寫進去，這樣商家剛 onboarding 也有東西可以 publish */
export async function seedDemoProductAction(opts: { fixtureSlug: 'teacup' | 'phonecase' | 'sauce' }): Promise<{ success: boolean; productId?: string; error?: string }> {
  try {
    const tenantId = await resolveTenantIdFromCookie();
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
          aiMetadata: { ...fixture, status: 'success' },
        })
        .returning({ id: products.id });
      return inserted.id;
    });

    revalidatePath('/merchant');
    return { success: true, productId };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Seed 失敗' };
  }
}
