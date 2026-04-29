/**
 * Suspend guard (V1 #53)
 * 在 merchant 寫入動作開頭呼叫, 商家被平台停權時拒絕寫入
 *
 * V1 哪些動作擋:
 *   - 上架新商品 (/api/products/generate, products/new)
 *   - 改商品 (products/[id]/actions)
 *   - 改設定 / brand voice (settings/actions)
 *   - IG/蝦皮 import (#65 會用)
 *
 * V1 哪些不擋 (in-flight 訂單必須能完成):
 *   - 訂單 status flip (#55 actions, RA: 設計決定)
 *
 * 用 dbAdmin 因為這個 helper 會被 server actions / API routes 從不同 context 呼叫,
 * 不一定有 RLS context. 純 read 操作, 沒 cross-tenant write 風險.
 */
import { dbAdmin } from '@/db/admin-only';
import { merchants } from '@/db/schema';
import { eq } from 'drizzle-orm';

export class MerchantSuspendedError extends Error {
  constructor(public tenantId: string, public reason: string | null) {
    super(reason ? `商家已被平台暫停: ${reason}` : '商家已被平台暫停');
    this.name = 'MerchantSuspendedError';
  }
}

/**
 * 檢查 merchant 是否被停權. 是的話 throw MerchantSuspendedError.
 * 商家不存在也算 throw (防無效 tenantId 寫入).
 */
export async function assertNotSuspended(tenantId: string): Promise<void> {
  const [row] = await dbAdmin
    .select({
      id: merchants.id,
      suspendedAt: merchants.suspendedAt,
      suspendedReason: merchants.suspendedReason,
    })
    .from(merchants)
    .where(eq(merchants.id, tenantId))
    .limit(1);

  if (!row) {
    throw new Error(`商家不存在: ${tenantId}`);
  }
  if (row.suspendedAt) {
    throw new MerchantSuspendedError(tenantId, row.suspendedReason);
  }
}
