/**
 * Vision call wrapper (OpenAI GPT-4o)
 *
 * 用 Vercel AI SDK 的 generateText() + Output.object() 配 productSchema，
 * 自動拿到 typed + 已驗證的 ProductOutput。
 *
 * V2.6.x Tier 1 #5: migrated from generateObject() (deprecated in AI SDK v6)
 * to generateText({ output: Output.object({ schema }) }). Behavior is the
 * same (LLM call → JSON parse → Zod validate → typed result), the entry
 * point is just on the supported function path. result.object → result.output.
 *
 * 重試策略：
 * - 預設 maxRetries=2（總共最多 3 次：原始 + 2 retry）
 * - retry 觸發條件：
 *   1. fetch / network / 429 rate limit / 5xx error (透過 APICallError.statusCode 判定)
 *   2. Zod schema 驗證失敗 (NoObjectGeneratedError, LLM 偶爾會吐多餘欄位、漏欄位)
 *   3. fallback: 字串比對 (相容非 APICallError 例外)
 * - 不 retry：4xx 認證錯誤、quota 用完（因為 retry 也救不了）
 *
 * 失敗 fallback：包成 { success: false, error } 回給 caller，
 * 由 Inngest worker 決定要寫 placeholder row 還是丟到 DLQ。
 */

import { openai } from '@ai-sdk/openai';
import { APICallError, NoObjectGeneratedError, generateText, Output } from 'ai';
import { buildSystemPrompt } from './prompt';
import { productSchema, type ProductOutput } from './schema';
import { normalizeUsage, type VisionUsage } from './usage-normalize';

// GPT-4o 2024-11-20: V1 用過的版本, vision 品質和 latency 平衡點
const MODEL_ID = 'gpt-4o-2024-11-20';

// ============================================================
// Retry 判定: 先試 APICallError (SDK-typed), 再 fallback 字串比對
// ============================================================

const RETRYABLE_STATUS_CODES = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

function isRetryableViaApiCallError(err: unknown): boolean | null {
  // 用 isInstance 而非 instanceof — APICallError 跨多個 ai-sdk 版本可能不是同一 class ref
  if (!APICallError.isInstance(err)) return null;
  if (err.isRetryable) return true;
  if (typeof err.statusCode === 'number' && RETRYABLE_STATUS_CODES.has(err.statusCode)) {
    return true;
  }
  // 4xx (排除上面 retryable 子集) → 不 retry
  if (typeof err.statusCode === 'number' && err.statusCode >= 400 && err.statusCode < 500) {
    return false;
  }
  return null; // 不確定 → 交給字串比對 fallback 判
}

function isRetryableViaMessage(err: unknown): boolean {
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  // network / rate limit / 5xx / Zod parse
  return (
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('fetch failed') ||
    msg.includes('rate limit') ||
    msg.includes('quota') ||
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

// 哪些錯誤值得重試 — APICallError-first, then NoObjectGeneratedError, then string fallback.
// V2.6.2: NoObjectGeneratedError became a public class in v5. The SDK throws it
// when the LLM returns content that fails Zod schema validation; we want to
// retry these (the LLM occasionally drops or adds fields, a second try usually
// hits the schema). Codex eng review #5.
function isRetryable(err: unknown): boolean {
  const sdkVerdict = isRetryableViaApiCallError(err);
  if (sdkVerdict !== null) return sdkVerdict;
  if (NoObjectGeneratedError.isInstance(err)) return true;
  return isRetryableViaMessage(err);
}

// exponential backoff with jitter — 0.5s / 1s / 2s 為 base
async function sleep(attempt: number): Promise<void> {
  const base = 500 * Math.pow(2, attempt);
  const jitter = Math.random() * 250;
  await new Promise((r) => setTimeout(r, base + jitter));
}

/**
 * V1.5 review C1 + V2.6.2 prep: usage transparency.
 *
 * Worker writes import_sessions.tokensIn/tokensOut + ai_usage_events from this
 * field; without it the cost cap is decorative. The actual shape of
 * `result.usage` from `generateObject` differs across AI SDK majors:
 *   - v4: { promptTokens, completionTokens, totalTokens? }
 *   - v5: { inputTokens, outputTokens, cachedInputTokens?, totalTokens? }
 *   - v6: { inputTokens, outputTokens, inputTokenDetails?: { cacheReadTokens? } }
 *
 * We funnel everything through `normalizeUsage()` (./usage-normalize.ts) so a
 * future SDK bump is a single typecheck-fix away from ai-cost.ts and the
 * pricing math, instead of silently zeroing the cap.
 *
 * Failure path (retries exhausted) returns 0/0 — no successful API call =
 * no token charge.
 */
// VisionUsage type re-exported from ./usage-normalize so existing imports
// from '@/lib/ai/vision' keep working.
export type { VisionUsage };

export type VisionResult =
  | {
      success: true;
      data: ProductOutput;
      attempts: number;
      usage: VisionUsage;
    }
  | {
      success: false;
      error: string;
      attempts: number;
      usage: VisionUsage;
    };

export async function callVisionWithRetry(opts: {
  /** 線上 URL (production worker 路徑) 或 Buffer (test 從 fixture 讀本地 jpeg) */
  imageUrl?: string;
  imageBuffer?: Buffer | Uint8Array;
  brandVoice: string;
  /** V1 #67 (RA12): IG/蝦皮 import 來源文案, 餵 LLM 重寫成 brand voice 風格 */
  sourceCaption?: string;
  maxRetries?: number;
}): Promise<VisionResult> {
  const { imageUrl, imageBuffer, brandVoice, sourceCaption, maxRetries = 2 } = opts;
  if (!imageUrl && !imageBuffer) {
    throw new Error('callVisionWithRetry: 需要 imageUrl 或 imageBuffer 其中一個');
  }
  const imagePayload: URL | Buffer | Uint8Array = imageBuffer ?? new URL(imageUrl as string);
  const system = buildSystemPrompt(brandVoice, sourceCaption);

  let lastErr: unknown;
  const totalAttempts = maxRetries + 1;

  for (let attempt = 0; attempt < totalAttempts; attempt++) {
    try {
      // generateText + Output.object 自動：呼叫 LLM → 解析 JSON → Zod 驗證
      // 只要任一步失敗都會 throw，外層 catch 接到後決定要不要 retry
      const result = await generateText({
        model: openai(MODEL_ID),
        output: Output.object({ schema: productSchema }),
        system,
        // multi-modal message：text + image
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
                image: imagePayload,
              },
            ],
          },
        ],
        // 對應 OpenAI 的 max_tokens / temperature
        // V2.6.2: AI SDK v5 renamed maxTokens → maxOutputTokens.
        maxOutputTokens: 1500,
        temperature: 0.7,
      });

      // V2.6.2: route through normalizeUsage() so an SDK major bump cannot
      // silently zero the cost cap. Adapter handles v4/v5/v6 shapes; today
      // (on v6) it reads inputTokens/outputTokens, on the v4/v5 fallback
      // path it reads promptTokens/completionTokens — same VisionUsage out
      // either way.
      const usage = normalizeUsage(result.usage);

      return {
        success: true,
        data: result.output,
        attempts: attempt + 1,
        usage,
      };
    } catch (err) {
      lastErr = err;
      const retryable = isRetryable(err);
      const hasMore = attempt < totalAttempts - 1;
      if (!retryable || !hasMore) break;
      await sleep(attempt);
    }
  }

  const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
  return {
    success: false,
    error: msg,
    attempts: totalAttempts,
    // Same shape as the success path's normalizeUsage return; cachedInputTokens=0
    // because no API call succeeded.
    usage: { tokensIn: 0, tokensOut: 0, cachedInputTokens: 0 },
  };
}
