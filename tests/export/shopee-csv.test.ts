/**
 * 蝦皮 CSV exporter unit test (V1.5 Track B2)
 *
 * Cover:
 *   1. 空 product 陣列 → 只有 header + UTF-8 BOM
 *   2. 單一商品 (無變體) → header + 1 data row
 *   3. 商品有變體 → 變體展開成 N 列, 規格欄位填正確
 *   4. UTF-8 BOM 是前 3 bytes (EF BB BF)
 */
import { describe, it, expect } from 'vitest';
import {
  generateShopeeCsv,
  SHOPEE_HEADERS,
  UTF8_BOM,
} from '@/lib/export/shopee-csv';
import type { Product } from '@/db/schema';

/** 工具: build 一個 minimal Product (test only) */
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
    // 第一個 char 是 BOM (U+FEFF)
    expect(csv[0]).toBe('﻿');
    expect(csv.startsWith(UTF8_BOM)).toBe(true);

    // BOM 是前 3 bytes EF BB BF
    const buf = Buffer.from(csv, 'utf8');
    expect(buf[0]).toBe(0xef);
    expect(buf[1]).toBe(0xbb);
    expect(buf[2]).toBe(0xbf);

    // header 完整 (剝掉 BOM 後第一行 = 21 欄表頭, comma joined)
    const body = csv.slice(1); // 去 BOM
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

    // data row 21 欄 (split with regex 不可靠因為值含逗號被引號包了; 這裡商品故意避開逗號)
    const dataRow = lines[1].split(',');
    expect(dataRow.length).toBe(SHOPEE_HEADERS.length);

    // 表頭順序: [分類代碼, 商品名稱, 商品描述, 主商品貨號, ...]
    expect(dataRow[0]).toBe('5940'); // 服飾配件 → 5940
    expect(dataRow[1]).toBe('iPhone 殼');
    expect(dataRow[2]).toBe('透明霧面');
    expect(dataRow[3]).toMatch(/^SKU-/);
    expect(dataRow[4]).toBe(''); // 無變體 → 規格識別碼空
    expect(dataRow[5]).toBe(''); // 規格名稱1
    expect(dataRow[6]).toBe(''); // 規格選項1
    expect(dataRow[10]).toBe('390'); // 價格
    expect(dataRow[11]).toBe('120'); // 庫存
    // V2.2.13: image URL is now absolute (Shopee imports need a public URL it can fetch).
    // In tests NEXT_PUBLIC_APP_URL=http://localhost:3000 + STORAGE_BACKEND=local
    // → getPublicUrl returns http://localhost:3000/uploads/<key>.
    expect(dataRow[13]).toBe('http://localhost:3000/uploads/tenant1/abc123.webp'); // 主商品圖片
    // 物流預設全開啟
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

    // 第二行 = 第一個變體 = 白色 S
    const r1 = lines[1].split(',');
    expect(r1[5]).toBe('顏色'); // 規格名稱1
    expect(r1[6]).toBe('白色'); // 規格選項1
    expect(r1[8]).toBe('尺寸'); // 規格名稱2
    expect(r1[9]).toBe('S'); // 規格選項2
    // 規格識別碼 = product.id 前 8 字元
    expect(r1[4]).toBe('11111111');
    // 商品選項貨號 = SKU-XXXX-白色-S
    expect(r1[12]).toContain('白色');
    expect(r1[12]).toContain('-S');

    // 最後一行 = 黑色 L
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
    // 描述 cell 應該被 " 包住, 內部 " 變 ""
    expect(csv).toContain('"內含 ""雙引號"" 與 逗號, 換行"');
  });

  // V1.5 review M3: option 字串裡 hyphen / 引號 / 特殊字會把 SKU 變 ambiguous
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

    // 商品選項貨號 (col index 12 — see schema)
    const sku1 = lines[1].split(',')[12];
    const sku2 = lines[2].split(',')[12];
    // hyphen 在原 option 內被換成 _, 確保 SKU 不會被多餘 hyphen 切錯
    expect(sku1).not.toContain('-M-L-');
    expect(sku1).toMatch(/-M_L$/);
    // 雙引號 / CJK 處理 — 中文保留 (Unicode \p{L}), 雙引號被換掉
    // 注意 column 12 是 raw split, 含 "" RFC4180 escape 內含的引號可能殘留
    expect(sku2).toMatch(/-中_号$|-中_号"$/);
  });
});
