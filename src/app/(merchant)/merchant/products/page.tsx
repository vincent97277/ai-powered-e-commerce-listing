/**
 * 商家商品列表 — 看自己所有商品 (透過 RLS, 只看到自己的)
 */
import Link from 'next/link';
import { cookies } from 'next/headers';
import { resolveMerchantFromCookie } from '@/lib/storage/resolve-merchant';
import { withTenantTx } from '@/lib/db/with-tenant';
import { products, orderItems, merchants } from '@/db/schema';
import { asc, desc, eq, lte, sql, type SQL } from 'drizzle-orm';
import { Plus, Package, ImageIcon, AlertTriangle } from 'lucide-react';
import { ProductRowActions } from './ProductRowActions';
import { dbAdmin } from '@/db/admin-only';
import { ExportDropdown } from '@/components/merchant/ExportDropdown';

/** V1.5 B1: 健康度 filter 種類 (對齊 src/lib/merchant/health-checks.ts). */
const HEALTH_FILTERS = ['no_photo', 'short_title', 'zero_stock', 'zero_price'] as const;
type HealthFilter = (typeof HEALTH_FILTERS)[number];

const HEALTH_FILTER_LABELS: Record<HealthFilter, string> = {
  no_photo: '缺照片',
  short_title: '標題太短',
  zero_stock: '缺貨',
  zero_price: '未定價',
};

function isHealthFilter(s: unknown): s is HealthFilter {
  return typeof s === 'string' && (HEALTH_FILTERS as readonly string[]).includes(s);
}

export const dynamic = 'force-dynamic';

const SORT_OPTIONS = {
  sales: '銷量 (高 → 低)',
  createdAt: '建立時間 (新 → 舊)',
  stock: '庫存 (少 → 多)',
  title: '標題 (A → Z)',
} as const;
type SortKey = keyof typeof SORT_OPTIONS;

function isSortKey(s: unknown): s is SortKey {
  return typeof s === 'string' && s in SORT_OPTIONS;
}

export default async function MerchantProductsList({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; filter?: string }>;
}) {
  const params = await searchParams;
  const sortKey: SortKey = isSortKey(params.sort) ? params.sort : 'sales';
  const lowStockOnly = params.filter === 'low-stock';
  const healthFilter: HealthFilter | null = isHealthFilter(params.filter) ? params.filter : null;

  const c = await cookies();
  const merchant = await resolveMerchantFromCookie(c.get('demo-merchant-id')?.value);

  // 取 lowStockThreshold from merchants (RLS 過, 但商家自己看自己沒問題)
  const [merchantRow] = await dbAdmin
    .select({ lowStockThreshold: merchants.lowStockThreshold })
    .from(merchants)
    .where(eq(merchants.id, merchant.tenantId))
    .limit(1);
  const threshold = merchantRow?.lowStockThreshold ?? 5;

  const items = await withTenantTx(merchant.tenantId, async (tx) => {
    const base = tx
      .select({
        id: products.id,
        title: products.title,
        description: products.description,
        priceCents: products.priceCents,
        stockQuantity: products.stockQuantity,
        isPublished: products.isPublished,
        productStatus: products.productStatus,
        r2Key: products.r2Key,
        createdAt: products.createdAt,
        soldCount: sql<number>`COALESCE((SELECT SUM(${orderItems.quantity})::int FROM ${orderItems} WHERE ${orderItems.productId} = ${products.id}), 0)::int`.mapWith(
          Number,
        ),
      })
      .from(products);

    let whereClause: SQL | undefined;
    if (lowStockOnly) {
      whereClause = lte(products.stockQuantity, threshold);
    } else if (healthFilter === 'no_photo') {
      // V1.5 review M4: fixture demo 圖也算 no_photo (跟 health-checks.ts 對齊)
      whereClause = sql`${products.r2Key} IS NULL OR ${products.r2Key} = '' OR ${products.r2Key} LIKE '%/fixtures/%'`;
    } else if (healthFilter === 'short_title') {
      whereClause = sql`length(${products.title}) < 8`;
    } else if (healthFilter === 'zero_stock') {
      whereClause = sql`${products.stockQuantity} = 0`;
    } else if (healthFilter === 'zero_price') {
      whereClause = sql`${products.priceCents} = 0 OR ${products.priceCents} IS NULL`;
    }

    const filtered = whereClause ? base.where(whereClause) : base;

    const sorted =
      sortKey === 'sales'
        ? filtered.orderBy(
            desc(sql`COALESCE((SELECT SUM(${orderItems.quantity}) FROM ${orderItems} WHERE ${orderItems.productId} = ${products.id}), 0)`),
            desc(products.createdAt),
          )
        : sortKey === 'stock'
          ? filtered.orderBy(asc(products.stockQuantity))
          : sortKey === 'title'
            ? filtered.orderBy(asc(products.title))
            : filtered.orderBy(desc(products.createdAt));

    return await sorted.limit(100);
  });

  return (
    <main
      className="min-h-screen px-4 py-6 sm:px-8 sm:py-8 lg:px-12 lg:py-10"
      style={{ backgroundColor: 'var(--brand-bg)', color: 'var(--brand-text)' }}
    >
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-col items-start gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
          <div>
            <p className="t-caption" style={{ color: 'var(--brand-primary)' }}>
              商品管理
            </p>
            <h1 className="t-h1" style={{ fontFamily: 'var(--brand-font-heading)' }}>
              你的所有商品
            </h1>
            <p className="t-small mt-1 opacity-60">
              {lowStockOnly ? `低庫存 (≤${threshold}) ` : ''}
              {healthFilter ? `${HEALTH_FILTER_LABELS[healthFilter]} ` : ''}
              {items.length} 件 · {items.filter((p) => p.isPublished).length} 件已上架
              {!lowStockOnly && !healthFilter && (() => {
                const lowCount = items.filter((p) => p.stockQuantity <= threshold).length;
                return lowCount > 0 ? ` · ${lowCount} 件低庫存` : '';
              })()}
            </p>
          </div>
          <Link
            href="/merchant/products/new"
            className="hover-lift inline-flex min-h-[44px] w-full items-center justify-center gap-2 px-6 py-3 text-base font-semibold elev-2 sm:w-auto"
            style={{
              backgroundColor: 'var(--brand-primary)',
              color: 'var(--brand-bg)',
              borderRadius: 'var(--brand-radius)',
              fontFamily: 'var(--brand-font-heading)',
            }}
          >
            <Plus className="h-4 w-4" strokeWidth={2.4} />
            上架新商品
          </Link>
        </header>

        {/* Sort + filter toolbar */}
        <nav className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <form className="flex items-center gap-2">
            <label htmlFor="sort" className="t-caption opacity-60">排序</label>
            <select
              id="sort"
              name="sort"
              defaultValue={sortKey}
              className="min-h-[44px] border bg-transparent px-3 py-1.5 text-sm sm:min-h-0"
              style={{
                borderColor: 'color-mix(in srgb, var(--brand-primary) 28%, transparent)',
                borderRadius: 'var(--brand-radius)',
                color: 'var(--brand-text)',
              }}
            >
              {Object.entries(SORT_OPTIONS).map(([k, label]) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </select>
            {lowStockOnly && <input type="hidden" name="filter" value="low-stock" />}
            {healthFilter && <input type="hidden" name="filter" value={healthFilter} />}
            <button
              type="submit"
              className="min-h-[44px] px-2 text-xs opacity-60 underline hover:opacity-100 sm:min-h-0 sm:px-0"
              style={{ color: 'var(--brand-primary)' }}
            >
              套用
            </button>
          </form>
          <div className="-mx-4 flex items-center gap-2 overflow-x-auto whitespace-nowrap px-4 sm:mx-0 sm:ml-auto sm:overflow-visible sm:px-0">
            {healthFilter && (
              <Link
                href={`/merchant/products?sort=${sortKey}`}
                className="inline-flex min-h-[36px] shrink-0 items-center gap-1 rounded px-3 py-1.5 text-xs font-medium"
                style={{
                  backgroundColor: 'var(--warning)',
                  color: 'var(--brand-bg)',
                  borderRadius: 'var(--brand-radius)',
                }}
              >
                健康度: {HEALTH_FILTER_LABELS[healthFilter]} · 清除
              </Link>
            )}
            <ExportDropdown
              kind="products"
              currentFilter={{
                filter: lowStockOnly ? 'low-stock' : healthFilter ?? undefined,
              }}
            />
            <Link
              href={lowStockOnly ? `/merchant/products?sort=${sortKey}` : `/merchant/products?sort=${sortKey}&filter=low-stock`}
              className="inline-flex min-h-[36px] shrink-0 items-center gap-1 rounded px-3 py-1.5 text-xs font-medium"
              style={
                lowStockOnly
                  ? {
                      backgroundColor: 'var(--error)',
                      color: 'var(--brand-bg)',
                      borderRadius: 'var(--brand-radius)',
                    }
                  : {
                      border: '1px solid color-mix(in srgb, var(--error) 30%, transparent)',
                      color: 'var(--error)',
                      borderRadius: 'var(--brand-radius)',
                    }
              }
            >
              <AlertTriangle className="h-3 w-3" strokeWidth={2.4} />
              {lowStockOnly ? '顯示全部' : `只看低庫存 (≤${threshold})`}
            </Link>
          </div>
        </nav>

        {items.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center gap-4 py-24 text-center"
            style={{
              borderRadius: 'calc(var(--brand-radius) * 4)',
              backgroundColor: 'color-mix(in srgb, var(--brand-primary) 4%, transparent)',
              border: '1px dashed color-mix(in srgb, var(--brand-primary) 22%, transparent)',
            }}
          >
            <Package className="h-12 w-12 opacity-50" strokeWidth={1.4} style={{ color: 'var(--brand-primary)' }} />
            <p className="t-h3" style={{ fontFamily: 'var(--brand-font-heading)' }}>
              還沒有商品
            </p>
            <p className="t-small opacity-60">拍張照片, 60 秒生出第一件商品。</p>
            <Link
              href="/merchant/products/new"
              className="hover-lift mt-2 inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold"
              style={{
                backgroundColor: 'var(--brand-primary)',
                color: 'var(--brand-bg)',
                borderRadius: 'var(--brand-radius)',
              }}
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2.4} />
              新增第一件商品
            </Link>
          </div>
        ) : (
          <>
            {/* Mobile card list (<md) */}
            <div className="space-y-3 md:hidden">
              {items.map((p) => {
                const hasImg = p.r2Key && !p.r2Key.includes('/fixtures/');
                const stockBadge =
                  p.stockQuantity === 0
                    ? { label: '無貨', bg: 'color-mix(in srgb, var(--brand-text) 90%, transparent)', fg: 'var(--brand-bg)' }
                    : p.stockQuantity <= threshold
                      ? { label: `⚠ ${p.stockQuantity}`, bg: 'color-mix(in srgb, var(--error) 14%, transparent)', fg: 'var(--error)' }
                      : null;
                const statusLabel =
                  p.productStatus === 'needs_review' ? '需審查' : p.isPublished ? '已上架' : '草稿';
                const statusBg =
                  p.productStatus === 'needs_review'
                    ? 'color-mix(in srgb, var(--warning) 14%, transparent)'
                    : p.isPublished
                      ? 'color-mix(in srgb, var(--success) 12%, transparent)'
                      : 'color-mix(in srgb, var(--brand-primary) 8%, transparent)';
                const statusFg =
                  p.productStatus === 'needs_review'
                    ? 'var(--warning)'
                    : p.isPublished
                      ? 'var(--success)'
                      : 'color-mix(in srgb, var(--brand-text) 60%, transparent)';
                return (
                  <div
                    key={p.id}
                    className="border p-3"
                    style={{
                      borderColor: 'color-mix(in srgb, var(--brand-primary) 16%, transparent)',
                      borderRadius: 'var(--brand-radius)',
                      backgroundColor: 'var(--brand-bg)',
                    }}
                  >
                    <Link
                      href={`/merchant/products/${p.id}`}
                      className="flex min-h-[44px] items-start gap-3"
                    >
                      <div
                        className="h-14 w-14 shrink-0 overflow-hidden"
                        style={{
                          borderRadius: 'var(--brand-radius)',
                          backgroundColor: 'color-mix(in srgb, var(--brand-primary) 8%, transparent)',
                        }}
                      >
                        {hasImg ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={`/uploads/${p.r2Key}`} alt={p.title} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full items-center justify-center">
                            <ImageIcon className="h-5 w-5 opacity-40" style={{ color: 'var(--brand-primary)' }} />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p
                          className="t-body line-clamp-2 font-medium"
                          style={{ fontFamily: 'var(--brand-font-heading)' }}
                        >
                          {p.title}
                        </p>
                        <p className="t-tabular mt-1 text-sm font-semibold" style={{ color: 'var(--brand-primary)' }}>
                          NT$ {(p.priceCents / 100).toLocaleString()}
                        </p>
                      </div>
                    </Link>
                    <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3"
                      style={{ borderColor: 'color-mix(in srgb, var(--brand-primary) 10%, transparent)' }}
                    >
                      <span
                        className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs"
                        style={{
                          backgroundColor: statusBg,
                          color: statusFg,
                          borderRadius: 'var(--brand-radius)',
                        }}
                      >
                        {statusLabel}
                      </span>
                      {stockBadge ? (
                        <span
                          className="inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold tabular-nums"
                          style={{
                            backgroundColor: stockBadge.bg,
                            color: stockBadge.fg,
                            borderRadius: 'var(--brand-radius)',
                          }}
                        >
                          {stockBadge.label}
                        </span>
                      ) : (
                        <span className="text-xs tabular-nums opacity-60">庫存 {p.stockQuantity}</span>
                      )}
                      {p.soldCount > 0 && (
                        <span className="text-xs tabular-nums opacity-60">已售 {p.soldCount}</span>
                      )}
                      <div className="ml-auto">
                        <ProductRowActions
                          productId={p.id}
                          isPublished={p.isPublished}
                          merchantSlug={merchant.slug}
                          title={p.title}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop table (md+) */}
            <div
              className="hidden overflow-hidden border md:block"
              style={{
                borderColor: 'color-mix(in srgb, var(--brand-primary) 16%, transparent)',
                borderRadius: 'var(--brand-radius)',
                backgroundColor: 'var(--brand-bg)',
              }}
            >
              <table className="w-full">
              <thead
                style={{
                  borderBottom: '1px solid color-mix(in srgb, var(--brand-primary) 14%, transparent)',
                  backgroundColor: 'color-mix(in srgb, var(--brand-primary) 4%, transparent)',
                }}
              >
                <tr className="text-left">
                  <th className="t-caption px-4 py-3 font-medium" style={{ color: 'var(--brand-primary)' }}>商品</th>
                  <th className="t-caption px-4 py-3 font-medium tabular-nums" style={{ color: 'var(--brand-primary)' }}>定價</th>
                  <th className="t-caption px-4 py-3 font-medium tabular-nums" style={{ color: 'var(--brand-primary)' }}>庫存</th>
                  <th className="t-caption px-4 py-3 font-medium tabular-nums" style={{ color: 'var(--brand-primary)' }}>銷量</th>
                  <th className="t-caption px-4 py-3 font-medium" style={{ color: 'var(--brand-primary)' }}>狀態</th>
                  <th className="t-caption px-4 py-3 font-medium text-right" style={{ color: 'var(--brand-primary)' }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((p, i) => {
                  const hasImg = p.r2Key && !p.r2Key.includes('/fixtures/');
                  return (
                    <tr
                      key={p.id}
                      className="hover:bg-brand-soft transition-colors"
                      style={{
                        borderBottom: i < items.length - 1
                          ? '1px solid color-mix(in srgb, var(--brand-primary) 10%, transparent)'
                          : undefined,
                      }}
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/merchant/products/${p.id}`}
                          className="flex items-center gap-3 hover:opacity-80"
                        >
                          <div
                            className="h-12 w-12 shrink-0 overflow-hidden"
                            style={{
                              borderRadius: 'var(--brand-radius)',
                              backgroundColor: 'color-mix(in srgb, var(--brand-primary) 8%, transparent)',
                            }}
                          >
                            {hasImg ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={`/uploads/${p.r2Key}`} alt={p.title} className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full items-center justify-center">
                                <ImageIcon className="h-5 w-5 opacity-40" style={{ color: 'var(--brand-primary)' }} />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p
                              className="t-body line-clamp-1 font-medium"
                              style={{ fontFamily: 'var(--brand-font-heading)' }}
                            >
                              {p.title}
                            </p>
                            <p
                              className="t-small line-clamp-1"
                              style={{ color: 'color-mix(in srgb, var(--brand-text) 50%, transparent)' }}
                            >
                              {p.description.slice(0, 60)}
                            </p>
                          </div>
                        </Link>
                      </td>
                      <td className="t-tabular px-4 py-3 text-sm font-semibold" style={{ color: 'var(--brand-primary)' }}>
                        NT$ {(p.priceCents / 100).toLocaleString()}
                      </td>
                      <td className="t-tabular px-4 py-3 text-sm">
                        {p.stockQuantity === 0 ? (
                          <span
                            className="inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold"
                            style={{
                              backgroundColor: 'color-mix(in srgb, var(--brand-text) 90%, transparent)',
                              color: 'var(--brand-bg)',
                              borderRadius: 'var(--brand-radius)',
                            }}
                          >
                            無貨
                          </span>
                        ) : p.stockQuantity <= threshold ? (
                          <span
                            className="inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold tabular-nums"
                            style={{
                              backgroundColor: 'color-mix(in srgb, var(--error) 14%, transparent)',
                              color: 'var(--error)',
                              borderRadius: 'var(--brand-radius)',
                            }}
                          >
                            ⚠ {p.stockQuantity}
                          </span>
                        ) : (
                          <span className="tabular-nums opacity-70">{p.stockQuantity}</span>
                        )}
                      </td>
                      <td className="t-tabular px-4 py-3 text-sm opacity-70">
                        {p.soldCount > 0 ? `${p.soldCount} 件` : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs"
                          style={{
                            backgroundColor: p.productStatus === 'needs_review'
                              ? 'color-mix(in srgb, var(--warning) 14%, transparent)'
                              : p.isPublished
                                ? 'color-mix(in srgb, var(--success) 12%, transparent)'
                                : 'color-mix(in srgb, var(--brand-primary) 8%, transparent)',
                            color: p.productStatus === 'needs_review'
                              ? 'var(--warning)'
                              : p.isPublished
                                ? 'var(--success)'
                                : 'color-mix(in srgb, var(--brand-text) 60%, transparent)',
                            borderRadius: 'var(--brand-radius)',
                          }}
                        >
                          <span
                            className="inline-block h-1.5 w-1.5 rounded-full"
                            style={{
                              backgroundColor: p.productStatus === 'needs_review'
                                ? 'var(--warning)'
                                : p.isPublished
                                  ? 'var(--success)'
                                  : 'var(--brand-primary)',
                            }}
                          />
                          {p.productStatus === 'needs_review' ? '需審查' : p.isPublished ? '已上架' : '草稿'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <ProductRowActions
                          productId={p.id}
                          isPublished={p.isPublished}
                          merchantSlug={merchant.slug}
                          title={p.title}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
