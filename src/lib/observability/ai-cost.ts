/**
 * AI cost cap enforcement (V1.5 Track A2, RA13)
 *
 * Daily-aggregates import_sessions.tokensIn/tokensOut + ai_usage_events.tokensIn/tokensOut,
 * if it exceeds merchants.dailyAiCostCentsCap (default NT$50 = 5000 cents) → block subsequent AI calls
 *
 * Why sum both tables (V1.5 smoke fix):
 *   - import_sessions: written by IG/Shopee batch import worker (RA13 original path)
 *   - ai_usage_events:  written by sync photo upload (/api/products/generate)
 *     → without this table, sync path has no record at all, DailyCostChip is always NT$0
 *   - The two sources-of-truth don't overlap (sync doesn't write import_sessions, batch doesn't write ai_usage_events)
 *
 * Why dbAdmin:
 *   - Admin observability scope (read from worker / sync API / settings page — three places)
 *   - Path src/lib/observability/** is in eslint.config.mjs:54 allowlist
 *   - No writes (read-only + compute), no cross-tenant leakage (always WHERE tenant_id = $1)
 *
 * Pricing hardcoded (V1.5 doesn't ship admin override UI, V2 will):
 *   - GPT-4o (gpt-4o-2024-11-20): $2.50 / $10 per 1M tokens
 *   - OpenAI counts images as input tokens
 *     → don't add separately here, just trust that tokensIn already includes image cost
 *
 * Timezone: Taiwan UTC+8 — "today" = TPE 00:00 → now
 *   created_at is timestamptz, so convert to TPE when computing boundary
 */
import { eq, and, gte } from 'drizzle-orm';
import { dbAdmin } from '@/db/admin-only';
import { merchants, importSessions, aiUsageEvents } from '@/db/schema';
import { tokenCost } from './ai-cost-pricing';

// V1.6 A9 prep: pricing math moved to ai-cost-pricing.ts (see that file's docstring).
// Re-export tokenCost here to preserve backward compat — cost-cap.test.ts still imports from '@/lib/observability/ai-cost'.
export { tokenCost };

/* ─────────────────────────── Daily window helper ─────────────────────────── */

/**
 * Get the UTC Date object corresponding to Taiwan timezone "today 00:00"
 * Asia/Taipei is fixed UTC+8 (no DST), just subtract 8h
 */
function getTpeMidnightUtc(now: Date = new Date()): Date {
  // TPE = UTC + 8h. To get "TPE's Y/M/D", add 8h to now then read UTC date components
  const tpe = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const y = tpe.getUTCFullYear();
  const m = tpe.getUTCMonth();
  const d = tpe.getUTCDate();
  // Build the UTC time corresponding to "TPE that day 00:00" = (Y-M-D 00:00 UTC) - 8h
  const tpeMidnightAsUtcMs = Date.UTC(y, m, d, 0, 0, 0, 0) - 8 * 60 * 60 * 1000;
  return new Date(tpeMidnightAsUtcMs);
}

/* ─────────────────────────── Daily cost aggregator ─────────────────────────── */

/**
 * Sum up the token cost (cents, integer) for all AI calls a merchant made "today (TPE)"
 *
 * Two source tables (non-overlapping — see file-level docstring):
 *   1. import_sessions  (IG/Shopee batch worker)
 *   2. ai_usage_events  (sync photo upload /api/products/generate)
 *
 * Two queries fired in parallel (Promise.all), same since boundary
 * Not using UNION ALL because the two tables have different schemas (import_sessions has extra
 * source_url etc.), and SELECTing tokens_in/out separately is simpler for the driver,
 * with no perf difference (both hit the tenant_created idx).
 */
export async function getDailyCostCents(tenantId: string): Promise<number> {
  const since = getTpeMidnightUtc();

  const [importRows, eventRows] = await Promise.all([
    dbAdmin
      .select({
        tokensIn: importSessions.tokensIn,
        tokensOut: importSessions.tokensOut,
      })
      .from(importSessions)
      .where(
        and(
          eq(importSessions.merchantId, tenantId),
          gte(importSessions.createdAt, since),
        ),
      ),
    dbAdmin
      .select({
        tokensIn: aiUsageEvents.tokensIn,
        tokensOut: aiUsageEvents.tokensOut,
      })
      .from(aiUsageEvents)
      .where(
        and(
          eq(aiUsageEvents.tenantId, tenantId),
          gte(aiUsageEvents.createdAt, since),
        ),
      ),
  ]);

  let totalCents = 0;
  for (const r of importRows) {
    totalCents += tokenCost(r.tokensIn ?? 0, r.tokensOut ?? 0);
  }
  for (const r of eventRows) {
    totalCents += tokenCost(r.tokensIn ?? 0, r.tokensOut ?? 0);
  }
  return Math.round(totalCents);
}

/* ─────────────────────────── Cap enforcement ─────────────────────────── */

export class CapExceededError extends Error {
  readonly code = 'AI_COST_CAP_EXCEEDED' as const;
  readonly usedCents: number;
  readonly capCents: number;

  constructor(usedCents: number, capCents: number) {
    super(
      `今日 AI 額度已達上限: NT$${Math.floor(usedCents / 100)} / NT$${Math.floor(capCents / 100)} (TPE 當日)`,
    );
    this.name = 'CapExceededError';
    this.usedCents = usedCents;
    this.capCents = capCents;
  }
}

/**
 * Get a merchant's dailyAiCostCentsCap (default 5000 cents)
 * Throws if tenantId doesn't exist — upstream should have validated, shouldn't trigger
 */
async function getCap(tenantId: string): Promise<number> {
  const [row] = await dbAdmin
    .select({ cap: merchants.dailyAiCostCentsCap })
    .from(merchants)
    .where(eq(merchants.id, tenantId))
    .limit(1);
  if (!row) {
    throw new Error(`[ai-cost] merchant ${tenantId} 不存在`);
  }
  return row.cap;
}

/**
 * Gatekeeper — call await assertWithinDailyCap(tenantId) before every AI entry point
 * Over cap → throw CapExceededError (caller catches and responds 429 / marks session failed)
 *
 * Note: race condition isn't blocked here (two concurrent requests both see used < cap and pass,
 *       used only exceeds cap after both finish). V1.5 accepts this over-shoot — the next
 *       request gets blocked anyway. Strict handling would need advisory lock or atomic
 *       check-and-add — V2 will revisit.
 */
export async function assertWithinDailyCap(tenantId: string): Promise<void> {
  const [usedCents, capCents] = await Promise.all([
    getDailyCostCents(tenantId),
    getCap(tenantId),
  ]);
  if (usedCents >= capCents) {
    throw new CapExceededError(usedCents, capCents);
  }
}

/**
 * For settings page / dashboard display — returns (used, cap) tuple, doesn't throw
 */
export async function getDailyCostSnapshot(
  tenantId: string,
): Promise<{ usedCents: number; capCents: number }> {
  const [usedCents, capCents] = await Promise.all([
    getDailyCostCents(tenantId),
    getCap(tenantId),
  ]);
  return { usedCents, capCents };
}

/**
 * Expose getTpeMidnightUtc to tests (avoids drift if tests recompute the boundary)
 */
export const __test = { getTpeMidnightUtc };
