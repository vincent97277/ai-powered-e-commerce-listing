/**
 * UI 共用型別 — 跟 AI schema 結構不同 (UI 接 flat string[])
 *
 * 為什麼分開：
 * - AI schema (src/lib/ai/schema.ts) variants 是 Array<{name, options}>，因為 GPT-4o
 *   結構化輸出比較準確
 * - UI fixtures + streaming display 用 flat string[]，render 比較單純
 * - 邊界轉換在 src/lib/ai/flatten.ts (轉 AI → UI)
 */

export type ProductOutput = {
  title: string;
  description: string;
  category: string;
  seo_tags: string[];
  variants: string[]; // UI flat 版
  price_twd: { min: number; max: number };
  confidence: number;
};

export type BrandVoice = 'minimal' | 'warm' | 'playful' | 'luxury';
