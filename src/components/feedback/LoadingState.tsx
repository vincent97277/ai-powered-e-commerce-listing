/**
 * LoadingState — loading state primitive (V1.6 Track B4)
 *
 * Variants:
 *   - skeleton  N rows of pulsating bars (default 3) — for tables/lists
 *   - spinner   lucide Loader2 with animate-spin — for sections / pages
 *   - inline    small inline spinner with optional label — for buttons / chips
 *
 * Brand-aware skeleton: uses `--brand-primary` at 8% mix (not shadcn `bg-muted`).
 * a11y: role="status" + aria-busy="true" + sr-only "Loading..." text.
 *
 * Server component, no client interaction.
 */
import { Loader2 } from 'lucide-react';
import { StateSurface, type StateSurfaceScope } from './StateSurface';

type Props = {
  variant?: 'skeleton' | 'spinner' | 'inline';
  rows?: number;
  label?: string;
  scope?: StateSurfaceScope;
};

export function LoadingState({
  variant = 'skeleton',
  rows = 3,
  label,
  scope = 'section',
}: Props) {
  if (variant === 'inline') {
    return (
      <span
        role="status"
        aria-busy="true"
        className="inline-flex items-center gap-2 text-sm"
        style={{ color: 'var(--brand-text)' }}
      >
        <Loader2
          className="h-4 w-4 animate-spin"
          strokeWidth={2}
          style={{ color: 'var(--brand-primary)' }}
          aria-hidden="true"
        />
        {label && <span>{label}</span>}
        <span className="sr-only">載入中...</span>
      </span>
    );
  }

  if (variant === 'spinner') {
    return (
      <StateSurface scope={scope}>
        <div
          role="status"
          aria-busy="true"
          className="flex flex-col items-center gap-3"
        >
          <Loader2
            width={48}
            height={48}
            strokeWidth={1.8}
            className="animate-spin"
            style={{ color: 'var(--brand-primary)' }}
            aria-hidden="true"
          />
          {label && (
            <p className="text-sm" style={{ color: 'var(--brand-text)', opacity: 0.7 }}>
              {label}
            </p>
          )}
          <span className="sr-only">載入中...</span>
        </div>
      </StateSurface>
    );
  }

  // skeleton variant
  const safeRows = Math.max(1, Math.floor(rows));
  return (
    <StateSurface scope={scope}>
      <div
        role="status"
        aria-busy="true"
        aria-label="載入中"
        className="flex w-full flex-col gap-3"
      >
        {Array.from({ length: safeRows }, (_, i) => (
          <div
            key={i}
            className="animate-pulse"
            style={{
              height: '1rem',
              width: i % 2 === 0 ? '100%' : '70%',
              backgroundColor: 'color-mix(in srgb, var(--brand-primary) 8%, transparent)',
              borderRadius: 'var(--brand-radius)',
            }}
          />
        ))}
        <span className="sr-only">載入中...</span>
      </div>
    </StateSurface>
  );
}
