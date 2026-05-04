/**
 * 商家後台 layout (V2 task 105)
 *
 * Per-merchant auth: 一次只進一家店. 從 merchant-session cookie 解出當前 merchant,
 * ThemeProvider 只收這一家的 themeVars (不再撈 top 10, 沒有 switcher 概念).
 *
 * Auth flow:
 *   1. middleware 已驗 HMAC (Edge runtime)
 *   2. 這裡 validateMerchantSession() 做 DB row liveness + revoked + expires (E11 defense-in-depth)
 *   3. session 失效 → redirect /merchant/login (跟 resolveMerchantFromCookie 同步進)
 *   4. row 撈到 → render header + banner (suspended / pending approval)
 *
 * 注意: 不能直接呼叫 resolveMerchantFromCookie() 因為這裡需要 themeVars + suspended/pending
 *      狀態, 所以重複一次 query (cheap, 同 DB row, 一次 round trip).
 */
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { dbAdmin } from '@/db/admin-only';
import { merchants as merchantsTable } from '@/db/schema';
import { ThemeProvider, type MerchantInfo } from '@/components/theme/ThemeProvider';
import { DemoModeToggle } from '@/components/demo/DemoModeToggle';
import { RainbowLogo } from '@/components/demo/RainbowLogo';
import { MERCHANT_SESSION_COOKIE, validateMerchantSession } from '@/lib/merchant-session';

export const dynamic = 'force-dynamic';

const TAGLINE_MAP: Record<string, string> = {
  akami: '永康街選物店 · 質感日系',
  afen: '夜市第三攤 · 限時搶購',
};

const EMOJI_MAP: Record<string, string> = {
  akami: '🍵',
  afen: '🍗',
};

export default async function MerchantLayout({ children }: { children: React.ReactNode }) {
  const c = await cookies();
  const cookieValue = c.get(MERCHANT_SESSION_COOKIE)?.value;

  const session = await validateMerchantSession(cookieValue);
  if (!session) {
    redirect('/merchant/login?next=/merchant');
  }

  // 撈當前 merchant 完整 row (theme + banner state). 一次 query 夠.
  const [currentRow] = await dbAdmin
    .select({
      id: merchantsTable.id,
      slug: merchantsTable.slug,
      name: merchantsTable.name,
      themeVars: merchantsTable.themeVars,
      suspendedAt: merchantsTable.suspendedAt,
      suspendedReason: merchantsTable.suspendedReason,
      approvedAt: merchantsTable.approvedAt,
    })
    .from(merchantsTable)
    .where(eq(merchantsTable.id, session.merchantId))
    .limit(1);

  // Row 被刪 (admin 操作 / 資料漂移) → force re-login.
  if (!currentRow) {
    redirect('/merchant/login?next=/merchant');
  }

  const currentMerchant: MerchantInfo = {
    id: currentRow.id,
    slug: currentRow.slug,
    name: currentRow.name,
    emoji: EMOJI_MAP[currentRow.slug],
    tagline: TAGLINE_MAP[currentRow.slug],
    themeVars: (currentRow.themeVars ?? {}) as Record<string, string>,
  };

  const isSuspended = currentRow.suspendedAt != null;
  const suspendedReason = currentRow.suspendedReason ?? null;
  // approved_at IS NULL → 還在等 admin 核可. 注意 resolveMerchantFromCookie 會 redirect 掉
  // pending merchant; 但 layout 比 resolveMerchantFromCookie 早跑, banner 可能短暫顯示 — 無傷.
  const isPendingApproval = currentRow.approvedAt == null;
  const currentName = currentRow.name;

  /**
   * V2.1.x FOUC fix: server-render an inline <style> with merchant themeVars
   * so first paint already has correct colors. ThemeProvider's useEffect still
   * runs as fallback for client-side state changes (preset dropdown, etc.).
   */
  const themeCssText = Object.entries(currentMerchant.themeVars)
    .map(([k, v]) => `${k}: ${v};`)
    .join(' ');

  return (
    <ThemeProvider merchants={[currentMerchant]} initialMerchantId={currentRow.id}>
      <style dangerouslySetInnerHTML={{ __html: `:root { ${themeCssText} }` }} />
      {isPendingApproval && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:px-8 lg:px-12">
          <strong>您的帳號正在等待 admin 審核</strong>
          <span className="ml-2 text-xs text-amber-700">
            (儲存的設定不會 lost; 對外 storefront 暫不開放, admin 核可後即可上架商品)
          </span>
        </div>
      )}
      {isSuspended && (
        <div className="border-b border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 sm:px-8 lg:px-12">
          <strong>你的商家已被平台暫停營業</strong>
          {suspendedReason && <span> — {suspendedReason}</span>}
          <span className="ml-2 text-xs text-red-600">
            (in-flight 訂單仍可處理, 但無法上架商品 / 改設定)
          </span>
        </div>
      )}
      <header
        className="flex items-center justify-between gap-3 border-b px-4 py-4 sm:px-8 lg:px-12"
        style={{
          backgroundColor: 'var(--brand-bg)',
          borderColor: 'color-mix(in srgb, var(--brand-primary) 20%, transparent)',
        }}
      >
        <RainbowLogo>
          <div
            style={{ fontFamily: 'var(--brand-font-heading)', color: 'var(--brand-primary)' }}
            className="text-xl"
          >
            Catalogify
          </div>
        </RainbowLogo>
        {/*
          V2 task 105 — 沒有 MerchantSwitcher. Per-merchant auth = 一次只進一家店.
          header 只顯示當前商家名 + 登出按鈕. form POST → /merchant/logout 純 server-rendered.
        */}
        <div className="flex items-center gap-3">
          <span
            className="text-sm font-semibold"
            style={{
              fontFamily: 'var(--brand-font-heading)',
              color: 'var(--brand-text)',
            }}
          >
            {currentName}
          </span>
          <form action="/merchant/logout" method="POST">
            <button
              type="submit"
              className="rounded border px-3 py-1.5 text-xs font-medium transition hover:opacity-80"
              style={{
                borderColor: 'color-mix(in srgb, var(--brand-primary) 28%, transparent)',
                color: 'var(--brand-primary)',
                backgroundColor: 'color-mix(in srgb, var(--brand-primary) 4%, transparent)',
                borderRadius: 'var(--brand-radius)',
              }}
            >
              登出
            </button>
          </form>
        </div>
      </header>
      {children}
      <DemoModeToggle />
    </ThemeProvider>
  );
}
