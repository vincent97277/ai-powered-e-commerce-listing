/**
 * Vision call wrapper (V1.5: Gemini-default with OpenAI rollback)
 *
 * V1.5 Track A1: 預設 Gemini 2.5 Flash, 設 AI_PROVIDER=openai 可 rollback 回 GPT-4o。
 * 沒上 provider abstraction layer (Eng E1: YAGNI; Vercel AI SDK 已抽象)。
 *
 * 用 Vercel AI SDK 的 generateObject() 配 productSchema，
 * 自動拿到 typed + 已驗證的 ProductOutput。
 *
 * 重試策略：
 * - 預設 maxRetries=2（總共最多 3 次：原始 + 2 retry）
 * - retry 觸發條件：
 *   1. fetch / network / 429 rate limit / 5xx error (透過 APICallError.statusCode 判定)
 *   2. Zod schema 驗證失敗（LLM 偶爾會吐多餘欄位、漏欄位）
 *   3. fallback: 字串比對 (相容舊 OpenAI 路徑與非 APICallError 例外)
 * - 不 retry：4xx 認證錯誤、quota 用完（因為 retry 也救不了）
 *
 * 失敗 fallback：包成 { success: false, error } 回給 caller，
 * 由 Inngest worker 決定要寫 placeholder row 還是丟到 DLQ。
 */

import { google } from '@ai-sdk/google';
import { openai } from '@ai-sdk/openai';
import { APICallError, generateObject } from 'ai';
import { buildSystemPrompt } from './prompt';
import { productSchema, type ProductOutput } from './schema';

/** module-load-time provider selection (env-var only, no per-merchant flip) */
export type AiProvider = 'gemini' | 'openai';

const RAW_PROVIDER = (process.env.AI_PROVIDER ?? 'gemini').toLowerCase();
export const AI_PROVIDER: AiProvider = RAW_PROVIDER === 'openai' ? 'openai' : 'gemini';

/** 對外曝露 (worker 寫 import_sessions.provider 用) */
export function getActiveAiProvider(): AiProvider {
  return AI_PROVIDER;
}

// Gemini 2.5 Flash: ~$0.30/$2.50 per 1M tokens (vs GPT-4o $2.50/$10)
// GPT-4o 2024-11-20: V1 用過的版本, vision 品質和 latency 平衡點
const GEMINI_MODEL_ID = 'gemini-2.5-flash';
const OPENAI_MODEL_ID = 'gpt-4o-2024-11-20';

export const ACTIVE_MODEL_ID = AI_PROVIDER === 'gemini' ? GEMINI_MODEL_ID : OPENAI_MODEL_ID;

/** 拿 model handle — 隔離 provider 差異, 上層只看 ai SDK 的 LanguageModel interface */
function getModel() {
  return AI_PROVIDER === 'gemini' ? google(GEMINI_MODEL_ID) : openai(OPENAI_MODEL_ID);
}

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
  // network / rate limit / 5xx / Zod parse / Gemini-specific quota strings
  return (
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('fetch failed') ||
    msg.includes('rate limit') ||
    msg.includes('quota') ||
    msg.includes('resource_exhausted') ||
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

// 哪些錯誤值得重試 — APICallError-first, 字串比對 fallback
function isRetryable(err: unknown): boolean {
  const sdkVerdict = isRetryableViaApiCallError(err);
  if (sdkVerdict !== null) return sdkVerdict;
  return isRetryableViaMessage(err);
}

// exponential backoff with jitter — 0.5s / 1s / 2s 為 base
async function sleep(attempt: number): Promise<void> {
  const base = 500 * Math.pow(2, attempt);
  const jitter = Math.random() * 250;
  await new Promise((r) => setTimeout(r, base + jitter));
}

/**
 * V1.5 review C1: 把 generateObject 回傳的 usage 透傳出來給 worker 寫入
 * import_sessions.tokensIn/tokensOut, 不然 cost cap 是裝飾品。
 *
 * AI SDK v4 的 result.usage shape: { promptTokens, completionTokens, totalTokens }
 * 我們重命名成 tokensIn/tokensOut, 對齊 import_sessions 欄位語意。
 *
 * 失敗時 (重試耗盡) usage 給 0/0 — 真的沒打成功就不算 token 用量。
 */
export type VisionUsage = { tokensIn: number; tokensOut: number };

export type VisionResult =
  | {
      success: true;
      data: ProductOutput;
      attempts: number;
      provider: AiProvider;
      usage: VisionUsage;
    }
  | {
      success: false;
      error: string;
      attempts: number;
      provider: AiProvider;
      usage: VisionUsage;
    };

export async function callVisionWithRetry(opts: {
  /** 線上 URL (production worker 路徑) 或 Buffer (eval suite 從 fixture 讀本地 jpeg) */
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
      // generateObject 自動：呼叫 LLM → 解析 JSON → Zod 驗證
      // 只要任一步失敗都會 throw，外層 catch 接到後決定要不要 retry
      const result = await generateObject({
        model: getModel(),
        schema: productSchema,
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
        // 對應 OpenAI/Gemini 的 max_tokens / temperature
        maxTokens: 1500,
        temperature: 0.7,
      });

      // V1.5 review C1: SDK v4 usage.{promptTokens, completionTokens} → tokensIn/Out
      // 老版本 SDK / 異常情況 usage 可能 undefined → fallback 0
      const usage: VisionUsage = {
        tokensIn: result.usage?.promptTokens ?? 0,
        tokensOut: result.usage?.completionTokens ?? 0,
      };

      return {
        success: true,
        data: result.object,
        attempts: attempt + 1,
        provider: AI_PROVIDER,
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
    provider: AI_PROVIDER,
    usage: { tokensIn: 0, tokensOut: 0 },
  };
}
