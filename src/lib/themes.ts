/**
 * Per-merchant theme — 5 CSS vars injected into :root.
 * Switching merchants triggers a whole-page transition (see globals.css `* { transition: ... }`).
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
    '--brand-primary': '#8B7355',     // dark brown
    '--brand-bg': '#FAF8F5',          // off-white
    '--brand-text': '#2C2416',        // dark coffee
    '--brand-radius': '2px',          // minimalist
    '--brand-font-heading': "'Noto Serif TC', serif",
  },
  afen: {
    '--brand-primary': '#E63946',     // Taiwanese red
    '--brand-bg': '#FFF8E7',          // cream
    '--brand-text': '#1D3557',        // dark blue
    '--brand-radius': '12px',         // rounded
    '--brand-font-heading': "'Noto Sans TC', sans-serif",
  },
};

export const MERCHANT_META: Record<MerchantId, { name: string; emoji: string; tagline: string }> = {
  akami: { name: '阿明選物', emoji: '🍵', tagline: '永康街選物店 · 質感日系 · 老闆有強迫症' },
  afen: { name: '阿芬鹹酥雞', emoji: '🍗', tagline: '夜市第三攤 · 限時搶購 · 老闆很吵' },
};
