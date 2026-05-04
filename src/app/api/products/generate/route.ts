/**
 * Async vision generation enqueue — V2.2.5.
 *
 * Was: synchronous GPT-4o vision call inside this route handler. Took 5-15s,
 * blew past Vercel Hobby's 10s function timeout. Now enqueues an Inngest
 * `product.ingest` event (same event used by import flows) and returns
 * immediately. The Inngest worker reads the upload from R2 / local-fs,
 * runs sharp + vision, writes the products row.
 *
 * Frontend pattern: GenerationStream.tsx posts here to enqueue, then polls
 * GET /api/products/generate/status?storageKey=<key> until status='success'.
 *
 * What stays synchronous in this route:
 *  - Auth (resolveMerchantFromCookie)
 *  - Suspended-merchant guard (assertNotSuspended) — fast DB read
 *  - Daily cost cap (assertWithinDailyCap) — fast DB read
 *  - Storage-key tenant prefix check
 *
 * Body: { storageKey: string }
 *   storageKey — opaque key returned by /api/uploads
 *
 * Response: { success: true, status: 'pending', storageKey } — 200
 *           { success: false, error: ... }                    — 400/403/429
 */
import { NextRequest, NextResponse } from 'next/server';
import { resolveMerchantFromCookie } from '@/lib/storage/resolve-merchant';
import { assertNotSuspended, MerchantSuspendedError } from '@/lib/merchant/suspend-guard';
import { assertWithinDailyCap, CapExceededError } from '@/lib/observability/ai-cost';
import { inngest } from '@/inngest/client';

export const runtime = 'nodejs';
// Enqueue is fast (DB checks + 1 Inngest publish). 5s ceiling is generous.
export const maxDuration = 5;

export async function POST(req: NextRequest) {
  try {
    const merchant = await resolveMerchantFromCookie();

    try {
      await assertNotSuspended(merchant.tenantId);
    } catch (err) {
      if (err instanceof MerchantSuspendedError) {
        return NextResponse.json({ success: false, error: err.message }, { status: 403 });
      }
      throw err;
    }

    const body = await req.json().catch(() => null);
    const storageKey = body?.storageKey as string | undefined;

    if (!storageKey || typeof storageKey !== 'string') {
      return NextResponse.json({ success: false, error: '缺少 storageKey' }, { status: 400 });
    }

    if (!storageKey.startsWith(`${merchant.tenantId}/`)) {
      return NextResponse.json(
        { success: false, error: `storage key 不屬於當前商家 (${merchant.slug})` },
        { status: 403 },
      );
    }

    try {
      await assertWithinDailyCap(merchant.tenantId);
    } catch (err) {
      if (err instanceof CapExceededError) {
        return NextResponse.json(
          {
            success: false,
            error: 'AI_COST_CAP_EXCEEDED',
            message: err.message,
            usedCents: err.usedCents,
            capCents: err.capCents,
          },
          { status: 429 },
        );
      }
      throw err;
    }

    try {
      await inngest.send({
        name: 'product.ingest',
        data: {
          tenantId: merchant.tenantId,
          merchantId: merchant.tenantId,
          r2Key: storageKey,
        },
      });
    } catch (sendErr) {
      console.error(
        '[/api/products/generate] inngest send failed',
        sendErr instanceof Error ? sendErr.message : sendErr,
      );
      return NextResponse.json(
        {
          success: false,
          error: 'INNGEST_UNAVAILABLE',
          message:
            'Background worker offline. In dev: start `inngest-cli dev`. In prod: check Inngest Cloud connectivity.',
        },
        { status: 503 },
      );
    }

    return NextResponse.json({
      success: true,
      status: 'pending',
      storageKey,
      merchantSlug: merchant.slug,
    });
  } catch (err) {
    // Let Next.js redirect signals propagate (resolveMerchantFromCookie() calls redirect()
    // when the cookie is missing/invalid — that should reach the framework, not be wrapped).
    if (
      err instanceof Error &&
      (err.message === 'NEXT_REDIRECT' || (err as { digest?: string }).digest?.startsWith?.('NEXT_REDIRECT'))
    ) {
      throw err;
    }
    console.error('[/api/products/generate] error', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : '伺服器錯誤' },
      { status: 500 },
    );
  }
}
