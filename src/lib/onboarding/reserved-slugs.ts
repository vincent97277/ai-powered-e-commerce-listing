/**
 * Reserved slug list (V1.7 D1) — application-layer block on /onboarding.
 *
 * Why blocklist (not just collision check on existing routes):
 *   - Future routes don't exist yet, but an attacker registering 'admin' / 'api' now
 *     would squat the slot — locked out forever once we ship.
 *   - Some names may collide with Next.js built-ins / static assets (_next, public, static, assets)
 *   - Some marketing / system pages only ship in V2 (about, privacy, terms, help, support)
 *
 * Matching is case-insensitive (slug is already lowercased, but extra defense).
 *
 * V2 candidates:
 *   - Move this list into a DB table maintained via admin UI
 *   - Add a brand-protection list (big brand names 'apple', 'google', ...) — V1.7 skip, scope creep.
 */

export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  // Platform reserved paths
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
  // Merchant back-office routes (won't collide if (merchant) is later switched to path-based routing)
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
