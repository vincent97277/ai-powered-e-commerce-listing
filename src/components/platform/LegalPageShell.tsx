/**
 * LegalPageShell — 法遵頁共用 layout (V1 #60)
 * 統一 header + footer + Linear-tone typography
 *
 * V1.9 T2: rotated zinc square → <Wordmark> in header,
 *           hairline border switched to semantic --border-hairline.
 */
import Link from 'next/link';
import type { ReactNode } from 'react';
import { PlatformShell } from './PlatformShell';
import { Wordmark } from './Wordmark';

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
        <Link href="/" className="inline-flex hover:opacity-80">
          <Wordmark size="md" />
        </Link>
        <header
          className="mt-6 border-b pb-6"
          style={{ borderColor: 'var(--border-hairline)' }}
        >
          <h1
            className="text-3xl font-semibold tracking-tight"
            style={{ color: 'var(--brand-text)' }}
          >
            {title}
          </h1>
          {subtitle && (
            <p className="mt-2 text-sm" style={{ color: 'var(--ink-muted)' }}>
              {subtitle}
            </p>
          )}
        </header>
        <article
          className="prose prose-zinc mt-8 max-w-none text-sm leading-relaxed"
          style={{ color: 'var(--brand-text)' }}
        >
          {children}
        </article>
        <footer
          className="mt-16 border-t pt-6"
          style={{ borderColor: 'var(--border-hairline)' }}
        >
          <div
            className="flex flex-wrap items-center justify-between gap-4 text-xs"
            style={{ color: 'var(--ink-muted)' }}
          >
            <div className="flex items-center gap-4">
              <Link href="/about" className="hover:underline">
                關於
              </Link>
              <Link href="/privacy" className="hover:underline">
                隱私權
              </Link>
              <Link href="/terms" className="hover:underline">
                服務條款
              </Link>
              <Link href="/" className="hover:underline">
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
