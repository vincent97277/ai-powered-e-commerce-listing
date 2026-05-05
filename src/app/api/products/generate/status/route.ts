/**
 * GET /api/products/generate/status?storageKey=<key>
 *
 * Polled by GenerationStream.tsx after kicking off async vision via
 * POST /api/products/generate. Looks up the products row written by the
 * Inngest worker, keyed on aiMetadata.source_key.
 *
 * Why source_key (not r2Key): the worker stores the PROCESSED key (.webp)
 * in products.r2Key, but the frontend only knows the ORIGINAL upload key.
 * source_key bridges that.
 *
 * Response shapes:
 *   { status: 'pending' }                                     — worker hasn't written yet
 *   { status: 'success', productId, data: ProductOutput }     — worker done, AI happy
 *   { status: 'failed', productId, error }                    — worker done, AI failed
 *
 * Polling cadence (suggested for client): 1.5-2s interval, 30s total budget.
 *
 * Security: tenant scope enforced via withTenantTx (RLS) — a merchant can
 * only see their own pending generations, even if they guess another's
 * storage key.
 */
import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { resolveMerchantFromCookie } from '@/lib/storage/resolve-merchant';
import { withTenantTx } from '@/lib/db/with-tenant';
import { products, type ProductAiMetadata } from '@/db/schema';
import { aiOutputToUi } from '@/lib/ai/flatten';

export const runtime = 'nodejs';
export const maxDuration = 5;

export async function GET(req: NextRequest) {
  try {
    const merchant = await resolveMerchantFromCookie();
    const storageKey = req.nextUrl.searchParams.get('storageKey');

    if (!storageKey) {
      return NextResponse.json({ error: '缺少 storageKey' }, { status: 400 });
    }

    if (!storageKey.startsWith(`${merchant.tenantId}/`)) {
      return NextResponse.json(
        { error: `storage key 不屬於當前商家 (${merchant.slug})` },
        { status: 403 },
      );
    }

    const row = await withTenantTx(merchant.tenantId, async (tx) => {
      const result = await tx.execute(
        sql`SELECT id, ai_metadata FROM ${products}
            WHERE tenant_id = ${merchant.tenantId}
              AND ai_metadata->>'source_key' = ${storageKey}
            ORDER BY created_at DESC
            LIMIT 1`,
      );
      const r = (result.rows ?? result)[0] as
        | { id: string; ai_metadata: ProductAiMetadata }
        | undefined;
      return r ?? null;
    });

    if (!row) {
      return NextResponse.json({ status: 'pending' });
    }

    const meta = row.ai_metadata;

    if (meta.status === 'failed') {
      return NextResponse.json({
        status: 'failed',
        productId: row.id,
        error: meta.error ?? 'AI 解析失敗',
      });
    }

    return NextResponse.json({
      status: 'success',
      productId: row.id,
      data: aiOutputToUi({
        title: meta.title,
        description: meta.description,
        category: meta.category,
        seo_tags: meta.seo_tags,
        variants: meta.variants,
        price_twd: meta.price_twd,
        confidence: meta.confidence,
      }),
    });
  } catch (err) {
    if (
      err instanceof Error &&
      (err.message === 'NEXT_REDIRECT' || (err as { digest?: string }).digest?.startsWith?.('NEXT_REDIRECT'))
    ) {
      throw err;
    }
    console.error('[/api/products/generate/status] error', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '伺服器錯誤' },
      { status: 500 },
    );
  }
}
