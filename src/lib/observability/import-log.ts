/**
 * Import observability logger (V1 #69)
 *
 * V1: 純 console.log 一行 JSON, 統一格式給 V2 metric 系統用
 *     未來改 datadog / honeycomb / pino → 改這個檔即可
 */
export type ImportLogPayload = {
  merchantId: string;
  sourceType: 'ig' | 'shopee';
  url: string;
  itemCount: number;
  durationMs: number;
  success: boolean;
  error?: string;
  successItems?: number;
  failedItems?: number;
};

export function logImport(payload: ImportLogPayload): void {
  const entry = {
    type: 'product.import',
    ts: new Date().toISOString(),
    ...payload,
  };
  // 一行 JSON 方便 grep / 後續 ingest
  console.log(JSON.stringify(entry));
}
