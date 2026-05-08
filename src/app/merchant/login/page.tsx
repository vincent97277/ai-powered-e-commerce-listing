/**
 * /merchant/login — V2 merchant login page (task 104)
 *
 * Mirrors /admin/login structure. Linear-tone (.platform wrapper) — high B/W contrast + thin borders.
 * When a real merchant lands here the brand theme isn't resolved yet (no cookie / no layout); using
 * the platform palette is intentional (brand-neutral, consistent with admin login).
 *
 * `?next=...` is carried by LoginForm via a hidden input to the server action; the server action
 * re-validates internal-only.
 */
import { LoginForm } from './LoginForm';

export const dynamic = 'force-dynamic';

export default async function MerchantLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const rawNext = params.next ?? '/merchant';
  // Internal-only guard (re-checked here — even if someone tampers with the hidden input, the server action still validates)
  const next = rawNext.startsWith('/merchant') ? rawNext : '/merchant';

  return (
    <main className="platform flex min-h-screen items-center justify-center bg-zinc-50 px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rotate-45 bg-zinc-900" />
          <span className="font-semibold tracking-tight text-zinc-900">Catalogify</span>
          <span className="font-mono text-xs text-zinc-500">/ merchant</span>
        </div>

        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">商家登入</h1>
        <p className="mt-1 text-sm text-zinc-500">輸入 email + 密碼登入後台</p>

        <LoginForm next={next} />

        <p className="mt-8 text-xs text-zinc-400">
          還沒有帳號?{' '}
          <a className="underline hover:text-zinc-600" href="/onboarding">
            開新店面
          </a>
        </p>
      </div>
    </main>
  );
}
