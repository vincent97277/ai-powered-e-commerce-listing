/**
 * Storefront layout — 注入該商家的 brand theme + 共用 header
 *
 * V1.7 D1: layout 層不擋 unapproved/suspended 商家進來 (theme/header 仍可 render),
 *   讓 page.tsx (root + product detail + cart) 各自處理. 因為 cart/checkout
 *   也應該在 unapproved/suspended 狀態下被擋, 但那些 page 自己會 query meta
 *   再決定. layout 只負責注入 theme.
 *
 * V1.9 T2 (I): adds a 32px platform footer at bottom of every storefront page,
 *   wrapped in `.platform` so brand vars switch to Linear warm palette locally —
 *   merchant brand vars are scoped to ThemeProviderForStore, the .platform
 *   wrapper underneath them re-overrides for just this strip.
 *   Result: even on /store/akami (deep brown serif), the footer reads as
 *   "by Catalogify" in paper-warm + warm-black.
 */
import { ThemeProviderForStore } from './ThemeForStore';
import { resolveStorefrontMeta, resolveSlugRedirect } from '@/lib/tenant/resolver';
import { dbAdmin } from '@/db/admin-only';
import { merchants } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { StorefrontHeader } from './StorefrontHeader';
import { Wordmark } from '@/components/platform/Wordmark';

export const dynamic = 'force-dynamic';

export default async function StoreLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const meta = await resolveStorefrontMeta(slug);
  if (!meta) {
    // V1 #52: 如 slug 不存在但 match 某商家 previousSlug → 301 redirect
    const newSlug = await resolveSlugRedirect(slug);
    if (newSlug) redirect(`/store/${newSlug}`);
    notFound();
  }

  // 拉商家 theme_vars
  const [m] = await dbAdmin
    .select({ themeVars: merchants.themeVars, name: merchants.name })
    .from(merchants)
    .where(eq(merchants.id, meta.tenantId))
    .limit(1);

  const themeVars = (m?.themeVars ?? {}) as Record<string, string>;

  return (
    <ThemeProviderForStore themeVars={themeVars}>
      <StorefrontHeader slug={slug} merchantName={m?.name ?? slug} />
      {children}

      {/* V1.9 T2 (I): platform footer — forces Linear warm palette in this strip */}
      <div
        className="platform"
        style={{ backgroundColor: 'var(--brand-bg)' }}
      >
        <footer
          className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-xs sm:px-8 sm:flex-nowrap lg:px-12"
          style={{
            borderColor: 'var(--platform-accent-edge)',
            color: 'var(--ink-muted)',
          }}
        >
          <div className="flex flex-wrap items-center gap-2">
            <Wordmark size="sm" />
            <span style={{ color: 'var(--ink-faint)' }}>·</span>
            <span>由 Catalogify 提供</span>
          </div>
          <nav className="flex flex-wrap items-center gap-3">
            <Link href="/" className="hover:underline">
              探索更多獨立店家 →
            </Link>
            <span style={{ color: 'var(--ink-faint)' }}>|</span>
            <Link href="/privacy" className="hover:underline">
              隱私
            </Link>
            <Link href="/terms" className="hover:underline">
              條款
            </Link>
          </nav>
        </footer>
      </div>
    </ThemeProviderForStore>
  );
}
