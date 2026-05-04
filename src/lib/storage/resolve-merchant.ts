/**
 * V2 task 105: cookie → merchant 解析 (per-merchant auth)
 *
 * 行為:
 *   1. 讀 merchant-session cookie
 *   2. validateMerchantSession() — HMAC + DB liveness + revoked + expires 全 check
 *   3. 從 merchants 表撈完整 row (suspended/approved 也擋 — 帳號狀態不對 force re-login)
 *   4. 任何失敗 → redirect('/merchant/login?next=/merchant')
 *
 * 為什麼 redirect 不 throw:
 *   - 全部 caller 都在 server component / server action / route handler context, 都允許 redirect()
 *   - 中央化 401 處理避免每個 caller 重寫 try/catch
 *   - middleware (Edge runtime) 已先擋一輪 HMAC, 這層是 layout-level "E11 defense-in-depth"
 *     再加 DB row liveness + suspended/approved 狀態 (middleware 拿不到 DB).
 *
 * V1.7 D1 的 hardcoded 'akami'/'afen' slug fallback + DEMO_MERCHANTS dict 已移除 —
 * V2 per-merchant auth 不再需要 demo merchants 的 slug-cookie path. demo seed 用
 * 真 email/password 登入 (scripts/seed-merchants.ts).
 */
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { dbAdmin } from '@/db/admin-only';
import { merchants } from '@/db/schema';
import { MERCHANT_SESSION_COOKIE, validateMerchantSession } from '@/lib/merchant-session';

export type ResolvedMerchant = {
  tenantId: string;
  slug: string;
  name: string;
  brandVoice: string;
};

/**
 * 解析當前登入 merchant 完整資訊. 任何 auth/狀態問題 → redirect 到 /merchant/login.
 * Caller 不需 try/catch — redirect() 在 Next.js 內部用 throw 短路, RSC 引擎自動處理.
 */
export async function resolveMerchantFromCookie(): Promise<ResolvedMerchant> {
  const c = await cookies();
  const cookieValue = c.get(MERCHANT_SESSION_COOKIE)?.value;

  const session = await validateMerchantSession(cookieValue);
  if (!session) {
    redirect('/merchant/login?next=/merchant');
  }

  const [m] = await dbAdmin
    .select({
      id: merchants.id,
      slug: merchants.slug,
      name: merchants.name,
      brandVoice: merchants.brandVoice,
      suspendedAt: merchants.suspendedAt,
      approvedAt: merchants.approvedAt,
    })
    .from(merchants)
    .where(eq(merchants.id, session.merchantId))
    .limit(1);

  // Merchant 被刪 / 帳號狀態不對 → force re-login.
  // 注意: suspended_at != null 代表「已停權」, 但商家仍可看自己後台 (in-flight 訂單必須處理),
  // 所以這裡 NOT 擋 suspended — layout banner 會顯示警告, 個別 write action 會 assertNotSuspended.
  // 真正擋的只有: row 不存在 (被 admin 刪) + 還在等審核 (approved_at IS NULL).
  if (!m) {
    redirect('/merchant/login?next=/merchant');
  }
  if (m.approvedAt === null) {
    // 還沒被 admin 核可 — 不能進 dashboard. /merchant/login server action 會在登入時擋,
    // 但若 merchant 在 active session 期間被取消核可, 此處兜底.
    redirect('/merchant/login?next=/merchant');
  }

  return {
    tenantId: m.id,
    slug: m.slug,
    name: m.name,
    brandVoice: m.brandVoice ?? '',
  };
}
