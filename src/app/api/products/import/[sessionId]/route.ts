/**
 * GET /api/products/import/[sessionId] — progress query (V1 #68)
 *
 * Returns the import_sessions row status for the client polling UI (2s interval)
 * Goes through RLS — merchants can only see their own session
 */
import { NextResponse, type NextRequest } from 'next/server';
import { resolveMerchantFromCookie } from '@/lib/storage/resolve-merchant';
import { withTenantTx } from '@/lib/db/with-tenant';
import { importSessions } from '@/db/schema';
import { eq } from 'drizzle-orm';

export const runtime = 'nodejs';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { sessionId } = await params;
    const merchant = await resolveMerchantFromCookie();

    const [session] = await withTenantTx(merchant.tenantId, async (tx) => {
      return await tx
        .select()
        .from(importSessions)
        .where(eq(importSessions.id, sessionId))
        .limit(1);
    });

    if (!session) {
      return NextResponse.json({ success: false, error: 'session 不存在' }, { status: 404 });
    }

    const isDone = session.status === 'completed' || session.status === 'failed';

    return NextResponse.json(
      {
        success: true,
        sessionId: session.id,
        status: session.status,
        totalItems: session.totalItems,
        completedItems: session.completedItems,
        errors: session.errors,
        sourceUrl: session.sourceUrl,
        sourceType: session.sourceType,
        done: isDone,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch (err) {
    console.error('[GET /api/products/import/{id}] 失敗', err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : '未知錯誤' },
      { status: 500 },
    );
  }
}
