/**
 * V1 middleware
 * - (merchant)/* — cookie 'demo-merchant-id' → x-tenant-id header
 * - storefront /store/{slug} — slug → tenant resolver (見 src/lib/tenant/resolver.ts)
 * - /admin/* (排除 /admin/login) — 驗 admin-session cookie HMAC, 缺/壞 redirect 到 /admin/login
 *   (DB 層 session 存活檢查在 server component 內做, middleware 只做純 crypto check)
 */
import { NextResponse, type NextRequest } from 'next/server';
import { ADMIN_SESSION_COOKIE, verifyCookieSignatureEdge } from '@/lib/admin-session-edge';

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
    const sessionId = await verifyCookieSignatureEdge(cookieValue, secret);
    if (!sessionId) {
      const url = req.nextUrl.clone();
      url.pathname = '/admin/login';
      url.searchParams.set('next', path);
      return NextResponse.redirect(url);
    }

    // HMAC OK — server component 會再做 DB 存活 check
    return NextResponse.next();
  }

  // ─── (merchant)/* — 既有邏輯 ───
  if (path.startsWith('/merchant')) {
    const tenantId = req.cookies.get('demo-merchant-id')?.value ?? 'akami';
    const res = NextResponse.next();
    res.headers.set('x-tenant-id', tenantId);
    return res;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/merchant/:path*', '/admin/:path*'],
};
