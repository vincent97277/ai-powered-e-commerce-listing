/**
 * Vision call wrapper (OpenAI GPT-4o).
 *
 * Uses Vercel AI SDK's generateText() + Output.object() with productSchema, so we get
 * a typed + validated ProductOutput automatically.
 *
 * V2.6.x Tier 1 #5: migrated from generateObject() (deprecated in AI SDK v6)
 * to generateText({ output: Output.object({ schema }) }). Behavior is the
 * same (LLM call → JSON parse → Zod validate → typed result), the entry
 * point is just on the supported function path. result.object → result.output.
 *
 * Retry strategy:
 * - Default maxRetries=2 (3 attempts total: original + 2 retries)
 * - Retry triggers:
 *   1. fetch / network / 429 rate limit / 5xx error (decided via APICallError.statusCode)
 *   2. Zod schema validation failure (NoObjectGeneratedError; the LLM occasionally drops or adds fields)
 *   3. Fallback: string match (compatible with non-APICallError exceptions)
 * - No retry: 4xx auth errors, quota exhausted (retry won't help)
 *
 * Failure fallback: wrap as { success: false, error } and return to caller; the
 * Inngest worker decides whether to write a placeholder row or send to the DLQ.
 */

import { openai } from '@ai-sdk/openai';
import { APICallError, NoObjectGeneratedError, generateText, Output } from 'ai';
import { buildSystemPrompt } from './prompt';
import { productSchema, type ProductOutput } from './schema';
import { normalizeUsage, type VisionUsage } from './usage-normalize';

// GPT-4o 2024-11-20: the version V1 settled on; sweet spot between vision quality and latency.
const MODEL_ID = 'gpt-4o-2024-11-20';

// ============================================================
// Retry decision: try APICallError first (SDK-typed), then fall back to string match.
// ============================================================

const RETRYABLE_STATUS_CODES = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

function isRetryableViaApiCallError(err: unknown): boolean | null {
  // Use isInstance instead of instanceof — APICallError may not be the same class ref across ai-sdk versions.
  if (!APICallError.isInstance(err)) return null;
  if (err.isRetryable) return true;
  if (typeof err.statusCode === 'number' && RETRYABLE_STATUS_CODES.has(err.statusCode)) {
    return true;
  }
  // 4xx (excluding the retryable subset above) -> no retry.
  if (typeof err.statusCode === 'number' && err.statusCode >= 400 && err.statusCode < 500) {
    return false;
  }
  return null; // Uncertain -> let the string-match fallback decide.
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

// Which errors are worth retrying — APICallError-first, then NoObjectGeneratedError, then string fallback.
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

// Exponential backoff with jitter — 0.5s / 1s / 2s as base.
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
  /** Live URL (production worker path) or Buffer (tests read a local jpeg from a fixture). */
  imageUrl?: string;
  imageBuffer?: Buffer | Uint8Array;
  brandVoice: string;
  /** V1 #67 (RA12): source caption from IG/Shopee import, fed to the LLM to rewrite in brand-voice style. */
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
      // generateText + Output.object handles it automatically: call LLM -> parse JSON -> Zod validate.
      // Any step throwing is caught below, which decides whether to retry.
      const result = await generateText({
        model: openai(MODEL_ID),
        output: Output.object({ schema: productSchema }),
        system,
        // multi-modal message: text + image
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
        // Maps to OpenAI's max_tokens / temperature.
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
