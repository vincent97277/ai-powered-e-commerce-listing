/**
 * ErrorState — error state primitive (V1.6 Track B4)
 *
 * 用法 (server component):
 *   <ErrorState error="載不到資料" retryHref="/admin" />
 *   <ErrorState error={err} supportHref="mailto:support@catalogify.com" />
 *
 * Server component — uses retryHref (a Link) instead of retry callback to stay server-only.
 * If a parent needs an onClick retry, wrap with their own client component.
 *
 * Title: 「出了點狀況」 (friendly TW phrasing).
 * Body: error message only — stack trace is NOT shown to keep UX civilian-grade.
 * a11y: role="alert" — assistive tech announces immediately.
 */
import Link from 'next/link';
import { AlertCircle } from 'lucide-react';
import { StateSurface, type StateSurfaceScope } from './StateSurface';

type Props = {
  error: Error | string;
  retryHref?: string;
  supportHref?: string;
  scope?: StateSurfaceScope;
};

function extractMessage(error: Error | string): string {
  if (typeof error === 'string') return error;
  return error.message || '未知錯誤';
}

export function ErrorState({ error, retryHref, supportHref, scope = 'section' }: Props) {
  const message = extractMessage(error);

  return (
    <StateSurface scope={scope}>
      <div role="alert" className="flex flex-col items-center gap-3">
        <AlertCircle
          width={48}
          height={48}
          strokeWidth={1.8}
          style={{ color: 'var(--error)' }}
          aria-hidden="true"
        />
        <h3
          className="t-h3 text-lg font-semibold"
          style={{
            color: 'var(--brand-text)',
            fontFamily: 'var(--brand-font-heading)',
          }}
        >
          出了點狀況
        </h3>
        <p
          className="text-sm max-w-md"
          style={{
            color: 'var(--brand-text)',
            opacity: 0.7,
          }}
        >
          {message}
        </p>
        {(retryHref || supportHref) && (
          <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
            {retryHref && (
              <Link
                href={retryHref}
                className="hover-lift inline-flex items-center justify-center rounded px-4 py-2 text-sm font-medium"
                style={{
                  backgroundColor: 'var(--brand-primary)',
                  color: 'var(--brand-bg)',
                  borderRadius: 'var(--brand-radius)',
                  minHeight: '44px',
                }}
              >
                重試
              </Link>
            )}
            {supportHref && (
              <Link
                href={supportHref}
                className="hover-lift inline-flex items-center justify-center rounded px-4 py-2 text-sm font-medium"
                style={{
                  backgroundColor: 'transparent',
                  color: 'var(--brand-text)',
                  border: '1px solid color-mix(in srgb, var(--brand-text) 24%, transparent)',
                  borderRadius: 'var(--brand-radius)',
                  minHeight: '44px',
                }}
              >
                聯絡支援
              </Link>
            )}
          </div>
        )}
      </div>
    </StateSurface>
  );
}
