/**
 * Merchant backend layout (V2 task 105)
 *
 * Per-merchant auth: one shop session at a time. Resolves current merchant from the
 * merchant-session cookie; ThemeProvider only receives this one merchant's themeVars
 * (no top-10 fetch, no switcher concept).
 *
 * Auth flow:
 *   1. middleware already verified HMAC (Edge runtime)
 *   2. validateMerchantSession() here checks DB row liveness + revoked + expires (E11 defense-in-depth)
 *   3. session invalid → redirect /merchant/login (in sync with resolveMerchantFromCookie)
 *   4. row found → render header + banner (suspended / pending approval)
 *
 * Note: can't just call resolveMerchantFromCookie() because we need themeVars + suspended/pending
 *       state here, so we duplicate the query (cheap, same DB row, one round trip).
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

  // Fetch the current merchant's full row (theme + banner state). One query is enough.
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

  // Row deleted (admin action / data drift) → force re-login.
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
  // approved_at IS NULL → still waiting for admin approval. Note: resolveMerchantFromCookie
  // redirects pending merchants away; but layout runs before resolveMerchantFromCookie, so the
  // banner may flash briefly — harmless.
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
          V2 task 105 — no MerchantSwitcher. Per-merchant auth = one shop session at a time.
          Header just shows the current merchant name + logout button. form POST → /merchant/logout, pure server-rendered.
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
