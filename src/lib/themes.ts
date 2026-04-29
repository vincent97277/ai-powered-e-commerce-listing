/**
 * Per-merchant theme — 5 個 CSS vars 注入到 :root
 * 切 merchant 時整頁 transition (見 globals.css 的 * { transition: ... })
 */
export type MerchantId = 'akami' | 'afen';

export type BrandTheme = {
  '--brand-primary': string;
  '--brand-bg': string;
  '--brand-text': string;
  '--brand-radius': string;
  '--brand-font-heading': string;
};

export const THEMES: Record<MerchantId, BrandTheme> = {
  akami: {
    '--brand-primary': '#8B7355',     // 深棕
    '--brand-bg': '#FAF8F5',          // 米白
    '--brand-text': '#2C2416',        // 深咖
    '--brand-radius': '2px',          // 極簡
    '--brand-font-heading': "'Noto Serif TC', serif",
  },
  afen: {
    '--brand-primary': '#E63946',     // 台味紅
    '--brand-bg': '#FFF8E7',          // 奶油
    '--brand-text': '#1D3557',        // 深藍
    '--brand-radius': '12px',         // 圓潤
    '--brand-font-heading': "'Noto Sans TC', sans-serif",
  },
};

export const MERCHANT_META: Record<MerchantId, { name: string; emoji: string; tagline: string }> = {
  akami: { name: '阿明選物', emoji: '🍵', tagline: '永康街選物店 · 質感日系 · 老闆有強迫症' },
  afen: { name: '阿芬鹹酥雞', emoji: '🍗', tagline: '夜市第三攤 · 限時搶購 · 老闆很吵' },
};
