/**
 * EmptyState — empty state primitive (V1.6 Track B4)
 *
 * 用法:
 *   <EmptyState
 *     icon={SearchX}
 *     title="找不到符合的商家"
 *     body="目前的篩選條件下沒有任何資料。"
 *     primaryCTA={{ label: '清除篩選', href: '/admin' }}
 *     scope="table"
 *   />
 *
 * Wraps StateSurface + lucide icon at 48px + title + optional body + 1-2 CTA links.
 * `role="status"` on outer (non-urgent informational state).
 *
 * Server component, 沒 client 互動 — CTA 是 <Link href> not onClick.
 */
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { StateSurface, type StateSurfaceScope, type StateSurfaceTone } from './StateSurface';

type CTA = { label: string; href: string };

type Props = {
  icon: LucideIcon;
  title: string;
  body?: string;
  primaryCTA?: CTA;
  secondaryCTA?: CTA;
  scope?: StateSurfaceScope;
  tone?: StateSurfaceTone;
};

export function EmptyState({
  icon: Icon,
  title,
  body,
  primaryCTA,
  secondaryCTA,
  scope = 'section',
  tone = 'neutral',
}: Props) {
  return (
    <StateSurface scope={scope} tone={tone}>
      <div role="status" className="flex flex-col items-center gap-3">
        <Icon
          width={48}
          height={48}
          strokeWidth={1.5}
          style={{
            color:
              tone === 'brand'
                ? 'var(--brand-primary)'
                : 'color-mix(in srgb, var(--brand-text) 50%, transparent)',
          }}
          aria-hidden="true"
        />
        <h3
          className="t-h3 text-lg font-semibold"
          style={{
            color: 'var(--brand-text)',
            fontFamily: 'var(--brand-font-heading)',
          }}
        >
          {title}
        </h3>
        {body && (
          <p
            className="text-sm max-w-md"
            style={{
              color: 'var(--brand-text)',
              opacity: 0.6,
            }}
          >
            {body}
          </p>
        )}
        {(primaryCTA || secondaryCTA) && (
          <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
            {primaryCTA && (
              <Link
                href={primaryCTA.href}
                className="hover-lift inline-flex items-center justify-center rounded px-4 py-2 text-sm font-medium"
                style={{
                  backgroundColor: 'var(--brand-primary)',
                  color: 'var(--brand-bg)',
                  borderRadius: 'var(--brand-radius)',
                  minHeight: '44px',
                }}
              >
                {primaryCTA.label}
              </Link>
            )}
            {secondaryCTA && (
              <Link
                href={secondaryCTA.href}
                className="hover-lift inline-flex items-center justify-center rounded px-4 py-2 text-sm font-medium"
                style={{
                  backgroundColor: 'transparent',
                  color: 'var(--brand-text)',
                  border: '1px solid color-mix(in srgb, var(--brand-text) 24%, transparent)',
                  borderRadius: 'var(--brand-radius)',
                  minHeight: '44px',
                }}
              >
                {secondaryCTA.label}
              </Link>
            )}
          </div>
        )}
      </div>
    </StateSurface>
  );
}
