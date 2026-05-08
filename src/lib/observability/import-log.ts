/**
 * Import observability logger (V1 #69)
 *
 * V1: pure console.log of one JSON line — uniform shape for the V2 metrics system.
 *     To swap in datadog / honeycomb / pino later, change this file only.
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
  // One JSON line — easy to grep / ingest downstream
  console.log(JSON.stringify(entry));
}
