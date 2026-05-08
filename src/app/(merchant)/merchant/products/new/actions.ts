'use server';

import { inngest } from '@/inngest/client';
import { resolveMerchantFromCookie } from '@/lib/storage/resolve-merchant';
import { assertNotSuspended } from '@/lib/merchant/suspend-guard';

/**
 * Trigger Inngest background generation after upload completes
 * (V1: synchronous /api/products/generate also runs; this is a backup path)
 */
export async function triggerIngest(opts: {
  r2Key: string;
}): Promise<{ ingested: boolean }> {
  const merchant = await resolveMerchantFromCookie();

  // V1 #53: suspended merchants cannot list new products
  await assertNotSuspended(merchant.tenantId);

  if (!opts.r2Key.startsWith(`${merchant.tenantId}/`)) {
    console.warn('[triggerIngest] storage key does not belong to current tenant, refusing', {
      tenantId: merchant.tenantId,
      key: opts.r2Key,
    });
    return { ingested: false };
  }

  await inngest.send({
    name: 'product.ingest',
    data: {
      tenantId: merchant.tenantId,
      r2Key: opts.r2Key,
      merchantId: merchant.tenantId,
    },
  });

  return { ingested: true };
}
