/**
 * Shopee fetcher (V1 #64)
 *
 * Shopee product pages ship structured JSON-LD (schema.org Product) — parse directly.
 * Storefront URL patterns: shopee.tw/shop/{shopid} | shopee.tw/{seller}.{shopid}
 *
 * Pure function: HTML → NormalizedItem[]
 */
import {
  type NormalizedItem,
  normalizeTitle,
  normalizeCaption,
  parsePrice,
} from './normalizer';

export class ShopeeParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ShopeeParseError';
  }
}

function extractJsonLd(html: string): unknown[] {
  const out: unknown[] = [];
  const re = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      out.push(JSON.parse(m[1].trim()));
    } catch {
      // skip
    }
  }
  return out;
}

function extractOgTags(html: string): Record<string, string> {
  const tags: Record<string, string> = {};
  const re = /<meta\s+(?:[^>]*?\s+)?(?:property|name)\s*=\s*["']([^"']+)["'][^>]*?\scontent\s*=\s*["']([^"']*)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (m[1].startsWith('og:') || m[1].startsWith('twitter:')) {
      tags[m[1]] = m[2];
    }
  }
  return tags;
}

export function parseShopeeHtml(html: string, sourcePageUrl: string): NormalizedItem[] {
  if (!html.trim()) throw new ShopeeParseError('HTML 為空');

  const items: NormalizedItem[] = [];
  const jsonLd = extractJsonLd(html);
  for (const node of jsonLd) {
    items.push(...extractFromShopeeJsonLd(node, sourcePageUrl));
  }

  // Fallback to og:* (single product page)
  if (items.length === 0) {
    const og = extractOgTags(html);
    if (og['og:title'] && og['og:image']) {
      items.push({
        title: normalizeTitle(og['og:title']),
        imageUrl: og['og:image'],
        sourceUrl: og['og:url'] ?? sourcePageUrl,
        sourceCaption: normalizeCaption(og['og:description']),
        price: parsePrice(og['product:price:amount'] ?? og['og:description']),
      });
    }
  }

  if (items.length === 0) {
    throw new ShopeeParseError('未找到任何商品 (蝦皮 HTML 結構可能變更, 或店面為空)');
  }

  return items;
}

function extractFromShopeeJsonLd(
  node: unknown,
  fallbackUrl: string,
): NormalizedItem[] {
  if (!node || typeof node !== 'object') return [];
  const obj = node as Record<string, unknown>;

  if (Array.isArray(obj['@graph'])) {
    return (obj['@graph'] as unknown[]).flatMap((n) =>
      extractFromShopeeJsonLd(n, fallbackUrl),
    );
  }

  const type = obj['@type'];
  if (type === 'Product') {
    const title = typeof obj.name === 'string' ? obj.name : '';
    const image =
      typeof obj.image === 'string'
        ? obj.image
        : Array.isArray(obj.image)
          ? (obj.image[0] as string)
          : (obj.image as { url?: string })?.url;
    if (!title || !image) return [];
    const offers = obj.offers as { price?: number | string; priceCurrency?: string } | undefined;
    return [
      {
        title: normalizeTitle(title),
        imageUrl: image,
        sourceUrl: typeof obj.url === 'string' ? obj.url : fallbackUrl,
        sourceCaption: normalizeCaption(typeof obj.description === 'string' ? obj.description : undefined),
        price: typeof offers?.price === 'number'
          ? Math.floor(offers.price)
          : parsePrice(typeof offers?.price === 'string' ? offers.price : undefined),
      },
    ];
  }

  if (type === 'ItemList' && Array.isArray(obj.itemListElement)) {
    return (obj.itemListElement as unknown[]).flatMap((n) =>
      extractFromShopeeJsonLd(n, fallbackUrl),
    );
  }

  if (type === 'ListItem' && obj.item) {
    return extractFromShopeeJsonLd(obj.item, fallbackUrl);
  }

  return [];
}
