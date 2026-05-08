/**
 * PartialState — partial-failure state primitive (V1.6 Track B4)
 *
 * Usage:
 *   <PartialState failedSections={['Sales chart', 'Recent orders']} />
 *
 * When a single widget fails, the page is still functional, but proactively tell
 * the user which sections didn't load. Yellow/amber AlertTriangle (var(--warning)).
 *
 * a11y:
 *   role="status" + aria-live="polite" — non-blocking heads-up
 *   (NOT alert — page is still usable, this is informational not urgent)
 *
 * Server component, no client interaction.
 */
import { AlertTriangle } from 'lucide-react';
import { StateSurface, type StateSurfaceScope } from './StateSurface';

type Props = {
  failedSections: string[];
  scope?: StateSurfaceScope;
};

export function PartialState({ failedSections, scope = 'inline' }: Props) {
  if (failedSections.length === 0) return null;

  return (
    <StateSurface scope={scope}>
      <div
        role="status"
        aria-live="polite"
        className="flex w-full flex-row items-start gap-3"
        style={{
          backgroundColor: 'color-mix(in srgb, var(--warning) 8%, transparent)',
          border: '1px solid color-mix(in srgb, var(--warning) 24%, transparent)',
          borderRadius: 'var(--brand-radius)',
          padding: '12px 16px',
        }}
      >
        <AlertTriangle
          className="h-5 w-5 shrink-0"
          strokeWidth={2.2}
          style={{ color: 'var(--warning)', marginTop: '2px' }}
          aria-hidden="true"
        />
        <div className="flex flex-col gap-1 text-left">
          <p
            className="text-sm font-medium"
            style={{ color: 'var(--brand-text)' }}
          >
            部分資料無法載入
          </p>
          <ul
            className="list-disc pl-5 text-xs"
            style={{ color: 'var(--brand-text)', opacity: 0.7 }}
          >
            {failedSections.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </div>
      </div>
    </StateSurface>
  );
}
