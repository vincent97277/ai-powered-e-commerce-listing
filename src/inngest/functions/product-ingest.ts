/**
 * Inngest function: product.ingest pipeline (local-first)
 *
 * Pipeline 步驟（每一步都用 step.run() 包，發揮 Inngest 的 step-level retry）：
 *   1. read-from-fs          — 從 public/uploads/ 讀照片
 *   2. process-image         — sharp 縮圖到 max 1024px + 轉 WebP
 *   3. write-processed       — 寫 processed/ 子目錄
 *   4. fetch-brand-voice     — 用 dbAdmin 抓商家 brand_voice
 *   5. call-vision           — 呼叫 GPT-4o vision (自帶 retry 2 次)
 *   6. write-product (or write-failed-placeholder)
 *      + emit success / failed event
 *
 * v2 升回 R2: read-from-fs / write-processed 兩步換成 R2 即可
 */

import { eq, sql } from 'drizzle-orm';
import sharp from 'sharp';
import { callVisionWithRetry } from '@/lib/ai/vision';
import { inngest } from '../client';
import { withTenantTx } from '@/lib/db/with-tenant';
import { dbAdmin } from '@/db/admin-only';
import {
  aiUsageEvents,
  importSessions,
  merchants,
  products,
  type ProductAiMetadata,
} from '@/db/schema';
import { readFile, writeProcessed, getPublicUrl, activeBackend } from '@/lib/storage';

export const productIngestFn = inngest.createFunction(
  {
    id: 'product-ingest',
    name: 'Product Ingest Pipeline',
    retries: 1,
    idempotency: 'event.data.tenantId + "/" + event.data.r2Key',
  },
  { event: 'product.ingest' },
  async ({ event, step, logger }) => {
    const { tenantId, r2Key, merchantId, sourceText, importSessionId, itemIndex } = event.data;
    logger.info('product.ingest 開始', { tenantId, r2Key, merchantId, hasSourceText: !!sourceText });

    // V2.2.11: validate event payload. The Inngest dashboard's "Run" button
    // and post-sync introspection can deliver events with empty/partial data;
    // without this guard, downstream readFile(undefined) crashes with a
    // confusing "Cannot read properties of undefined (reading 'includes')"
    // TypeError. Return a structured no-op so the failure is visible in the
    // Inngest UI without polluting Sentry / error budgets.
    if (typeof tenantId !== 'string' || !tenantId) {
      logger.error('product.ingest: missing event.data.tenantId', { data: event.data });
      return { ok: false, skipped: true, reason: 'missing_tenant_id' };
    }
    if (typeof r2Key !== 'string' || !r2Key) {
      logger.error('product.ingest: missing event.data.r2Key', { data: event.data });
      return { ok: false, skipped: true, reason: 'missing_r2_key' };
    }
    if (typeof merchantId !== 'string' || !merchantId) {
      logger.error('product.ingest: missing event.data.merchantId', { data: event.data });
      return { ok: false, skipped: true, reason: 'missing_merchant_id' };
    }

    // V2.2.9: timing instrumentation — each step logs its wall time so the
    // operator can verify, after Neon + R2 provisioning, that no single step
    // exceeds the 10s Vercel Hobby per-fn cap. Log lines look like:
    //   [step-timing] read-from-fs 134ms
    // Inngest also tracks step duration in its dashboard; this is a redundant
    // local log for `vercel logs` / `gcloud logs` grep.
    const timed = async <T>(name: string, fn: () => Promise<T>): Promise<T> => {
      const t0 = Date.now();
      const result = await fn();
      const ms = Date.now() - t0;
      logger.info('[step-timing]', { step: name, ms, slow: ms > 8000 });
      if (ms > 9000) {
        // Single step closer than 1s to Hobby limit — flag for review.
        logger.warn('[step-timing] step approaching 10s Hobby cap', { step: name, ms });
      }
      return result;
    };

    // Step 1: 從 storage 讀原始照片
    const originalBuffer = await step.run('read-from-fs', () =>
      timed('read-from-fs', async () => {
        const buf = await readFile(r2Key);
        return buf.toString('base64');
      }),
    );

    // Step 2: 縮圖 + WebP
    const processed = await step.run('process-image', () =>
      timed('process-image', async () => {
        const buf = Buffer.from(originalBuffer, 'base64');
        const out = await sharp(buf)
          .rotate()
          .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 85 })
          .toBuffer();
        return { base64: out.toString('base64'), size: out.length };
      }),
    );

    // Step 3: 寫處理過的版本回 storage
    const processedKey = await step.run('write-processed', () =>
      timed('write-processed', async () => {
        const buf = Buffer.from(processed.base64, 'base64');
        const { key } = await writeProcessed(tenantId, buf);
        return key;
      }),
    );

    // Step 4: 抓 brand_voice (system query 走 dbAdmin)
    const brandVoice = await step.run('fetch-brand-voice', () =>
      timed('fetch-brand-voice', async () => {
        const rows = await dbAdmin
          .select({ brandVoice: merchants.brandVoice })
          .from(merchants)
          .where(eq(merchants.id, tenantId))
          .limit(1);
        return rows[0]?.brandVoice ?? '';
      }),
    );

    // Step 5: GPT-4o vision (the slow step — typically 5-15s; biggest risk on Hobby)
    //         V1 #67 (RA12): sourceText 從 IG/蝦皮 import 帶進來, 餵 GPT-4o 重寫成 brand voice
    //
    // V2.6.1 local-dev fix: when STORAGE_BACKEND=local, the processedKey resolves
    // to http://localhost:3000/uploads/... — OpenAI cloud cannot reach localhost,
    // so vision fails and the worker falls back to fixture mode. In local mode
    // we pass the processed bytes inline (vision lib already supports imageBuffer
    // path); in r2 mode we pass the public URL (R2 is publicly reachable, and
    // this avoids resending bytes we just uploaded).
    const visionResult = await step.run('call-vision', () =>
      timed('call-vision', async () => {
        const visionPayload =
          activeBackend() === 'r2'
            ? { imageUrl: getPublicUrl(processedKey) }
            : { imageBuffer: Buffer.from(processed.base64, 'base64') };
        return await callVisionWithRetry({
          ...visionPayload,
          brandVoice,
          sourceCaption: sourceText,
          maxRetries: 2,
        });
      }),
    );

    // V1.5 review C1: 把 vision 回傳的 token usage 累積進 import_sessions, 給 cost cap 讀
    // step.run idempotency: 同一 step ID retry 時 Inngest 不重跑 → 不會重複加 usage
    // 失敗 case usage 會是 0/0, write 也沒副作用 — 直接跳過寫入
    const hasUsage = visionResult.usage.tokensIn > 0 || visionResult.usage.tokensOut > 0;
    if (importSessionId && hasUsage) {
      await step.run('record-token-usage', async () => {
        // import_sessions 沒 tenant_id 欄位 (RLS via JOIN merchants), 但 withTenantTx 會
        // SET LOCAL app.tenant_id, RLS policy 走 JOIN 認得 merchant_id = tenantId 的 session
        const tokensIn = visionResult.usage.tokensIn;
        const tokensOut = visionResult.usage.tokensOut;
        await withTenantTx(tenantId, async (tx) => {
          await tx
            .update(importSessions)
            .set({
              tokensIn: sql`${importSessions.tokensIn} + ${tokensIn}`,
              tokensOut: sql`${importSessions.tokensOut} + ${tokensOut}`,
              updatedAt: new Date(),
            })
            .where(eq(importSessions.id, importSessionId));
        });
      });
    }

    // V2.2.5: when this run is from a photo-upload (no importSessionId), record
    // ai_usage_events instead so the daily cost cap still sees the spend.
    // step.run idempotency keeps retries from double-counting.
    if (!importSessionId && hasUsage) {
      await step.run('record-ai-usage-photo-upload', async () => {
        await withTenantTx(tenantId, async (tx) => {
          await tx.insert(aiUsageEvents).values({
            tenantId,
            tokensIn: visionResult.usage.tokensIn,
            tokensOut: visionResult.usage.tokensOut,
            source: 'photo_upload',
          });
        });
      });
    }

    // Step 6a: 失敗分支 (RA20: 寫 needs_review status, 不 throw 讓 parent retry)
    if (!visionResult.success) {
      logger.error('vision 失敗', { error: visionResult.error });

      const failedProductId = await step.run('write-failed-placeholder', async () => {
        return await withTenantTx(tenantId, async (tx) => {
          const inserted = await tx
            .insert(products)
            .values({
              tenantId,
              title: '上架失敗 — 請手動補資料',
              description: `AI 解析失敗：${visionResult.error}`,
              r2Key: processedKey,
              priceCents: 0,
              productStatus: 'needs_review', // RA20
              aiMetadata: {
                title: '上架失敗',
                description: '需手動補資料',
                category: '其他',
                seo_tags: [],
                variants: [],
                price_twd: { min: 0, max: 0 },
                confidence: 0,
                status: 'failed',
                source_key: r2Key,
                error: visionResult.error,
              } satisfies ProductAiMetadata,
            })
            .returning({ id: products.id });
          return inserted[0].id;
        });
      });

      await step.sendEvent('emit-failed', {
        name: 'product.ingest.failed',
        data: { tenantId, r2Key, error: visionResult.error, importSessionId, itemIndex },
      });

      // RA20: 不 throw — parent worker 已 dispatch, 不該因為 child AI 失敗 retry parent
      return { ok: false, productId: failedProductId, error: visionResult.error };
    }

    // Step 6b: 成功分支 — 額外 Zod-light 驗證 (RA10): title/desc 不可含 URL
    const aiData = visionResult.data;
    const URL_RE = /https?:\/\/|www\./i;
    if (URL_RE.test(aiData.title) || URL_RE.test(aiData.description)) {
      logger.warn('AI output 含 URL, 標 needs_review', { title: aiData.title });
      const flaggedProductId = await step.run('write-flagged', async () => {
        return await withTenantTx(tenantId, async (tx) => {
          const inserted = await tx
            .insert(products)
            .values({
              tenantId,
              title: aiData.title,
              description: aiData.description,
              r2Key: processedKey,
              priceCents: aiData.price_twd.min * 100,
              productStatus: 'needs_review',
              aiMetadata: {
                ...aiData,
                status: 'success',
                source_key: r2Key,
              } satisfies ProductAiMetadata,
            })
            .returning({ id: products.id });
          return inserted[0].id;
        });
      });
      return { ok: true, productId: flaggedProductId, flagged: true };
    }

    const productId = await step.run('write-product', async () => {
      return await withTenantTx(tenantId, async (tx) => {
        const ai = visionResult.data;
        const inserted = await tx
          .insert(products)
          .values({
            tenantId,
            title: ai.title,
            description: ai.description,
            r2Key: processedKey,
            priceCents: ai.price_twd.min * 100,
            aiMetadata: {
              ...ai,
              status: 'success',
              source_key: r2Key,
            } satisfies ProductAiMetadata,
          })
          .returning({ id: products.id });
        return inserted[0].id;
      });
    });

    await step.sendEvent('emit-ingested', {
      name: 'product.ingested',
      data: { productId, tenantId, importSessionId, itemIndex },
    });

    logger.info('product.ingest 完成', { productId, confidence: visionResult.data.confidence });
    return { ok: true, productId, confidence: visionResult.data.confidence };
  },
);
