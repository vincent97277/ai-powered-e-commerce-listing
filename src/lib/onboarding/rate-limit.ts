/**
 * Onboarding IP rate limit (V1.7 D1) — DB-backed, 不引 Redis.
 *
 * 1 success per IP per 24h. 失敗的 attempt (rate_limited / invalid_slug / reserved_slug /
 * honeypot / duplicate_slug) 也記錄, 但不算進 limit (避免 attacker 故意打壞掉的請求把自己鎖住,
 * 反而做不到 DOS legit user).
 *
 * Why per-IP-per-24h, not stricter:
 *   - 一個人開 1 家店 / 24h 是合理上限 (V1 demo)
 *   - 5 minutes 太嚴, 開錯打回去就要等
 *   - 強碰 NAT / school / cafe 共用 IP 會擋好人 — 但 V1.7 還沒上 captcha, 折衷
 *
 * checkRateLimit 走 dbAdmin (BYPASSRLS) — onboarding 還沒 tenant context, 也沒 user.
 * 對應 ESLint allowlist: src/lib/onboarding/** (admin observability 同類, 跨 tenant query).
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
 * 檢查指定 IP 在過去 RATE_LIMIT_HOURS 內是否已有 success.
 * 注意只算 success — 失敗的 attempt 不消耗 quota (見上面 docstring).
 */
export async function checkRateLimit(ip: string): Promise<RateLimitDecision> {
  if (!ip) {
    // 沒 IP 不該發生 (middleware/headers 都會給) — 防呆: 直接擋, log 'rate_limited'.
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
 * 寫入 onboarding_attempts. 任何分支都該呼叫 (success / 各種拒絕),
 * 給 admin 觀察 abuse pattern.
 *
 * 不 throw 上去 — log 寫不進去也不能擋掉主流程. console.error fallback.
 */
export async function logAttempt(opts: {
  ip: string;
  slug: string;
  result: AttemptResult;
}): Promise<void> {
  try {
    await dbAdmin.insert(onboardingAttempts).values({
      ipAddress: opts.ip || 'unknown',
      slugAttempted: opts.slug.slice(0, 64), // truncate 保守, abuse 也別佔太多空間
      result: opts.result,
    });
  } catch (err) {
    console.error('[onboarding] logAttempt failed', err);
  }
}

/**
 * 從 Next.js headers Map 取真實 IP. x-forwarded-for first hop > x-real-ip > 'unknown'.
 * (與 src/app/admin/login/actions.ts 同 pattern)
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
