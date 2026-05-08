/**
 * Shopee bulk-upload CSV export (V1.5 Track B2)
 *
 * Aligned with shopee-tw-mass-upload-sample.csv (Taiwan mall, 21 columns):
 *   category code, product name, product description, main SKU, spec group id,
 *   spec name 1, spec option 1, spec image, spec name 2, spec option 2,
 *   price, stock, option SKU, main product image, weight,
 *   length, width, height, 7-11 COD, FamilyMart COD, T-cat home delivery, post,
 *   longer prep days
 * (Exact CJK header strings preserved in SHOPEE_HEADERS below — Shopee parser is positional.)
 *
 * Strategy:
 *   - Pure function generateShopeeCsv(products) -> string (with UTF-8 BOM)
 *   - Variants: expand only first 1+2 axes for product_status='active'; no variants -> single row
 *   - Weight/size/logistics: safe defaults (0.1kg, 16x12x4cm, all enabled)
 *   - Category: aiMetadata.category maps to Shopee category code (cat-map)
 *   - Image: r2Key -> /uploads/{r2Key} relative path (for demo use)
 */
import type { Product } from '@/db/schema';
import { getPublicUrl } from '@/lib/storage';

/** UTF-8 BOM — keeps Windows Excel from mangling the CSV encoding. */
export const UTF8_BOM = '﻿';

/**
 * Shopee 21-column header (aligned with shopee-tw-mass-upload-sample.csv).
 * Order is fixed; Shopee's upload parser is positional.
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
 * AI metadata category -> Shopee category code (Taiwan).
 *
 * Numbers are picked from representative children in Shopee TW's popular category tree; merchants can fine-tune in the Shopee back office.
 * V1.5 demo-level mapping, not aiming for accuracy (full mapping integration via Shopee's own API is a V2+ item).
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

/** RFC 4180 + Shopee quirks: wrap in double quotes, escape inner double quotes -> "" */
function csvCell(v: string | number | null | undefined): string {
  if (v == null) return '';
  const s = String(v);
  // newline / double-quote / comma -> wrap in double quotes and escape
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Map ai_metadata.category to a category code (not found -> 0). */
function mapCategory(category: string | undefined): string {
  if (!category) return DEFAULT_CATEGORY_CODE;
  return SHOPEE_CATEGORY_MAP[category] ?? DEFAULT_CATEGORY_CODE;
}

/** Image URL: V2.2.13 uses the storage facade's absolute URL (R2 or local-fs).
 *  Shopee import requires an absolute URL — must be reachable from the Shopee server. */
function resolveImageUrl(r2Key: string | null | undefined): string {
  if (!r2Key) return '';
  if (r2Key.includes('/fixtures/')) return '';
  return getPublicUrl(r2Key);
}

/** Expand a single product (including variants) into Shopee CSV rows. */
function productToRows(p: Product): string[][] {
  const categoryCode = mapCategory(p.aiMetadata?.category);
  const title = p.title;
  const description = (p.description ?? '').trim();
  const sku = `SKU-${p.id.slice(0, 8).toUpperCase()}`;
  const imageUrl = resolveImageUrl(p.r2Key);
  const price = String(Math.max(0, Math.round(p.priceCents / 100)));
  const stock = String(Math.max(0, p.stockQuantity));

  // Default logistics / size: Shopee requires all fields to have values; merchants can tweak in the back office.
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

  // No variants -> single row, spec fields blank.
  if (variants.length === 0 || variants.every((v) => v.options.length === 0)) {
    return [
      [
        categoryCode,
        title,
        description,
        sku,
        '', // spec group id column
        '',
        '',
        '',
        '',
        '',
        price,
        stock,
        sku, // option SKU column = main SKU (no variants)
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

  // Has variants -> expand axis1 x axis2 (Cartesian product); Shopee caps at 2 axes.
  const axis1 = variants[0];
  const axis2 = variants[1];
  // Shopee spec group id: shared by all spec rows of the same product (here we use a slice of the product id).
  const specGroupId = p.id.slice(0, 8);
  const rows: string[][] = [];

  const opts1 = axis1.options.length > 0 ? axis1.options : [''];
  const opts2 = axis2 && axis2.options.length > 0 ? axis2.options : [''];

  // V1.5 review M3: SKU sanitization — option strings (e.g. "M-L", '中"号') must not contain hyphens / quotes / whitespace,
  // otherwise the SKU becomes ambiguous and Shopee upload may reject. Unicode-aware: keep Chinese/Japanese/digits, replace others with _.
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
        '', // spec image column — V1.5 doesn't ship per-axis images; uses the main product image throughout.
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
 * Main API: products[] -> Shopee CSV string (with UTF-8 BOM).
 * Empty array -> header only + BOM (still useful for merchants to inspect column order).
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

  // The Shopee parser handles \r\n fine; use \r\n to align with the sample file and Excel.
  return UTF8_BOM + lines.join('\r\n') + '\r\n';
}
