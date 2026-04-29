/**
 * 同步 GPT-4o vision endpoint — Hackathon 簡化版 (繞過 Inngest)
 *
 * v2 升回 production: 改用 Inngest event 走背景，前端 polling DB
 * Hackathon: 直接同步呼叫，前端等個 3-8 秒拿到結果就 streaming
 *
 * Body: { storageKey: string }  (來自 /api/uploads 回傳的 key)
 * Response: { success: true, data: ProductOutput } | { success: false, error: string }
 */
import { NextRequest, NextResponse } from 'next/server';
import { readFileLocal } from '@/lib/storage/local-fs';
import { getMerchantFromCookie, DEMO_MERCHANT_COOKIE } from '@/lib/storage/demo-merchants';
import { dbAdmin } from '@/db/admin-only';
import { merchants } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { callVisionWithRetry } from '@/lib/ai/vision';
import { aiOutputToUi } from '@/lib/ai/flatten';
import sharp from 'sharp';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const cookieValue = req.cookies.get(DEMO_MERCHANT_COOKIE)?.value;
    const merchant = getMerchantFromCookie(cookieValue);

    const body = await req.json().catch(() => null);
    const storageKey = body?.storageKey as string | undefined;

    if (!storageKey || typeof storageKey !== 'string') {
      return NextResponse.json({ success: false, error: '缺少 storageKey' }, { status: 400 });
    }

    // 防呆: storage key 必須以 tenantId/ 開頭
    if (!storageKey.startsWith(`${merchant.tenantId}/`)) {
      return NextResponse.json({ success: false, error: 'storage key 不屬於目前 tenant' }, { status: 403 });
    }

    // 讀檔 + 縮圖 (給 GPT-4o 看的版本)
    const original = await readFileLocal(storageKey);
    const processed = await sharp(original)
      .rotate()
      .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();

    // base64 data URL — GPT-4o vision 接受 data: scheme，避免本地 URL 從 OpenAI 看不到
    const dataUrl = `data:image/webp;base64,${processed.toString('base64')}`;

    // 抓 brand voice
    const rows = await dbAdmin
      .select({ brandVoice: merchants.brandVoice })
      .from(merchants)
      .where(eq(merchants.id, merchant.tenantId))
      .limit(1);
    const brandVoice = rows[0]?.brandVoice ?? '';

    // 同步呼叫 GPT-4o
    const result = await callVisionWithRetry({
      imageUrl: dataUrl,
      brandVoice,
      maxRetries: 2,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error, attempts: result.attempts },
        { status: 502 },
      );
    }

    // AI 輸出 (Array<{name, options}>) → UI 用 (string[])
    const uiData = aiOutputToUi(result.data);

    return NextResponse.json({
      success: true,
      data: uiData,
      attempts: result.attempts,
    });
  } catch (err) {
    console.error('[/api/products/generate] error', err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : '伺服器錯誤' },
      { status: 500 },
    );
  }
}
