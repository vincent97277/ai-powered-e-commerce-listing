'use server';

/**
 * 訂單 status flip server actions (V1 #55)
 *
 * 規則:
 *   - pending → paid
 *   - paid → shipped (要 trackingNumber + carrier)
 *   - shipped → completed
 *   - 任何 → refunded (要 reason, 不可逆)
 *   - 不允許往回切 (e.g. shipped → paid)
 *
 * 每次切狀態:
 *   - 寫入 order_status_history (audit trail)
 *   - optimistic concurrency: WHERE status = expectedFromStatus, rowCount=1 才算成功
 *   - revalidatePath
 *
 * Refund rate limit: 每商家每小時最多 5 件 → refunded (RA: Security C4 緩解)
 *
 * NOT 擋 suspended merchant — in-flight 訂單必須能完成流程
 */
import { revalidatePath } from 'next/cache';
import { withTenantTx } from '@/lib/db/with-tenant';
import { orders, orderStatusHistory } from '@/db/schema';
import { resolveMerchantFromCookie } from '@/lib/storage/resolve-merchant';
import { and, eq, gte, sql } from 'drizzle-orm';

type ActionResult = { success: boolean; error?: string };

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  pending: ['paid', 'refunded'],
  paid: ['shipped', 'refunded'],
  shipped: ['completed', 'refunded'],
  completed: ['refunded'], // 完成後仍可退
  failed: ['refunded'],
  refunded: [], // dead-end
};

const REFUND_RATE_LIMIT = 5; // 5 件 / 小時 / merchant

async function getTenantId(): Promise<string> {
  const m = await resolveMerchantFromCookie();
  return m.tenantId;
}

/** 驗 transition 合法 */
function canTransition(from: string, to: string): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * 通用 status flip with optimistic concurrency check
 * 失敗 ({ success: false }) 時 status 沒變
 */
async function flipStatus(opts: {
  orderId: string;
  fromStatus: string;
  toStatus: string;
  note?: string;
  extraUpdate?: Record<string, unknown>;
}): Promise<ActionResult> {
  const tenantId = await getTenantId();

  if (!canTransition(opts.fromStatus, opts.toStatus)) {
    return { success: false, error: `不可從 ${opts.fromStatus} 切到 ${opts.toStatus}` };
  }

  try {
    const result = await withTenantTx(tenantId, async (tx) => {
      // optimistic concurrency: WHERE status = expected
      const updateRes = await tx
        .update(orders)
        .set({
          status: opts.toStatus as 'pending' | 'paid' | 'shipped' | 'completed' | 'failed' | 'refunded',
          updatedAt: new Date(),
          ...(opts.extraUpdate ?? {}),
        })
        .where(and(eq(orders.id, opts.orderId), eq(orders.status, opts.fromStatus as 'pending' | 'paid' | 'shipped' | 'completed' | 'failed' | 'refunded')))
        .returning({ id: orders.id });

      if (updateRes.length !== 1) {
        // 已被別的 tab 改過狀態 (stale)
        throw new Error('訂單狀態已被改過, 請重新整理頁面');
      }

      // 寫 audit log
      await tx.insert(orderStatusHistory).values({
        orderId: opts.orderId,
        fromStatus: opts.fromStatus,
        toStatus: opts.toStatus,
        changedBy: 'merchant',
        note: opts.note ?? null,
      });

      return updateRes[0];
    });

    if (!result) return { success: false, error: '訂單不存在' };

    revalidatePath(`/merchant/orders/${opts.orderId}`);
    revalidatePath('/merchant/orders');
    revalidatePath('/merchant');
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : '切換失敗' };
  }
}

/** 待付款 → 已付款 */
export async function markPaid(orderId: string): Promise<ActionResult> {
  return flipStatus({ orderId, fromStatus: 'pending', toStatus: 'paid' });
}

/** 已付款 → 已出貨 (要 trackingNumber + carrier) */
export async function markShipped(
  orderId: string,
  trackingNumber: string,
  carrier: string,
): Promise<ActionResult> {
  if (!trackingNumber.trim() || !carrier.trim()) {
    return { success: false, error: '物流單號跟物流商必填' };
  }
  return flipStatus({
    orderId,
    fromStatus: 'paid',
    toStatus: 'shipped',
    note: `${carrier} #${trackingNumber}`,
    extraUpdate: { trackingNumber: trackingNumber.trim(), carrier: carrier.trim() },
  });
}

/** 已出貨 → 已完成 */
export async function markCompleted(orderId: string): Promise<ActionResult> {
  return flipStatus({ orderId, fromStatus: 'shipped', toStatus: 'completed' });
}

/**
 * 任何 → 已退款 (含 reason, 不可逆)
 * Rate limit: 5 件 / 小時 / merchant (RA: Security C4 緩解)
 */
export async function markRefunded(
  orderId: string,
  reason: string,
  fromStatus: string,
): Promise<ActionResult> {
  if (!reason.trim() || reason.length > 500) {
    return { success: false, error: '退款原因 1-500 字' };
  }

  const tenantId = await getTenantId();

  // Rate limit: 過去 1 小時內已 refunded 的訂單數
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recentRefunds = await withTenantTx(tenantId, async (tx) => {
    return await tx
      .select({ n: sql<number>`count(*)::int`.mapWith(Number) })
      .from(orderStatusHistory)
      .innerJoin(orders, eq(orders.id, orderStatusHistory.orderId))
      .where(
        and(
          eq(orderStatusHistory.toStatus, 'refunded'),
          gte(orderStatusHistory.createdAt, oneHourAgo),
        ),
      );
  });
  const refundCount = recentRefunds[0]?.n ?? 0;
  if (refundCount >= REFUND_RATE_LIMIT) {
    return {
      success: false,
      error: `近 1 小時退款次數已達上限 (${REFUND_RATE_LIMIT} 件), 請稍後或聯絡平台`,
    };
  }

  return flipStatus({
    orderId,
    fromStatus,
    toStatus: 'refunded',
    note: reason,
  });
}

/** Form-shaped wrapper for <form action={saveNote.bind(null, orderId)}> */
export async function updateInternalNoteForm(orderId: string, formData: FormData): Promise<void> {
  await updateInternalNote(orderId, String(formData.get('note') ?? ''));
}

/** 更新內部備註 (商家私用) */
export async function updateInternalNote(
  orderId: string,
  note: string,
): Promise<ActionResult> {
  if (note.length > 500) {
    return { success: false, error: '備註最多 500 字' };
  }
  const tenantId = await getTenantId();
  try {
    await withTenantTx(tenantId, async (tx) => {
      await tx
        .update(orders)
        .set({ internalNote: note, updatedAt: new Date() })
        .where(eq(orders.id, orderId));
    });
    revalidatePath(`/merchant/orders/${orderId}`);
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : '備註更新失敗' };
  }
}
