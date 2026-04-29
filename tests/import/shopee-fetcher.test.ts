/**
 * 蝦皮 fetcher unit tests (V1 #64)
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseShopeeHtml, ShopeeParseError } from '@/lib/import/shopee-fetcher';

function fixture(name: string): string {
  return readFileSync(resolve(__dirname, `../fixtures/${name}`), 'utf-8');
}

describe('parseShopeeHtml', () => {
  it('蝦皮 shop page → 2 items', () => {
    const html = fixture('shopee-shop.html');
    const items = parseShopeeHtml(html, 'https://shopee.tw/akamishop');
    expect(items).toHaveLength(2);
    expect(items[0].title).toBe('復古日式陶杯');
    expect(items[0].imageUrl).toContain('cf.shopee.tw');
    expect(items[0].price).toBe(680);
    expect(items[1].title).toBe('手沖咖啡濾杯');
    expect(items[1].price).toBe(850);
  });

  it('空 HTML → throw', () => {
    expect(() => parseShopeeHtml('', 'https://shopee.tw/x')).toThrow(/HTML 為空/);
  });

  it('沒 metadata → throw', () => {
    const html = '<html><body>nothing</body></html>';
    expect(() => parseShopeeHtml(html, 'https://shopee.tw/x')).toThrow(ShopeeParseError);
  });
});
