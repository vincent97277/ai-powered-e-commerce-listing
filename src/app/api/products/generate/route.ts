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
import { withTenantTx } from '@/lib/db/with-tenant';
import { products, type ProductAiMetadata } from '@/db/schema';
import { callVisionWithRetry } from '@/lib/ai/vision';
import { aiOutputToUi } from '@/lib/ai/flatten';
import sharp from 'sharp';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const cookieValue = req.cookies.get('demo-merchant-id')?.value;
    const merchant = await resolveMerchantFromCookie(cookieValue);

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
