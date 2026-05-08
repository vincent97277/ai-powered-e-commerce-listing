/**
 * 訂單 Excel (xlsx) 匯出 (V1.5 Track B2)
 *
 * 13 欄表頭:
 *   訂單編號 / 顧客姓名 / Email / 電話 / 地址 / 狀態 / 總額 (NT$) /
 *   物流商 / 物流單號 / 建立時間 / 已付款時間 / 已出貨時間 / 已完成時間
 *
 * 已付款 / 已出貨 / 已完成時間 → 從 order_status_history 對應 toStatus 取最早 createdAt
 * (orders 表本身沒這 3 個欄位; 由 caller 把 history 推算好 timestamps 一起傳進來)
 *
 * exceljs + frozen header + auto width — 同 products-xlsx 模式
 */
import ExcelJS from 'exceljs';
import type { Order } from '@/db/schema';

const STATUS_LABEL: Record<string, string> = {
  pending: '待付款',
  paid: '已付款',
  shipped: '已出貨',
  completed: '已完成',
  failed: '失敗',
  refunded: '已退款',
};

/** 由 orders + status history 拼出的 export-shape */
export type OrderExportRow = Order & {
  paidAt: Date | null;
  shippedAt: Date | null;
  completedAt: Date | null;
};

type Column = {
  header: string;
  key: string;
  maxWidth?: number;
};

const COLUMNS: Column[] = [
  { header: '訂單編號', key: 'id', maxWidth: 38 },
  { header: '顧客姓名', key: 'customerName', maxWidth: 20 },
  { header: 'Email', key: 'customerEmail', maxWidth: 30 },
  { header: '電話', key: 'customerPhone', maxWidth: 16 },
  { header: '地址', key: 'customerAddress', maxWidth: 40 },
  { header: '狀態', key: 'statusLabel', maxWidth: 12 },
  { header: '總額 (NT$)', key: 'total', maxWidth: 14 },
  { header: '物流商', key: 'carrier', maxWidth: 14 },
  { header: '物流單號', key: 'trackingNumber', maxWidth: 24 },
  { header: '建立時間', key: 'createdAt', maxWidth: 22 },
  { header: '已付款時間', key: 'paidAt', maxWidth: 22 },
  { header: '已出貨時間', key: 'shippedAt', maxWidth: 22 },
  { header: '已完成時間', key: 'completedAt', maxWidth: 22 },
];

function fmtTime(d: Date | null | undefined): string {
  if (!d) return '';
  const yr = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const dy = String(d.getDate()).padStart(2, '0');
  const hr = String(d.getHours()).padStart(2, '0');
  const mn = String(d.getMinutes()).padStart(2, '0');
  return `${yr}-${mo}-${dy} ${hr}:${mn}`;
}

/**
 * 主 API: orders[] → xlsx Buffer
 */
export async function generateOrdersXlsx(orders: OrderExportRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'rls-ai-shop';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet('訂單列表', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  sheet.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key }));

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.alignment = { vertical: 'middle' };

  for (const o of orders) {
    sheet.addRow({
      id: o.id,
      customerName: o.customerName ?? '',
      customerEmail: o.customerEmail,
      customerPhone: o.customerPhone ?? '',
      customerAddress: o.customerAddress ?? '',
      statusLabel: STATUS_LABEL[o.status] ?? o.status,
      total: Math.round(o.totalCents / 100),
      carrier: o.carrier ?? '',
      trackingNumber: o.trackingNumber ?? '',
      createdAt: fmtTime(o.createdAt),
      paidAt: fmtTime(o.paidAt),
      shippedAt: fmtTime(o.shippedAt),
      completedAt: fmtTime(o.completedAt),
    });
  }

  // Auto width
  COLUMNS.forEach((col, idx) => {
    const sheetCol = sheet.getColumn(idx + 1);
    let maxLen = col.header.length;
    sheetCol.eachCell({ includeEmpty: false }, (cell) => {
      const v = cell.value;
      const s = v == null ? '' : String(v);
      const len = [...s].reduce(
        (acc, ch) => acc + (/[一-鿿　-ヿ]/.test(ch) ? 1.6 : 1),
        0,
      );
      if (len > maxLen) maxLen = Math.ceil(len);
    });
    sheetCol.width = Math.min(maxLen + 2, col.maxWidth ?? 60);
  });

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
