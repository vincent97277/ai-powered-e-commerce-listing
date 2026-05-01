/**
 * /merchant-switcher — full-list browse page for switching merchants (V1.7 D2)
 *
 * 為什麼存在: V1 ~ V1.6 的 MerchantSwitcher 一次撈全部商家塞到 dropdown,
 * >50 商家就破. V1.7 D2 把 dropdown 限制 top 10 + 加這頁全列表 + 搜尋 + 分頁.
 *
 * Server component:
 *   - URL searchParams: ?q=&page= (跟 AdminToolbar A1 同 pattern)
 *   - SQL: WHERE approved_at IS NOT NULL [+ ILIKE name|slug] ORDER BY updated_at DESC
 *   - LIMIT 20 / OFFSET (page-1)*20
 *   - 0 命中 → <EmptyState> (V1.6 B4)
 *   - 越界 page → redirect 回最後一頁
 *
 * Cookie 設置 reuse: 點 row 走 client SwitchRow 元件, document.cookie 直接設 (跟
 * ThemeProvider.setCurrentId line 64 same shape) — 不寫新 server action 簡化 V1.7.
 */
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { dbAdmin } from '@/db/admin-only';
import { merchants as merchantsTable } from '@/db/schema';
import { count, desc, sql } from 'drizzle-orm';
import { ArrowLeft, ChevronLeft, ChevronRight, SearchX, Users } from 'lucide-react';
import { EmptyState } from '@/components/feedback/EmptyState';
import { DEMO_MERCHANTS, DEMO_MERCHANT_COOKIE } from '@/lib/storage/demo-merchants';
import { SearchInput } from './SearchInput';
import { SwitchRow } from './SwitchRow';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;

type SearchParams = { q?: string; page?: string };

export default async function MerchantSwitcherPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const q = (params.q ?? '').trim();
  const requestedPage = Math.max(1, Number.parseInt(params.page ?? '1', 10) || 1);

  // 解析當前 merchant id (highlight 用)
  const c = await cookies();
  const cookieValue = c.get(DEMO_MERCHANT_COOKIE)?.value;
  let currentId = '';
  if (cookieValue) {
    if (cookieValue === 'akami' || cookieValue === 'afen') {
      currentId = DEMO_MERCHANTS[cookieValue].tenantId;
    } else if (/^[0-9a-f-]{36}$/i.test(cookieValue)) {
      currentId = cookieValue;
    }
  }

  // 動態 WHERE — 只列 approved 商家 (storefront blocked merchants 不該顯示)
  const whereClauses = [sql`${merchantsTable.approvedAt} IS NOT NULL`];
  if (q.length > 0) {
    // ILIKE name + slug (跟 admin search V1.6 A1 同 pattern)
    whereClauses.push(
      sql`(${merchantsTable.name} ILIKE ${'%' + q + '%'} OR ${merchantsTable.slug} ILIKE ${'%' + q + '%'})`,
    );
  }
  const whereSql = sql.join(whereClauses, sql` AND `);

  // Filtered total → 決定 totalPages
  const [totalRow] = await dbAdmin
    .select({ n: count(merchantsTable.id) })
    .from(merchantsTable)
    .where(whereSql);
  const filteredTotal = totalRow?.n ?? 0;

  const totalPages = Math.max(1, Math.ceil(filteredTotal / PAGE_SIZE));

  // 越界 redirect (避免 page=999 顯示空白)
  if (filteredTotal > 0 && requestedPage > totalPages) {
    const sp = new URLSearchParams();
    if (q) sp.set('q', q);
    sp.set('page', String(totalPages));
    redirect(`/merchant-switcher?${sp.toString()}`);
  }

  const offset = (requestedPage - 1) * PAGE_SIZE;

  const rows = await dbAdmin
    .select({
      id: merchantsTable.id,
      slug: merchantsTable.slug,
      name: merchantsTable.name,
    })
    .from(merchantsTable)
    .where(whereSql)
    .orderBy(desc(merchantsTable.updatedAt))
    .limit(PAGE_SIZE)
    .offset(offset);

  return (
    <main className="px-4 py-10 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-3xl space-y-6">
        {/* Header */}
        <header className="space-y-3">
          <Link
            href="/merchant"
            className="inline-flex items-center gap-1 text-sm text-zinc-500 underline-offset-4 hover:underline"
          >
            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.2} />
            回後台
          </Link>
          <h1
            className="text-3xl font-semibold tracking-tight"
            style={{ color: 'var(--brand-text)', fontFamily: 'var(--brand-font-heading)' }}
          >
            切換商家
          </h1>
          <p className="text-sm text-zinc-500">
            共 {filteredTotal} 家{q ? `符合「${q}」` : '已核可商家'}
          </p>
        </header>

        {/* Search */}
        <SearchInput initialQ={q} />

        {/* List / Empty */}
        {rows.length === 0 ? (
          q ? (
            <EmptyState
              icon={SearchX}
              title="找不到符合的商家"
              body={`目前篩選: 搜尋「${q}」`}
              primaryCTA={{ label: '清除篩選', href: '/merchant-switcher' }}
              scope="section"
            />
          ) : (
            <EmptyState
              icon={Users}
              title="平台還沒有已核可商家"
              body="目前還沒有任何已上架的商家."
              primaryCTA={{ label: '開新店面', href: '/onboarding' }}
              scope="section"
            />
          )
        ) : (
          <ul className="grid gap-2">
            {rows.map((m) => (
              <li key={m.id}>
                <SwitchRow
                  id={m.id}
                  slug={m.slug}
                  name={m.name}
                  isCurrent={m.id === currentId}
                />
              </li>
            ))}
          </ul>
        )}

        {/* Pagination */}
        {rows.length > 0 && totalPages > 1 && (
          <Pagination currentPage={requestedPage} totalPages={totalPages} q={q} />
        )}
      </div>
    </main>
  );
}

function buildPageHref(page: number, q: string): string {
  const sp = new URLSearchParams();
  if (q) sp.set('q', q);
  if (page > 1) sp.set('page', String(page));
  const qs = sp.toString();
  return qs ? `/merchant-switcher?${qs}` : '/merchant-switcher';
}

function Pagination({
  currentPage,
  totalPages,
  q,
}: {
  currentPage: number;
  totalPages: number;
  q: string;
}) {
  const prevDisabled = currentPage <= 1;
  const nextDisabled = currentPage >= totalPages;

  return (
    <nav
      className="flex flex-col items-center justify-between gap-3 text-sm sm:flex-row"
      aria-label="商家列表分頁"
    >
      <p className="text-xs text-zinc-500">
        第 {currentPage} / {totalPages} 頁
      </p>
      <div className="flex items-center gap-2">
        {prevDisabled ? (
          <span
            aria-disabled="true"
            className="inline-flex cursor-not-allowed items-center gap-1 rounded border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-zinc-400"
            style={{ minHeight: '44px' }}
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={2.2} />
            上一頁
          </span>
        ) : (
          <Link
            href={buildPageHref(currentPage - 1, q)}
            className="inline-flex items-center gap-1 rounded border border-zinc-300 bg-white px-3 py-1.5 text-zinc-700 hover:border-zinc-400 hover:bg-zinc-50"
            rel="prev"
            style={{ minHeight: '44px' }}
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={2.2} />
            上一頁
          </Link>
        )}
        {nextDisabled ? (
          <span
            aria-disabled="true"
            className="inline-flex cursor-not-allowed items-center gap-1 rounded border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-zinc-400"
            style={{ minHeight: '44px' }}
          >
            下一頁
            <ChevronRight className="h-4 w-4" strokeWidth={2.2} />
          </span>
        ) : (
          <Link
            href={buildPageHref(currentPage + 1, q)}
            className="inline-flex items-center gap-1 rounded border border-zinc-300 bg-white px-3 py-1.5 text-zinc-700 hover:border-zinc-400 hover:bg-zinc-50"
            rel="next"
            style={{ minHeight: '44px' }}
          >
            下一頁
            <ChevronRight className="h-4 w-4" strokeWidth={2.2} />
          </Link>
        )}
      </div>
    </nav>
  );
}
