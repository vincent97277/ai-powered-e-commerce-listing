/**
 * POST /api/products/import — IG/蝦皮 一鍵 import (V1 #65, RA14)
 *
 * Body: { url: string, type: 'ig' | 'shopee' }
 * 流程:
 *   1. resolve cookie → tenantId
 *   2. assertNotSuspended (停權商家擋)
 *   3. url-guard.assertSafeUrl (hostname allowlist, 擋 SSRF)
 *   4. idempotency dedup: 同 (tenantId, sourceUrl) 5 分鐘內 status='pending' 已存在 → 回該 session
 *   5. INSERT import_sessions row (status='pending')
 *   6. inngest.send('product.import.batch', { sessionId, tenantId, ... })
 *   7. return 202 { sessionId, redirectTo: `/merchant/products/import/{sessionId}` }
 *
 * 立刻回應 (< 1 秒), 真正的 fetch + parse + dispatch 在 inngest worker 做 (#66)
 */
import { NextRequest, NextResponse } from 'next/server';
import { resolveMerchantFromCookie } from '@/lib/storage/resolve-merchant';
import { assertNotSuspended, MerchantSuspendedError } from '@/lib/merchant/suspend-guard';
import {
  assertSafeUrl,
  ImportSourceUnavailableError,
} from '@/lib/import/url-guard';
import { withTenantTx } from '@/lib/db/with-tenant';
import { importSessions } from '@/db/schema';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { inngest } from '@/inngest/client';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const merchant = await resolveMerchantFromCookie(req.cookies.get('demo-merchant-id')?.value);

    // 停權商家擋
    try {
      await assertNotSuspended(merchant.tenantId);
    } catch (err) {
      if (err instanceof MerchantSuspendedError) {
        return NextResponse.json({ success: false, error: err.message }, { status: 403 });
      }
      throw err;
    }

    const body = (await req.json().catch(() => null)) as { url?: string; type?: string } | null;
    if (!body?.url || !body.type) {
      return NextResponse.json({ success: false, error: '缺少 url / type' }, { status: 400 });
    }
    if (body.type !== 'ig' && body.type !== 'shopee') {
      return NextResponse.json({ success: false, error: 'type 必須是 ig 或 shopee' }, { status: 400 });
    }

    // SSRF guard: hostname allowlist
    let safeUrl: URL;
    try {
      safeUrl = assertSafeUrl(body.url, 'source');
    } catch (err) {
      if (err instanceof ImportSourceUnavailableError) {
        return NextResponse.json({ success: false, error: err.message }, { status: 400 });
      }
      throw err;
    }
    const sourceUrl = safeUrl.toString();

    // type 跟 hostname 對齊 (避免商家貼 IG URL 但選 type=蝦皮)
    if (body.type === 'ig' && !safeUrl.hostname.includes('instagram.com')) {
      return NextResponse.json({ success: false, error: 'URL 不是 IG' }, { status: 400 });
    }
    if (body.type === 'shopee' && !safeUrl.hostname.includes('shopee.tw')) {
      return NextResponse.json({ success: false, error: 'URL 不是 蝦皮' }, { status: 400 });
    }

    // Idempotency dedup: 5 分鐘內同 (tenant, sourceUrl) 未完成的 session 回它
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    const sessionId = await withTenantTx(merchant.tenantId, async (tx) => {
      const existing = await tx
        .select({ id: importSessions.id })
        .from(importSessions)
        .where(
          and(
            eq(importSessions.merchantId, merchant.tenantId),
            eq(importSessions.sourceUrl, sourceUrl),
            sql`${importSessions.status} IN ('pending','fetching','importing')`,
            gte(importSessions.createdAt, fiveMinAgo),
          ),
        )
        .orderBy(desc(importSessions.createdAt))
        .limit(1);
      if (existing.length > 0) return existing[0].id;

      const [inserted] = await tx
        .insert(importSessions)
        .values({
          merchantId: merchant.tenantId,
          sourceUrl,
          sourceType: body.type as 'ig' | 'shopee',
          status: 'pending',
        })
        .returning({ id: importSessions.id });
      return inserted.id;
    });

    // Dispatch parent worker
    await inngest.send({
      name: 'product.import.batch',
      data: {
        sessionId,
        tenantId: merchant.tenantId,
        merchantId: merchant.tenantId,
        sourceUrl,
        sourceType: body.type,
      },
    });

    return NextResponse.json(
      {
        success: true,
        sessionId,
        redirectTo: `/merchant/products/import/${sessionId}`,
      },
      { status: 202 },
    );
  } catch (err) {
    console.error('[POST /api/products/import] 失敗', err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : '未知錯誤' },
      { status: 500 },
    );
  }
}
