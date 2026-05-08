/**
 * Shopee CSV exporter unit test (V1.5 Track B2)
 *
 * Cover:
 *   1. Empty product array → header only + UTF-8 BOM
 *   2. Single product (no variants) → header + 1 data row
 *   3. Product with variants → variants expanded to N rows, spec columns filled correctly
 *   4. UTF-8 BOM is the first 3 bytes (EF BB BF)
 */
import { describe, it, expect } from 'vitest';
import {
  generateShopeeCsv,
  SHOPEE_HEADERS,
  UTF8_BOM,
} from '@/lib/export/shopee-csv';
import type { Product } from '@/db/schema';

/** Helper: build a minimal Product (test only) */
function buildProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: '11111111-2222-3333-4444-555555555555',
    tenantId: '00000000-0000-0000-0000-000000000001',
    title: '純棉短T 男女款',
    description: '100% 精梳棉, 厚實不透',
    aiMetadata: {
      title: '純棉短T 男女款',
      description: '100% 精梳棉, 厚實不透',
      category: '服飾配件',
      seo_tags: ['台灣現貨', '基本款'],
      variants: [],
      price_twd: { min: 390, max: 390 },
      confidence: 0.9,
    },
    r2Key: 'tenant1/abc123.webp',
    priceCents: 39000,
    stockQuantity: 50,
    productStatus: 'active',
    isPublished: true,
    importedFromUrl: null,
    createdAt: new Date('2026-04-30T00:00:00Z'),
    updatedAt: new Date('2026-04-30T00:00:00Z'),
    ...overrides,
  } as Product;
}

describe('generateShopeeCsv', () => {
  it('case 1: 空 product 陣列回 header only + UTF-8 BOM', () => {
    const csv = generateShopeeCsv([]);
    // First char is BOM (U+FEFF)
    expect(csv[0]).toBe('﻿');
    expect(csv.startsWith(UTF8_BOM)).toBe(true);

    // BOM is the first 3 bytes EF BB BF
    const buf = Buffer.from(csv, 'utf8');
    expect(buf[0]).toBe(0xef);
    expect(buf[1]).toBe(0xbb);
    expect(buf[2]).toBe(0xbf);

    // header complete (after stripping BOM, first line = 21-column header, comma joined)
    const body = csv.slice(1); // strip BOM
    const lines = body.split(/\r\n/).filter((l) => l !== '');
    expect(lines.length).toBe(1);
    const headerCells = lines[0].split(',');
    expect(headerCells).toEqual(SHOPEE_HEADERS);
  });

  it('case 2: 單一無變體商品 → header + 1 row, 所有 21 欄都有對應值', () => {
    const product = buildProduct({
      title: 'iPhone 殼',
      description: '透明霧面',
      priceCents: 39000,
      stockQuantity: 120,
    });
    const csv = generateShopeeCsv([product]);

    const body = csv.slice(1);
    const lines = body.split(/\r\n/).filter((l) => l !== '');
    expect(lines.length).toBe(2); // header + 1

    const headerCells = lines[0].split(',');
    expect(headerCells).toEqual(SHOPEE_HEADERS);

    // data row 21 columns (split with regex is unreliable because values containing commas are quoted; this product deliberately avoids commas)
    const dataRow = lines[1].split(',');
    expect(dataRow.length).toBe(SHOPEE_HEADERS.length);

    // Header order: [category code, product name, product description, main SKU, ...]
    expect(dataRow[0]).toBe('5940'); // 服飾配件 → 5940
    expect(dataRow[1]).toBe('iPhone 殼');
    expect(dataRow[2]).toBe('透明霧面');
    expect(dataRow[3]).toMatch(/^SKU-/);
    expect(dataRow[4]).toBe(''); // no variants → spec identifier empty
    expect(dataRow[5]).toBe(''); // spec name 1
    expect(dataRow[6]).toBe(''); // spec option 1
    expect(dataRow[10]).toBe('390'); // price
    expect(dataRow[11]).toBe('120'); // stock
    // V2.2.13: image URL is now absolute (Shopee imports need a public URL it can fetch).
    // In tests NEXT_PUBLIC_APP_URL=http://localhost:3000 + STORAGE_BACKEND=local
    // → getPublicUrl returns http://localhost:3000/uploads/<key>.
    expect(dataRow[13]).toBe('http://localhost:3000/uploads/tenant1/abc123.webp'); // main product image
    // Shipping defaults all enabled
    expect(dataRow[18]).toBe('開啟');
    expect(dataRow[19]).toBe('開啟');
    expect(dataRow[20]).toBe('開啟');
    expect(dataRow[21]).toBe('開啟');
  });

  it('case 3: 變體商品 → axis1 × axis2 笛卡兒積展開, 規格欄位填值', () => {
    const product = buildProduct({
      title: '純棉T',
      description: '台灣製',
      priceCents: 39000,
      stockQuantity: 50,
      aiMetadata: {
        title: '純棉T',
        description: '台灣製',
        category: '服飾配件',
        seo_tags: [],
        variants: [
          { name: '顏色', options: ['白色', '黑色'] },
          { name: '尺寸', options: ['S', 'M', 'L'] },
        ],
        price_twd: { min: 390, max: 390 },
        confidence: 0.9,
      },
    });

    const csv = generateShopeeCsv([product]);
    const body = csv.slice(1);
    const lines = body.split(/\r\n/).filter((l) => l !== '');

    // header + 2*3 = 6 data rows
    expect(lines.length).toBe(7);

    // Second row = first variant = white S
    const r1 = lines[1].split(',');
    expect(r1[5]).toBe('顏色'); // spec name 1
    expect(r1[6]).toBe('白色'); // spec option 1
    expect(r1[8]).toBe('尺寸'); // spec name 2
    expect(r1[9]).toBe('S'); // spec option 2
    // Spec identifier = first 8 chars of product.id
    expect(r1[4]).toBe('11111111');
    // Variant SKU = SKU-XXXX-(white)-S
    expect(r1[12]).toContain('白色');
    expect(r1[12]).toContain('-S');

    // Last row = black L
    const rLast = lines[6].split(',');
    expect(rLast[6]).toBe('黑色');
    expect(rLast[9]).toBe('L');
  });

  it('case 4: BOM 確認 = EF BB BF (3 bytes)', () => {
    const csv = generateShopeeCsv([]);
    const buf = Buffer.from(csv, 'utf8');
    expect(buf.slice(0, 3).toString('hex')).toBe('efbbbf');
  });

  it('case 5: 描述含逗號 / 雙引號 → 正確 RFC4180 quote-escape', () => {
    const product = buildProduct({
      title: '測試',
      description: '內含 "雙引號" 與 逗號, 換行',
    });
    const csv = generateShopeeCsv([product]);
    // Description cell should be wrapped in ", internal " becomes ""
    expect(csv).toContain('"內含 ""雙引號"" 與 逗號, 換行"');
  });

  // V1.5 review M3: hyphen / quotes / special chars in option strings make SKU ambiguous
  it('case 6: variant option 含 hyphen / 引號 → SKU sanitization (M3 fix)', () => {
    const product = buildProduct({
      title: '測試 SKU sanitize',
      description: '驗 V1.5 M3',
      aiMetadata: {
        title: '測試 SKU sanitize',
        description: '驗 V1.5 M3',
        category: '服飾配件',
        seo_tags: [],
        variants: [
          { name: '尺寸', options: ['M-L', '中"号'] },
        ],
        price_twd: { min: 390, max: 390 },
        confidence: 0.9,
      },
    });
    const csv = generateShopeeCsv([product]);
    const body = csv.slice(1);
    const lines = body.split(/\r\n/).filter((l) => l !== '');
    expect(lines.length).toBe(3); // header + 2 data rows

    // Variant SKU (col index 12 — see schema)
    const sku1 = lines[1].split(',')[12];
    const sku2 = lines[2].split(',')[12];
    // Hyphen in original option is replaced with _, ensuring SKU is not split incorrectly by extra hyphen
    expect(sku1).not.toContain('-M-L-');
    expect(sku1).toMatch(/-M_L$/);
    // Double quote / CJK handling — Chinese preserved (Unicode \p{L}), double quotes replaced
    // Note column 12 is raw split; "" RFC4180-escaped internal quotes may remain
    expect(sku2).toMatch(/-中_号$|-中_号"$/);
  });
});
