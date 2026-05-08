'use server';

/**
 * Merchant self-signup server action — V1.7 D1 hardening
 *
 * V1 simplified → V1.7 D1 upgrade:
 *   - No email verification / no captcha / no user account: still not doing those (V2)
 *   - Added:
 *     1. Honeypot field hp_url — if a bot fills it → fake-success (waste bot's time, no merchant created)
 *     2. IP rate limit: 1 success per IP / 24h (DB-backed, onboarding_attempts table)
 *     3. Reserved slug list: admin/api/store/... rejected outright
 *     4. No immediate cookie set / no direct entry to backend — approved_at = NULL → /onboarding/pending
 *     5. Every branch logs one onboarding_attempts row → admin can see abuse patterns
 *
 * Security note:
 *   - Even when the bot trips the honeypot, server still returns a 'pending' message (don't tell the bot it got blocked)
 *   - rate_limited / reserved_slug / invalid_slug all use generic friendly copy
 *   - Do not leak specifics like "this IP has already signed up"
 */

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { hash as bcryptHash } from 'bcryptjs';
import { dbAdmin } from '@/db/admin-only';
import { merchants } from '@/db/schema';
import { isReservedSlug } from '@/lib/onboarding/reserved-slugs';
import {
  checkRateLimit,
  extractIp,
  logAttempt,
} from '@/lib/onboarding/rate-limit';
import { pickThemeForVoice } from '@/lib/themes/match';

const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/; // lowercase letters/digits/dash, 3-32 chars
// V2 task 104 — basic email shape (RFC 5322 properly is huge, this is the pragmatic check
// matching the same pattern used elsewhere; DB unique index is the source of truth on dups).
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128;

export type CreateMerchantState = {
  error?: string;
  /** Set when going down the honeypot fake-success path (form shows a generic "under review" message but no real redirect) */
  pendingFake?: boolean;
};

// V2.1 — theme is now picked by brand voice keyword matching (see src/lib/themes/presets.ts +
// src/lib/themes/match.ts). On no match, falls back to modern-minimal. Replaced the original
// 3-hardcoded + random THEME_PICKS array (used by V1 onboarding bootstrap).

export async function createMerchantAction(
  _prev: CreateMerchantState,
  formData: FormData,
): Promise<CreateMerchantState> {
  const slug = String(formData.get('slug') ?? '').trim().toLowerCase();
  const name = String(formData.get('name') ?? '').trim();
  const brandVoice = String(formData.get('brandVoice') ?? '').trim();
  const honeypot = String(formData.get('hp_url') ?? '').trim();
  // V2 task 104 — login credentials. Lowercase email before hash check & persist (DB
  // partial unique index is on lower(email)).
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');
  const passwordConfirm = String(formData.get('passwordConfirm') ?? '');

  const h = await headers();
  const ip = extractIp(h);

  // ─── 1. Honeypot ───
  // If a bot fills any hidden field → pretend success, do not actually create the merchant.
  // No redirect — once a redirect happens, an attacker knows the endpoint is real and usable.
  // Return pendingFake = true; the page shows a generic "under review" message.
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

  // ─── 4b. V2 task 104 — Email + password validation ───
  // (Placed after the reserved check; slug must pass first. All failures log 'invalid_slug' due to
  //  schema limitation — V1.7 D1 didn't reserve an 'invalid_credentials' enum, and we won't migrate
  //  the enum just for this; we reuse invalid_slug.)
  if (!EMAIL_REGEX.test(email) || email.length > 254) {
    await logAttempt({ ip, slug, result: 'invalid_slug' });
    return { error: 'Email 格式不正確' };
  }
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    await logAttempt({ ip, slug, result: 'invalid_slug' });
    return { error: `密碼必須 ${PASSWORD_MIN}-${PASSWORD_MAX} 字` };
  }
  if (password !== passwordConfirm) {
    await logAttempt({ ip, slug, result: 'invalid_slug' });
    return { error: '兩次輸入的密碼不一致' };
  }

  // ─── 5. Insert merchant — approved_at = NULL (pending admin) ───
  // bcrypt cost=10 (mirror loginMerchant's fake-hash cost). Hash outside the try to keep the try block small.
  const passwordHash = await bcryptHash(password, 10);
  // V2.1: brand voice → theme keyword match. Fallback = modern-minimal (neutral, works with any product).
  const matchedTheme = pickThemeForVoice(brandVoice);

  try {
    await dbAdmin
      .insert(merchants)
      .values({
        slug,
        name,
        email,
        passwordHash,
        brandVoice: brandVoice.slice(0, 200),
        themeVars: matchedTheme.themeVars,
        // approvedAt defaults to null = pending; leave blank, don't set.
      })
      .returning({ id: merchants.id, slug: merchants.slug });
  } catch (err) {
    // pg unique violation: SQLSTATE 23505. When drizzle leaks the message it usually contains
    // "duplicate key value violates unique constraint <name>". We use the constraint name
    // to distinguish slug vs email duplicate (different message, gives the user a clear hint).
    const msg = err instanceof Error ? err.message.toLowerCase() : '';
    if (msg.includes('duplicate') || msg.includes('unique')) {
      // email constraint name = merchants_email_unique_idx (schema 0008)
      if (msg.includes('email')) {
        await logAttempt({ ip, slug, result: 'duplicate_slug' });
        return { error: '此 email 已註冊, 換一個試試' };
      }
      await logAttempt({ ip, slug, result: 'duplicate_slug' });
      return { error: `slug 「${slug}」已被使用, 換一個試試` };
    }
    await logAttempt({ ip, slug, result: 'invalid_slug' });
    return { error: err instanceof Error ? err.message : '建立失敗' };
  }

  // ─── 6. Success: log + redirect to pending ───
  // Note: no cookie set / no auto-login. Admin must approve first (V1.7 flow); only after approval
  // can the merchant use email + password from /merchant/login to enter the backend (V2 task 104 flow).
  await logAttempt({ ip, slug, result: 'success' });

  // redirect must be outside try (Next.js redirect uses a throw mechanism)
  redirect('/onboarding/pending');
}
