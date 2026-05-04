/**
 * Env validation tests — V2.2.1.
 *
 * Uses vi.stubEnv (vitest 1.5+) for safe per-test env mutation.
 * vi.unstubAllEnvs in afterEach restores process.env without polluting
 * subsequent test files.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { getEnv, _resetEnvCacheForTesting } from '@/lib/env';

afterEach(() => {
  vi.unstubAllEnvs();
  _resetEnvCacheForTesting();
});

describe('env validation', () => {
  it('parses valid env successfully', () => {
    _resetEnvCacheForTesting();
    const env = getEnv();
    expect(env.DATABASE_URL_USER).toBeDefined();
    expect(env.DATABASE_URL_ADMIN).toBeDefined();
    expect(env.ADMIN_SESSION_SECRET.length).toBeGreaterThanOrEqual(32);
    expect(env.MERCHANT_SESSION_SECRET.length).toBeGreaterThanOrEqual(32);
  });

  it('throws when ADMIN_SESSION_SECRET is too short', () => {
    vi.stubEnv('ADMIN_SESSION_SECRET', 'tooshort');
    _resetEnvCacheForTesting();
    expect(() => getEnv()).toThrow(/ADMIN_SESSION_SECRET/);
  });

  it('throws when MERCHANT_SESSION_SECRET is too short', () => {
    vi.stubEnv('MERCHANT_SESSION_SECRET', 'short');
    _resetEnvCacheForTesting();
    expect(() => getEnv()).toThrow(/MERCHANT_SESSION_SECRET/);
  });

  it('throws when DATABASE_URL_USER is missing', () => {
    vi.stubEnv('DATABASE_URL_USER', '');
    _resetEnvCacheForTesting();
    expect(() => getEnv()).toThrow(/DATABASE_URL_USER/);
  });

  it('throws on bad URL format', () => {
    vi.stubEnv('DATABASE_URL_USER', 'not a url');
    _resetEnvCacheForTesting();
    expect(() => getEnv()).toThrow(/DATABASE_URL_USER/);
  });

  it('production: rejects DATABASE_URL_USER without sslmode=require', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DATABASE_URL', 'postgresql://owner:pass@host:5432/db?sslmode=require');
    vi.stubEnv('DATABASE_URL_USER', 'postgresql://user:pass@host:5432/db');
    vi.stubEnv('DATABASE_URL_ADMIN', 'postgresql://admin:pass@host:5432/db?sslmode=require');
    vi.stubEnv('OPENAI_API_KEY', 'sk-' + 'a'.repeat(40));
    vi.stubEnv('INNGEST_EVENT_KEY', 'evtkey1234');
    vi.stubEnv('INNGEST_SIGNING_KEY', 'signkey1234');
    _resetEnvCacheForTesting();
    expect(() => getEnv()).toThrow(/sslmode=require/);
  });

  it('production: accepts DATABASE_URL_USER with sslmode=require', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DATABASE_URL', 'postgresql://owner:pass@host:5432/db?sslmode=require');
    vi.stubEnv('DATABASE_URL_USER', 'postgresql://user:pass@host:5432/db?sslmode=require');
    vi.stubEnv('DATABASE_URL_ADMIN', 'postgresql://admin:pass@host:5432/db?sslmode=require');
    vi.stubEnv('OPENAI_API_KEY', 'sk-' + 'a'.repeat(40));
    vi.stubEnv('INNGEST_EVENT_KEY', 'evtkey1234');
    vi.stubEnv('INNGEST_SIGNING_KEY', 'signkey1234');
    _resetEnvCacheForTesting();
    expect(() => getEnv()).not.toThrow();
  });

  it('production: rejects sslmode=disable', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DATABASE_URL', 'postgresql://owner:pass@host:5432/db?sslmode=require');
    vi.stubEnv('DATABASE_URL_USER', 'postgresql://user:pass@host:5432/db?sslmode=disable');
    vi.stubEnv('DATABASE_URL_ADMIN', 'postgresql://admin:pass@host:5432/db?sslmode=require');
    vi.stubEnv('OPENAI_API_KEY', 'sk-' + 'a'.repeat(40));
    vi.stubEnv('INNGEST_EVENT_KEY', 'evtkey1234');
    vi.stubEnv('INNGEST_SIGNING_KEY', 'signkey1234');
    _resetEnvCacheForTesting();
    expect(() => getEnv()).toThrow(/sslmode=require/);
  });

  it('production: accepts sslmode=verify-full', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DATABASE_URL', 'postgresql://owner:pass@host:5432/db?sslmode=verify-full');
    vi.stubEnv('DATABASE_URL_USER', 'postgresql://user:pass@host:5432/db?sslmode=verify-full');
    vi.stubEnv('DATABASE_URL_ADMIN', 'postgresql://admin:pass@host:5432/db?sslmode=verify-full');
    vi.stubEnv('OPENAI_API_KEY', 'sk-' + 'a'.repeat(40));
    vi.stubEnv('INNGEST_EVENT_KEY', 'evtkey1234');
    vi.stubEnv('INNGEST_SIGNING_KEY', 'signkey1234');
    _resetEnvCacheForTesting();
    expect(() => getEnv()).not.toThrow();
  });

  it('production: requires OPENAI_API_KEY', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DATABASE_URL_USER', 'postgresql://user:pass@host:5432/db?sslmode=require');
    vi.stubEnv('DATABASE_URL_ADMIN', 'postgresql://admin:pass@host:5432/db?sslmode=require');
    vi.stubEnv('OPENAI_API_KEY', '');
    vi.stubEnv('INNGEST_EVENT_KEY', 'evtkey1234');
    vi.stubEnv('INNGEST_SIGNING_KEY', 'signkey1234');
    _resetEnvCacheForTesting();
    expect(() => getEnv()).toThrow(/OPENAI_API_KEY/);
  });

  it('production: requires INNGEST keys', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('DATABASE_URL_USER', 'postgresql://user:pass@host:5432/db?sslmode=require');
    vi.stubEnv('DATABASE_URL_ADMIN', 'postgresql://admin:pass@host:5432/db?sslmode=require');
    vi.stubEnv('OPENAI_API_KEY', 'sk-' + 'a'.repeat(40));
    vi.stubEnv('INNGEST_EVENT_KEY', '');
    vi.stubEnv('INNGEST_SIGNING_KEY', '');
    _resetEnvCacheForTesting();
    expect(() => getEnv()).toThrow(/INNGEST/);
  });
});
