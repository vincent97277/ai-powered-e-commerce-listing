/**
 * V2.1 — 16+ theme presets for onboarding auto-match + settings dropdown.
 *
 * 設計原則:
 *   - 每個 preset 是「一整套視覺語氣」, 不只是顏色 — 含 radius + heading font (5 個 CSS vars).
 *   - keywords 是中文 brand voice 關鍵詞, 給 onboarding action 用 substring 比對找最像的 vibe
 *     (見 src/lib/themes/match.ts). Keywords 至少 3 個, 蓋常見講法 (e.g. 「日系」「質感」「留白」)
 *   - 顏色 contrast 都過 WCAG AA on bg (text vs bg ≥ 4.5:1), 設計 review 通過.
 *   - radius 用 CSS pixel string (`'2px'`, `'12px'`, `'999px'`) — 直接灌進 `--brand-radius`.
 *     Pill 風格用 `'9999px'` (Tailwind 慣例) — 大數字 fallback 不會壞.
 *   - heading font 用 Google Fonts CSS family stack — Next.js 已 preload Noto Serif TC / Noto Sans TC,
 *     其他 family 用 system fallback (chrome/safari built-in 都有 serif/sans-serif/cursive).
 *
 * V2.1 不做:
 *   - 自定 preset 存 DB (V3 candidate)
 *   - preset 圖片 thumbnail (現在只用 emoji + 顏色 swatch in dropdown)
 *   - preset 之間 migration / rename (id 是 stable kebab, 改名請開 V2.2 issue)
 *
 * 加新 preset 步驟:
 *   1. push 一筆到 THEME_PRESETS
 *   2. 跑 vitest tests/themes/match.test.ts → 確保 unique id + 5 vars 存在
 *   3. 若新 preset 想搶 onboarding match, keyword 排序最好放前面 (match 取 highest score, ties 取
 *      array 靠前的)
 */

export type ThemePreset = {
  /** 穩定 kebab id, V2.1+ 不可改名 (settings DB 不存 preset id, 但 future-proof) */
  id: string;
  /** 中文 label, 顯示在 settings dropdown */
  label: string;
  /** 一句中文 description, dropdown 副標 */
  hint: string;
  /** 一個 emoji 代表 vibe */
  emoji: string;
  /** brand voice 關鍵詞 (中文) — onboarding match 用 substring 比對 */
  keywords: string[];
  /** 5 個 CSS vars — 直接 spread 進 merchants.themeVars JSONB */
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
// 手寫感 / 復古 — 只用通用 family fallback, 不額外 load font (避免 V2.1 加 Google Fonts request).
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
 * Default theme id — onboarding 沒命中關鍵字時 fallback.
 * Modern minimal 是「沒個性反而最安全」的選擇 — 任何商品類型都不違和.
 */
export const DEFAULT_THEME_ID = 'modern-minimal';
