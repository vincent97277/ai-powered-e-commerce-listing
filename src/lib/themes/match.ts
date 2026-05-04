/**
 * V2.1 — brand voice → theme preset matcher.
 *
 * 用 keyword substring 比對 (不做 stemming / fuzzy / embedding) 因為:
 *   - 中文 substring 已經夠好用 — 「質感日系, 短句留白」直接命中 quiet-japanese 3 個 keyword
 *   - V2.1 不引入 LLM 呼叫 (省 token + 不增加 onboarding 延遲 + 不需 fallback 處理)
 *   - 即使比對失敗 fallback 是 modern-minimal — 中性安全, 不會壞品牌調性
 *
 * Edge cases:
 *   - 空字串 / 純空白 → DEFAULT_THEME_ID
 *   - 無關鍵字命中 → DEFAULT_THEME_ID
 *   - 多 preset 同分 → 取 THEME_PRESETS array 排前面的 (穩定 tiebreak)
 *   - case 不敏感 (toLowerCase 兩邊都跑, 即使中文無 case 概念也保留, 預防英文混入 keyword 未來)
 *
 * 不在 scope:
 *   - 不在這裡做 brandVoice 長度檢查 (action 那邊已經 .slice(0, 200))
 *   - 不存命中分數給 admin debug (V3 candidate, 看是否要加 onboarding_attempts.matched_theme)
 */
import { THEME_PRESETS, DEFAULT_THEME_ID, type ThemePreset } from './presets';

/**
 * Match a brand voice text to a theme preset by keyword substring overlap.
 * Returns the highest-scoring preset, or DEFAULT_THEME_ID if no match.
 *
 * 注意: array iteration 順序 = THEME_PRESETS 定義順序; 同分時取靠前的 (穩定排序).
 */
export function pickThemeForVoice(brandVoice: string): ThemePreset {
  if (!brandVoice || brandVoice.trim().length === 0) {
    return getDefaultTheme();
  }

  const lower = brandVoice.toLowerCase();
  let best: { preset: ThemePreset; score: number } | null = null;

  for (const preset of THEME_PRESETS) {
    let score = 0;
    for (const kw of preset.keywords) {
      if (lower.includes(kw.toLowerCase())) {
        score += 1;
      }
    }
    // 嚴格 > 不取代同分; 保留 array 排序前者 (穩定 tiebreak — 早期定義的 preset 優先)
    if (score > 0 && (best === null || score > best.score)) {
      best = { preset, score };
    }
  }

  return best?.preset ?? getDefaultTheme();
}

/**
 * Return preset by id, or null if unknown id.
 * Settings dropdown change handler 用這個.
 */
export function getThemeById(id: string): ThemePreset | null {
  return THEME_PRESETS.find((t) => t.id === id) ?? null;
}

/**
 * Default fallback. Pure helper to keep `pickThemeForVoice` readable.
 * 一定有 preset (THEME_PRESETS[0] 是 quiet-japanese, 永遠存在 — array 不可能空,
 * 因為定義 in source 不是 dynamic).
 */
function getDefaultTheme(): ThemePreset {
  return (
    THEME_PRESETS.find((t) => t.id === DEFAULT_THEME_ID) ??
    THEME_PRESETS[0]
  );
}
