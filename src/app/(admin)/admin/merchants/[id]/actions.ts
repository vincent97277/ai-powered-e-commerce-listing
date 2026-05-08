'use server';

/**
 * Admin actions: suspend / activate / rename_slug (V1 #51, RA19)
 *                approve_merchant (V1.7 D1)
 * All wrap update + audit insert in dbAdmin.transaction (atomic)
 * Failure → returns {error}, UI toast
 */
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { dbAdmin } from '@/db/admin-only';
import { merchants, adminActionHistory } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';
import { invalidateSlug } from '@/lib/tenant/resolver';
import {
  ADMIN_SESSION_COOKIE,
  validateAdminSession,
} from '@/lib/admin-session';

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

/**
 * V1.7 D1: Approve merchant — set approved_at = now() + log adminActionHistory.
 * Only operates if approvedAt IS NULL (idempotent guard).
 *
 * adminSessionId is extracted from the admin-session cookie (middleware/layout already verified
 * the cookie signature + DB row exists; we re-validate here to defend against an attacker grabbing
 * an old cookie in the gap between layout cache invalidation and this action).
 */
export async function approveMerchant(merchantId: string): Promise<ActionResult> {
  // Second admin session validation — defense in depth
  const c = await cookies();
  const cookieValue = c.get(ADMIN_SESSION_COOKIE)?.value;
  const adminSessionId = await validateAdminSession(cookieValue);
  if (!adminSessionId) {
    return { error: '無效的 admin session, 請重新登入' };
  }

  let merchantSlug: string | undefined;
  try {
    await dbAdmin.transaction(async (tx) => {
      const [m] = await tx
        .select({
          id: merchants.id,
          slug: merchants.slug,
          approvedAt: merchants.approvedAt,
        })
        .from(merchants)
        .where(eq(merchants.id, merchantId))
        .limit(1);
      if (!m) throw new Error('商家不存在');
      if (m.approvedAt) throw new Error('商家已核可');
      merchantSlug = m.slug;

      await tx
        .update(merchants)
        .set({
          approvedAt: new Date(),
          approvedByAdmin: adminSessionId,
          updatedAt: new Date(),
        })
        .where(eq(merchants.id, merchantId));

      await tx.insert(adminActionHistory).values({
        targetMerchantId: merchantId,
        action: 'approve_merchant',
        payload: { adminSessionId },
      });
    });

    if (merchantSlug) {
      // Now publicly visible — flush slug cache + storefront page
      invalidateSlug(merchantSlug, merchantSlug);
      revalidatePath(`/store/${merchantSlug}`);
    }
    revalidatePath(`/admin/merchants/${merchantId}`);
    revalidatePath('/admin');
    revalidatePath('/admin/queue');
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : '核可失敗' };
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

      // collision check: new slug must not match any merchant's slug or previousSlug
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
          previousSlug: m.slug, // 1 level of history
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
