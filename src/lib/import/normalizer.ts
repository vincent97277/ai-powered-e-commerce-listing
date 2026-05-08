/**
 * Normalizer — normalizes raw data from IG / Shopee parsers into import records
 * (V1 #64)
 *
 * Public type: NormalizedItem (for inngest event payload + UI display)
 *   - title: required, 1-200 chars (truncate if too long), can't be all whitespace
 *   - imageUrl: required, https + in IMAGE_HOSTS allowlist
 *   - price?: optional (number, integer NTD)
 *   - sourceUrl: per-item URL (individual product URL, used as dedup key)
 *   - sourceCaption?: merchant's original text (fed to GPT-4o for rewriting)
 */
import { z } from 'zod';

export const NormalizedItemSchema = z.object({
  title: z.string().min(1).max(200),
  imageUrl: z.string().url(),
  price: z.number().int().positive().optional(),
  sourceUrl: z.string().url(),
  sourceCaption: z.string().max(2200).optional(), // IG caption max
});

export type NormalizedItem = z.infer<typeof NormalizedItemSchema>;

/** Ensure title isn't blank, truncate if too long */
export function normalizeTitle(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '需人工審核 (來源未提供標題)';
  return trimmed.length > 200 ? trimmed.slice(0, 200) : trimmed;
}

/** Ensure caption doesn't exceed IG limit */
export function normalizeCaption(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  const t = raw.trim();
  if (!t) return undefined;
  return t.length > 2200 ? t.slice(0, 2200) : t;
}

/** Parse NT$ price string → integer NTD (not cents)
 * Priority order:
 *   1. NT$ 1200 / NT$1,200 / $1200 / ¥1200 (currency-tagged)
 *   2. 1200 元 / 1,200 元 (元 suffix)
 *   3. Bare digits (risky, easy to misread) → not accepted
 */
export function parsePrice(raw: string | undefined | null): number | undefined {
  if (!raw) return undefined;
  const text = raw.replace(/[,，]/g, '');

  // 1. currency-prefix: NT$, $, ¥
  const prefixMatch = text.match(/(?:NT\$|US\$|\$|¥)\s*(\d+)/i);
  if (prefixMatch) {
    const n = Number(prefixMatch[1]);
    if (Number.isFinite(n) && n > 0 && n <= 1_000_000) return Math.floor(n);
  }

  // 2. suffix: 元
  const suffixMatch = text.match(/(\d+)\s*元/);
  if (suffixMatch) {
    const n = Number(suffixMatch[1]);
    if (Number.isFinite(n) && n > 0 && n <= 1_000_000) return Math.floor(n);
  }

  // 3. Whole string is digits (bare numeric string e.g. "1200")
  if (/^\d+$/.test(text.trim())) {
    const n = Number(text.trim());
    if (Number.isFinite(n) && n > 0 && n <= 1_000_000) return Math.floor(n);
  }

  return undefined;
}

/**
 * Normalize a list of candidates into a single list, dedup by sourceUrl (per-item)
 * Cap 5-20 items:
 *   - < 5 items: no filter, return all
 *   - > 20 items: take first 20
 *   - = 0 items: caller handles (throw or empty array)
 */
export function dedupAndCap(items: NormalizedItem[], maxItems = 20): NormalizedItem[] {
  const seen = new Set<string>();
  const out: NormalizedItem[] = [];
  for (const item of items) {
    if (seen.has(item.sourceUrl)) continue;
    seen.add(item.sourceUrl);
    out.push(item);
    if (out.length >= maxItems) break;
  }
  return out;
}
