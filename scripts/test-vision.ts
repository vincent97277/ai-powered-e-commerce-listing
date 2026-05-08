/**
 * scripts/test-vision.ts — Build day 09:00 first task
 *
 * Purpose: run a single GPT-4o vision + Zod-validation pass without Inngest / DB / R2,
 * to confirm:
 *   1. OPENAI_API_KEY is valid
 *   2. SYSTEM_PROMPT_TEMPLATE has no typos
 *   3. productSchema does not reject the model's output
 *
 * Usage:
 *   pnpm tsx scripts/test-vision.ts ./tests/fixtures/sample-teacup.jpg
 *
 * Expected output:
 *   - Prints JSON with 7 fields
 *   - confidence > 0.5 (for a clear product photo)
 *
 * Troubleshooting:
 *   - "OPENAI_API_KEY missing" → check .env.local
 *   - "no_object_generated"    → model returned no JSON; verify the system prompt
 *   - "ZodError"               → model responded but was rejected by banned-word /
 *                                length checks; inspect error.issues for the failing rule
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

  // Read the local file as a base64 data URI (GPT-4o vision accepts the data: scheme)
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
    brandVoice: '台灣文青質感、親切但不浮誇、偏好天然材質', // fixed brand_voice used by the smoke test
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
