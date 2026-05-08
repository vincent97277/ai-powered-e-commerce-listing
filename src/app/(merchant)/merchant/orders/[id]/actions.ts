'use server';

/**
 * Order status flip server actions (V1 #55)
 *
 * Rules:
 *   - pending → paid
 *   - paid → shipped (requires trackingNumber + carrier)
 *   - shipped → completed
 *   - any → refunded (requires reason, irreversible)
 *   - No backwards transitions (e.g. shipped → paid)
 *
 * On every status flip:
 *   - Write order_status_history (audit trail)
 *   - Optimistic concurrency: WHERE status = expectedFromStatus, only counts as success if rowCount=1
 *   - revalidatePath
 *
 * Refund rate limit: at most 5 → refunded per merchant per hour (RA: Security C4 mitigation)
 *
 * Does NOT block suspended merchants — in-flight orders must be able to complete their flow
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
  completed: ['refunded'], // refundable even after completion
  failed: ['refunded'],
  refunded: [], // dead-end
};

const REFUND_RATE_LIMIT = 5; // 5 / hour / merchant

async function getTenantId(): Promise<string> {
  const m = await resolveMerchantFromCookie();
  return m.tenantId;
}

/** Verify the transition is allowed */
function canTransition(from: string, to: string): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Generic status flip with optimistic concurrency check.
 * On failure ({ success: false }), status is unchanged.
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
        // Status already changed by another tab (stale)
        throw new Error('訂單狀態已被改過, 請重新整理頁面');
      }

      // Write audit log
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

/** pending → paid */
export async function markPaid(orderId: string): Promise<ActionResult> {
  return flipStatus({ orderId, fromStatus: 'pending', toStatus: 'paid' });
}

/** paid → shipped (requires trackingNumber + carrier) */
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

/** shipped → completed */
export async function markCompleted(orderId: string): Promise<ActionResult> {
  return flipStatus({ orderId, fromStatus: 'shipped', toStatus: 'completed' });
}

/**
 * any → refunded (with reason, irreversible)
 * Rate limit: 5 / hour / merchant (RA: Security C4 mitigation)
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

  // Rate limit: number of orders refunded in the past hour
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

/** Update internal note (merchant-private) */
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
