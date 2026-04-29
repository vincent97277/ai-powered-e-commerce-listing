/**
 * SSRF defense for IG/蝦皮 import (V1 #62, RA9 + RA10 secondary)
 *
 * Design 文件 §A6 + Security review B1 要求:
 *   1. hostname allowlist via new URL().hostname (不用 regex, regex 可被 user-info trick 繞過)
 *   2. https only
 *   3. DNS resolve hostname → IP, 拒 RFC1918/loopback/link-local v4+v6 (DNS rebinding 防禦)
 *   4. redirect 不自動 follow, 每 hop 重 validate
 *   5. 5MB body cap pre-parse (parser DoS 防禦)
 *   6. 10s timeout
 *
 * Two separate allowlists:
 *   - SOURCE_HOSTS: IG / 蝦皮 shop URL (商家貼的, 屬於 import session source)
 *   - IMAGE_HOSTS:  IG / 蝦皮 CDN (parser 抓出的 og:image / item image URL)
 */
import { lookup } from 'node:dns/promises';

export class ImportSourceUnavailableError extends Error {
  constructor(message: string, public statusCode = 400) {
    super(message);
    this.name = 'ImportSourceUnavailableError';
  }
}

const SOURCE_HOSTS = new Set([
  'www.instagram.com',
  'instagram.com',
  'www.shopee.tw',
  'shopee.tw',
]);

const IMAGE_HOSTS = new Set([
  // IG CDN
  'instagram.com',
  'www.instagram.com',
  'scontent.cdninstagram.com',
  'scontent-tpe1-1.cdninstagram.com',
  'scontent-iad3-1.cdninstagram.com',
  // 蝦皮 CDN (台灣)
  'cf.shopee.tw',
  'down-tw.img.susercontent.com',
  'down.img.susercontent.com',
]);

const DEFAULT_FETCH_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024; // 5MB

export type AllowlistKind = 'source' | 'image';

/**
 * 拆 URL 並驗 hostname 在對應 allowlist
 * @returns 已驗的 URL object, 可拿來 fetch
 * @throws ImportSourceUnavailableError 如不通過
 */
export function assertSafeUrl(input: string, kind: AllowlistKind): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new ImportSourceUnavailableError('URL 格式無效');
  }
  if (url.protocol !== 'https:') {
    throw new ImportSourceUnavailableError('只接受 https URL');
  }
  const allow = kind === 'source' ? SOURCE_HOSTS : IMAGE_HOSTS;
  if (!allow.has(url.hostname)) {
    throw new ImportSourceUnavailableError(
      kind === 'source'
        ? `URL 不在支援的 source 範圍 (僅 IG / 蝦皮 shop)`
        : `Image URL 不在支援的 CDN 範圍`,
    );
  }
  return url;
}

/**
 * 拒 private/loopback/link-local IP (DNS rebinding 防禦, Security B1)
 * 用 IPv4/IPv6 規則 reject 內網位址
 */
export async function assertNotPrivateHost(hostname: string): Promise<void> {
  // 直接拒 hostname=localhost/127.x/etc 字面值 (DNS lookup 之前)
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) {
    throw new ImportSourceUnavailableError('Internal hostname 拒絕');
  }

  let addrs: Array<{ address: string; family: number }>;
  try {
    addrs = await lookup(hostname, { all: true });
  } catch {
    throw new ImportSourceUnavailableError(`無法解析 hostname: ${hostname}`);
  }
  for (const a of addrs) {
    if (a.family === 4 && isPrivateIPv4(a.address)) {
      throw new ImportSourceUnavailableError(`hostname 解析到內網 IPv4 (${a.address})`);
    }
    if (a.family === 6 && isPrivateIPv6(a.address)) {
      throw new ImportSourceUnavailableError(`hostname 解析到內網 IPv6 (${a.address})`);
    }
  }
}

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true; // 拒不解析的 IP
  const [a, b] = parts;
  // 10.0.0.0/8
  if (a === 10) return true;
  // 172.16.0.0/12
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16
  if (a === 192 && b === 168) return true;
  // 127.0.0.0/8 loopback
  if (a === 127) return true;
  // 169.254.0.0/16 link-local (含 AWS/GCP IMDS 169.254.169.254)
  if (a === 169 && b === 254) return true;
  // 0.0.0.0/8
  if (a === 0) return true;
  // CGNAT 100.64.0.0/10
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::') return true; // loopback / unspecified
  if (lower.startsWith('::ffff:')) {
    // IPv4-mapped, recurse
    const v4 = lower.slice('::ffff:'.length);
    return isPrivateIPv4(v4);
  }
  if (lower.startsWith('fe80:')) return true; // link-local
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique local
  return false;
}

/**
 * Safe fetch with full SSRF + size + timeout guard
 *   - hostname allowlist
 *   - DNS resolve check (no private IP)
 *   - redirect: 'manual' 每 hop 重驗
 *   - 5MB body cap
 *   - 10s timeout
 *
 * 適合: 抓 shop page HTML, 抓 image binary
 *
 * 注: 大 binary download (5-20 件圖) 用 image-downloader.ts 走 streaming
 *     此 helper 適合一次性 small fetch (HTML page)
 */
export async function safeFetch(
  input: string,
  opts: {
    kind: AllowlistKind;
    method?: 'GET' | 'HEAD';
    timeoutMs?: number;
    maxBytes?: number;
    extraHeaders?: Record<string, string>;
    /** 最多 follow 幾次 redirect (每次都會重 validate). default 3 */
    maxRedirects?: number;
  },
): Promise<{ url: URL; body: Uint8Array; contentType: string | null; status: number }> {
  const maxRedirects = opts.maxRedirects ?? 3;
  let currentUrl = assertSafeUrl(input, opts.kind);
  await assertNotPrivateHost(currentUrl.hostname);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS);

  try {
    for (let hop = 0; hop <= maxRedirects; hop++) {
      const res = await fetch(currentUrl, {
        method: opts.method ?? 'GET',
        headers: {
          // 模擬真實 browser, 增加 IG/蝦皮 不擋我們的機率
          'user-agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
          'accept-language': 'zh-TW,zh;q=0.9',
          ...opts.extraHeaders,
        },
        redirect: 'manual',
        signal: ctrl.signal,
      });

      // Redirect → 重 validate Location
      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const loc = res.headers.get('location');
        if (!loc) {
          throw new ImportSourceUnavailableError(`${res.status} 但缺 Location header`);
        }
        const nextUrl = new URL(loc, currentUrl); // 支援 relative
        currentUrl = assertSafeUrl(nextUrl.toString(), opts.kind);
        await assertNotPrivateHost(currentUrl.hostname);
        if (hop === maxRedirects) {
          throw new ImportSourceUnavailableError(`重導太多次 (>${maxRedirects})`);
        }
        continue;
      }

      if (!res.ok) {
        throw new ImportSourceUnavailableError(`HTTP ${res.status}`, res.status);
      }

      // 讀 body, 拒過大
      const maxBytes = opts.maxBytes ?? MAX_RESPONSE_BYTES;
      const reader = res.body?.getReader();
      if (!reader) {
        throw new ImportSourceUnavailableError('回應沒有 body');
      }
      const chunks: Uint8Array[] = [];
      let total = 0;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) {
          total += value.length;
          if (total > maxBytes) {
            await reader.cancel();
            throw new ImportSourceUnavailableError(
              `Body 超過 ${(maxBytes / 1024 / 1024).toFixed(0)}MB cap`,
            );
          }
          chunks.push(value);
        }
      }
      const body = new Uint8Array(total);
      let offset = 0;
      for (const c of chunks) {
        body.set(c, offset);
        offset += c.length;
      }
      return {
        url: currentUrl,
        body,
        contentType: res.headers.get('content-type'),
        status: res.status,
      };
    }
    throw new ImportSourceUnavailableError('redirect loop 沒 break');
  } catch (err) {
    if (err instanceof ImportSourceUnavailableError) throw err;
    if (err instanceof Error && err.name === 'AbortError') {
      throw new ImportSourceUnavailableError('連線 timeout');
    }
    throw new ImportSourceUnavailableError(
      err instanceof Error ? err.message : '未知 fetch 錯誤',
    );
  } finally {
    clearTimeout(timer);
  }
}
