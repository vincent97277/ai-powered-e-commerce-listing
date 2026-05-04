'use server';

/**
 * Merchant login server action (V2 task 104, 105 finalized) — mirrors /admin/login/actions.ts.
 *
 * Flow:
 *   1. read email + password + next from FormData
 *   2. validate next is internal (starts with /merchant) — reject open redirect
 *   3. call loginMerchant() → checks bcrypt + suspended + pending status
 *   4. on success: set merchant-session cookie (only)
 *   5. redirect(next)
 *
 * V2 task 105 移除過渡用 demo-merchant-id cookie — 全部 consumers 已透過
 * resolveMerchantFromCookie() 讀 merchant-session cookie.
 *
 * Error messages from loginMerchant are already i18n (繁中) and intentionally generic
 * for credential failures (no username enumeration). Status errors (suspended / pending)
 * surface only post-credential.
 */
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  MERCHANT_SESSION_COOKIE,
  MERCHANT_SESSION_DURATION_MS,
  loginMerchant,
} from '@/lib/merchant-session';

export type LoginState = { error?: string } | undefined;

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = formData.get('email');
  const password = formData.get('password');
  const next = formData.get('next');

  if (typeof email !== 'string' || typeof password !== 'string') {
    return { error: '請輸入 email 與密碼' };
  }

  // Internal-only redirect — block /evil.com / //evil.com / http://... etc.
  // 必須 startsWith '/merchant' AND NOT '//' (protocol-relative).
  let nextPath = '/merchant';
  if (typeof next === 'string' && next.startsWith('/merchant') && !next.startsWith('//')) {
    nextPath = next;
  }

  const h = await headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? undefined;
  const userAgent = h.get('user-agent') ?? undefined;

  const result = await loginMerchant(email, password, { ip, userAgent });
  if (!result.success) {
    return { error: result.error };
  }

  const c = await cookies();
  c.set(MERCHANT_SESSION_COOKIE, result.cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: result.expiresAt,
    maxAge: Math.floor(MERCHANT_SESSION_DURATION_MS / 1000),
  });

  redirect(nextPath);
}
