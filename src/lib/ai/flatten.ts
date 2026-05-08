/**
 * AI → UI boundary conversion.
 *
 * AI returns variants as [{name: "顏色", options: ["黑","白"]}, {...}].
 * UI wants flat string[]: ["顏色 黑", "顏色 白", ...].
 */
import type { ProductOutput as AiOutput } from './schema';
import type { ProductOutput as UiOutput } from '@/lib/types';

export function aiOutputToUi(ai: AiOutput): UiOutput {
  const flatVariants: string[] = ai.variants.flatMap((v) =>
    v.options.map((opt) => `${v.name} ${opt}`),
  );

  return {
    title: ai.title,
    description: ai.description,
    category: ai.category,
    seo_tags: ai.seo_tags,
    variants: flatVariants,
    price_twd: ai.price_twd,
    confidence: ai.confidence,
  };
}
