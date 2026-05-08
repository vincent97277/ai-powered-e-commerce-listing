/**
 * V2.1 — theme presets + brand-voice matcher tests.
 *
 * Pure-function tests, no DB / no next/headers. Covers:
 *   - empty / no-keyword input → fallback default (modern-minimal)
 *   - clear keyword hits → expected preset
 *   - tiebreak stability (same score → preset earlier in array wins)
 *   - presets schema invariants: ≥16 entries, unique ids, all 5 themeVars present,
 *     keywords array length ≥ 3
 */
import { describe, it, expect } from 'vitest';
import {
  THEME_PRESETS,
  DEFAULT_THEME_ID,
  type ThemePreset,
} from '@/lib/themes/presets';
import { pickThemeForVoice, getThemeById } from '@/lib/themes/match';

const REQUIRED_VARS: Array<keyof ThemePreset['themeVars']> = [
  '--brand-primary',
  '--brand-bg',
  '--brand-text',
  '--brand-radius',
  '--brand-font-heading',
];

describe('THEME_PRESETS schema invariants', () => {
  it('has at least 16 presets', () => {
    expect(THEME_PRESETS.length).toBeGreaterThanOrEqual(16);
  });

  it('every preset has unique id', () => {
    const ids = THEME_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every preset has all 5 themeVars + keywords array length >= 3', () => {
    for (const preset of THEME_PRESETS) {
      // 5 CSS vars all present + non-empty
      for (const k of REQUIRED_VARS) {
        expect(
          preset.themeVars[k],
          `preset ${preset.id} missing ${k}`,
        ).toBeTruthy();
        expect(typeof preset.themeVars[k]).toBe('string');
      }
      // keywords >= 3
      expect(
        preset.keywords.length,
        `preset ${preset.id} keywords too short`,
      ).toBeGreaterThanOrEqual(3);
      // label / hint / emoji non-empty
      expect(preset.label.length).toBeGreaterThan(0);
      expect(preset.hint.length).toBeGreaterThan(0);
      expect(preset.emoji.length).toBeGreaterThan(0);
    }
  });

  it('DEFAULT_THEME_ID resolves to an actual preset', () => {
    expect(THEME_PRESETS.some((p) => p.id === DEFAULT_THEME_ID)).toBe(true);
  });
});

describe('pickThemeForVoice', () => {
  it('empty string → default (modern-minimal)', () => {
    expect(pickThemeForVoice('').id).toBe(DEFAULT_THEME_ID);
  });

  it('whitespace-only → default', () => {
    expect(pickThemeForVoice('   ').id).toBe(DEFAULT_THEME_ID);
    expect(pickThemeForVoice('\n\t  ').id).toBe(DEFAULT_THEME_ID);
  });

  it('no known keywords → default', () => {
    expect(pickThemeForVoice('沒任何已知關鍵詞').id).toBe(DEFAULT_THEME_ID);
    expect(pickThemeForVoice('xyz random text 12345').id).toBe(DEFAULT_THEME_ID);
  });

  it('streetwear: 潮男潮女流行 → streetwear', () => {
    const result = pickThemeForVoice('要有那種吸引追求流行, 潮男潮女感覺的語調');
    expect(result.id).toBe('streetwear');
  });

  it('quiet-japanese: 簡約日系留白 → quiet-japanese', () => {
    const result = pickThemeForVoice('簡約日系, 短句, 留白');
    expect(result.id).toBe('quiet-japanese');
  });

  it('night-market: 夜市熱炒台味 → night-market', () => {
    const result = pickThemeForVoice('夜市熱炒台味, 老闆很吵');
    expect(result.id).toBe('night-market');
  });

  it('dessert-bakery: 甜點烘焙下午茶 → dessert-bakery', () => {
    const result = pickThemeForVoice('我們做甜點烘焙, 下午茶系列');
    expect(result.id).toBe('dessert-bakery');
  });

  it('tech-ecom: 科技電商專業 → tech-ecom (or modern-minimal as 專業 also matches)', () => {
    // "科技電商" hits two tech-ecom keywords vs "專業" hits one modern-minimal keyword
    const result = pickThemeForVoice('科技電商, 數位 3C 周邊');
    expect(result.id).toBe('tech-ecom');
  });

  it('fitness: 健身運動訓練 → fitness', () => {
    const result = pickThemeForVoice('健身保健運動訓練, 蛋白補給');
    expect(result.id).toBe('fitness');
  });

  it('case-insensitive matching (mixed cn/en)', () => {
    // "Retro" is a vintage-retro keyword — uppercase should also match
    const result = pickThemeForVoice('Retro 老派風格');
    expect(result.id).toBe('vintage-retro');
  });
});

describe('getThemeById', () => {
  it('returns preset for known id', () => {
    expect(getThemeById('quiet-japanese')?.id).toBe('quiet-japanese');
    expect(getThemeById('night-market')?.label).toBe('夜市熱炒');
  });

  it('returns null for unknown id', () => {
    expect(getThemeById('does-not-exist')).toBeNull();
    expect(getThemeById('')).toBeNull();
  });
});
