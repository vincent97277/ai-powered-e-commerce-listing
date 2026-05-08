/**
 * /admin/login — platform admin password login (V1 #45)
 * Linear-tone: high B/W contrast + thin borders + Inter
 */
import { LoginForm } from './LoginForm';

export const dynamic = 'force-dynamic';

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const next = params.next ?? '/admin';

  return (
    <main className="platform flex min-h-screen items-center justify-center bg-zinc-50 px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rotate-45 bg-zinc-900" />
          <span className="font-semibold tracking-tight text-zinc-900">Catalogify</span>
          <span className="font-mono text-xs text-zinc-500">/ admin</span>
        </div>

        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">平台管理</h1>
        <p className="mt-1 text-sm text-zinc-500">輸入管理密碼登入</p>

        <LoginForm next={next} />

        <p className="mt-8 text-xs text-zinc-400">
          商家請從{' '}
          <a className="underline hover:text-zinc-600" href="/merchant">
            /merchant
          </a>{' '}
          登入
        </p>
      </div>
    </main>
  );
}
