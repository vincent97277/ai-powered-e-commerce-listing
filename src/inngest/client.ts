/**
 * Inngest client + 事件型別
 *
 * Hackathon scope：只有 product.ingest pipeline 三個事件。
 *
 * 事件設計：
 * - product.ingest          ← 前端上傳完成後 trigger（input 事件）
 * - product.ingested        ← AI pipeline 成功後 emit（讓其他 worker / UI 訂閱）
 * - product.ingest.failed   ← 失敗 emit（DLQ 用，UI 顯示「處理失敗、請重試」）
 *
 * 為什麼要 emit 成功 / 失敗事件而不是直接寫 DB 完事？
 *   方便之後接「商品上架後自動發 IG 文」「失敗時自動通知商家」這類
 *   下游 worker — 反正 hackathon scope 只跑一條，但接點先留好。
 */

import { EventSchemas, Inngest } from 'inngest';

type ProductIngestEvent = {
  data: {
    tenantId: string; // 租戶 ID（給 RLS 用）
    r2Key: string; // R2 物件 key，e.g. "{tenant}/uploads/{uuid}.jpg"
    merchantId: string; // 商家 ID（同 tenant 內可能多商家，這裡多帶一個）
  };
};

type ProductIngestedEvent = {
  data: {
    productId: string;
    tenantId: string;
  };
};

type ProductIngestFailedEvent = {
  data: {
    tenantId: string;
    r2Key: string;
    error: string;
  };
};

export type Events = {
  'product.ingest': ProductIngestEvent;
  'product.ingested': ProductIngestedEvent;
  'product.ingest.failed': ProductIngestFailedEvent;
};

export const inngest = new Inngest({
  id: 'demo-sass-2',
  schemas: new EventSchemas().fromRecord<Events>(),
});
