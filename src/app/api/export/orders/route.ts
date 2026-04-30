/**
 * GET /api/export/orders.xlsx?status=&from=&to=
 *
 * V1.5 Track B2: 訂單 Excel 匯出 (統一收口)
 *   - 透過 cookie 解 tenantId → withTenantTx (RLS-safe)
 *   - 接受 status 過濾 (對齊 /merchant/orders ?status=)
 *   - 接受 from / to (YYYY-MM-DD) 限制建立時間區間
 *   - 同步 join order_status_history 把 paid/shipped/completed timestamps 也丟進 export
 *   - Content-Type + Content-Disposition: attachment 觸發瀏覽器下載
 */
import { NextRequest, NextResponse } from 'next/server';
import { resolveMerchantFromCookie } from '@/lib/storage/resolve-merchant';
import { assertNotSuspended, MerchantSuspendedError } from '@/lib/merchant/suspend-guard';
import { withTenantTx } from '@/lib/db/with-tenant';
import { orders, orderStatusHistory, type Order } from '@/db/schema';
import { and, asc, desc, eq, gte, lt, inArray, sql } from 'drizzle-orm';
import { generateOrdersXlsx, type OrderExportRow } from '@/lib/export/orders-xlsx';

/**
 * V1.5 review H2: Content-Disposition 防注入 helper
 *
 * 即便目前 filename 都是 server-side 產 (e.g. orders-2025-01-01.xlsx) 沒外部輸入,
 * 仍套這層, 抓住 reviewer 提的「未來把 merchant slug 拼進來」風險
 *  - \r\n 拆 header (CRLF injection)
 *  - " 拆 quoted filename
 * 同時雙開 RFC 6266 filename + filename* (UTF-8 fallback) 給非 ASCII 安全
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

/** YYYY-MM-DD → Date (UTC midnight); 不合法 → null */
function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return isNaN(d.getTime()) ? null : d;
}

export async function GET(req: NextRequest) {
  try {
    const cookieValue = req.cookies.get('demo-merchant-id')?.value;
    const merchant = await resolveMerchantFromCookie(cookieValue);

    // V1.5 review H1: 停權商家不可匯出 (對齊 /api/products/generate 的 suspend guard)
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
    // to 是含當日 — 內部加 1 天用 < 比 <= 安全
    const toExclusive = toRaw ? new Date(toRaw.getTime() + 24 * 60 * 60 * 1000) : null;

    const exportRows = await withTenantTx(merchant.tenantId, async (tx) => {
      // 1) 撈訂單
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
        .limit(5000); // 防爆: 5000 筆上限 (一個商家正常匯出量級)

      if (orderRows.length === 0) {
        return [];
      }

      // 2) 一次撈這批 order 的 status history (paid/shipped/completed 最早 createdAt)
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

      // 3) join 成 OrderExportRow
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

    // V1.5 review M2: silent truncate signal — 讓 client 知道有沒有滿格 5000
    const truncated = exportRows.length === 5000 ? '1' : '0';

    // NextResponse 不直收 Node Buffer (TS 型別); 轉 Uint8Array view
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
