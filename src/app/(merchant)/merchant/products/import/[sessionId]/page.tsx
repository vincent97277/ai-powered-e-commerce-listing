/**
 * /merchant/products/import/[sessionId] — import 進度頁 (V1 #68)
 * Server component fetch initial state, ImportProgressStream client poll 2s
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { resolveMerchantFromCookie } from '@/lib/storage/resolve-merchant';
import { withTenantTx } from '@/lib/db/with-tenant';
import { importSessions } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { ArrowLeft } from 'lucide-react';
import { ImportProgressStream } from './ImportProgressStream';

export const dynamic = 'force-dynamic';

export default async function ImportProgressPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const merchant = await resolveMerchantFromCookie();

  const [session] = await withTenantTx(merchant.tenantId, async (tx) => {
    return await tx
      .select()
      .from(importSessions)
      .where(eq(importSessions.id, sessionId))
      .limit(1);
  });

  if (!session) notFound();

  return (
    <main
      className="min-h-screen px-12 py-10"
      style={{ backgroundColor: 'var(--brand-bg)', color: 'var(--brand-text)' }}
    >
      <div className="mx-auto max-w-2xl space-y-6">
        <Link
          href="/merchant/products/import"
          className="inline-flex items-center gap-1 text-sm opacity-60 hover:opacity-100"
          style={{ color: 'var(--brand-text)' }}
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.2} />
          回 import 入口
        </Link>

        <header>
          <p className="t-caption" style={{ color: 'var(--brand-primary)' }}>
            import session #{session.id.slice(0, 8)}
          </p>
          <h1 className="t-h2" style={{ fontFamily: 'var(--brand-font-heading)' }}>
            {session.sourceType === 'ig' ? 'IG' : '蝦皮'} 商品 import 中
          </h1>
          <p className="t-small mt-1 break-all opacity-50 font-mono">
            {session.sourceUrl}
          </p>
        </header>

        <ImportProgressStream
          sessionId={session.id}
          initialStatus={session.status}
          initialTotal={session.totalItems}
          initialCompleted={session.completedItems}
          initialErrors={session.errors as Array<Record<string, unknown>>}
        />
      </div>
    </main>
  );
}
