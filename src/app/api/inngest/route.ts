/**
 * Inngest webhook handler — Next.js App Router
 *
 * 注意：
 * - sharp 是 native 模組，必須跑在 Node.js runtime，不能用 edge
 * - maxDuration 拉到 300s（vision call + R2 round-trip 偶爾會慢）
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
