/**
 * V1.9 T3 O2 — getThankYouMessage heuristic mapping smoke tests.
 *
 * Free-text brandVoice → 4 voice tones via keyword detection.
 * Default = warm (shop-owner voice, most natural).
 */
import { describe, it, expect } from 'vitest';
import { getThankYouMessage, __TEST } from '@/lib/brand-voice/thank-you';

describe('getThankYouMessage', () => {
  it('empty / null / undefined → warm default', () => {
    expect(getThankYouMessage()).toBe(__TEST.THANK_YOU_BY_VOICE.warm);
    expect(getThankYouMessage(null)).toBe(__TEST.THANK_YOU_BY_VOICE.warm);
    expect(getThankYouMessage('')).toBe(__TEST.THANK_YOU_BY_VOICE.warm);
    expect(getThankYouMessage('   ')).toBe(__TEST.THANK_YOU_BY_VOICE.warm);
  });

  it('luxury keywords → luxury voice', () => {
    expect(getThankYouMessage('精品工藝, 職人傳承')).toBe(__TEST.THANK_YOU_BY_VOICE.luxury);
    expect(getThankYouMessage('我們是頂級 luxury 品牌')).toBe(__TEST.THANK_YOU_BY_VOICE.luxury);
    expect(getThankYouMessage('質感生活, 品味典雅')).toBe(__TEST.THANK_YOU_BY_VOICE.luxury);
  });

  it('playful keywords → playful voice', () => {
    expect(getThankYouMessage('俏皮活潑的小店!')).toBe(__TEST.THANK_YOU_BY_VOICE.playful);
    expect(getThankYouMessage('熱情有趣')).toBe(__TEST.THANK_YOU_BY_VOICE.playful);
    expect(getThankYouMessage('哈哈, 來逛喔')).toBe(__TEST.THANK_YOU_BY_VOICE.playful);
  });

  it('minimal keywords → minimal voice', () => {
    expect(getThankYouMessage('簡約低調風格')).toBe(__TEST.THANK_YOU_BY_VOICE.minimal);
    expect(getThankYouMessage('clean minimal aesthetic')).toBe(__TEST.THANK_YOU_BY_VOICE.minimal);
    expect(getThankYouMessage('專業乾淨')).toBe(__TEST.THANK_YOU_BY_VOICE.minimal);
  });

  it('neutral / unknown free-text → warm default', () => {
    expect(getThankYouMessage('我們賣咖啡和茶葉')).toBe(__TEST.THANK_YOU_BY_VOICE.warm);
    expect(getThankYouMessage('handmade ceramics from Taiwan')).toBe(__TEST.THANK_YOU_BY_VOICE.warm);
  });

  it('returns non-empty merchant-voiced strings', () => {
    for (const v of Object.values(__TEST.THANK_YOU_BY_VOICE)) {
      expect(v.length).toBeGreaterThan(5);
      // Each starts with thanks word ("謝謝", "OK啦", "感謝") — feels merchant-voiced.
      expect(v).toMatch(/(謝謝|OK啦|感謝)/);
    }
  });
});
