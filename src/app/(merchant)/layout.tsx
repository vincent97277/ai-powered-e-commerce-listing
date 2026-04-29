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
import { desc } from 'drizzle-orm';

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

  // 撈所有 merchants 從 DB
  const rows = await dbAdmin
    .select({
      id: merchantsTable.id,
      slug: merchantsTable.slug,
      name: merchantsTable.name,
      themeVars: merchantsTable.themeVars,
    })
    .from(merchantsTable)
    .orderBy(desc(merchantsTable.createdAt));

  const merchants: MerchantInfo[] = rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    emoji: EMOJI_MAP[r.slug],
    tagline: TAGLINE_MAP[r.slug],
    themeVars: (r.themeVars ?? {}) as Record<string, string>,
  }));

  // 解析當前 merchant id (cookie 可能是 'akami'/'afen' slug 或 UUID)
  let currentId = merchants[0]?.id ?? '';
  if (cookieValue) {
    if (cookieValue === 'akami' || cookieValue === 'afen') {
      currentId = DEMO_MERCHANTS[cookieValue].tenantId;
    } else if (/^[0-9a-f-]{36}$/i.test(cookieValue)) {
      const found = merchants.find((m) => m.id === cookieValue);
      if (found) currentId = found.id;
    }
  }

  return (
    <ThemeProvider merchants={merchants} initialMerchantId={currentId}>
      <header
        className="flex items-center justify-between border-b px-12 py-4"
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
        <MerchantSwitcher />
      </header>
      {children}
      <DemoModeToggle />
    </ThemeProvider>
  );
}
