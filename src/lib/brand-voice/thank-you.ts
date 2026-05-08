/**
 * V1.9 T3 O2 — merchant-voiced thank-you for customer order confirmation.
 *
 * brandVoice is free-text (see src/lib/types.ts comment), not an enum.
 * Heuristically infer tone from the free-text → pick the closest of 4 voice tones.
 * If nothing matches, fall back to warm (the most natural "shopkeeper voice").
 */

const THANK_YOU_BY_VOICE = {
  minimal: '謝謝你, 訂單我們收到了',
  warm: '謝謝你, 訂單已經收到, 馬上幫你準備',
  playful: 'OK啦! 訂單收到, 馬上幫你打包',
  luxury: '感謝您的訂購, 我們會用心為您準備',
} as const;

type Voice = keyof typeof THANK_YOU_BY_VOICE;

/** Infer tone from free-text brandVoice. Heuristic, matches common keywords. */
function detectVoice(text: string): Voice {
  const t = text.toLowerCase();
  // luxury / high-end / premium — luxury
  if (/(精品|奢華|高級|頂級|尊榮|質感|典雅|工藝|職人|傳承|honour|luxury|premium|尊貴|品味)/i.test(t)) {
    return 'luxury';
  }
  // lively / enthusiastic / playful — playful
  if (/(俏皮|活潑|熱情|有趣|搞笑|可愛|幽默|fun|playful|嗨|耶|啦|喔|呢|哈|!|！|😊|🎉|✨)/i.test(t)) {
    return 'playful';
  }
  // minimal / calm / professional — minimal
  if (/(簡約|簡潔|低調|專業|乾淨|minimal|clean|簡單|理性|樸素)/i.test(t)) {
    return 'minimal';
  }
  // Default warm — "shopkeeper voice" is most natural
  return 'warm';
}

/**
 * Used by the customer order confirmation page.
 * brandVoice is free-text (or undefined / null / empty); infer the tone → return the matching thank-you copy.
 */
export function getThankYouMessage(brandVoice?: string | null): string {
  const text = (brandVoice ?? '').trim();
  if (!text) return THANK_YOU_BY_VOICE.warm;
  return THANK_YOU_BY_VOICE[detectVoice(text)];
}

/** Export for tests */
export const __TEST = { THANK_YOU_BY_VOICE, detectVoice };
