/**
 * Reserved slug list (V1.7 D1) — application-layer block on /onboarding.
 *
 * Why blocklist (not just collision check on existing routes):
 *   - Future routes 還沒加, 但 attacker 現在註冊 'admin' / 'api' 就佔位 → 之後就佔死
 *   - 部分名稱有可能跟 Next.js 內建 / static asset 衝突 (_next, public, static, assets)
 *   - 一些 marketing / system pages V2 才會建 (about, privacy, terms, help, support)
 *
 * Match 是 case-insensitive (slug 已 lowercase, 但這層多保險一次).
 *
 * V2 可考慮:
 *   - 把這份搬 DB 表, 給 admin UI 維護
 *   - 加 brand-protection list (大品牌名稱 'apple', 'google', ...) — V1.7 不做, scope creep.
 */

export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  // 平台保留路徑
  'admin',
  'api',
  'www',
  'app',
  'store',
  'merchant',
  'account',
  // Auth / signup
  'login',
  'logout',
  'signup',
  'signin',
  'register',
  'onboarding',
  // Legal / marketing
  'about',
  'privacy',
  'terms',
  'help',
  'support',
  'contact',
  // Static / framework reserved
  'static',
  '_next',
  'public',
  'assets',
  'favicon',
  // 商家後台 routes (未來如把 (merchant) 改 path-based 也不會撞)
  'dashboard',
  'settings',
  'orders',
  'products',
  'cart',
  'checkout',
]);

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug.toLowerCase());
}
