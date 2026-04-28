/**
 * Inngest function: product.ingest pipeline
 *
 * Pipeline 步驟（每一步都用 step.run() 包，發揮 Inngest 的 step-level retry）：
 *   1. download-from-r2     — 從 R2 下載原始照片
 *   2. process-image        — sharp 縮圖到 max 1024px + 轉 WebP
 *   3. upload-processed     — 把處理過的版本傳回 R2
 *   4. fetch-brand-voice    — 用 dbAdmin 抓商家 brand_voice
 *   5. sign-vision-url      — 簽 5 分鐘 presigned URL 給 GPT-4o
 *   6. call-vision          — 呼叫 GPT-4o vision (自帶 retry 2 次)
 *   7. write-product (or write-failed-placeholder)
 *      + emit success / failed event
 *
 * 為什麼每步都包 step.run？
 *   - 假設 step 6 (vision) 失敗，Inngest 重跑時會 skip step 1–5 的結果（cached）
 *     直接重試 step 6 — 大幅降低 R2 / DB 壓力。
 *   - 每個 step 都是 idempotent — function-level idempotency key 防止重複
 *
 * 注意：sharp 是 native 模組，這個 function 必須跑在 Node.js runtime
 * （見 src/app/api/inngest/route.ts 的 export const runtime = 'nodejs'）。
 */

import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { eq } from 'drizzle-orm';
import { callVisionWithRetry } from '@/lib/ai/vision';
import { inngest } from '../client';
import { withTenantTx } from '@/lib/db/with-tenant';
import { dbAdmin } from '@/db/admin-only';
import { merchants, products, type ProductAiMetadata } from '@/db/schema';

// ============================================================
// R2 client（用 S3 相容協定）
// ============================================================

const r2 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT!,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});
const R2_BUCKET = process.env.R2_BUCKET!;

// ============================================================
// Inngest function
// ============================================================

export const productIngestFn = inngest.createFunction(
  {
    id: 'product-ingest',
    name: 'Product Ingest Pipeline',
    retries: 1,
    idempotency: 'event.data.tenantId + "/" + event.data.r2Key',
  },
  { event: 'product.ingest' },
  async ({ event, step, logger }) => {
    const { tenantId, r2Key, merchantId } = event.data;
    logger.info('product.ingest 開始', { tenantId, r2Key, merchantId });

    // Step 1: 下載原始照片
    const originalBuffer = await step.run('download-from-r2', async () => {
      const obj = await r2.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: r2Key }));
      if (!obj.Body) throw new Error(`R2 object empty: ${r2Key}`);
      const bytes = await obj.Body.transformToByteArray();
      return Buffer.from(bytes).toString('base64');
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

    // Step 3: 上傳處理版本
    const processedKey = await step.run('upload-processed', async () => {
      const uuid = randomUUID();
      const key = `${tenantId}/processed/${uuid}.webp`;
      await r2.send(
        new PutObjectCommand({
          Bucket: R2_BUCKET,
          Key: key,
          Body: Buffer.from(processed.base64, 'base64'),
          ContentType: 'image/webp',
        }),
      );
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

    // Step 5: 簽 GPT-4o 用的 presigned URL (R2 物件不公開)
    const visionImageUrl = await step.run('sign-vision-url', async () => {
      return await getSignedUrl(
        r2,
        new GetObjectCommand({ Bucket: R2_BUCKET, Key: processedKey }),
        { expiresIn: 300 },
      );
    });

    // Step 6: GPT-4o vision (內建 retry 2 次)
    const visionResult = await step.run('call-vision', async () => {
      return await callVisionWithRetry({
        imageUrl: visionImageUrl,
        brandVoice,
        maxRetries: 2,
      });
    });

    // Step 7a: 失敗分支
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
        data: { tenantId, r2Key, error: visionResult.error },
      });

      return { ok: false, productId: failedProductId, error: visionResult.error };
    }

    // Step 7b: 成功分支
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
            priceCents: ai.price_twd.min * 100, // TWD → cents
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
      data: { productId, tenantId },
    });

    logger.info('product.ingest 完成', { productId, confidence: visionResult.data.confidence });
    return { ok: true, productId, confidence: visionResult.data.confidence };
  },
);
