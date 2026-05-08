/**
 * V1 + V2 middleware (Edge runtime — pure crypto only, no DB)
 *
 * - /admin/* (excluding /admin/login) — verifies admin-session cookie HMAC; missing/bad
 *   redirects to /admin/login (V1 #43, RA11). DB-layer session liveness check lives in
 *   (admin)/layout.tsx (V1.6 E11 defense-in-depth).
 *
 * - /merchant/* (excluding /merchant/login + /merchant/signup + /merchant/logout) —
 *   verifies merchant-session cookie HMAC; missing/bad redirects to /merchant/login?next=...
 *   (V2 task 103). DB row liveness + revoked + suspended/approved checks in
 *   (merchant)/layout.tsx and resolveMerchantFromCookie() (E11 defense-in-depth, V2 task 105).
 *
 * - /onboarding/* — signup flow, no auth required, pass-through (not in matcher; this
 *   comment is documentation belt-and-suspenders).
 *
 * V2 task 105: legacy demo-merchant-id cookie handling fully removed — all consumers
 *   now go through merchant-session. /merchant-switcher route also deleted (per-merchant
 *   auth has no switcher concept; one login per merchant). Visiting /merchant-switcher
 *   returns 404 — this is OK.
 *
 * Missing env (admin/merchant secret) → 503. Matches admin pattern.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { ADMIN_SESSION_COOKIE, verifyCookieSignatureEdge as verifyAdminEdge } from '@/lib/admin-session-edge';
import {
  MERCHANT_SESSION_COOKIE,
  verifyCookieSignatureEdge as verifyMerchantEdge,
} from '@/lib/merchant-session-edge';

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  // ─── /admin/* gate ───
  if (path.startsWith('/admin')) {
    // /admin/login is unguarded (user needs to log in)
    if (path === '/admin/login' || path.startsWith('/admin/login/')) {
      return NextResponse.next();
    }

    // Missing env → 503
    const password = process.env.ADMIN_PASSWORD;
    const secret = process.env.ADMIN_SESSION_SECRET;
    if (!password || !secret || secret.length < 32) {
      return new NextResponse(
        'Admin gate not configured (ADMIN_PASSWORD or ADMIN_SESSION_SECRET missing/invalid)',
        { status: 503 },
      );
    }

    // Verify cookie HMAC
    const cookieValue = req.cookies.get(ADMIN_SESSION_COOKIE)?.value;
    const sessionId = await verifyAdminEdge(cookieValue, secret);
    if (!sessionId) {
      const url = req.nextUrl.clone();
      url.pathname = '/admin/login';
      url.searchParams.set('next', path);
      return NextResponse.redirect(url);
    }

    // HMAC OK — server component will do the DB liveness check
    return NextResponse.next();
  }

  // ─── /merchant/* gate (V2 task 103, 105 finalized) ───
  if (path.startsWith('/merchant')) {
    // /merchant/login + /merchant/signup + /merchant/logout are unguarded
    // (login/signup pages don't require auth; logout is an idempotent route — fine to call
    //  without a cookie → just redirects to login)
    const isPublicMerchantPath =
      path === '/merchant/login' ||
      path.startsWith('/merchant/login/') ||
      path === '/merchant/signup' ||
      path.startsWith('/merchant/signup/') ||
      path === '/merchant/logout' ||
      path.startsWith('/merchant/logout/');

    if (isPublicMerchantPath) {
      return NextResponse.next();
    }

    // Missing env → 503 (matches admin pattern)
    const merchantSecret = process.env.MERCHANT_SESSION_SECRET;
    if (!merchantSecret || merchantSecret.length < 32) {
      return new NextResponse(
        'Merchant gate not configured (MERCHANT_SESSION_SECRET missing or <32 chars)',
        { status: 503 },
      );
    }

    // Verify cookie HMAC
    const cookieValue = req.cookies.get(MERCHANT_SESSION_COOKIE)?.value;
    const sessionId = await verifyMerchantEdge(cookieValue, merchantSecret);
    if (!sessionId) {
      const url = req.nextUrl.clone();
      url.pathname = '/merchant/login';
      url.searchParams.set('next', path);
      return NextResponse.redirect(url);
    }

    // HMAC OK — (merchant)/layout.tsx + resolveMerchantFromCookie() handle DB row liveness +
    // revoked + suspended/approved checks (V2 task 105, E11 defense-in-depth).
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  // /onboarding not in matcher → middleware doesn't run → auto pass-through (signup needs no auth)
  // V2 task 105: /merchant-switcher no longer matches (route deleted) — visiting returns 404, by design.
  matcher: ['/merchant/:path*', '/admin/:path*'],
};
