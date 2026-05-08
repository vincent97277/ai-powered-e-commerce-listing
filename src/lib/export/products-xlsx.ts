/**
 * 商品 Excel (xlsx) 匯出 (V1.5 Track B2)
 *
 * 9 欄表頭:
 *   商品編號 / 標題 / 描述 / 分類 / 變體 (JSON) / 價格 / 庫存 / 圖片 URL / 建立時間
 *
 * 設計:
 *   - exceljs (Apache-2.0, MIT compatible)
 *   - 第一列 bold + 凍結 (frozen header row)
 *   - 自動寬度: 取每欄最大字串長度 + 2 chars buffer (上限 60)
 *   - 變體欄位: JSON.stringify(aiMetadata.variants) - 商家肉眼看也能 parse
 *   - Buffer.from(...) 讓 Next.js Response 直接餵
 */
import ExcelJS from 'exceljs';
import type { Product } from '@/db/schema';
import { getPublicUrl } from '@/lib/storage';

type Column = {
  header: string;
  /** key 在 row object 內 */
  key: string;
  /** 自動寬度上限 */
  maxWidth?: number;
};

const COLUMNS: Column[] = [
  { header: '商品編號', key: 'id', maxWidth: 38 },
  { header: '標題', key: 'title', maxWidth: 50 },
  { header: '描述', key: 'description', maxWidth: 60 },
  { header: '分類', key: 'category', maxWidth: 16 },
  { header: '變體', key: 'variants', maxWidth: 60 },
  { header: '價格 (NT$)', key: 'price', maxWidth: 14 },
  { header: '庫存', key: 'stock', maxWidth: 10 },
  { header: '圖片 URL', key: 'imageUrl', maxWidth: 50 },
  { header: '建立時間', key: 'createdAt', maxWidth: 22 },
];

function imageUrl(r2Key: string | null | undefined): string {
  if (!r2Key) return '';
  if (r2Key.includes('/fixtures/')) return '';
  // V2.2.13: server-side getPublicUrl returns absolute URL for both backends
  // (R2_PUBLIC_URL or NEXT_PUBLIC_APP_URL/uploads/). Exports go to merchants
  // who download + import elsewhere — must be absolute.
  return getPublicUrl(r2Key);
}

function fmtTime(d: Date): string {
  // 台灣商家最熟的 YYYY-MM-DD HH:mm
  const yr = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const dy = String(d.getDate()).padStart(2, '0');
  const hr = String(d.getHours()).padStart(2, '0');
  const mn = String(d.getMinutes()).padStart(2, '0');
  return `${yr}-${mo}-${dy} ${hr}:${mn}`;
}

/**
 * 主 API: products[] → xlsx Buffer
 */
export async function generateProductsXlsx(products: Product[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'rls-ai-shop';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet('商品列表', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  // 設 columns (header + key)
  sheet.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key }));

  // Header bold
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.alignment = { vertical: 'middle' };

  // Body rows
  for (const p of products) {
    sheet.addRow({
      id: p.id,
      title: p.title,
      description: (p.description ?? '').replace(/\s+/g, ' ').trim(),
      category: p.aiMetadata?.category ?? '',
      variants: JSON.stringify(p.aiMetadata?.variants ?? []),
      price: Math.round((p.priceCents ?? 0) / 100),
      stock: p.stockQuantity ?? 0,
      imageUrl: imageUrl(p.r2Key),
      createdAt: fmtTime(p.createdAt),
    });
  }

  // Auto width: 取每欄 max(len, header.len) + 2, clamp to maxWidth
  COLUMNS.forEach((col, idx) => {
    const sheetCol = sheet.getColumn(idx + 1);
    let maxLen = col.header.length;
    sheetCol.eachCell({ includeEmpty: false }, (cell) => {
      const v = cell.value;
      const s = v == null ? '' : String(v);
      // CJK 字元在 Excel 比拉丁寬, 粗略 *1.6 補
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
