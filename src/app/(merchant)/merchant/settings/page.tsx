/**
 * Merchant settings page — change store name, slug, brand voice, theme colors
 */
import { resolveMerchantFromCookie } from '@/lib/storage/resolve-merchant';
import { withTenantTx } from '@/lib/db/with-tenant';
import { merchants } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { SettingsForm } from './SettingsForm';
import { getDailyCostSnapshot } from '@/lib/observability/ai-cost';
import { DailyCostChip } from './DailyCostChip';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const current = await resolveMerchantFromCookie();

  // Fetch full merchant (incl. themeVars). V2.6.2 Tier 1 #4: route through withTenantTx for
  // consistency — all tenant-scoped queries take the same path. The merchants table itself has
  // no RLS policy (storefronts cross-query theme/name), but going through withTenantTx doesn't
  // change query results — it just keeps "direct import of dbUser" out of user-facing routes.
  // Write path (settings/actions.ts) still goes through dbAdmin (web_anon has no UPDATE grant).
  const [m] = await withTenantTx(current.tenantId, async (tx) =>
    tx.select().from(merchants).where(eq(merchants.id, current.tenantId)).limit(1),
  );

  // V1.5 A2: today's AI usage (server-side, SSR'd with the form)
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
