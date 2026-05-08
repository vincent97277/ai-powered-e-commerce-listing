/**
 * V2.1 — brand voice -> theme preset matcher.
 *
 * Uses keyword substring matching (no stemming / fuzzy / embedding) because:
 *   - Chinese substring is already good enough — "質感日系, 短句留白" hits 3 quiet-japanese keywords directly.
 *   - V2.1 deliberately avoids an LLM call (saves tokens, no added onboarding latency, no fallback handling needed).
 *   - Even on a miss the fallback is modern-minimal — neutral and safe, doesn't clash with brand tone.
 *
 * Edge cases:
 *   - Empty / whitespace-only string -> DEFAULT_THEME_ID
 *   - No keyword hit -> DEFAULT_THEME_ID
 *   - Multiple presets tied -> pick the earlier entry in THEME_PRESETS (stable tiebreak)
 *   - Case-insensitive (toLowerCase on both sides; kept even though Chinese has no case, in case English keywords appear later)
 *
 * Out of scope:
 *   - No brandVoice length check here (the calling action already does .slice(0, 200)).
 *   - No persisted match score for admin debug (V3 candidate; consider onboarding_attempts.matched_theme).
 */
import { THEME_PRESETS, DEFAULT_THEME_ID, type ThemePreset } from './presets';

/**
 * Match a brand voice text to a theme preset by keyword substring overlap.
 * Returns the highest-scoring preset, or DEFAULT_THEME_ID if no match.
 *
 * Note: array iteration order = THEME_PRESETS definition order; on tie, earlier entry wins (stable order).
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
    // Strict > does not replace on tie; preserves earlier array entry (stable tiebreak — earlier-defined preset wins).
    if (score > 0 && (best === null || score > best.score)) {
      best = { preset, score };
    }
  }

  return best?.preset ?? getDefaultTheme();
}

/**
 * Return preset by id, or null if unknown id.
 * Used by the settings dropdown change handler.
 */
export function getThemeById(id: string): ThemePreset | null {
  return THEME_PRESETS.find((t) => t.id === id) ?? null;
}

/**
 * Default fallback. Pure helper to keep `pickThemeForVoice` readable.
 * Always returns a preset (THEME_PRESETS[0] is quiet-japanese, always present — the array cannot be empty
 * because it's defined in source, not dynamically).
 */
function getDefaultTheme(): ThemePreset {
  return (
    THEME_PRESETS.find((t) => t.id === DEFAULT_THEME_ID) ??
    THEME_PRESETS[0]
  );
}
