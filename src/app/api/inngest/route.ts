/**
 * Inngest webhook handler — Next.js App Router
 *
 * Notes:
 * - sharp is a native module, must run on Node.js runtime, not edge
 * - maxDuration raised to 300s (vision call + R2 round-trip is occasionally slow)
 */

import { serve } from 'inngest/next';
import { inngest } from '@/inngest/client';
import { productIngestFn } from '@/inngest/functions/product-ingest';
import { productImportBatchFn } from '@/inngest/functions/product-import-batch';

export const runtime = 'nodejs';
export const maxDuration = 300;

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [productIngestFn, productImportBatchFn],
});
