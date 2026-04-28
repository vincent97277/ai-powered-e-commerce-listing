/**
 * scripts/test-vision.ts — Build day 09:00 第一件事
 *
 * 目的：在不依賴 Inngest / DB / R2 的情況下，純跑一次 GPT-4o vision +
 * Zod 驗證，確認：
 *   1. OPENAI_API_KEY 有效
 *   2. SYSTEM_PROMPT_TEMPLATE 沒打錯字
 *   3. productSchema 不會把模型輸出擋掉
 *
 * 用法：
 *   pnpm tsx scripts/test-vision.ts ./tests/fixtures/sample-teacup.jpg
 *
 * 預期輸出：
 *   - 印出 7 個欄位的 JSON
 *   - confidence > 0.5（如果是清楚的商品照）
 *
 * 失敗排查：
 *   - "OPENAI_API_KEY missing" → 檢查 .env.local
 *   - "no_object_generated"    → 模型沒吐 JSON，看 system prompt 對不對
 *   - "ZodError"               → 模型吐了但被禁字 / 長度檢查擋掉，看
 *                                error.issues 是哪一條 rule fail
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { callVisionWithRetry } from '../src/lib/ai/vision';

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error('用法：pnpm tsx scripts/test-vision.ts <image-path>');
    process.exit(1);
  }

  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY missing — 在 .env.local 設定');
    process.exit(1);
  }

  const imagePath = resolve(arg);
  if (!existsSync(imagePath)) {
    console.error(`找不到圖片：${imagePath}`);
    process.exit(1);
  }

  // 把本地檔案讀成 base64 data URI（GPT-4o vision 接受 data: scheme）
  const buf = readFileSync(imagePath);
  const ext = imagePath.split('.').pop()?.toLowerCase() ?? 'jpeg';
  const mime =
    ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
  const dataUri = `data:${mime};base64,${buf.toString('base64')}`;

  console.log(`[test-vision] 圖片：${imagePath} (${buf.length} bytes)`);
  console.log('[test-vision] 呼叫 GPT-4o vision...');

  const t0 = Date.now();
  const result = await callVisionWithRetry({
    imageUrl: dataUri,
    brandVoice: '台灣文青質感、親切但不浮誇、偏好天然材質', // smoke test 用的固定 brand_voice
    maxRetries: 2,
  });
  const elapsed = Date.now() - t0;

  console.log(`[test-vision] 完成，耗時 ${elapsed}ms`);

  if (!result.success) {
    console.error('[test-vision] FAIL', { error: result.error, attempts: result.attempts });
    process.exit(2);
  }

  console.log(`[test-vision] OK (attempts=${result.attempts})`);
  console.log('---');
  console.log(JSON.stringify(result.data, null, 2));
  console.log('---');
  console.log(`title:       ${result.data.title.length} 字`);
  console.log(`description: ${result.data.description.length} 字`);
  console.log(`category:    ${result.data.category}`);
  console.log(`seo_tags:    ${result.data.seo_tags.length} 個`);
  console.log(`variants:    ${result.data.variants.length} 組`);
  console.log(`price_twd:   $${result.data.price_twd.min} – $${result.data.price_twd.max}`);
  console.log(`confidence:  ${result.data.confidence}`);
}

main().catch((err) => {
  console.error('[test-vision] 未預期錯誤', err);
  process.exit(3);
});
