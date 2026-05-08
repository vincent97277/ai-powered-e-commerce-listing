/**
 * IG fetcher (V1 #64)
 *
 * Parse IG public pages (account / product post / shop) → og:* + JSON-LD
 *
 * V1 constraints:
 *   - No IG official API (no OAuth)
 *   - Just fetches server-side rendered HTML (IG is user-agent sensitive, safeFetch mimics Chrome)
 *   - Private accounts / blocked: parser finds no data, throws
 *   - One page ≤ 20 products (cap)
 *
 * Parse strategy:
 *   1. Extract <meta property="og:title|og:image|og:description"> (single product post)
 *   2. Extract <script type="application/ld+json"> contents (Product / ItemList) for multi-item
 *
 * Pure function: input = HTML string, output = NormalizedItem[]
 * (fetch happens in caller, parser is pure HTML → struct, friendly for unit test fixtures)
 */
import {
  type NormalizedItem,
  normalizeTitle,
  normalizeCaption,
  parsePrice,
} from './normalizer';

export class IgParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IgParseError';
  }
}

/** Parse og:* meta tags */
function extractOgTags(html: string): Record<string, string> {
  const tags: Record<string, string> = {};
  // <meta property="og:xxx" content="...">  or reverse order (content before, property after)
  const re = /<meta\s+(?:[^>]*?\s+)?(?:property|name)\s*=\s*["']([^"']+)["'][^>]*?\scontent\s*=\s*["']([^"']*)["']/gi;
  const re2 = /<meta\s+(?:[^>]*?\s+)?content\s*=\s*["']([^"']*)["'][^>]*?\s(?:property|name)\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (m[1].startsWith('og:') || m[1].startsWith('twitter:')) {
      tags[m[1]] = decodeHtmlEntities(m[2]);
    }
  }
  while ((m = re2.exec(html)) !== null) {
    if (m[2].startsWith('og:') || m[2].startsWith('twitter:')) {
      if (!tags[m[2]]) tags[m[2]] = decodeHtmlEntities(m[1]);
    }
  }
  return tags;
}

/** Extract application/ld+json blocks → array of parsed objects */
function extractJsonLd(html: string): unknown[] {
  const out: unknown[] = [];
  const re = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(m[1].trim());
      out.push(parsed);
    } catch {
      // skip malformed JSON-LD
    }
  }
  return out;
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

/**
 * Parse IG HTML → NormalizedItem[]
 * Strategy:
 *   - Try JSON-LD Product/ItemList first (multi-item)
 *   - Fallback to og:* (single page = single item)
 *
 * Images outside IMAGE_HOSTS get blocked by url-guard, so we don't filter image url here
 *
 * @param sourcePageUrl — IG URL pasted by merchant (used as sourceUrl fallback)
 */
export function parseIgHtml(html: string, sourcePageUrl: string): NormalizedItem[] {
  if (!html.trim()) throw new IgParseError('HTML 為空');

  // Private account detection (IG uses "This account is private" or page-side "私人帳號")
  if (
    /This Account is Private/i.test(html) ||
    /此帳號為私人帳號/i.test(html) ||
    /私人帳號/.test(html)
  ) {
    throw new IgParseError('該 IG 帳號為私人帳號, 無法抓取');
  }

  const items: NormalizedItem[] = [];

  // 1. JSON-LD pass
  const jsonLd = extractJsonLd(html);
  for (const node of jsonLd) {
    const found = extractItemsFromJsonLd(node, sourcePageUrl);
    items.push(...found);
  }

  // 2. og:* pass (if JSON-LD found nothing → fallback to single item)
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
    throw new IgParseError('未找到任何商品 (HTML 結構可能變更)');
  }

  return items;
}

/**
 * Recursively extract Product / ItemList from JSON-LD
 * IG may use @graph or nested structures, scan everything
 */
function extractItemsFromJsonLd(
  node: unknown,
  fallbackUrl: string,
): NormalizedItem[] {
  if (!node || typeof node !== 'object') return [];
  const obj = node as Record<string, unknown>;

  // @graph
  if (Array.isArray(obj['@graph'])) {
    return (obj['@graph'] as unknown[]).flatMap((n) => extractItemsFromJsonLd(n, fallbackUrl));
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
    const offers = obj.offers as { price?: number | string } | undefined;
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
    return (obj.itemListElement as unknown[]).flatMap((n) => extractItemsFromJsonLd(n, fallbackUrl));
  }

  if (type === 'ListItem') {
    const item = obj.item;
    return extractItemsFromJsonLd(item, fallbackUrl);
  }

  return [];
}
