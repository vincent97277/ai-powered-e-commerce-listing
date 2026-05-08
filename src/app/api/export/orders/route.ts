/**
 * GET /api/export/orders.xlsx?status=&from=&to=
 *
 * V1.5 Track B2: order Excel export (single chokepoint)
 *   - tenantId resolved via cookie → withTenantTx (RLS-safe)
 *   - accepts status filter (aligned with /merchant/orders ?status=)
 *   - accepts from / to (YYYY-MM-DD) to bound creation-time range
 *   - joins order_status_history to include paid/shipped/completed timestamps in the export
 *   - Content-Type + Content-Disposition: attachment to trigger browser download
 */
import { NextRequest, NextResponse } from 'next/server';
import { resolveMerchantFromCookie } from '@/lib/storage/resolve-merchant';
import { assertNotSuspended, MerchantSuspendedError } from '@/lib/merchant/suspend-guard';
import { withTenantTx } from '@/lib/db/with-tenant';
import { orders, orderStatusHistory, type Order } from '@/db/schema';
import { and, asc, desc, eq, gte, lt, inArray, sql } from 'drizzle-orm';
import { generateOrdersXlsx, type OrderExportRow } from '@/lib/export/orders-xlsx';

/**
 * V1.5 review H2: Content-Disposition injection-defense helper
 *
 * Even though today's filenames are all server-generated (e.g. orders-2025-01-01.xlsx)
 * with no external input, we still apply this layer to address the reviewer's concern
 * about "future risk of splicing in merchant slug":
 *  - \r\n splits the header (CRLF injection)
 *  - " breaks out of the quoted filename
 * Also emits both RFC 6266 filename + filename* (UTF-8 fallback) for non-ASCII safety.
 */
function buildContentDisposition(filename: string): string {
  const safe = filename.replace(/[\r\n"]/g, '_');
  return `attachment; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}

export const runtime = 'nodejs';

const ALLOWED_STATUS = ['pending', 'paid', 'shipped', 'completed', 'failed', 'refunded'] as const;
type Status = (typeof ALLOWED_STATUS)[number];

function isStatus(s: unknown): s is Status {
  return typeof s === 'string' && (ALLOWED_STATUS as readonly string[]).includes(s);
}

/** YYYY-MM-DD → Date (UTC midnight); invalid → null */
function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return isNaN(d.getTime()) ? null : d;
}

export async function GET(req: NextRequest) {
  try {
    const merchant = await resolveMerchantFromCookie();

    // V1.5 review H1: suspended merchants cannot export (aligned with /api/products/generate's suspend guard)
    try {
      await assertNotSuspended(merchant.tenantId);
    } catch (err) {
      if (err instanceof MerchantSuspendedError) {
        return NextResponse.json({ success: false, error: err.message }, { status: 403 });
      }
      throw err;
    }

    const url = new URL(req.url);
    const statusParam = url.searchParams.get('status');
    const status: Status | null = isStatus(statusParam) ? statusParam : null;
    const from = parseDate(url.searchParams.get('from'));
    const toRaw = parseDate(url.searchParams.get('to'));
    // `to` is inclusive of that day — internally add 1 day and use < instead of <= for safety
    const toExclusive = toRaw ? new Date(toRaw.getTime() + 24 * 60 * 60 * 1000) : null;

    const exportRows = await withTenantTx(merchant.tenantId, async (tx) => {
      // 1) Fetch orders
      const conditions = [];
      if (status) conditions.push(eq(orders.status, status));
      if (from) conditions.push(gte(orders.createdAt, from));
      if (toExclusive) conditions.push(lt(orders.createdAt, toExclusive));

      const baseQuery = tx.select().from(orders);
      const orderRows: Order[] = await (conditions.length > 0
        ? baseQuery.where(and(...conditions))
        : baseQuery
      )
        .orderBy(desc(orders.createdAt))
        .limit(5000); // Safety cap: 5000-row max (normal export volume for one merchant)

      if (orderRows.length === 0) {
        return [];
      }

      // 2) Fetch this batch's status history in one query (earliest createdAt for paid/shipped/completed)
      const orderIds = orderRows.map((o) => o.id);
      const historyRows = await tx
        .select({
          orderId: orderStatusHistory.orderId,
          toStatus: orderStatusHistory.toStatus,
          changedAt: sql<Date>`MIN(${orderStatusHistory.createdAt})`.mapWith((v: string | Date) =>
            v instanceof Date ? v : new Date(v),
          ),
        })
        .from(orderStatusHistory)
        .where(
          and(
            inArray(orderStatusHistory.orderId, orderIds),
            inArray(orderStatusHistory.toStatus, ['paid', 'shipped', 'completed']),
          ),
        )
        .groupBy(orderStatusHistory.orderId, orderStatusHistory.toStatus)
        .orderBy(asc(orderStatusHistory.orderId));

      // 3) join into OrderExportRow
      const tsByOrder = new Map<string, { paidAt: Date | null; shippedAt: Date | null; completedAt: Date | null }>();
      for (const h of historyRows) {
        const cur = tsByOrder.get(h.orderId) ?? { paidAt: null, shippedAt: null, completedAt: null };
        if (h.toStatus === 'paid') cur.paidAt = h.changedAt;
        else if (h.toStatus === 'shipped') cur.shippedAt = h.changedAt;
        else if (h.toStatus === 'completed') cur.completedAt = h.changedAt;
        tsByOrder.set(h.orderId, cur);
      }

      const exportData: OrderExportRow[] = orderRows.map((o) => {
        const ts = tsByOrder.get(o.id) ?? { paidAt: null, shippedAt: null, completedAt: null };
        return { ...o, ...ts };
      });
      return exportData;
    });

    const buffer = await generateOrdersXlsx(exportRows);

    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const filename = `orders-${today}.xlsx`;

    // V1.5 review M2: silent truncate signal — lets client know whether the 5000-row cap was hit
    const truncated = exportRows.length === 5000 ? '1' : '0';

    // NextResponse doesn't accept Node Buffer directly (TS types); convert to Uint8Array view
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': buildContentDisposition(filename),
        'Cache-Control': 'no-store',
        'X-Export-Row-Count': String(exportRows.length),
        'X-Export-Truncated': truncated,
      },
    });
  } catch (err) {
    console.error('[/api/export/orders] error', err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : '匯出失敗' },
      { status: 500 },
    );
  }
}
