/**
 * 商家後台 layout — 從 DB 撈所有 merchants 給 switcher，cookie 解析當前 merchant
 */
import { cookies } from 'next/headers';
import { dbAdmin } from '@/db/admin-only';
import { merchants as merchantsTable } from '@/db/schema';
import { ThemeProvider, type MerchantInfo } from '@/components/theme/ThemeProvider';
import { MerchantSwitcher } from '@/components/theme/MerchantSwitcher';
import { DemoModeToggle } from '@/components/demo/DemoModeToggle';
import { RainbowLogo } from '@/components/demo/RainbowLogo';
import { DEMO_MERCHANTS, DEMO_MERCHANT_COOKIE } from '@/lib/storage/demo-merchants';
import { count, desc, eq, isNotNull } from 'drizzle-orm';

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
  const cookieValue = c.get(DEMO_MERCHANT_COOKIE)?.value;

  // V1.7 D2: 不再 SELECT all (>50 商家會炸 DOM). 改撈 top 10 most recently active
  // approved merchants 給 dropdown, 加 totalCount 給「查看全部」link 判斷.
  // Current merchant 若不在 top 10 必須單獨補撈 (theme/suspended/pending banner 需要).
  const topRows = await dbAdmin
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
    .where(isNotNull(merchantsTable.approvedAt))
    .orderBy(desc(merchantsTable.updatedAt))
    .limit(10);

  const [totalCountRow] = await dbAdmin
    .select({ n: count(merchantsTable.id) })
    .from(merchantsTable)
    .where(isNotNull(merchantsTable.approvedAt));
  const totalCount = totalCountRow?.n ?? 0;

  // 解析當前 merchant id (cookie 可能是 'akami'/'afen' slug 或 UUID)
  let resolvedId = '';
  if (cookieValue) {
    if (cookieValue === 'akami' || cookieValue === 'afen') {
      resolvedId = DEMO_MERCHANTS[cookieValue].tenantId;
    } else if (/^[0-9a-f-]{36}$/i.test(cookieValue)) {
      resolvedId = cookieValue;
    }
  }

  // 若 current 不在 top 10 (e.g. 久未活動的商家), 額外撈一次以取得 themeVars + banner state
  let currentRow = resolvedId ? topRows.find((r) => r.id === resolvedId) : undefined;
  if (resolvedId && !currentRow) {
    const [extra] = await dbAdmin
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
      .where(eq(merchantsTable.id, resolvedId))
      .limit(1);
    if (extra) currentRow = extra;
  }
  // Fallback: cookie 失效或商家被刪 → 用 top[0]
  if (!currentRow && topRows[0]) {
    currentRow = topRows[0];
  }
  const currentId = currentRow?.id ?? '';

  // ThemeProvider 需要 current merchant 的 themeVars; 把 current row union 進去 (de-dup by id)
  const allRows = currentRow && !topRows.find((r) => r.id === currentRow!.id)
    ? [...topRows, currentRow]
    : topRows;

  const merchants: MerchantInfo[] = allRows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    emoji: EMOJI_MAP[r.slug],
    tagline: TAGLINE_MAP[r.slug],
    themeVars: (r.themeVars ?? {}) as Record<string, string>,
  }));

  const topMerchants = topRows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
  }));

  const isSuspended = currentRow?.suspendedAt != null;
  const suspendedReason = currentRow?.suspendedReason ?? null;
  // V1.7 D1: 是否還在等 admin approve? approved_at IS NULL → pending.
  // suspended 比 pending 嚴重, 兩個 banner 都顯示不衝突 (不同 message).
  // 注意: top 10 query 已 filter approved_at IS NOT NULL, 所以只有 fallback 撈到的 currentRow
  // 才可能 pending — 表示使用者剛 onboarding 完還在等 admin 核可.
  const isPendingApproval = currentRow != null && currentRow.approvedAt == null;
  const currentForSwitcher = currentRow
    ? { id: currentRow.id, slug: currentRow.slug, name: currentRow.name }
    : { id: '', slug: 'unknown', name: '未知商家' };

  return (
    <ThemeProvider merchants={merchants} initialMerchantId={currentId}>
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
        <MerchantSwitcher
          current={currentForSwitcher}
          topMerchants={topMerchants}
          totalCount={totalCount}
        />
      </header>
      {children}
      <DemoModeToggle />
    </ThemeProvider>
  );
}
