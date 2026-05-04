'use server';

import { revalidatePath } from 'next/cache';
import { dbAdmin } from '@/db/admin-only';
import { merchants } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { resolveMerchantFromCookie } from '@/lib/storage/resolve-merchant';
import { invalidateSlug } from '@/lib/tenant/resolver';
import { assertNotSuspended } from '@/lib/merchant/suspend-guard';

const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/;

export type UpdateMerchantPatch = {
  name?: string;
  slug?: string;
  brandVoice?: string;
  themeVars?: Record<string, string>;
  /** V1 #71 */
  lowStockThreshold?: number;
  dailyAiCostCentsCap?: number;
};

export async function updateMerchantAction(
  patch: UpdateMerchantPatch,
): Promise<{ success: boolean; error?: string; newSlug?: string }> {
  try {
    const current = await resolveMerchantFromCookie();

    // V1 #53: 停權商家不可改設定
    try {
      await assertNotSuspended(current.tenantId);
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : '停權中' };
    }

    // Validate
    if (patch.name !== undefined && (patch.name.length < 1 || patch.name.length > 60)) {
      return { success: false, error: '店名 1-60 字' };
    }
    if (patch.slug !== undefined) {
      const slug = patch.slug.trim().toLowerCase();
      if (!SLUG_REGEX.test(slug)) {
        return { success: false, error: 'slug 必須 3-32 字, 小寫英數加橫線' };
      }
      patch.slug = slug;
    }
    if (patch.brandVoice !== undefined && patch.brandVoice.length > 200) {
      return { success: false, error: '品牌語氣最多 200 字' };
    }
    if (
      patch.lowStockThreshold !== undefined &&
      (patch.lowStockThreshold < 0 || patch.lowStockThreshold > 10000)
    ) {
      return { success: false, error: '低庫存閾值需 0-10000 之間' };
    }
    if (
      patch.dailyAiCostCentsCap !== undefined &&
      (patch.dailyAiCostCentsCap < 10000 || patch.dailyAiCostCentsCap > 10_000_000)
    ) {
      return { success: false, error: 'AI 成本上限需 NT$ 100-100,000 之間 (cents)' };
    }

    const oldSlug = current.slug;
    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.name !== undefined) update.name = patch.name;
    if (patch.slug !== undefined) update.slug = patch.slug;
    if (patch.brandVoice !== undefined) update.brandVoice = patch.brandVoice;
    if (patch.themeVars !== undefined) update.themeVars = patch.themeVars;
    if (patch.lowStockThreshold !== undefined) update.lowStockThreshold = patch.lowStockThreshold;
    if (patch.dailyAiCostCentsCap !== undefined) update.dailyAiCostCentsCap = patch.dailyAiCostCentsCap;

    try {
      await dbAdmin
        .update(merchants)
        .set(update)
        .where(eq(merchants.id, current.tenantId));
    } catch (err) {
      if (err instanceof Error && err.message.includes('duplicate')) {
        return { success: false, error: `slug 「${patch.slug}」已被使用` };
      }
      throw err;
    }

    // 失效 cache: 舊 slug 跟新 slug 都要 invalidate
    if (patch.slug && patch.slug !== oldSlug) {
      invalidateSlug(oldSlug, patch.slug);
    }

    revalidatePath('/merchant');
    revalidatePath('/merchant/settings');
    revalidatePath(`/store/${oldSlug}`);
    if (patch.slug) revalidatePath(`/store/${patch.slug}`);

    return { success: true, newSlug: patch.slug };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : '更新失敗',
    };
  }
}
