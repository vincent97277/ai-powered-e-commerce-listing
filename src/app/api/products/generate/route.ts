/**
 * 同步 GPT-4o vision endpoint — 商品資訊生成
 *
 * Body: { storageKey: string, productId?: string }
 *   storageKey — 來自 /api/uploads
 *   productId  — optional，若有就把生成結果寫進該 product 並回新 product id
 *
 * Response: { success: true, data: ProductOutput, productId } | { success: false, error: string }
 */
import { NextRequest, NextResponse } from 'next/server';
import { readFileLocal } from '@/lib/storage/local-fs';
import { resolveMerchantFromCookie } from '@/lib/storage/resolve-merchant';
import { assertNotSuspended, MerchantSuspendedError } from '@/lib/merchant/suspend-guard';
import { withTenantTx } from '@/lib/db/with-tenant';
import { products, aiUsageEvents, type ProductAiMetadata } from '@/db/schema';
import { callVisionWithRetry } from '@/lib/ai/vision';
import { aiOutputToUi } from '@/lib/ai/flatten';
import { assertWithinDailyCap, CapExceededError } from '@/lib/observability/ai-cost';
import sharp from 'sharp';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const cookieValue = req.cookies.get('demo-merchant-id')?.value;
    const merchant = await resolveMerchantFromCookie(cookieValue);

    // V1 #53: 停權商家不可上架
    try {
      await assertNotSuspended(merchant.tenantId);
    } catch (err) {
      if (err instanceof MerchantSuspendedError) {
        return NextResponse.json({ success: false, error: err.message }, { status: 403 });
      }
      throw err;
    }

    const body = await req.json().catch(() => null);
    const storageKey = body?.storageKey as string | undefined;
    const persist = body?.persist !== false; // default true — 寫入 DB

    if (!storageKey || typeof storageKey !== 'string') {
      return NextResponse.json({ success: false, error: '缺少 storageKey' }, { status: 400 });
    }

    // 防呆: storage key 必須以 tenantId/ 開頭
    if (!storageKey.startsWith(`${merchant.tenantId}/`)) {
      return NextResponse.json(
        { success: false, error: `storage key 不屬於當前商家 (${merchant.slug})` },
        { status: 403 },
      );
    }

    // V1.5 A2: 每日 AI 成本守門 — 超過 cap 直接 429, 不打 vision API
    try {
      await assertWithinDailyCap(merchant.tenantId);
    } catch (err) {
      if (err instanceof CapExceededError) {
        return NextResponse.json(
          {
            success: false,
            error: 'AI_COST_CAP_EXCEEDED',
            message: err.message,
            usedCents: err.usedCents,
            capCents: err.capCents,
          },
          { status: 429 },
        );
      }
      throw err;
    }

    // 讀檔 + 縮圖
    const original = await readFileLocal(storageKey);
    const processed = await sharp(original)
      .rotate()
      .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();

    const dataUrl = `data:image/webp;base64,${processed.toString('base64')}`;

    // 真實呼叫 GPT-4o，brand_voice 來自當前 merchant
    const result = await callVisionWithRetry({
      imageUrl: dataUrl,
      brandVoice: merchant.brandVoice,
      maxRetries: 2,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error, attempts: result.attempts },
        { status: 502 },
      );
    }

    // V1.5 smoke fix: sync vision call 也要落盤 token 用量,
    // 不然 DailyCostChip 永遠看 import_sessions, 同步路徑顯示 NT$0
    // 用 withTenantTx 走 RLS-safe path (set_config + WITH CHECK 雙重防呆)
    if (result.usage.tokensIn > 0 || result.usage.tokensOut > 0) {
      try {
        await withTenantTx(merchant.tenantId, async (tx) => {
          await tx.insert(aiUsageEvents).values({
            tenantId: merchant.tenantId,
            tokensIn: result.usage.tokensIn,
            tokensOut: result.usage.tokensOut,
            source: 'photo_upload',
          });
        });
      } catch (logErr) {
        // 記不到 usage 不該擋商品上架 — 商家已經付了 vision 費用, 後續 UI 用 cost cap 守
        console.error('[/api/products/generate] ai_usage_events insert failed', logErr);
      }
    }

    const uiData = aiOutputToUi(result.data);

    // 寫進 DB (透過 RLS, 確保歸屬於當前 merchant)
    let productId: string | undefined;
    if (persist) {
      productId = await withTenantTx(merchant.tenantId, async (tx) => {
        const [inserted] = await tx
          .insert(products)
          .values({
            tenantId: merchant.tenantId,
            title: result.data.title,
            description: result.data.description,
            r2Key: storageKey,
            priceCents: result.data.price_twd.min * 100,
            isPublished: false,
            aiMetadata: { ...result.data, status: 'success' } satisfies ProductAiMetadata,
          })
          .returning({ id: products.id });
        return inserted.id;
      });
    }

    return NextResponse.json({
      success: true,
      data: uiData,
      attempts: result.attempts,
      productId,
      merchantSlug: merchant.slug,
      brandVoiceUsed: merchant.brandVoice ? merchant.brandVoice.slice(0, 60) + '...' : '(空)',
    });
  } catch (err) {
    console.error('[/api/products/generate] error', err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : '伺服器錯誤' },
      { status: 500 },
    );
  }
}
