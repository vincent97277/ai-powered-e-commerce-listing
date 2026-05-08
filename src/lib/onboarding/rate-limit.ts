/**
 * Onboarding IP rate limit (V1.7 D1) — DB-backed, no Redis dependency.
 *
 * 1 success per IP per 24h. Failed attempts (rate_limited / invalid_slug / reserved_slug /
 * honeypot / duplicate_slug) are also logged, but don't count against the limit (so an
 * attacker can't deliberately spam broken requests to lock themselves in and DOS legit
 * users instead).
 *
 * Why per-IP-per-24h, not stricter:
 *   - 1 store / 24h per person is a reasonable upper bound (V1 demo)
 *   - 5 minutes is too strict — typo and you have to wait
 *   - NAT / school / cafe shared IPs will block good users — but V1.7 has no captcha yet, this is the compromise
 *
 * checkRateLimit goes through dbAdmin (BYPASSRLS) — onboarding has no tenant context yet, no user.
 * Matches ESLint allowlist: src/lib/onboarding/** (same class as admin observability, cross-tenant query).
 */
import { sql } from 'drizzle-orm';
import { dbAdmin } from '@/db/admin-only';
import { onboardingAttempts } from '@/db/schema';

const RATE_LIMIT_HOURS = 24;
const MAX_SUCCESSES = 1;

export type AttemptResult =
  | 'success'
  | 'rate_limited'
  | 'invalid_slug'
  | 'reserved_slug'
  | 'honeypot'
  | 'duplicate_slug';

export type RateLimitDecision = { allowed: true } | { allowed: false; reason: string };

/**
 * Check whether the given IP has had a success within the past RATE_LIMIT_HOURS.
 * Note: only counts successes — failed attempts don't consume quota (see docstring above).
 */
export async function checkRateLimit(ip: string): Promise<RateLimitDecision> {
  if (!ip) {
    // No IP shouldn't happen (middleware/headers always provide one) — guard: block immediately, log 'rate_limited'.
    return { allowed: false, reason: '無法辨識來源 IP, 請稍後再試' };
  }
  const result = await dbAdmin.execute<{ n: string | number }>(sql`
    SELECT COUNT(*)::int AS n
      FROM onboarding_attempts
     WHERE ip_address = ${ip}
       AND result = 'success'
       AND created_at > now() - (${RATE_LIMIT_HOURS} || ' hours')::interval
  `);
  const row = result.rows[0];
  const n = Number(row?.n ?? 0);
  if (n >= MAX_SUCCESSES) {
    return { allowed: false, reason: '24 小時內已註冊過商家, 請稍後再試' };
  }
  return { allowed: true };
}

/**
 * Write to onboarding_attempts. Every branch should call this (success / various rejections),
 * so admin can observe abuse patterns.
 *
 * Doesn't throw upward — a failed log write must not block the main flow. console.error fallback.
 */
export async function logAttempt(opts: {
  ip: string;
  slug: string;
  result: AttemptResult;
}): Promise<void> {
  try {
    await dbAdmin.insert(onboardingAttempts).values({
      ipAddress: opts.ip || 'unknown',
      slugAttempted: opts.slug.slice(0, 64), // conservative truncate; don't let abuse take too much space
      result: opts.result,
    });
  } catch (err) {
    console.error('[onboarding] logAttempt failed', err);
  }
}

/**
 * Get the real IP from the Next.js headers Map. x-forwarded-for first hop > x-real-ip > 'unknown'.
 * (Same pattern as src/app/admin/login/actions.ts)
 */
export function extractIp(h: Headers): string {
  const xff = h.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  const real = h.get('x-real-ip');
  if (real) return real.trim();
  return 'unknown';
}
