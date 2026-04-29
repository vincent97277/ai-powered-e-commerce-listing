import { resolveStorefrontMeta } from '@/lib/tenant/resolver';
import { withTenantTx } from '@/lib/db/with-tenant';
import { products } from '@/db/schema';
import { notFound } from 'next/navigation';
import { eq, and } from 'drizzle-orm';
import { CustomerProductView } from './CustomerProductView';

export const dynamic = 'force-dynamic';

export default async function CustomerProductPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const meta = await resolveStorefrontMeta(slug);
  if (!meta) notFound();

  const [product] = await withTenantTx(meta.tenantId, async (tx) => {
    return await tx
      .select()
      .from(products)
      .where(and(eq(products.id, id), eq(products.isPublished, true)))
      .limit(1);
  });

  if (!product) notFound();

  return (
    <CustomerProductView
      slug={slug}
      productId={product.id}
      title={product.title}
      description={product.description}
      r2Key={product.r2Key}
      priceCents={product.priceCents}
      aiMetadata={product.aiMetadata}
    />
  );
}
