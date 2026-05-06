/**
 * Vercel Analytics beforeSend filter — V2.6 distribution sprint.
 *
 * Two jobs:
 * 1. Drop events for non-public surfaces. Admin and merchant pages are not
 *    visited by recruiters / engineers / AI crawlers — counting them
 *    inflates the V2.6 90-day sunset gate (operator + smoke checks).
 * 2. Strip PII from URLs. Order IDs, import session IDs, and cookie-bound
 *    merchant IDs are UUIDs that should not land in any third-party
 *    analytics dashboard. Vercel Analytics is cookie-less and IP-anonymized,
 *    but URL paths still contain customer-identifying data.
 *
 * Public surfaces (events ALLOWED through):
 *   /, /about, /privacy, /terms,
 *   /store/<slug>, /store/<slug>/product/<slug>
 *
 * Filtered surfaces (events DROPPED, beforeSend returns null):
 *   /admin/**            — platform admin
 *   /merchant/**         — merchant dashboard (post-login)
 *   /api/**              — API routes
 *   /store/<slug>/order/<uuid>  — order detail (PII)
 *   /store/<slug>/checkout      — checkout (cart contents in URL params)
 *   /merchant/products/import/<uuid> — import session (PII)
 *   any URL containing a UUID-shaped path segment
 *
 * The filter is split into a pure function so it's unit-testable without
 * importing @vercel/analytics — the package's BeforeSendEvent type is a
 * client-only type and can't load in node test runner.
 */

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const FILTERED_PREFIXES = ['/admin', '/merchant', '/api'];

/**
 * Returns true if the URL path should be reported to analytics.
 * Returns false if the URL is a private surface or contains PII.
 */
export function shouldReportEvent(urlOrPath: string): boolean {
  let pathname: string;
  try {
    // Accept full URLs ("https://demo-sass-2.vercel.app/store/akami") and bare
    // paths ("/store/akami"). URL constructor needs a base for bare paths.
    const u = new URL(urlOrPath, 'https://placeholder.invalid');
    pathname = u.pathname;
  } catch {
    return false;
  }

  // Private surfaces and API routes — drop entirely.
  for (const prefix of FILTERED_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return false;
    }
  }

  // Storefront order detail and checkout contain PII (order ID in path,
  // cart items in query string). Drop the whole event.
  if (/^\/store\/[^/]+\/(order|checkout)(\/|$)/.test(pathname)) {
    return false;
  }

  // Anything else carrying a UUID is treated as PII-bearing and dropped.
  // (e.g. future routes we forget to add to FILTERED_PREFIXES.)
  if (UUID_RE.test(pathname)) {
    return false;
  }

  return true;
}

/**
 * Vercel Analytics beforeSend hook. Returns the event unchanged for public
 * paths, returns null for paths that should not be tracked.
 *
 * Typed loosely (`{ url: string }`) so this module can be imported by tests
 * without dragging in the @vercel/analytics client-only types.
 */
export function analyticsBeforeSend<T extends { url: string }>(event: T): T | null {
  return shouldReportEvent(event.url) ? event : null;
}
