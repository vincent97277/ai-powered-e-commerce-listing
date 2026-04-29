'use server';

/**
 * Admin actions: suspend / activate / rename_slug (V1 #51, RA19)
 * 全部 dbAdmin.transaction 包 update + audit insert (atomic)
 * 失敗 → returning {error}, UI toast
 */
import { revalidatePath } from 'next/cache';
import { dbAdmin } from '@/db/admin-only';
import { merchants, adminActionHistory } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
import { invalidateSlug } from '@/lib/tenant/resolver';

const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/;

type ActionResult = { error?: string };

export async function suspendMerchant(
  merchantId: string,
  reason: string,
): Promise<ActionResult> {
  if (!reason || reason.length > 500) {
    return { error: '原因 1-500 字' };
  }
  let merchantSlug: string | undefined;
  try {
    await dbAdmin.transaction(async (tx) => {
      const [m] = await tx
        .select({ id: merchants.id, slug: merchants.slug, suspendedAt: merchants.suspendedAt })
        .from(merchants)
        .where(eq(merchants.id, merchantId))
        .limit(1);
      if (!m) throw new Error('商家不存在');
      if (m.suspendedAt) throw new Error('商家已停權');
      merchantSlug = m.slug;

      await tx
        .update(merchants)
        .set({
          suspendedAt: new Date(),
          suspendedReason: reason,
          updatedAt: new Date(),
        })
        .where(eq(merchants.id, merchantId));

      await tx.insert(adminActionHistory).values({
        targetMerchantId: merchantId,
        action: 'suspend',
        payload: { reason },
      });
    });

    if (merchantSlug) {
      invalidateSlug(merchantSlug, merchantSlug); // refresh cache
      revalidatePath(`/store/${merchantSlug}`);
    }
    revalidatePath(`/admin/merchants/${merchantId}`);
    revalidatePath('/admin');
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : '停權失敗' };
  }
}

export async function activateMerchant(merchantId: string): Promise<ActionResult> {
  let merchantSlug: string | undefined;
  try {
    await dbAdmin.transaction(async (tx) => {
      const [m] = await tx
        .select({ id: merchants.id, slug: merchants.slug, suspendedAt: merchants.suspendedAt })
        .from(merchants)
        .where(eq(merchants.id, merchantId))
        .limit(1);
      if (!m) throw new Error('商家不存在');
      if (!m.suspendedAt) throw new Error('商家未停權');
      merchantSlug = m.slug;

      await tx
        .update(merchants)
        .set({
          suspendedAt: null,
          suspendedReason: null,
          updatedAt: new Date(),
        })
        .where(eq(merchants.id, merchantId));

      await tx.insert(adminActionHistory).values({
        targetMerchantId: merchantId,
        action: 'activate',
        payload: {},
      });
    });

    if (merchantSlug) {
      invalidateSlug(merchantSlug, merchantSlug);
      revalidatePath(`/store/${merchantSlug}`);
    }
    revalidatePath(`/admin/merchants/${merchantId}`);
    revalidatePath('/admin');
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : '啟用失敗' };
  }
}

export async function renameSlug(
  merchantId: string,
  newSlug: string,
): Promise<ActionResult> {
  const slug = newSlug.trim().toLowerCase();
  if (!SLUG_REGEX.test(slug)) {
    return { error: 'slug 格式錯 (3-32 字, 小寫英數加橫線)' };
  }

  let oldSlug: string | undefined;
  try {
    await dbAdmin.transaction(async (tx) => {
      const [m] = await tx
        .select({
          id: merchants.id,
          slug: merchants.slug,
          previousSlug: merchants.previousSlug,
        })
        .from(merchants)
        .where(eq(merchants.id, merchantId))
        .limit(1);
      if (!m) throw new Error('商家不存在');
      oldSlug = m.slug;
      if (slug === m.slug) throw new Error('新 slug 跟現在的一樣');

      // collision check: 新 slug 不能 match 任何商家的 slug 或 previousSlug
      const [existing] = await tx
        .select({ id: merchants.id })
        .from(merchants)
        .where(
          sql`(${merchants.slug} = ${slug} OR ${merchants.previousSlug} = ${slug}) AND ${merchants.id} != ${merchantId}`,
        )
        .limit(1);
      if (existing) throw new Error(`slug 「${slug}」已被使用 (含歷史 slug)`);

      await tx
        .update(merchants)
        .set({
          slug,
          previousSlug: m.slug, // 1 層 history
          updatedAt: new Date(),
        })
        .where(eq(merchants.id, merchantId));

      await tx.insert(adminActionHistory).values({
        targetMerchantId: merchantId,
        action: 'rename_slug',
        payload: { oldSlug: m.slug, newSlug: slug },
      });
    });

    if (oldSlug) {
      invalidateSlug(oldSlug, slug);
      revalidatePath(`/store/${oldSlug}`);
    }
    revalidatePath(`/store/${slug}`);
    revalidatePath(`/admin/merchants/${merchantId}`);
    revalidatePath('/admin');
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : '改名失敗' };
  }
}
