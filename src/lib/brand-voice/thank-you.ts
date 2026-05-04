/**
 * V1.9 T3 O2 — merchant-voiced thank-you for customer order confirmation.
 *
 * brandVoice 是 free-text (見 src/lib/types.ts 註解), 不是 enum.
 * 用啟發式從 free-text 推語氣 → pick the closest 4 voice tones.
 * 找不到就 fallback to warm (最自然的「老闆口吻」).
 */

const THANK_YOU_BY_VOICE = {
  minimal: '謝謝你, 訂單我們收到了',
  warm: '謝謝你, 訂單已經收到, 馬上幫你準備',
  playful: 'OK啦! 訂單收到, 馬上幫你打包',
  luxury: '感謝您的訂購, 我們會用心為您準備',
} as const;

type Voice = keyof typeof THANK_YOU_BY_VOICE;

/** 從 free-text brandVoice 推測語氣. 啟發式, 抓常見關鍵字. */
function detectVoice(text: string): Voice {
  const t = text.toLowerCase();
  // 奢華/高級/精品 — luxury
  if (/(精品|奢華|高級|頂級|尊榮|質感|典雅|工藝|職人|傳承|honour|luxury|premium|尊貴|品味)/i.test(t)) {
    return 'luxury';
  }
  // 活潑/熱情/俏皮 — playful
  if (/(俏皮|活潑|熱情|有趣|搞笑|可愛|幽默|fun|playful|嗨|耶|啦|喔|呢|哈|!|！|😊|🎉|✨)/i.test(t)) {
    return 'playful';
  }
  // 簡約/冷靜/專業 — minimal
  if (/(簡約|簡潔|低調|專業|乾淨|minimal|clean|簡單|理性|樸素)/i.test(t)) {
    return 'minimal';
  }
  // 預設 warm — 「老闆口吻」最自然
  return 'warm';
}

/**
 * 給 customer order confirmation page 用.
 * brandVoice 是 free-text (or undefined / null / empty), 推測語氣 → 回對應感謝文案.
 */
export function getThankYouMessage(brandVoice?: string | null): string {
  const text = (brandVoice ?? '').trim();
  if (!text) return THANK_YOU_BY_VOICE.warm;
  return THANK_YOU_BY_VOICE[detectVoice(text)];
}

/** Export for tests */
export const __TEST = { THANK_YOU_BY_VOICE, detectVoice };
