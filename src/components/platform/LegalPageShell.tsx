/**
 * LegalPageShell — 法遵頁共用 layout (V1 #60)
 * 統一 header + footer + Linear-tone typography
 */
import Link from 'next/link';
import type { ReactNode } from 'react';
import { PlatformShell } from './PlatformShell';

export function LegalPageShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <PlatformShell className="min-h-screen">
      <div className="mx-auto max-w-3xl px-6 py-12 md:py-16">
        <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-zinc-500">
          <span className="inline-block h-2.5 w-2.5 rotate-45 bg-zinc-900" />
          <Link href="/" className="hover:text-zinc-900 hover:underline">
            Catalogify
          </Link>
        </div>
        <header className="mt-6 border-b border-zinc-200 pb-6">
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-zinc-500">{subtitle}</p>}
        </header>
        <article className="prose prose-zinc mt-8 max-w-none text-sm leading-relaxed text-zinc-700">
          {children}
        </article>
        <footer className="mt-16 border-t border-zinc-200 pt-6">
          <div className="flex flex-wrap items-center justify-between gap-4 text-xs text-zinc-500">
            <div className="flex items-center gap-4">
              <Link href="/about" className="hover:text-zinc-900 hover:underline">
                關於
              </Link>
              <Link href="/privacy" className="hover:text-zinc-900 hover:underline">
                隱私權
              </Link>
              <Link href="/terms" className="hover:text-zinc-900 hover:underline">
                服務條款
              </Link>
              <Link href="/" className="hover:text-zinc-900 hover:underline">
                回首頁
              </Link>
            </div>
            <span className="font-mono">Catalogify · 2026</span>
          </div>
        </footer>
      </div>
    </PlatformShell>
  );
}
