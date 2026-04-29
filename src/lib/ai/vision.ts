/**
 * GPT-4o vision call wrapper
 *
 * 用 Vercel AI SDK 的 generateObject() 配 productSchema，
 * 自動拿到 typed + 已驗證的 ProductOutput。
 *
 * 重試策略：
 * - 預設 maxRetries=2（總共最多 3 次：原始 + 2 retry）
 * - retry 觸發條件：
 *   1. fetch / network / 429 rate limit / 5xx error
 *   2. Zod schema 驗證失敗（GPT 偶爾會吐多餘欄位、漏欄位）
 * - 不 retry：4xx 認證錯誤、quota 用完（因為 retry 也救不了）
 *
 * 失敗 fallback：包成 { success: false, error } 回給 caller，
 * 由 Inngest worker 決定要寫 placeholder row 還是丟到 DLQ。
 */

import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { buildSystemPrompt } from './prompt';
import { productSchema, type ProductOutput } from './schema';

// 用 2024-11-20 版本（vision 品質和 latency 平衡點，V1 夠用）
const MODEL_ID = 'gpt-4o-2024-11-20';

// 哪些錯誤值得重試
function isRetryable(err: unknown): boolean {
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  // network / rate limit / 5xx / Zod parse
  return (
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('fetch failed') ||
    msg.includes('rate limit') ||
    msg.includes('429') ||
    msg.includes('500') ||
    msg.includes('502') ||
    msg.includes('503') ||
    msg.includes('504') ||
    msg.includes('zod') ||
    msg.includes('schema') ||
    msg.includes('no_object_generated')
  );
}

// exponential backoff with jitter — 0.5s / 1s / 2s 為 base
async function sleep(attempt: number): Promise<void> {
  const base = 500 * Math.pow(2, attempt);
  const jitter = Math.random() * 250;
  await new Promise((r) => setTimeout(r, base + jitter));
}

export type VisionResult =
  | { success: true; data: ProductOutput; attempts: number }
  | { success: false; error: string; attempts: number };

export async function callVisionWithRetry(opts: {
  imageUrl: string;
  brandVoice: string;
  /** V1 #67 (RA12): IG/蝦皮 import 來源文案, 餵 GPT-4o 重寫成 brand voice 風格 */
  sourceCaption?: string;
  maxRetries?: number;
}): Promise<VisionResult> {
  const { imageUrl, brandVoice, sourceCaption, maxRetries = 2 } = opts;
  const system = buildSystemPrompt(brandVoice, sourceCaption);

  let lastErr: unknown;
  const totalAttempts = maxRetries + 1;

  for (let attempt = 0; attempt < totalAttempts; attempt++) {
    try {
      // generateObject 自動：呼叫 GPT-4o → 解析 JSON → Zod 驗證
      // 只要任一步失敗都會 throw，外層 catch 接到後決定要不要 retry
      const result = await generateObject({
        model: openai(MODEL_ID),
        schema: productSchema,
        system,
        // multi-modal message：text + image_url
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: '請看這張商品照片，依 system prompt 規則輸出 JSON。',
              },
              {
                type: 'image',
                image: new URL(imageUrl),
              },
            ],
          },
        ],
        // 對應 OpenAI 的 max_tokens / temperature
        maxTokens: 1500,
        temperature: 0.7,
      });

      return { success: true, data: result.object, attempts: attempt + 1 };
    } catch (err) {
      lastErr = err;
      const retryable = isRetryable(err);
      const hasMore = attempt < totalAttempts - 1;
      if (!retryable || !hasMore) break;
      await sleep(attempt);
    }
  }

  const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
  return { success: false, error: msg, attempts: totalAttempts };
}
