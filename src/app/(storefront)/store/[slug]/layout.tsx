/**
 * Storefront layout — 注入該商家的 brand theme + 共用 header
 */
import { ThemeProviderForStore } from './ThemeForStore';
import { resolveStorefrontMeta } from '@/lib/tenant/resolver';
import { dbAdmin } from '@/db/admin-only';
import { merchants } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { StorefrontHeader } from './StorefrontHeader';

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
  if (!meta) notFound();

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
    </ThemeProviderForStore>
  );
}
