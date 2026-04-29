/**
 * product.import.batch — IG/蝦皮 import parent worker (V1 #66)
 *
 * 職責:
 *   1. step.run('fetch-source')  抓 IG/蝦皮 HTML (safeFetch)
 *   2. step.run('parse-source')  parser → NormalizedItem[]
 *   3. step.run('cap-and-update-total') cap 5-20 件, 寫 import_sessions.totalItems
 *   4. step.run('item-N')        per-item: 下載圖 → dispatch product.ingest child event
 *      (per-item step 確保 retry 不重算 counter — RA1)
 *   5. step.run('complete')      sessions.status = 'completed'
 *
 * 失敗策略:
 *   - 整批 fetch/parse 失敗 → import_sessions.status='failed' + errors[]
 *   - 個別 item 失敗 → errors[] 加一筆, 其他 item 照跑 (per-item step.run isolated)
 *   - completedItems counter 由 child event 在 product.ingest 完成時 ++
 *     (但因 per-item step.run dispatch 已穩定, 計數可從 dispatch 數推)
 *
 * RA13 cost cap (TODO V1.5):
 *   import_sessions.tokensIn/tokensOut 已預留, V1 不真執行 cap (smoke test 流程順)
 *   V1.5 加 daily_ai_cost 累積 + 超 cap abort batch
 *
 * 全 withTenantTx 寫入 (RA: ENG D2 final), tenantId 從 event.data 取
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

const MAX_ITEMS_PER_SESSION = 20;
const MIN_ITEMS_WARN = 5;

export const productImportBatchFn = inngest.createFunction(
  {
    id: 'product-import-batch',
    name: 'IG/蝦皮 import 批次處理',
    retries: 1,
    idempotency: 'event.data.sessionId',
    // 序列下載 5-20 張圖避免 OOM, 不要 concurrency 衝高
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

    // Step 3: 寫入 totalItems + status='importing'
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

    // Step 4: per-item processing — 序列, 每個 item 一個 step.run (RA1: retry safe)
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
          // 寫進 errors[] 但不 throw — 其他 item 繼續跑
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

    // Step 5: mark completed (即便部分 fail, 整 batch 算 completed; UI 顯示 errors[] 給商家 retry)
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
