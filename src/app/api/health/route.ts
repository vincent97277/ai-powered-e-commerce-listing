/**
 * Health check route — V2.2.1.
 *
 * Returns 200 + structured JSON when:
 * - env vars validate via getEnv()
 * - DATABASE_URL_USER pool can SELECT 1
 * - DATABASE_URL_ADMIN pool can SELECT 1
 *
 * Returns 503 + reason when any check fails. Never returns 200 with degraded
 * components — keep this binary so platform health probes can act on it.
 *
 * NOT exposed for monitoring detail (no schema info, no version) — just
 * "is this instance ready for traffic." Anyone querying this gets a small
 * fingerprint of which DB pools are wired, which is acceptable.
 */
import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { getEnv } from '@/lib/env';
import { dbAdmin, dbUser } from '@/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    getEnv();
  } catch (err) {
    return NextResponse.json(
      { ok: false, reason: 'env_invalid', message: err instanceof Error ? err.message : 'unknown' },
      { status: 503 },
    );
  }

  try {
    await dbUser.execute(sql`SELECT 1`);
  } catch {
    return NextResponse.json({ ok: false, reason: 'db_user_unreachable' }, { status: 503 });
  }

  try {
    await dbAdmin.execute(sql`SELECT 1`);
  } catch {
    return NextResponse.json({ ok: false, reason: 'db_admin_unreachable' }, { status: 503 });
  }

  return NextResponse.json({ ok: true });
}
