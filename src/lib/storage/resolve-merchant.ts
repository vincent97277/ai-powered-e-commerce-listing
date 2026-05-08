/**
 * V2 task 105: cookie → merchant resolution (per-merchant auth)
 *
 * Behavior:
 *   1. Read merchant-session cookie
 *   2. validateMerchantSession() — HMAC + DB liveness + revoked + expires all checked
 *   3. Fetch full row from merchants table (suspended/approved also block — account state wrong forces re-login)
 *   4. Any failure → redirect('/merchant/login?next=/merchant')
 *
 * Why redirect, not throw:
 *   - All callers run in server component / server action / route handler context, where redirect() is allowed
 *   - Centralized 401 handling avoids every caller rewriting try/catch
 *   - Middleware (Edge runtime) already does a first-pass HMAC check; this layer is layout-level "E11 defense-in-depth",
 *     adding DB row liveness + suspended/approved state (middleware has no DB access).
 *
 * V1.7 D1's hardcoded 'akami'/'afen' slug fallback + DEMO_MERCHANTS dict was removed —
 * V2 per-merchant auth no longer needs the demo-merchants slug-cookie path. demo seed
 * uses real email/password login (scripts/seed-merchants.ts).
 */
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { dbAdmin } from '@/db/admin-only';
import { merchants } from '@/db/schema';
import { MERCHANT_SESSION_COOKIE, validateMerchantSession } from '@/lib/merchant-session';

export type ResolvedMerchant = {
  tenantId: string;
  slug: string;
  name: string;
  brandVoice: string;
};

/**
 * Resolve full info of the current logged-in merchant. Any auth/state issue → redirect to /merchant/login.
 * Caller doesn't need try/catch — redirect() short-circuits via throw inside Next.js, RSC engine handles it automatically.
 */
export async function resolveMerchantFromCookie(): Promise<ResolvedMerchant> {
  const c = await cookies();
  const cookieValue = c.get(MERCHANT_SESSION_COOKIE)?.value;

  const session = await validateMerchantSession(cookieValue);
  if (!session) {
    redirect('/merchant/login?next=/merchant');
  }

  const [m] = await dbAdmin
    .select({
      id: merchants.id,
      slug: merchants.slug,
      name: merchants.name,
      brandVoice: merchants.brandVoice,
      suspendedAt: merchants.suspendedAt,
      approvedAt: merchants.approvedAt,
    })
    .from(merchants)
    .where(eq(merchants.id, session.merchantId))
    .limit(1);

  // Merchant deleted / account state wrong → force re-login.
  // Note: suspended_at != null means "suspended", but merchant can still view their own backend
  // (in-flight orders must be handled), so this layer does NOT block suspended — layout banner
  // shows the warning, individual write actions call assertNotSuspended.
  // What actually blocks: row missing (admin deleted) + still pending approval (approved_at IS NULL).
  if (!m) {
    redirect('/merchant/login?next=/merchant');
  }
  if (m.approvedAt === null) {
    // Not yet approved by admin — cannot enter dashboard. /merchant/login server action blocks at login,
    // but this is a backstop in case the merchant gets unapproved during an active session.
    redirect('/merchant/login?next=/merchant');
  }

  return {
    tenantId: m.id,
    slug: m.slug,
    name: m.name,
    brandVoice: m.brandVoice ?? '',
  };
}
