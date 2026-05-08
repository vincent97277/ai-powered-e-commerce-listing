/**
 * Homepage merchant cards — productCount must match storefront-visible products.
 *
 * Bug history: V2.6.x bug report — homepage merchant cards showed total
 * product count including drafts (`is_published = false`). Storefront page
 * (`src/app/(storefront)/store/[slug]/page.tsx:63`) filters
 * `WHERE is_published = true`, so the card count was always >= storefront
 * count. Customer clicks "5 件商品" card, sees only 2 products on the
 * storefront → confusion + trust hit.
 *
 * This test pins the contract: count what the storefront shows, nothing more.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dbAdmin } from '@/db';
import { merchants, products } from '@/db/schema';
import { eq } from 'drizzle-orm';
import {
  getFeaturedMerchants,
  getRecentMerchants,
  getPlatformStats,
} from '@/lib/platform/featured-merchants';
import type { ProductAiMetadata } from '@/db/schema';

// Reserved UUID prefix for this test only — won't collide with v1-integration
// fixtures (88888888-) or demo data (11111111-/22222222-).
const TENANT = '66666666-1111-1111-1111-111111111111';
const NEEDED_TITLE_PREFIX = 'featured-merchants-test:';

const STUB_AI_META: ProductAiMetadata = {
  title: 'stub',
  description: 'stub',
  category: '其他',
  seo_tags: [],
  variants: [],
  price_twd: { min: 0, max: 0 },
  confidence: 0.5,
};

beforeAll(async () => {
  // Approved + non-suspended merchant
  await dbAdmin
    .insert(merchants)
    .values({
      id: TENANT,
      slug: 'fmtest',
      name: 'featured-merchants test merchant',
      themeVars: {},
      approvedAt: new Date(),
      approvedByAdmin: 'system',
    })
    .onConflictDoNothing();

  // Wipe any leftover test products from prior failed runs
  await dbAdmin.delete(products).where(eq(products.tenantId, TENANT));

  // Seed 3 published + 2 unpublished products. The card count should report 3.
  const rows = [
    { is_published: true, title: 'P1' },
    { is_published: true, title: 'P2' },
    { is_published: true, title: 'P3' },
    { is_published: false, title: 'D1-draft' },
    { is_published: false, title: 'D2-draft' },
  ];
  await dbAdmin.insert(products).values(
    rows.map((r) => ({
      tenantId: TENANT,
      title: NEEDED_TITLE_PREFIX + r.title,
      description: 'fixture',
      r2Key: `test/featured-merchants/${r.title}.jpg`,
      aiMetadata: STUB_AI_META,
      isPublished: r.is_published,
      productStatus: 'active' as const,
    })),
  );
});

afterAll(async () => {
  await dbAdmin.delete(products).where(eq(products.tenantId, TENANT));
  await dbAdmin.delete(merchants).where(eq(merchants.id, TENANT));
});

describe('homepage merchant cards — productCount matches storefront', () => {
  it('getFeaturedMerchants counts only is_published=true', async () => {
    const featured = await getFeaturedMerchants(50);
    const me = featured.find((m) => m.id === TENANT);
    expect(me, 'test merchant should appear in featured').toBeTruthy();
    // 3 published, NOT 5 total
    expect(me!.productCount).toBe(3);
  });

  it('getRecentMerchants counts only is_published=true', async () => {
    const recent = await getRecentMerchants(50);
    const me = recent.find((m) => m.id === TENANT);
    expect(me, 'test merchant should appear in recent (just inserted)').toBeTruthy();
    expect(me!.productCount).toBe(3);
  });

  it('getPlatformStats productCount excludes drafts + suspended/unapproved tenants', async () => {
    // Snapshot before
    const stats1 = await getPlatformStats();

    // Add 1 more published product → +1
    await dbAdmin.insert(products).values({
      tenantId: TENANT,
      title: NEEDED_TITLE_PREFIX + 'extra-published',
      description: 'fixture',
      r2Key: 'test/featured-merchants/extra.jpg',
      aiMetadata: STUB_AI_META,
      isPublished: true,
      productStatus: 'active',
    });

    const stats2 = await getPlatformStats();
    expect(stats2.productCount - stats1.productCount).toBe(1);

    // Add 1 unpublished → 0 delta
    await dbAdmin.insert(products).values({
      tenantId: TENANT,
      title: NEEDED_TITLE_PREFIX + 'extra-draft',
      description: 'fixture',
      r2Key: 'test/featured-merchants/extra-draft.jpg',
      aiMetadata: STUB_AI_META,
      isPublished: false,
      productStatus: 'active',
    });

    const stats3 = await getPlatformStats();
    expect(stats3.productCount - stats2.productCount).toBe(0);
  });
});
