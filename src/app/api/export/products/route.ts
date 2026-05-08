/**
 * GET /api/export/products?format=xlsx|shopee_csv&filter=
 *
 * V1.5 Track B2: product Excel + Shopee CSV export (single chokepoint)
 *   - withTenantTx (RLS-safe) fetches the current merchant's products
 *   - filter aligned with /merchant/products: low-stock | no_photo | short_title | zero_stock | zero_price
 *   - format=xlsx → exceljs Buffer
 *   - format=shopee_csv → Shopee 21-column CSV (UTF-8 BOM)
 */
import { NextRequest, NextResponse } from 'next/server';
import { resolveMerchantFromCookie } from '@/lib/storage/resolve-merchant';
import { assertNotSuspended, MerchantSuspendedError } from '@/lib/merchant/suspend-guard';
import { withTenantTx } from '@/lib/db/with-tenant';
import { products, merchants, type Product } from '@/db/schema';
import { desc, eq, lte, sql, type SQL } from 'drizzle-orm';
import { generateProductsXlsx } from '@/lib/export/products-xlsx';
import { generateShopeeCsv } from '@/lib/export/shopee-csv';

/**
 * V1.5 review H2: Content-Disposition injection-defense helper (same pattern as orders route)
 */
function buildContentDisposition(filename: string): string {
  const safe = filename.replace(/[\r\n"]/g, '_');
  return `attachment; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}

export const runtime = 'nodejs';

const VALID_FORMATS = ['xlsx', 'shopee_csv'] as const;
type Format = (typeof VALID_FORMATS)[number];

function isFormat(s: unknown): s is Format {
  return typeof s === 'string' && (VALID_FORMATS as readonly string[]).includes(s);
}

const HEALTH_FILTERS = ['no_photo', 'short_title', 'zero_stock', 'zero_price'] as const;
type HealthFilter = (typeof HEALTH_FILTERS)[number];

function isHealthFilter(s: unknown): s is HealthFilter {
  return typeof s === 'string' && (HEALTH_FILTERS as readonly string[]).includes(s);
}

export async function GET(req: NextRequest) {
  try {
    const merchant = await resolveMerchantFromCookie();

    // V1.5 review H1: suspended merchants cannot export (aligned with /api/products/generate's suspend guard)
    try {
      await assertNotSuspended(merchant.tenantId);
    } catch (err) {
      if (err instanceof MerchantSuspendedError) {
        return NextResponse.json({ success: false, error: err.message }, { status: 403 });
      }
      throw err;
    }

    const url = new URL(req.url);
    const formatParam = url.searchParams.get('format') ?? 'xlsx';
    const format: Format = isFormat(formatParam) ? formatParam : 'xlsx';
    const filterParam = url.searchParams.get('filter');

    const items: Product[] = await withTenantTx(merchant.tenantId, async (tx) => {
      // merchants table has no RLS; web_anon has SELECT → read own row via dbUser to get threshold
      let threshold = 5;
      if (filterParam === 'low-stock') {
        const [row] = await tx
          .select({ lowStockThreshold: merchants.lowStockThreshold })
          .from(merchants)
          .where(eq(merchants.id, merchant.tenantId))
          .limit(1);
        threshold = row?.lowStockThreshold ?? 5;
      }

      let whereClause: SQL | undefined;
      if (filterParam === 'low-stock') {
        whereClause = lte(products.stockQuantity, threshold);
      } else if (isHealthFilter(filterParam)) {
        if (filterParam === 'no_photo') {
          // V1.5 review M4: fixture demo images count as no_photo too (aligned with health-checks.ts / list page)
          whereClause = sql`${products.r2Key} IS NULL OR ${products.r2Key} = '' OR ${products.r2Key} LIKE '%/fixtures/%'`;
        } else if (filterParam === 'short_title') {
          whereClause = sql`length(${products.title}) < 8`;
        } else if (filterParam === 'zero_stock') {
          whereClause = sql`${products.stockQuantity} = 0`;
        } else if (filterParam === 'zero_price') {
          whereClause = sql`${products.priceCents} = 0 OR ${products.priceCents} IS NULL`;
        }
      }

      const base = tx.select().from(products);
      const filtered = whereClause ? base.where(whereClause) : base;
      return await filtered.orderBy(desc(products.createdAt)).limit(5000);
    });

    const today = new Date().toISOString().slice(0, 10);

    // V1.5 review M2: silent truncate signal — lets client know whether the 5000-row cap was hit
    const truncated = items.length === 5000 ? '1' : '0';
    const truncationHeaders = {
      'X-Export-Row-Count': String(items.length),
      'X-Export-Truncated': truncated,
    };

    if (format === 'shopee_csv') {
      const csv = generateShopeeCsv(items);
      const filename = `products-shopee-${today}.csv`;
      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': buildContentDisposition(filename),
          'Cache-Control': 'no-store',
          ...truncationHeaders,
        },
      });
    }

    // xlsx (default)
    const buffer = await generateProductsXlsx(items);
    const filename = `products-${today}.xlsx`;
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': buildContentDisposition(filename),
        'Cache-Control': 'no-store',
        ...truncationHeaders,
      },
    });
  } catch (err) {
    console.error('[/api/export/products] error', err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : '匯出失敗' },
      { status: 500 },
    );
  }
}
