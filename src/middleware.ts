/**
 * Hackathon 簡化版 middleware
 * - 從 cookie 'demo-merchant-id' 讀 tenant，預設 akami
 * - 對 (merchant) 路由群組注入 x-tenant-id header
 * - storefront 路由用 slug → tenant resolver (見 src/lib/tenant/resolver.ts)
 * - admin 路由不檢查 tenant，直接 dbAdmin
 */
import { NextResponse, type NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  const tenantId = req.cookies.get('demo-merchant-id')?.value ?? 'akami';
  const res = NextResponse.next();
  if (req.nextUrl.pathname.startsWith('/merchant')) {
    res.headers.set('x-tenant-id', tenantId);
  }
  return res;
}

export const config = { matcher: ['/merchant/:path*'] };
