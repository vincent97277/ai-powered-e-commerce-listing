/**
 * 商家設定頁 — 改店名、slug、品牌語氣、主題顏色
 */
import { cookies } from 'next/headers';
import { resolveMerchantFromCookie } from '@/lib/storage/resolve-merchant';
import { dbAdmin } from '@/db/admin-only';
import { merchants } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { SettingsForm } from './SettingsForm';
import { getDailyCostSnapshot } from '@/lib/observability/ai-cost';
import { DailyCostChip } from './DailyCostChip';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const c = await cookies();
  const current = await resolveMerchantFromCookie(c.get('demo-merchant-id')?.value);

  // 撈完整 merchant (含 themeVars)
  const [m] = await dbAdmin
    .select()
    .from(merchants)
    .where(eq(merchants.id, current.tenantId))
    .limit(1);

  // V1.5 A2: 今日 AI 用量 (server-side, 跟 form 一起 SSR)
  const { usedCents, capCents } = await getDailyCostSnapshot(current.tenantId);

  return (
    <main
      className="min-h-screen px-4 py-6 sm:px-8 sm:py-8 lg:px-12 lg:py-10"
      style={{ backgroundColor: 'var(--brand-bg)', color: 'var(--brand-text)' }}
    >
      <div className="mx-auto max-w-3xl space-y-8">
        <header className="space-y-3">
          <p className="t-caption" style={{ color: 'var(--brand-primary)' }}>
            商家設定
          </p>
          <h1 className="t-h1" style={{ fontFamily: 'var(--brand-font-heading)' }}>
            管理你的店面
          </h1>
          <p className="t-small mt-1 opacity-60">
            店名 / 網址 / 品牌語氣 / 視覺主題 — 改了立刻套用
          </p>
          <DailyCostChip usedCents={usedCents} capCents={capCents} />
        </header>

        <SettingsForm
          name={m.name}
          slug={m.slug}
          brandVoice={m.brandVoice ?? ''}
          themeVars={(m.themeVars ?? {}) as Record<string, string>}
          lowStockThreshold={m.lowStockThreshold}
          dailyAiCostCentsCap={m.dailyAiCostCentsCap}
        />
      </div>
    </main>
  );
}
