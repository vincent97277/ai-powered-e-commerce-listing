/**
 * product.import.batch — IG/Shopee import parent worker (V1 #66)
 *
 * Responsibilities:
 *   1. step.run('fetch-source')  fetch IG/Shopee HTML (safeFetch)
 *   2. step.run('parse-source')  parser → NormalizedItem[]
 *   3. step.run('cap-and-update-total') cap to 5-20 items, write import_sessions.totalItems
 *   4. step.run('item-N')        per-item: download image → dispatch product.ingest child event
 *      (per-item step ensures retries don't double-count — RA1)
 *   5. step.run('complete')      sessions.status = 'completed'
 *
 * Failure strategy:
 *   - Batch-wide fetch/parse failure → import_sessions.status='failed' + errors[]
 *   - Per-item failure → push to errors[]; other items proceed (per-item step.run is isolated)
 *   - completedItems counter is incremented by child events when product.ingest finishes
 *     (with per-item step.run dispatch stable, count can also be derived from dispatch count)
 *
 * RA13 cost cap (TODO V1.5):
 *   import_sessions.tokensIn/tokensOut already reserved; V1 doesn't actually enforce a cap
 *   (smoke test flow runs through). V1.5 adds daily_ai_cost accumulation + abort batch on cap.
 *
 * All writes go through withTenantTx (RA: ENG D2 final); tenantId comes from event.data.
 */
import { eq, sql } from 'drizzle-orm';
import { inngest } from '../client';
import { withTenantTx } from '@/lib/db/with-tenant';
import { importSessions } from '@/db/schema';
import { safeFetch } from '@/lib/import/url-guard';
import { parseIgHtml, IgParseError } from '@/lib/import/ig-fetcher';
import { parseShopeeHtml, ShopeeParseError } from '@/lib/import/shopee-fetcher';
import {
  type NormalizedItem,
  dedupAndCap,
} from '@/lib/import/normalizer';
import { downloadImageToStorage } from '@/lib/import/image-downloader';
import { logImport } from '@/lib/observability/import-log';
import { assertWithinDailyCap, CapExceededError } from '@/lib/observability/ai-cost';

const MAX_ITEMS_PER_SESSION = 20;
const MIN_ITEMS_WARN = 5;

export const productImportBatchFn = inngest.createFunction(
  {
    id: 'product-import-batch',
    name: 'IG/蝦皮 import 批次處理',
    retries: 1,
    idempotency: 'event.data.sessionId',
    // Serial downloads of 5-20 images to avoid OOM; don't crank concurrency.
    concurrency: { limit: 3, key: 'event.data.tenantId' },
  },
  { event: 'product.import.batch' },
  async ({ event, step, logger }) => {
    const { sessionId, tenantId, merchantId, sourceUrl, sourceType } = event.data;
    const startedAt = Date.now();
    logger.info('product.import.batch start', { sessionId, sourceType, sourceUrl });

    // Step 0: status='fetching'
    await step.run('mark-fetching', async () => {
      await withTenantTx(tenantId, async (tx) => {
        await tx
          .update(importSessions)
          .set({ status: 'fetching', updatedAt: new Date() })
          .where(eq(importSessions.id, sessionId));
      });
    });

    // Step 1: fetch source HTML
    let html: string;
    try {
      html = await step.run('fetch-source', async () => {
        const fetched = await safeFetch(sourceUrl, {
          kind: 'source',
          method: 'GET',
          timeoutMs: 10_000,
          maxBytes: 5 * 1024 * 1024,
        });
        return new TextDecoder('utf-8').decode(fetched.body);
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : '抓取來源失敗';
      await markFailed(tenantId, sessionId, message);
      logImport({
        merchantId,
        sourceType,
        url: sourceUrl,
        itemCount: 0,
        durationMs: Date.now() - startedAt,
        success: false,
        error: message,
      });
      throw err; // Inngest re-runs idempotently
    }

    // Step 2: parse HTML → items
    let items: NormalizedItem[];
    try {
      items = await step.run('parse-source', async () => {
        const parsed =
          sourceType === 'ig'
            ? parseIgHtml(html, sourceUrl)
            : parseShopeeHtml(html, sourceUrl);
        return dedupAndCap(parsed, MAX_ITEMS_PER_SESSION);
      });
    } catch (err) {
      const message =
        err instanceof IgParseError || err instanceof ShopeeParseError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'parser 失敗';
      await markFailed(tenantId, sessionId, message);
      logImport({
        merchantId,
        sourceType,
        url: sourceUrl,
        itemCount: 0,
        durationMs: Date.now() - startedAt,
        success: false,
        error: message,
      });
      throw err;
    }

    if (items.length === 0) {
      await markFailed(tenantId, sessionId, '未找到任何商品');
      logImport({
        merchantId,
        sourceType,
        url: sourceUrl,
        itemCount: 0,
        durationMs: Date.now() - startedAt,
        success: false,
        error: 'zero items',
      });
      return { success: false, reason: 'zero items' };
    }

    // Step 3: write totalItems + status='importing'
    await step.run('write-total', async () => {
      await withTenantTx(tenantId, async (tx) => {
        await tx
          .update(importSessions)
          .set({
            status: 'importing',
            totalItems: items.length,
            updatedAt: new Date(),
          })
          .where(eq(importSessions.id, sessionId));
      });
    });

    if (items.length < MIN_ITEMS_WARN) {
      logger.warn(`只找到 ${items.length} 件, 建議至少 ${MIN_ITEMS_WARN} 件`);
    }

    // Step 3.5: V1.5 A2 cost cap gate — don't dispatch any more child events past the cap.
    // (Per-item child failures are still handled by product.ingest itself; this only blocks
    //  the whole batch from entering.)
    const capCheck = await step.run('check-cost-cap', async () => {
      try {
        await assertWithinDailyCap(tenantId);
        return { exceeded: false as const };
      } catch (err) {
        if (err instanceof CapExceededError) {
          return {
            exceeded: true as const,
            message: err.message,
            usedCents: err.usedCents,
            capCents: err.capCents,
          };
        }
        throw err; // Unexpected error → let Inngest retry
      }
    });

    if (capCheck.exceeded) {
      await markFailed(tenantId, sessionId, '今日 AI 額度已達上限');
      logImport({
        merchantId,
        sourceType,
        url: sourceUrl,
        itemCount: items.length,
        durationMs: Date.now() - startedAt,
        success: false,
        error: `AI_COST_CAP_EXCEEDED: ${capCheck.message}`,
      });
      logger.warn('product.import.batch aborted: cost cap exceeded', {
        sessionId,
        usedCents: capCheck.usedCents,
        capCents: capCheck.capCents,
      });
      return {
        success: false,
        reason: 'AI_COST_CAP_EXCEEDED',
        usedCents: capCheck.usedCents,
        capCents: capCheck.capCents,
      };
    }

    // Step 4: per-item processing — serial, one step.run per item (RA1: retry-safe)
    const itemResults: Array<{ ok: boolean; itemIndex: number; error?: string }> = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const result = await step.run(`item-${i}`, async () => {
        try {
          // Download image to local storage → opaque r2Key
          const { key } = await downloadImageToStorage(tenantId, item.imageUrl);

          // Dispatch child event (existing product.ingest worker handles GPT-4o vision)
          await inngest.send({
            name: 'product.ingest',
            data: {
              tenantId,
              merchantId,
              r2Key: key,
              sourceText: item.sourceCaption,
              importSessionId: sessionId,
              itemIndex: i,
            },
          });
          return { ok: true as const, itemIndex: i };
        } catch (err) {
          const errMessage = err instanceof Error ? err.message : 'unknown';
          // Write to errors[] but don't throw — other items keep going
          await withTenantTx(tenantId, async (tx) => {
            await tx
              .update(importSessions)
              .set({
                errors: sql`${importSessions.errors} || ${JSON.stringify([
                  { itemIndex: i, sourceItemUrl: item.sourceUrl, message: errMessage },
                ])}::jsonb`,
                updatedAt: new Date(),
              })
              .where(eq(importSessions.id, sessionId));
          });
          return { ok: false as const, itemIndex: i, error: errMessage };
        }
      });
      itemResults.push(result);
    }

    // Step 5: mark completed (even with some failures the batch counts as completed; UI shows
    //         errors[] so the merchant can retry)
    const successCount = itemResults.filter((r) => r.ok).length;
    await step.run('mark-completed', async () => {
      await withTenantTx(tenantId, async (tx) => {
        await tx
          .update(importSessions)
          .set({
            status: 'completed',
            completedItems: successCount,
            updatedAt: new Date(),
          })
          .where(eq(importSessions.id, sessionId));
      });
    });

    logImport({
      merchantId,
      sourceType,
      url: sourceUrl,
      itemCount: items.length,
      durationMs: Date.now() - startedAt,
      success: true,
      successItems: successCount,
      failedItems: items.length - successCount,
    });

    return {
      success: true,
      sessionId,
      totalItems: items.length,
      successCount,
      failedCount: items.length - successCount,
    };
  },
);

async function markFailed(tenantId: string, sessionId: string, message: string): Promise<void> {
  await withTenantTx(tenantId, async (tx) => {
    await tx
      .update(importSessions)
      .set({
        status: 'failed',
        errors: sql`${importSessions.errors} || ${JSON.stringify([{ message }])}::jsonb`,
        updatedAt: new Date(),
      })
      .where(eq(importSessions.id, sessionId));
  });
}
