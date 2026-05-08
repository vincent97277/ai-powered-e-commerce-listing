/**
 * V2.1 — 16+ theme presets for onboarding auto-match + settings dropdown.
 *
 * Design principles:
 *   - Each preset is a "complete visual voice", not just colors — includes radius + heading font (5 CSS vars).
 *   - keywords are Chinese brand-voice terms used by the onboarding action for substring match to find the closest vibe
 *     (see src/lib/themes/match.ts). At least 3 keywords each, covering common phrasings (e.g. "日系", "質感", "留白").
 *   - Color contrast all passes WCAG AA on bg (text vs bg >= 4.5:1), design review approved.
 *   - radius uses a CSS pixel string (`'2px'`, `'12px'`, `'999px'`) — fed directly into `--brand-radius`.
 *     Pill style uses `'9999px'` (Tailwind convention) — large-number fallback won't break.
 *   - heading font uses a Google Fonts CSS family stack — Next.js already preloads Noto Serif TC / Noto Sans TC,
 *     other families fall back to system (chrome/safari built-in serif/sans-serif/cursive).
 *
 * Out of scope for V2.1:
 *   - Custom presets persisted in the DB (V3 candidate)
 *   - Preset thumbnail images (currently just emoji + color swatch in the dropdown)
 *   - Migration / rename between presets (id is a stable kebab string; for renames open a V2.2 issue)
 *
 * Adding a new preset:
 *   1. Push an entry to THEME_PRESETS
 *   2. Run vitest tests/themes/match.test.ts -> ensures unique id + all 5 vars present
 *   3. If the new preset should win onboarding match, place its keywords near the front of the array (match picks
 *      highest score, ties go to the earlier entry).
 */

export type ThemePreset = {
  /** Stable kebab id; not renameable in V2.1+ (settings DB does not store preset id, but future-proof). */
  id: string;
  /** Chinese label shown in the settings dropdown. */
  label: string;
  /** One-line Chinese description, used as the dropdown subtitle. */
  hint: string;
  /** One emoji to represent the vibe. */
  emoji: string;
  /** Brand voice keywords (Chinese) — onboarding match uses substring comparison. */
  keywords: string[];
  /** 5 CSS vars — spread directly into merchants.themeVars JSONB. */
  themeVars: {
    '--brand-primary': string;
    '--brand-bg': string;
    '--brand-text': string;
    '--brand-radius': string;
    '--brand-font-heading': string;
  };
};

const FONT_NOTO_SERIF = "'Noto Serif TC', serif";
const FONT_NOTO_SANS = "'Noto Sans TC', sans-serif";
const FONT_INTER = "'Inter', 'Noto Sans TC', sans-serif";
// Handwritten / retro — uses only generic family fallback, no extra font load (avoids adding a Google Fonts request in V2.1).
const FONT_SCRIPT_FALLBACK = "'Noto Serif TC', 'Brush Script MT', cursive, serif";

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'quiet-japanese',
    label: '質感日系',
    hint: '暖咖啡色 + 宋體 + 銳利邊角',
    emoji: '🍵',
    keywords: ['質感', '簡約', '日系', '留白', '安靜', '不形容詞', '內斂'],
    themeVars: {
      '--brand-primary': '#8B7355',
      '--brand-bg': '#FAF8F5',
      '--brand-text': '#2C2416',
      '--brand-radius': '2px',
      '--brand-font-heading': FONT_NOTO_SERIF,
    },
  },
  {
    id: 'night-market',
    label: '夜市熱炒',
    hint: '台味紅 + 厚黑體 + 微圓角',
    emoji: '🍗',
    keywords: ['熱情', '在地', '鮮豔', '嗆', '台味', '夜市', '人情味', '熱炒'],
    themeVars: {
      '--brand-primary': '#E63946',
      '--brand-bg': '#FFF8E7',
      '--brand-text': '#1D3557',
      '--brand-radius': '4px',
      '--brand-font-heading': FONT_NOTO_SANS,
    },
  },
  {
    id: 'literary-cafe',
    label: '文青咖啡',
    hint: '苔綠 + 宋體 + 中圓角',
    emoji: '📖',
    keywords: ['文青', '咖啡', '書店', '森林', '寧靜', '慢活', '苔綠'],
    themeVars: {
      '--brand-primary': '#3F4E3D',
      '--brand-bg': '#F5F3ED',
      '--brand-text': '#1F2A1E',
      '--brand-radius': '8px',
      '--brand-font-heading': FONT_NOTO_SERIF,
    },
  },
  {
    id: 'streetwear',
    label: '街頭潮男',
    hint: '黑底金字 + 銳利切角',
    emoji: '🧢',
    keywords: ['潮', '街頭', '個性', '酷', '黑暗', '霸氣', '潮男', '潮女', '流行'],
    themeVars: {
      '--brand-primary': '#D4AF37',
      '--brand-bg': '#0A0A0A',
      '--brand-text': '#F5F5F5',
      '--brand-radius': '0px',
      '--brand-font-heading': FONT_NOTO_SANS,
    },
  },
  {
    id: 'tea-shop',
    label: '手搖飲品',
    hint: '檸檬黃 + 圓黑體 + 大圓角',
    emoji: '🧋',
    keywords: ['手搖', '飲料', '青春', '活潑', '夏天', '可愛', '檸檬'],
    themeVars: {
      '--brand-primary': '#F5B700',
      '--brand-bg': '#FFFEF5',
      '--brand-text': '#3A2E10',
      '--brand-radius': '16px',
      '--brand-font-heading': FONT_NOTO_SANS,
    },
  },
  {
    id: 'modern-minimal',
    label: '簡約現代',
    hint: '純白黑 + Inter + 微圓角',
    emoji: '⚪',
    keywords: ['現代', '簡約', '極簡', '專業', '乾淨', '中性'],
    themeVars: {
      '--brand-primary': '#1F2937',
      '--brand-bg': '#FFFFFF',
      '--brand-text': '#111827',
      '--brand-radius': '4px',
      '--brand-font-heading': FONT_INTER,
    },
  },
  {
    id: 'pink-sweet',
    label: '韓系少女',
    hint: '粉嫩 + 圓潤 + 大圓角',
    emoji: '🌸',
    keywords: ['韓系', '少女', '粉嫩', '甜美', '可愛', '夢幻', '柔和'],
    themeVars: {
      '--brand-primary': '#E91E63',
      '--brand-bg': '#FFF5F8',
      '--brand-text': '#4A1F2E',
      '--brand-radius': '12px',
      '--brand-font-heading': FONT_NOTO_SANS,
    },
  },
  {
    id: 'earth-farmer',
    label: '暖陽小農',
    hint: '陶土橘 + 宋體 + 微圓角',
    emoji: '🌾',
    keywords: ['小農', '田野', '溫暖', '質樸', '手作', '土地', '產地直送', '農夫'],
    themeVars: {
      '--brand-primary': '#C77D5C',
      '--brand-bg': '#FBF6EE',
      '--brand-text': '#3A2418',
      '--brand-radius': '4px',
      '--brand-font-heading': FONT_NOTO_SERIF,
    },
  },
  {
    id: 'island-resort',
    label: '海島度假',
    hint: '湖水綠 + 黑體 + 中圓角',
    emoji: '🏝️',
    keywords: ['海島', '度假', '海邊', '夏天', '清涼', '湖水', '熱帶'],
    themeVars: {
      '--brand-primary': '#26A69A',
      '--brand-bg': '#F0FAF8',
      '--brand-text': '#0F3D38',
      '--brand-radius': '8px',
      '--brand-font-heading': FONT_NOTO_SANS,
    },
  },
  {
    id: 'handcraft',
    label: '手工飾品',
    hint: '玫瑰金 + 手寫體 + 中圓角',
    emoji: '💍',
    keywords: ['手工', '飾品', '工藝', '優雅', '玫瑰金', '精緻', '訂製'],
    themeVars: {
      '--brand-primary': '#B76E79',
      '--brand-bg': '#FBF5F3',
      '--brand-text': '#3A1F22',
      '--brand-radius': '8px',
      '--brand-font-heading': FONT_SCRIPT_FALLBACK,
    },
  },
  {
    id: 'kawaii-stationery',
    label: '童書文具',
    hint: '粉藍 + 圓潤 + 大圓角',
    emoji: '🖍️',
    keywords: ['童書', '文具', '童趣', '插畫', '粉藍', '可愛', '兒童', '療癒'],
    themeVars: {
      '--brand-primary': '#5B9BD5',
      '--brand-bg': '#F5FAFF',
      '--brand-text': '#1F3A55',
      '--brand-radius': '16px',
      '--brand-font-heading': FONT_NOTO_SANS,
    },
  },
  {
    id: 'vintage-retro',
    label: '個性復古',
    hint: '焦橘 + 宋體 + 銳利',
    emoji: '📻',
    keywords: ['復古', '個性', '老派', 'retro', '舊時光', '懷舊', '70s', '80s'],
    themeVars: {
      '--brand-primary': '#CC5500',
      '--brand-bg': '#F8F0E3',
      '--brand-text': '#2E1A0A',
      '--brand-radius': '2px',
      '--brand-font-heading': FONT_NOTO_SERIF,
    },
  },
  {
    id: 'tech-ecom',
    label: '科技電商',
    hint: '電光藍 + Inter + 微圓角',
    emoji: '💻',
    keywords: ['科技', '電商', '3C', '數位', '專業', '效率', '電子'],
    themeVars: {
      '--brand-primary': '#0066FF',
      '--brand-bg': '#F8FAFE',
      '--brand-text': '#0A1F3D',
      '--brand-radius': '4px',
      '--brand-font-heading': FONT_INTER,
    },
  },
  {
    id: 'florist',
    label: '清新花藝',
    hint: '薰衣草紫 + 宋體 + 中圓角',
    emoji: '💐',
    keywords: ['花藝', '花店', '清新', '優雅', '紫色', '浪漫', '花束'],
    themeVars: {
      '--brand-primary': '#9575CD',
      '--brand-bg': '#FAF7FE',
      '--brand-text': '#2A1F44',
      '--brand-radius': '8px',
      '--brand-font-heading': FONT_NOTO_SERIF,
    },
  },
  {
    id: 'fitness',
    label: '健身保健',
    hint: '森林綠 + 厚黑體 + 微圓角',
    emoji: '💪',
    keywords: ['健身', '保健', '運動', '能量', '專業', '陽剛', '訓練', '蛋白'],
    themeVars: {
      '--brand-primary': '#2D5016',
      '--brand-bg': '#F5F7F0',
      '--brand-text': '#1A2D0A',
      '--brand-radius': '4px',
      '--brand-font-heading': FONT_NOTO_SANS,
    },
  },
  {
    id: 'dessert-bakery',
    label: '甜點烘焙',
    hint: '巧克力棕 + 宋體 + 中圓角',
    emoji: '🧁',
    keywords: ['甜點', '烘焙', '蛋糕', '巧克力', '溫暖', '療癒', '下午茶', '麵包'],
    themeVars: {
      '--brand-primary': '#5D4037',
      '--brand-bg': '#FBF5EE',
      '--brand-text': '#2A1A12',
      '--brand-radius': '8px',
      '--brand-font-heading': FONT_NOTO_SERIF,
    },
  },
  {
    id: 'bookstore',
    label: '書店書房',
    hint: '牛皮卡其 + 宋體 + 微圓角',
    emoji: '📚',
    keywords: ['書店', '書房', '閱讀', '紙本', '知識', '安靜', '獨立書店'],
    themeVars: {
      '--brand-primary': '#A0826D',
      '--brand-bg': '#FAF6EF',
      '--brand-text': '#3A2A1A',
      '--brand-radius': '4px',
      '--brand-font-heading': FONT_NOTO_SERIF,
    },
  },
  {
    id: 'outdoor-sport',
    label: '戶外運動',
    hint: '苔綠 + 機能黑體 + 銳利',
    emoji: '🏔️',
    keywords: ['戶外', '登山', '露營', '機能', '探險', '自然', '徒步'],
    themeVars: {
      '--brand-primary': '#556B2F',
      '--brand-bg': '#F4F5EE',
      '--brand-text': '#1F2A14',
      '--brand-radius': '2px',
      '--brand-font-heading': FONT_NOTO_SANS,
    },
  },
];

/**
 * Default theme id — fallback when onboarding hits no keyword.
 * Modern minimal is the "no-personality-is-the-safest-choice" option — feels at home with any product type.
 */
export const DEFAULT_THEME_ID = 'modern-minimal';
