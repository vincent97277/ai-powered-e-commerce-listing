/**
 * IG fetcher unit tests (V1 #64)
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseIgHtml, IgParseError } from '@/lib/import/ig-fetcher';

function fixture(name: string): string {
  return readFileSync(resolve(__dirname, `../fixtures/${name}`), 'utf-8');
}

describe('parseIgHtml', () => {
  it('IG shop page (JSON-LD ItemList) → 3 items', () => {
    const html = fixture('ig-shop.html');
    const items = parseIgHtml(html, 'https://www.instagram.com/some_shop/');
    expect(items).toHaveLength(3);
    expect(items[0].title).toBe('夏日輕便手提袋');
    expect(items[0].imageUrl).toContain('scontent.cdninstagram.com');
    expect(items[0].price).toBe(1200);
    expect(items[1].price).toBe(980);
    expect(items[2].price).toBeUndefined(); // 沒 offers
  });

  it('IG single post (og:* only, no JSON-LD) → 1 item fallback', () => {
    const html = fixture('ig-single-post.html');
    const items = parseIgHtml(html, 'https://www.instagram.com/p/single-cup/');
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('手工陶瓷馬克杯 / 質感拉坯');
    expect(items[0].sourceUrl).toBe('https://www.instagram.com/p/single-cup/');
    expect(items[0].price).toBe(680); // 從 description 抓出
  });

  it('IG private account → throw', () => {
    const html = fixture('ig-private.html');
    expect(() => parseIgHtml(html, 'https://www.instagram.com/private/')).toThrow(
      IgParseError,
    );
  });

  it('空 HTML → throw', () => {
    expect(() => parseIgHtml('', 'https://www.instagram.com/x/')).toThrow(/HTML 為空/);
  });

  it('HTML 結構變動 (沒 og 沒 JSON-LD) → throw', () => {
    const html = '<html><body>random page no metadata</body></html>';
    expect(() => parseIgHtml(html, 'https://www.instagram.com/x/')).toThrow(IgParseError);
  });
});
