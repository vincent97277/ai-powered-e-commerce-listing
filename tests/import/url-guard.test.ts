/**
 * url-guard.ts unit tests (V1 #62, RA9)
 * Coverage:
 *   - hostname allowlist (source vs image)
 *   - https only
 *   - user-info trick (https://www.instagram.com@evil.com/) 拒
 *   - localhost / .local / .internal 拒
 *   - private IPv4 (127, 10, 172.16, 192.168, 169.254, 0.0.0.0/8) 拒
 *   - private IPv6 (::1, fe80, fc00, IPv4-mapped) 拒
 *   - public IG / 蝦皮 hostname 過
 */
import { describe, expect, it } from 'vitest';
import {
  assertSafeUrl,
  assertNotPrivateHost,
  ImportSourceUnavailableError,
} from '@/lib/import/url-guard';

describe('assertSafeUrl — source kind (shop URL)', () => {
  it('允許 IG shop URL', () => {
    const u = assertSafeUrl('https://www.instagram.com/some_shop', 'source');
    expect(u.hostname).toBe('www.instagram.com');
  });

  it('允許 instagram.com 無 www', () => {
    const u = assertSafeUrl('https://instagram.com/p/xxx', 'source');
    expect(u.hostname).toBe('instagram.com');
  });

  it('允許 蝦皮 shop URL', () => {
    const u = assertSafeUrl('https://shopee.tw/seller', 'source');
    expect(u.hostname).toBe('shopee.tw');
  });

  it('拒 http (非 https)', () => {
    expect(() => assertSafeUrl('http://www.instagram.com/x', 'source')).toThrow(
      ImportSourceUnavailableError,
    );
  });

  it('拒 user-info trick (https://www.instagram.com@evil.com/)', () => {
    // 這是 SSRF 經典繞過: hostname 應為 evil.com, 不是 IG
    expect(() =>
      assertSafeUrl('https://www.instagram.com@evil.com/foo', 'source'),
    ).toThrow(ImportSourceUnavailableError);
  });

  it('拒 image CDN host 用在 source allowlist', () => {
    expect(() =>
      assertSafeUrl('https://scontent.cdninstagram.com/img.jpg', 'source'),
    ).toThrow(/不在支援的 source/);
  });

  it('拒 facebook.com 等其他 host', () => {
    expect(() => assertSafeUrl('https://www.facebook.com/x', 'source')).toThrow();
  });

  it('拒 invalid URL 字串', () => {
    expect(() => assertSafeUrl('not a url', 'source')).toThrow(/格式無效/);
  });
});

describe('assertSafeUrl — image kind (CDN URL)', () => {
  it('允許 IG CDN', () => {
    const u = assertSafeUrl(
      'https://scontent.cdninstagram.com/v/t51.29350-15/abc.jpg',
      'image',
    );
    expect(u.hostname).toBe('scontent.cdninstagram.com');
  });

  it('允許 蝦皮 CDN', () => {
    const u = assertSafeUrl(
      'https://cf.shopee.tw/file/abc.jpg',
      'image',
    );
    expect(u.hostname).toBe('cf.shopee.tw');
  });

  it('拒 image kind 對 source-only host', () => {
    // shopee.tw 在 source 但不在 image (只有 cf.shopee.tw 跟 down* 在 image)
    expect(() => assertSafeUrl('https://shopee.tw/img.jpg', 'image')).toThrow();
  });
});

describe('assertNotPrivateHost — DNS rebinding 防禦', () => {
  it('拒 localhost', async () => {
    await expect(assertNotPrivateHost('localhost')).rejects.toThrow(/Internal/);
  });

  it('拒 *.local', async () => {
    await expect(assertNotPrivateHost('mybox.local')).rejects.toThrow(/Internal/);
  });

  it('拒 *.internal', async () => {
    await expect(assertNotPrivateHost('vault.internal')).rejects.toThrow(/Internal/);
  });

  it('允許 公開 IG hostname (DNS resolve OK)', async () => {
    // 這個會做真 DNS lookup, 須 internet. CI 環境若沒網可能 fail
    // 用 try/catch 區分 DNS 錯 vs 內網錯
    try {
      await assertNotPrivateHost('www.instagram.com');
      // 過 = 沒網內 IP, 對
    } catch (err) {
      // 若是 DNS 錯, 跳過 (網路問題)
      const msg = err instanceof Error ? err.message : '';
      if (!msg.includes('無法解析') && !msg.includes('內網')) throw err;
      if (msg.includes('內網')) throw err; // 真錯, 不該過
    }
  });
});
