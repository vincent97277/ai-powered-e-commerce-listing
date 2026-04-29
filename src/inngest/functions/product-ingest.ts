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

import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { callVisionWithRetry } from '@/lib/ai/vision';
import { inngest } from '../client';
import { withTenantTx } from '@/lib/db/with-tenant';
import { dbAdmin } from '@/db/admin-only';
import { merchants, products, type ProductAiMetadata } from '@/db/schema';
import {
  readFileLocal,
  writeProcessedLocal,
  getPublicUrl,
} from '@/lib/storage/local-fs';

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

    // Step 1: 從本地讀原始照片
    const originalBuffer = await step.run('read-from-fs', async () => {
      const buf = await readFileLocal(r2Key);
      return buf.toString('base64');
    });

    // Step 2: 縮圖 + WebP
    const processed = await step.run('process-image', async () => {
      const buf = Buffer.from(originalBuffer, 'base64');
      const out = await sharp(buf)
        .rotate()
        .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 85 })
        .toBuffer();
      return { base64: out.toString('base64'), size: out.length };
    });

    // Step 3: 寫處理過的版本到本地
    const processedKey = await step.run('write-processed', async () => {
      const buf = Buffer.from(processed.base64, 'base64');
      const { key } = await writeProcessedLocal(tenantId, buf);
      return key;
    });

    // Step 4: 抓 brand_voice (system query 走 dbAdmin)
    const brandVoice = await step.run('fetch-brand-voice', async () => {
      const rows = await dbAdmin
        .select({ brandVoice: merchants.brandVoice })
        .from(merchants)
        .where(eq(merchants.id, tenantId))
        .limit(1);
      return rows[0]?.brandVoice ?? '';
    });

    // Step 5: GPT-4o vision (要絕對 URL — 用 NEXT_PUBLIC_APP_URL + /uploads/...)
    //         V1 #67 (RA12): sourceText 從 IG/蝦皮 import 帶進來, 餵 GPT-4o 重寫成 brand voice
    const visionResult = await step.run('call-vision', async () => {
      const imageUrl = getPublicUrl(processedKey);
      return await callVisionWithRetry({
        imageUrl,
        brandVoice,
        sourceCaption: sourceText,
        maxRetries: 2,
      });
    });

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
              aiMetadata: { ...aiData, status: 'success' } satisfies ProductAiMetadata,
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
