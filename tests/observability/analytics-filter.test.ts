/**
 * V2.6 T3 — Vercel Analytics beforeSend filter.
 *
 * The filter is the load-bearing primitive for V2.6's 90-day sunset gate:
 * inflated counts from operator-traffic / smoke checks / PII-bearing URLs
 * would corrupt the success criterion. These tests pin behavior so a future
 * refactor cannot silently re-enable PII collection.
 */
import { describe, it, expect } from 'vitest';
import { shouldReportEvent, analyticsBeforeSend } from '@/lib/observability/analytics-filter';

describe('shouldReportEvent — public surfaces (allowed)', () => {
  it.each([
    '/',
    '/about',
    '/privacy',
    '/terms',
    '/store/akami',
    '/store/afen',
    '/store/akami/product/leather-bag',
    '/store/akami/product/some-slug-with-dashes',
  ])('allows %s', (path) => {
    expect(shouldReportEvent(path)).toBe(true);
  });

  it('accepts a full URL (Vercel passes event.url as absolute)', () => {
    expect(shouldReportEvent('https://demo-sass-2.vercel.app/store/akami')).toBe(true);
  });
});

describe('shouldReportEvent — private surfaces (dropped)', () => {
  it.each([
    '/admin',
    '/admin/',
    '/admin/queue',
    '/admin/merchants',
    '/admin/observability/ai-cost',
    '/merchant',
    '/merchant/',
    '/merchant/products',
    '/merchant/orders/all',
    '/merchant/settings',
    '/api',
    '/api/inngest',
    '/api/health',
    '/api/v1/some/route',
  ])('drops %s (private surface prefix)', (path) => {
    expect(shouldReportEvent(path)).toBe(false);
  });
});

describe('shouldReportEvent — PII URLs (dropped)', () => {
  it('drops storefront order detail (order ID UUID in path)', () => {
    expect(
      shouldReportEvent('/store/akami/order/550e8400-e29b-41d4-a716-446655440000'),
    ).toBe(false);
  });

  it('drops storefront checkout (cart items in query string typically)', () => {
    expect(shouldReportEvent('/store/akami/checkout')).toBe(false);
    expect(shouldReportEvent('/store/akami/checkout/confirm')).toBe(false);
  });

  it('drops merchant import session URLs (session ID UUID in path)', () => {
    expect(
      shouldReportEvent('/merchant/products/import/12345678-1234-1234-1234-123456789abc'),
    ).toBe(false);
  });

  it('drops any URL containing a UUID even if not in a known filter prefix', () => {
    // belt-and-suspenders: forgot-future-route protection.
    expect(
      shouldReportEvent('/some/new/route/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'),
    ).toBe(false);
  });

  it('drops UUID in any case', () => {
    expect(
      shouldReportEvent('/store/x/order/AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE'),
    ).toBe(false);
  });
});

describe('shouldReportEvent — edge cases', () => {
  it('returns false for malformed URLs', () => {
    // The URL constructor accepts most strings, but truly malformed ones throw.
    // The placeholder base means even bare paths parse, so we're checking the
    // try/catch fallback exists. Pass an unparseable scheme to force it.
    expect(shouldReportEvent('http://[::1:bad')).toBe(false);
  });

  it('treats /admin-foo (no slash separator) as PUBLIC — startsWith requires "/" delimiter', () => {
    // Defensive: if a future public route is named e.g. /administration,
    // we should not accidentally drop it because of /admin prefix match.
    expect(shouldReportEvent('/admin-foo')).toBe(true);
    expect(shouldReportEvent('/merchant-news')).toBe(true);
  });

  it('drops trailing slash variants of private surfaces', () => {
    expect(shouldReportEvent('/admin/')).toBe(false);
    expect(shouldReportEvent('/merchant/')).toBe(false);
  });
});

describe('analyticsBeforeSend — Vercel Analytics hook adapter', () => {
  it('returns the event unchanged for public paths', () => {
    const event = { url: 'https://demo-sass-2.vercel.app/store/akami' };
    expect(analyticsBeforeSend(event)).toBe(event);
  });

  it('returns null for private paths', () => {
    const event = { url: 'https://demo-sass-2.vercel.app/admin/queue' };
    expect(analyticsBeforeSend(event)).toBeNull();
  });

  it('returns null for PII-bearing paths', () => {
    const event = {
      url: 'https://demo-sass-2.vercel.app/store/akami/order/550e8400-e29b-41d4-a716-446655440000',
    };
    expect(analyticsBeforeSend(event)).toBeNull();
  });

  it('preserves additional event fields when allowing', () => {
    const event = { url: 'https://demo-sass-2.vercel.app/about', name: 'pageview' };
    expect(analyticsBeforeSend(event)).toEqual(event);
  });
});
