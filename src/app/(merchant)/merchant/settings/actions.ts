'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { dbAdmin } from '@/db/admin-only';
import { merchants } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { resolveMerchantFromCookie } from '@/lib/storage/resolve-merchant';
import { invalidateSlug } from '@/lib/tenant/resolver';

const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/;

export type UpdateMerchantPatch = {
  name?: string;
  slug?: string;
  brandVoice?: string;
  themeVars?: Record<string, string>;
};

export async function updateMerchantAction(
  patch: UpdateMerchantPatch,
): Promise<{ success: boolean; error?: string; newSlug?: string }> {
  try {
    const c = await cookies();
    const current = await resolveMerchantFromCookie(c.get('demo-merchant-id')?.value);

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

    const oldSlug = current.slug;
    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.name !== undefined) update.name = patch.name;
    if (patch.slug !== undefined) update.slug = patch.slug;
    if (patch.brandVoice !== undefined) update.brandVoice = patch.brandVoice;
    if (patch.themeVars !== undefined) update.themeVars = patch.themeVars;

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
