/**
 * Shared UI types — different shape from AI schema (UI takes flat string[]).
 *
 * Why split:
 * - AI schema (src/lib/ai/schema.ts) variants is Array<{name, options}>, because GPT-4o's
 *   structured output is more accurate that way.
 * - UI fixtures + streaming display use flat string[] — simpler to render.
 * - Boundary conversion in src/lib/ai/flatten.ts (AI → UI).
 */

export type ProductOutput = {
  title: string;
  description: string;
  category: string;
  seo_tags: string[];
  variants: string[]; // UI flat form
  price_twd: { min: number; max: number };
  confidence: number;
};

// V1.5 smoke fix: BrandVoice 4-enum removed — single source is /merchant/settings.brandVoice (free text).
// Merchant settings page now feeds the prompt directly; no more select picker.
