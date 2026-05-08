/**
 * /merchant/logout — POST handler (V2 task 104, 105 finalized)
 *
 * Why a route and not a server action: triggered directly by the layout header's logout button
 * via <form> POST — works without client-side hydration. Pure server-rendered, no JS required.
 *
 * Behavior:
 *   1. read merchant-session cookie → verify HMAC → revoke DB row (revoked_at = now())
 *   2. clear merchant-session cookie
 *   3. 303 → /merchant/login
 *
 * Idempotent: no cookie / bad signature / DB row already revoked → still clears cookie + redirects, no error.
 *
 * Security: revoke must hit the DB — clearing the cookie alone isn't enough. If an attacker grabs
 *           the cookie value on another device, revoke marks the DB row revoked_at and
 *           validateMerchantSession blocks immediately.
 *
 * V2 task 105: no longer clears the demo-merchant-id transitional cookie (login no longer sets it).
 */
import { NextResponse, type NextRequest } from 'next/server';
import {
  MERCHANT_SESSION_COOKIE,
  revokeMerchantSession,
  verifyCookieSignature,
} from '@/lib/merchant-session';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const cookieValue = req.cookies.get(MERCHANT_SESSION_COOKIE)?.value;

  // Valid signature → extract sessionId → revoke DB row. If signature is bad, just skip (clearing the cookie is enough).
  if (cookieValue) {
    const sessionId = verifyCookieSignature(cookieValue);
    if (sessionId) {
      try {
        await revokeMerchantSession(sessionId);
      } catch (err) {
        // A failed revoke write must not block the logout flow (e.g. DB hiccup); log + continue clearing the cookie.
        console.error('[merchant/logout] revoke failed', err);
      }
    }
  }

  const url = req.nextUrl.clone();
  url.pathname = '/merchant/login';
  url.search = '';
  const res = NextResponse.redirect(url, 303); // 303 see-other: POST → GET semantic

  res.cookies.set(MERCHANT_SESSION_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: new Date(0),
    maxAge: 0,
  });

  return res;
}

// GET → method-not-allowed (logout must be POST to prevent CSRF / prefetch-as-logout)
export async function GET() {
  return new NextResponse('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } });
}
