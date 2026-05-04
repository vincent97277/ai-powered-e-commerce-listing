/**
 * V1 + V2 middleware (Edge runtime — pure crypto only, no DB)
 *
 * - /admin/* (排除 /admin/login) — 驗 admin-session cookie HMAC, 缺/壞 redirect 到 /admin/login
 *   (V1 #43, RA11) DB 層 session 存活檢查在 (admin)/layout.tsx (V1.6 E11 defense-in-depth)
 *
 * - /merchant/* (排除 /merchant/login + /merchant/signup + /merchant/logout) — 驗
 *   merchant-session cookie HMAC, 缺/壞 redirect 到 /merchant/login?next=... (V2 task 103).
 *   DB row liveness + revoked + suspended/approved 在 (merchant)/layout.tsx 跟
 *   resolveMerchantFromCookie() (E11 defense-in-depth, V2 task 105).
 *
 * - /onboarding/* — 註冊流程, 不需登入, 直接放行 (但 matcher 沒列, 這裡是雙保險文件)
 *
 * V2 task 105: 完全移除 legacy demo-merchant-id cookie 處理 — 所有 consumers 已
 *   改走 merchant-session. /merchant-switcher route 也已刪除 (per-merchant auth 沒
 *   切換概念, 一次登一家). 訪 /merchant-switcher 會 404 — 這 OK.
 *
 * env 缺 (admin/merchant 任一 secret) → 503. matches admin pattern.
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
    // /admin/login 不擋 (使用者要登入)
    if (path === '/admin/login' || path.startsWith('/admin/login/')) {
      return NextResponse.next();
    }

    // env 缺 → 503
    const password = process.env.ADMIN_PASSWORD;
    const secret = process.env.ADMIN_SESSION_SECRET;
    if (!password || !secret || secret.length < 32) {
      return new NextResponse(
        'Admin gate not configured (ADMIN_PASSWORD or ADMIN_SESSION_SECRET missing/invalid)',
        { status: 503 },
      );
    }

    // 驗 cookie HMAC
    const cookieValue = req.cookies.get(ADMIN_SESSION_COOKIE)?.value;
    const sessionId = await verifyAdminEdge(cookieValue, secret);
    if (!sessionId) {
      const url = req.nextUrl.clone();
      url.pathname = '/admin/login';
      url.searchParams.set('next', path);
      return NextResponse.redirect(url);
    }

    // HMAC OK — server component 會再做 DB 存活 check
    return NextResponse.next();
  }

  // ─── /merchant/* gate (V2 task 103, 105 finalized) ───
  if (path.startsWith('/merchant')) {
    // /merchant/login + /merchant/signup + /merchant/logout 不擋
    // (登入/註冊頁本身不需登入; logout 是 idempotent route, 沒 cookie 也能呼叫 → 直接 redirect 到 login)
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

    // env 缺 → 503 (matches admin pattern)
    const merchantSecret = process.env.MERCHANT_SESSION_SECRET;
    if (!merchantSecret || merchantSecret.length < 32) {
      return new NextResponse(
        'Merchant gate not configured (MERCHANT_SESSION_SECRET missing or <32 chars)',
        { status: 503 },
      );
    }

    // 驗 cookie HMAC
    const cookieValue = req.cookies.get(MERCHANT_SESSION_COOKIE)?.value;
    const sessionId = await verifyMerchantEdge(cookieValue, merchantSecret);
    if (!sessionId) {
      const url = req.nextUrl.clone();
      url.pathname = '/merchant/login';
      url.searchParams.set('next', path);
      return NextResponse.redirect(url);
    }

    // HMAC OK — (merchant)/layout.tsx + resolveMerchantFromCookie() 會做 DB row liveness +
    // revoked + suspended/approved checks (V2 task 105, E11 defense-in-depth).
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  // /onboarding 不在 matcher → middleware 不跑 → 自動放行 (註冊流程不需登入)
  // V2 task 105: /merchant-switcher 不再 match (route 已刪) — 訪會 404, by design.
  matcher: ['/merchant/:path*', '/admin/:path*'],
};
