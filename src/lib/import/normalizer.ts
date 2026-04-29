/**
 * Normalizer — 把 IG / 蝦皮 parser 抓出的原始資料 normalize 成 import 用 record
 * (V1 #64)
 *
 * 對外型別: NormalizedItem (給 inngest event payload + UI display)
 *   - title: 必, 1-200 chars (truncate 過長), 不可純空白
 *   - imageUrl: 必, https + 在 IMAGE_HOSTS allowlist
 *   - price?: 可選 (number, 整數元)
 *   - sourceUrl: per-item URL (商品個別 URL, dedup key)
 *   - sourceCaption?: 商家原文 (餵 GPT-4o 重寫用)
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

/** 確保 title 不是空白, 過長 truncate */
export function normalizeTitle(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '需人工審核 (來源未提供標題)';
  return trimmed.length > 200 ? trimmed.slice(0, 200) : trimmed;
}

/** 確保 caption 不超 IG 上限 */
export function normalizeCaption(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  const t = raw.trim();
  if (!t) return undefined;
  return t.length > 2200 ? t.slice(0, 2200) : t;
}

/** 解析 NT$ 價格字串 → integer 元 (不是 cents)
 * 優先順序:
 *   1. NT$ 1200 / NT$1,200 / $1200 / ¥1200 (currency-tagged)
 *   2. 1200 元 / 1,200 元 (元 suffix)
 *   3. 純數字 (危險, 容易抓錯) → 不接受
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

  // 3. 整段就是數字 (純數字字串 e.g. "1200")
  if (/^\d+$/.test(text.trim())) {
    const n = Number(text.trim());
    if (Number.isFinite(n) && n > 0 && n <= 1_000_000) return Math.floor(n);
  }

  return undefined;
}

/**
 * 從多個候選 normalize 成單一 list, dedup by sourceUrl (per-item)
 * cap 5-20 件:
 *   - < 5 件: 不過濾, 全部返
 *   - > 20 件: 取前 20
 *   - = 0 件: caller 處理 (throw or empty array)
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
