/**
 * StateSurface — shared shell for all feedback primitives (V1.6 Track B4)
 *
 * Scope-aware container. 4 scopes:
 *   - page    full padding (py-16 px-4), centered vertically
 *   - section medium padding (py-10 px-6), within a card
 *   - table   minimum padding (py-8), inside table cell or below
 *   - inline  tight (py-4), no centering — for chips/buttons inline
 *
 * Tone: 'brand' | 'neutral' (default 'neutral'). 'brand' tints surface with --brand-primary;
 * 'neutral' stays transparent. Admin pages default neutral; merchant pages opt in to brand.
 *
 * Server component, 沒 client 互動.
 */
import type { ReactNode } from 'react';

export type StateSurfaceScope = 'page' | 'section' | 'table' | 'inline';
export type StateSurfaceTone = 'brand' | 'neutral';

type Props = {
  scope?: StateSurfaceScope;
  tone?: StateSurfaceTone;
  className?: string;
  children: ReactNode;
};

const SCOPE_CLASS: Record<StateSurfaceScope, string> = {
  page: 'flex flex-col items-center justify-center text-center py-16 px-4',
  section: 'flex flex-col items-center text-center py-10 px-6',
  table: 'flex flex-col items-center text-center py-8 px-4',
  inline: 'flex flex-row items-center gap-3 py-4 px-2',
};

export function StateSurface({
  scope = 'section',
  tone = 'neutral',
  className,
  children,
}: Props) {
  const classes = [SCOPE_CLASS[scope], className].filter(Boolean).join(' ');

  // tone='brand' tints with --brand-primary; tone='neutral' stays transparent.
  const style =
    tone === 'brand'
      ? {
          backgroundColor: 'color-mix(in srgb, var(--brand-primary) 4%, transparent)',
          border: '1px solid color-mix(in srgb, var(--brand-primary) 12%, transparent)',
          borderRadius: 'var(--brand-radius)',
          color: 'var(--brand-text)',
        }
      : {
          color: 'var(--brand-text)',
        };

  return (
    <div data-scope={scope} data-tone={tone} className={classes} style={style}>
      {children}
    </div>
  );
}
