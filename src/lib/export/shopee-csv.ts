/**
 * 蝦皮大量上架 CSV 匯出 (V1.5 Track B2)
 *
 * 對齊 shopee-tw-mass-upload-sample.csv (台灣商城 21 欄):
 *   分類代碼, 商品名稱, 商品描述, 主商品貨號, 商品規格識別碼,
 *   規格名稱1, 規格選項1, 規格圖片, 規格名稱2, 規格選項2,
 *   價格, 庫存, 商品選項貨號, 主商品圖片, 重量,
 *   長度, 寬度, 高度, 7-11取貨付款, 全家取貨付款, 黑貓宅配, 郵局, 較長備貨天數
 *
 * 策略:
 *   - 純函式 generateShopeeCsv(products) → string (含 UTF-8 BOM)
 *   - 變體: 只展開到 product_status='active' 且第 1+2 軸; 沒變體就單列
 *   - 重量/尺寸/物流: 用安全預設 (0.1kg, 16x12x4cm, 全部開啟)
 *   - 分類: aiMetadata.category 對應到蝦皮分類代碼 (cat-map)
 *   - 圖片: r2Key → /uploads/{r2Key} 的相對路徑 (demo 用)
 */
import type { Product } from '@/db/schema';
import { getPublicUrl } from '@/lib/storage';

/** UTF-8 BOM — 讓 Windows Excel 開啟 CSV 不亂碼 */
export const UTF8_BOM = '﻿';

/**
 * 蝦皮 21 欄表頭 (對齊 shopee-tw-mass-upload-sample.csv)
 * 順序不可變; 蝦皮上傳 parser 是 positional.
 */
export const SHOPEE_HEADERS: readonly string[] = [
  '分類代碼',
  '商品名稱',
  '商品描述',
  '主商品貨號',
  '商品規格識別碼',
  '規格名稱1',
  '規格選項1',
  '規格圖片',
  '規格名稱2',
  '規格選項2',
  '價格',
  '庫存',
  '商品選項貨號',
  '主商品圖片',
  '重量',
  '長度',
  '寬度',
  '高度',
  '7-11取貨付款',
  '全家取貨付款',
  '黑貓宅配',
  '郵局',
  '較長備貨天數',
];

/**
 * AI metadata category → 蝦皮分類代碼 (台灣)
 *
 * 數字採自蝦皮台灣熱門類目樹的子節點代表; 商家可在蝦皮後台二次調整。
 * V1.5 demo 級別映射，不求精確 (蝦皮自身有完整對照表 API V2 才整合)。
 */
const SHOPEE_CATEGORY_MAP: Record<string, string> = {
  '服飾配件': '5940',
  '美妝保養': '11324',
  '食品飲料': '6112',
  '居家生活': '5708',
  '3C 周邊': '5538',
  '文具書籍': '11341',
  '運動戶外': '11363',
  '其他': '0',
};

const DEFAULT_CATEGORY_CODE = '0';

/** RFC 4180 + 蝦皮 quirks: 包雙引號, 逃逸雙引號 → "" */
function csvCell(v: string | number | null | undefined): string {
  if (v == null) return '';
  const s = String(v);
  // 換行 / 雙引號 / 逗號 → 用雙引號包並逃逸
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** 把 ai_metadata.category 對到分類代碼 (找不到 → 0) */
function mapCategory(category: string | undefined): string {
  if (!category) return DEFAULT_CATEGORY_CODE;
  return SHOPEE_CATEGORY_MAP[category] ?? DEFAULT_CATEGORY_CODE;
}

/** 圖片 URL: V2.2.13 用 storage facade 的 absolute URL (R2 or local-fs).
 *  Shopee 匯入需要絕對 URL — 從蝦皮 server 抓得到. */
function resolveImageUrl(r2Key: string | null | undefined): string {
  if (!r2Key) return '';
  if (r2Key.includes('/fixtures/')) return '';
  return getPublicUrl(r2Key);
}

/** 把單一 product (含變體) 展開成蝦皮 CSV row[] */
function productToRows(p: Product): string[][] {
  const categoryCode = mapCategory(p.aiMetadata?.category);
  const title = p.title;
  const description = (p.description ?? '').trim();
  const sku = `SKU-${p.id.slice(0, 8).toUpperCase()}`;
  const imageUrl = resolveImageUrl(p.r2Key);
  const price = String(Math.max(0, Math.round(p.priceCents / 100)));
  const stock = String(Math.max(0, p.stockQuantity));

  // 預設物流 / 尺寸: 蝦皮要求所有欄位有值, 商家可在後台微調
  const weightKg = '0.1';
  const length = '16';
  const width = '12';
  const height = '4';
  const sevenEleven = '開啟';
  const familyMart = '開啟';
  const tcat = '開啟';
  const post = '開啟';
  const longLeadDays = '';

  const variants = p.aiMetadata?.variants ?? [];

  // 沒變體 → 單列, 規格欄位空白
  if (variants.length === 0 || variants.every((v) => v.options.length === 0)) {
    return [
      [
        categoryCode,
        title,
        description,
        sku,
        '', // 商品規格識別碼
        '',
        '',
        '',
        '',
        '',
        price,
        stock,
        sku, // 商品選項貨號 = 主貨號 (無變體)
        imageUrl,
        weightKg,
        length,
        width,
        height,
        sevenEleven,
        familyMart,
        tcat,
        post,
        longLeadDays,
      ],
    ];
  }

  // 有變體 → 展開 axis1 × axis2 (笛卡兒積); 蝦皮上限 2 軸
  const axis1 = variants[0];
  const axis2 = variants[1];
  // 蝦皮規格識別碼: 同一商品所有規格列共用一組 (這裡用 product id slice)
  const specGroupId = p.id.slice(0, 8);
  const rows: string[][] = [];

  const opts1 = axis1.options.length > 0 ? axis1.options : [''];
  const opts2 = axis2 && axis2.options.length > 0 ? axis2.options : [''];

  // V1.5 review M3: SKU sanitization — option 字串 (e.g. "M-L", '中"号') 不得帶 hyphen / 引號 / 空白,
  // 否則 SKU 變 ambiguous + 蝦皮上架可能拒. Unicode-aware: 中文/日文/數字保留, 其他換 _
  const sanitizeSkuPart = (s: string): string =>
    s.replace(/[^\p{L}\p{N}]+/gu, '_').slice(0, 16) || 'opt';

  for (const o1 of opts1) {
    for (const o2 of opts2) {
      const skuParts = [sku];
      if (o1) skuParts.push(sanitizeSkuPart(o1));
      if (o2) skuParts.push(sanitizeSkuPart(o2));
      const optionSku = skuParts.join('-');
      rows.push([
        categoryCode,
        title,
        description,
        sku,
        specGroupId,
        axis1.name ?? '',
        o1,
        '', // 規格圖片 — V1.5 不分軸圖, 統一用主商品圖
        axis2?.name ?? '',
        o2,
        price,
        stock,
        optionSku,
        imageUrl,
        weightKg,
        length,
        width,
        height,
        sevenEleven,
        familyMart,
        tcat,
        post,
        longLeadDays,
      ]);
    }
  }
  return rows;
}

/**
 * 主 API: 把 products[] → 蝦皮 CSV 字串 (含 UTF-8 BOM)
 * 空 array → header only + BOM (商家拿來看欄位順序也合理)
 */
export function generateShopeeCsv(products: Product[]): string {
  const lines: string[] = [];
  lines.push(SHOPEE_HEADERS.map(csvCell).join(','));

  for (const p of products) {
    const rows = productToRows(p);
    for (const r of rows) {
      lines.push(r.map(csvCell).join(','));
    }
  }

  // 蝦皮 parser 對 \r\n 容忍度高; 用 \r\n 對齊 sample 與 Excel
  return UTF8_BOM + lines.join('\r\n') + '\r\n';
}
