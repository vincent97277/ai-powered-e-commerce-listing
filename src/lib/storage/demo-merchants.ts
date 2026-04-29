/**
 * Demo Merchants — V1 用的 hardcode tenant mapping。
 *
 * 為什麼: Auth.js 在 1-day build 完整接會吃太多時間，
 * 我們改用 cookie `demo-merchant-id` 直接帶 slug，server 端 map 回 tenant uuid。
 *
 * 上線前必須:
 *  - 換成 Auth.js + DB 查詢
 *  - 移除 hardcode
 *  - tenantId 改從 session 拿
 */

export type DemoMerchantSlug = 'akami' | 'afen';

export interface DemoMerchant {
  tenantId: string;
  slug: DemoMerchantSlug;
  name: string;
  /** 同個 tenant 下的 merchant id (Drizzle merchants.id)，V1 一對一 */
  merchantId: string;
}

export const DEMO_MERCHANTS: Record<DemoMerchantSlug, DemoMerchant> = {
  akami: {
    tenantId: '11111111-1111-1111-1111-111111111111',
    slug: 'akami',
    name: '阿明選物',
    merchantId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  },
  afen: {
    tenantId: '22222222-2222-2222-2222-222222222222',
    slug: 'afen',
    name: '阿芬鹹酥雞',
    merchantId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  },
};

/**
 * 從 cookie value 取出 merchant，認不出來就 fallback 到 akami。
 * 不丟錯，因為 V1 demo 流暢度比 strict 重要。
 */
export function getMerchantFromCookie(
  cookieValue: string | undefined,
): DemoMerchant {
  return (
    DEMO_MERCHANTS[cookieValue as DemoMerchantSlug] ?? DEMO_MERCHANTS.akami
  );
}

/** Cookie key 統一在這裡，前後端共用 */
export const DEMO_MERCHANT_COOKIE = 'demo-merchant-id';
