'use server';

/**
 * 商家自助註冊 server action — V1.7 D1 hardening
 *
 * V1 簡化版 → V1.7 D1 升級:
 *   - 沒 email 驗證 / 沒 captcha / 沒 user account: 仍然不做 (V2)
 *   - 多了:
 *     1. Honeypot 欄位 hp_url — bot 填了 → fake-success (浪費 bot 時間, 不建商家)
 *     2. IP rate limit: 1 success per IP / 24h (DB-backed, onboarding_attempts 表)
 *     3. Reserved slug list: admin/api/store/... 直接拒
 *     4. 不立刻 set cookie / 不直接進後台 — approved_at = NULL → /onboarding/pending
 *     5. 所有分支都 log 一行 onboarding_attempts → admin 看 abuse pattern
 *
 * Security note:
 *   - 即使 bot 觸發 honeypot, server 仍回 'pending' 訊息 (不告訴 bot 被擋)
 *   - rate_limited / reserved_slug / invalid_slug 都用 generic 的友善文案
 *   - 不 leak 出「這個 IP 已經註冊過了」的具體 detail
 */

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { dbAdmin } from '@/db/admin-only';
import { merchants } from '@/db/schema';
import { isReservedSlug } from '@/lib/onboarding/reserved-slugs';
import {
  checkRateLimit,
  extractIp,
  logAttempt,
} from '@/lib/onboarding/rate-limit';

const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/; // lowercase letters/digits/dash, 3-32 chars

export type CreateMerchantState = {
  error?: string;
  /** Set when 走 honeypot fake-success path (form 收到後顯示 generic「審核中」訊息但不真的 redirect) */
  pendingFake?: boolean;
};

const THEME_PICKS = [
  {
    '--brand-primary': '#8B7355',
    '--brand-bg': '#FAF8F5',
    '--brand-text': '#2C2416',
    '--brand-radius': '2px',
    '--brand-font-heading': "'Noto Serif TC', serif",
  },
  {
    '--brand-primary': '#E63946',
    '--brand-bg': '#FFF8E7',
    '--brand-text': '#1D3557',
    '--brand-radius': '12px',
    '--brand-font-heading': "'Noto Sans TC', sans-serif",
  },
  {
    '--brand-primary': '#2A9D8F',
    '--brand-bg': '#F4F9F7',
    '--brand-text': '#1B2D2A',
    '--brand-radius': '6px',
    '--brand-font-heading': "'Noto Sans TC', sans-serif",
  },
];

export async function createMerchantAction(
  _prev: CreateMerchantState,
  formData: FormData,
): Promise<CreateMerchantState> {
  const slug = String(formData.get('slug') ?? '').trim().toLowerCase();
  const name = String(formData.get('name') ?? '').trim();
  const brandVoice = String(formData.get('brandVoice') ?? '').trim();
  const honeypot = String(formData.get('hp_url') ?? '').trim();

  const h = await headers();
  const ip = extractIp(h);

  // ─── 1. Honeypot ───
  // Bot 填了任何隱藏欄位 → 假裝成功, 不真的建商家.
  // 不 redirect — 因為 redirect 一旦過去, attacker 就知道 endpoint 是真的能用的.
  // 回 pendingFake = true, page 會顯示 generic 「審核中」 訊息.
  if (honeypot.length > 0) {
    await logAttempt({ ip, slug: slug || '(empty)', result: 'honeypot' });
    return { pendingFake: true };
  }

  // ─── 2. IP rate limit ───
  const rl = await checkRateLimit(ip);
  if (!rl.allowed) {
    await logAttempt({ ip, slug: slug || '(empty)', result: 'rate_limited' });
    return { error: rl.reason };
  }

  // ─── 3. Slug format ───
  if (!SLUG_REGEX.test(slug)) {
    await logAttempt({ ip, slug: slug || '(empty)', result: 'invalid_slug' });
    return { error: 'Slug 必須 3-32 字, 只能包含小寫字母, 數字, 橫線 (中間)' };
  }
  if (name.length < 1 || name.length > 60) {
    await logAttempt({ ip, slug, result: 'invalid_slug' });
    return { error: '店名 1-60 字' };
  }

  // ─── 4. Reserved slug ───
  if (isReservedSlug(slug)) {
    await logAttempt({ ip, slug, result: 'reserved_slug' });
    return { error: `slug 「${slug}」是平台保留字, 換一個試試` };
  }

  // ─── 5. Insert merchant — approved_at = NULL (pending admin) ───
  const theme = THEME_PICKS[Math.floor(Math.random() * THEME_PICKS.length)];

  try {
    await dbAdmin
      .insert(merchants)
      .values({
        slug,
        name,
        brandVoice: brandVoice.slice(0, 200),
        themeVars: theme,
        // approvedAt 預設 null = pending; 留空不寫.
      })
      .returning({ id: merchants.id, slug: merchants.slug });
  } catch (err) {
    if (err instanceof Error && err.message.toLowerCase().includes('duplicate')) {
      await logAttempt({ ip, slug, result: 'duplicate_slug' });
      return { error: `slug 「${slug}」已被使用, 換一個試試` };
    }
    await logAttempt({ ip, slug, result: 'invalid_slug' });
    return { error: err instanceof Error ? err.message : '建立失敗' };
  }

  // ─── 6. Success: log + redirect to pending ───
  // 注意: 不 set cookie. Admin 必須先 approve, 商家才能進後台.
  await logAttempt({ ip, slug, result: 'success' });

  // redirect 必須在 try 外面 (Next.js redirect 用 throw 機制)
  redirect('/onboarding/pending');
}
