/**
 * Inngest client + event types.
 *
 * V1 scope: just the three product.ingest pipeline events.
 *
 * Event design:
 * - product.ingest          ← triggered after frontend upload completes (input event)
 * - product.ingested        ← emitted after AI pipeline success (subscribed by other workers / UI)
 * - product.ingest.failed   ← emitted on failure (DLQ; UI shows "processing failed, please retry")
 *
 * Why emit success/failure events instead of just writing to DB and being done?
 *   Easier to wire up downstream workers like "auto-post product to IG after listing"
 *   or "auto-notify merchant on failure". V1 scope only runs one pipeline, but the
 *   hook points are already in place.
 */

import { EventSchemas, Inngest } from 'inngest';

type ProductIngestEvent = {
  data: {
    tenantId: string; // tenant ID (for RLS)
    r2Key: string; // local storage key, e.g. "{tenant}/{uuid}.jpg"
    merchantId: string; // merchant ID (a tenant may have multiple merchants, so we carry it separately)
    /** V1 #67 (RA12): source caption fed into GPT-4o during IG/Shopee import (merchant's original copy) */
    sourceText?: string;
    /** V1 #66 (RA15): used by child failure to write back into parent session */
    importSessionId?: string;
    itemIndex?: number;
  };
};

type ProductIngestedEvent = {
  data: {
    productId: string;
    tenantId: string;
    importSessionId?: string;
    itemIndex?: number;
  };
};

type ProductIngestFailedEvent = {
  data: {
    tenantId: string;
    r2Key: string;
    error: string;
    importSessionId?: string;
    itemIndex?: number;
  };
};

/** V1 #66: IG/Shopee import batch parent worker (5-20 items / session) */
type ProductImportBatchEvent = {
  data: {
    sessionId: string;
    tenantId: string;
    merchantId: string;
    sourceUrl: string;
    sourceType: 'ig' | 'shopee';
  };
};

export type Events = {
  'product.ingest': ProductIngestEvent;
  'product.ingested': ProductIngestedEvent;
  'product.ingest.failed': ProductIngestFailedEvent;
  'product.import.batch': ProductImportBatchEvent;
};

export const inngest = new Inngest({
  id: 'rls-ai-shop',
  schemas: new EventSchemas().fromRecord<Events>(),
});
