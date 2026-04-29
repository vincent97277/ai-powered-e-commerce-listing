/**
 * 共用的 cookie → merchant 解析 (async, 支援 UUID + DB 查詢)
 *
 * Cookie 值有 3 種可能:
 *   1. 'akami' / 'afen' — hardcoded demo merchants
 *   2. UUID 格式 — onboarding 後產生的新 merchant
 *   3. 沒設 / 不認識 — fallback 到第一個 demo merchant (akami)
 */
import { dbAdmin } from '@/db/admin-only';
import { merchants } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { DEMO_MERCHANTS } from './demo-merchants';

export type ResolvedMerchant = {
  tenantId: string;
  slug: string;
  name: string;
  brandVoice: string;
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 從 cookie 解析當前 merchant 完整資訊
 * 永遠回傳一個有效 merchant (worst case fallback 到 akami)
 */
export async function resolveMerchantFromCookie(
  cookieValue?: string,
): Promise<ResolvedMerchant> {
  // Path 1: hardcoded slug
  if (cookieValue === 'akami' || cookieValue === 'afen') {
    const m = DEMO_MERCHANTS[cookieValue];
    // 從 DB 補 brand_voice (DEMO_MERCHANTS 沒存)
    const [row] = await dbAdmin
      .select({ brandVoice: merchants.brandVoice })
      .from(merchants)
      .where(eq(merchants.id, m.tenantId))
      .limit(1);
    return {
      tenantId: m.tenantId,
      slug: m.slug,
      name: m.name,
      brandVoice: row?.brandVoice ?? '',
    };
  }

  // Path 2: UUID — DB 查
  if (cookieValue && UUID_REGEX.test(cookieValue)) {
    const [row] = await dbAdmin
      .select({
        id: merchants.id,
        slug: merchants.slug,
        name: merchants.name,
        brandVoice: merchants.brandVoice,
      })
      .from(merchants)
      .where(eq(merchants.id, cookieValue))
      .limit(1);
    if (row) {
      return {
        tenantId: row.id,
        slug: row.slug,
        name: row.name,
        brandVoice: row.brandVoice ?? '',
      };
    }
  }

  // Path 3: fallback to akami
  const akami = DEMO_MERCHANTS.akami;
  const [row] = await dbAdmin
    .select({ brandVoice: merchants.brandVoice })
    .from(merchants)
    .where(eq(merchants.id, akami.tenantId))
    .limit(1);
  return {
    tenantId: akami.tenantId,
    slug: akami.slug,
    name: akami.name,
    brandVoice: row?.brandVoice ?? '',
  };
}
