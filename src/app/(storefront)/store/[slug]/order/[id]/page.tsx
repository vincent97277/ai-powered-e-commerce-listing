import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';
import { resolveStorefrontMeta } from '@/lib/tenant/resolver';
import { withTenantTx } from '@/lib/db/with-tenant';
import { orders, orderItems, products } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getThankYouMessage } from '@/lib/brand-voice/thank-you';

export const dynamic = 'force-dynamic';

export default async function OrderConfirmationPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const meta = await resolveStorefrontMeta(slug);
  if (!meta) notFound();

  const data = await withTenantTx(meta.tenantId, async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, id)).limit(1);
    if (!order) return null;

    const items = await tx
      .select({
        id: orderItems.id,
        quantity: orderItems.quantity,
        unitPriceCents: orderItems.unitPriceCents,
        productTitle: products.title,
      })
      .from(orderItems)
      .innerJoin(products, eq(orderItems.productId, products.id))
      .where(eq(orderItems.orderId, id));

    return { order, items };
  });

  if (!data) notFound();

  const thankYou = getThankYouMessage(meta.brandVoice);

  return (
    <main
      className="min-h-screen px-6 py-12 md:px-12"
      style={{ backgroundColor: 'var(--brand-bg)', color: 'var(--brand-text)' }}
    >
      <div className="mx-auto max-w-2xl">
        <div className="mb-8 flex flex-col items-center text-center">
          <div
            className="mb-4 inline-flex h-20 w-20 items-center justify-center"
            style={{
              borderRadius: '50%',
              backgroundColor: 'color-mix(in srgb, var(--success) 12%, transparent)',
            }}
          >
            <CheckCircle2 className="h-10 w-10" strokeWidth={2.2} style={{ color: 'var(--success)' }} />
          </div>
          <h1 className="t-h1" style={{ fontFamily: 'var(--brand-font-heading)' }}>
            {thankYou}
          </h1>
          <p className="text-sm mt-2" style={{ color: 'var(--ink-muted)' }}>
            — {meta.name} 老闆
          </p>
          <p
            className="t-body mt-4"
            style={{ color: 'color-mix(in srgb, var(--brand-text) 65%, transparent)' }}
          >
            訂單編號 <span className="font-mono text-sm">#{data.order.id.slice(0, 8)}</span>
          </p>
          <p
            className="t-small mt-1"
            style={{ color: 'color-mix(in srgb, var(--brand-text) 50%, transparent)' }}
          >
            通知已寄到 {data.order.customerEmail}
          </p>
        </div>

        <div
          className="space-y-3 border p-6"
          style={{
            borderColor: 'color-mix(in srgb, var(--brand-primary) 18%, transparent)',
            borderRadius: 'calc(var(--brand-radius) + 2px)',
            backgroundColor: 'color-mix(in srgb, var(--brand-primary) 3%, var(--brand-bg))',
            boxShadow: 'var(--elev-1)',
          }}
        >
          {data.items.map((it) => (
            <div key={it.id} className="flex items-center justify-between text-sm">
              <span className="flex-1 line-clamp-1 pr-4">{it.productTitle}</span>
              <span
                className="tabular-nums"
                style={{ color: 'color-mix(in srgb, var(--brand-text) 60%, transparent)' }}
              >
                × {it.quantity}
              </span>
              <span className="ml-4 tabular-nums font-semibold" style={{ color: 'var(--brand-primary)' }}>
                NT$ {((it.unitPriceCents * it.quantity) / 100).toLocaleString()}
              </span>
            </div>
          ))}
          <hr className="my-2" style={{ borderColor: 'color-mix(in srgb, var(--brand-primary) 18%, transparent)' }} />
          <div className="flex items-baseline justify-between">
            <span className="t-caption" style={{ color: 'var(--brand-primary)' }}>
              總金額
            </span>
            <span
              className="t-tabular text-2xl font-semibold"
              style={{ color: 'var(--brand-primary)', fontFamily: 'var(--brand-font-heading)' }}
            >
              NT$ {(data.order.totalCents / 100).toLocaleString()}
            </span>
          </div>
        </div>

        <div className="mt-8 flex justify-center">
          <Link
            href={`/store/${slug}`}
            className="t-small underline"
            style={{ color: 'var(--brand-primary)' }}
          >
            繼續逛 {slug}
          </Link>
        </div>

        <p className="mt-8 text-center text-xs opacity-50">
          · 金流整合中 — 訂單已建立, 商家可在後台看到, 真實扣款功能即將上線
        </p>
      </div>
    </main>
  );
}
