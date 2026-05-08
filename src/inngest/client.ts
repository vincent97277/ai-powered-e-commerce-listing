/**
 * Inngest client + 事件型別
 *
 * V1 scope：只有 product.ingest pipeline 三個事件。
 *
 * 事件設計：
 * - product.ingest          ← 前端上傳完成後 trigger（input 事件）
 * - product.ingested        ← AI pipeline 成功後 emit（讓其他 worker / UI 訂閱）
 * - product.ingest.failed   ← 失敗 emit（DLQ 用，UI 顯示「處理失敗、請重試」）
 *
 * 為什麼要 emit 成功 / 失敗事件而不是直接寫 DB 完事？
 *   方便之後接「商品上架後自動發 IG 文」「失敗時自動通知商家」這類
 *   下游 worker — 反正 V1 scope 只跑一條，但接點先留好。
 */

import { EventSchemas, Inngest } from 'inngest';

type ProductIngestEvent = {
  data: {
    tenantId: string; // 租戶 ID（給 RLS 用）
    r2Key: string; // 本地 storage key, e.g. "{tenant}/{uuid}.jpg"
    merchantId: string; // 商家 ID（同 tenant 內可能多商家，這裡多帶一個）
    /** V1 #67 (RA12): IG/蝦皮 import 時餵進 GPT-4o 的 source caption (商家原文) */
    sourceText?: string;
    /** V1 #66 (RA15): 給 child failure 寫回 parent session 用 */
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

/** V1 #66: IG/蝦皮 import batch parent worker (5-20 件 / session) */
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
