/**
 * Suspend guard (V1 #53)
 * Call at the head of any merchant write action — refuses writes when the
 * merchant has been suspended by the platform.
 *
 * V1 actions blocked:
 *   - Listing new products (/api/products/generate, products/new)
 *   - Editing products (products/[id]/actions)
 *   - Changing settings / brand voice (settings/actions)
 *   - IG/Shopee import (used by #65)
 *
 * V1 actions NOT blocked (in-flight orders must still complete):
 *   - Order status flip (#55 actions, RA: design call)
 *
 * Uses dbAdmin because this helper is called from server actions / API routes
 * across different contexts that may not have RLS context. Pure read op, no
 * cross-tenant write risk.
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
 * Check whether the merchant is suspended; if so, throw MerchantSuspendedError.
 * Non-existent merchant also throws (guards against invalid tenantId writes).
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
