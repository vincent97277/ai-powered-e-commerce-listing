/**
 * StatusChip — universal status pill primitive (V1.9 T1)
 *
 * Replaces 5+ forked inline status-pill implementations across:
 *   - /admin/page.tsx (suspended / active)
 *   - /admin/queue/page.tsx (severity P1-P5)
 *   - /merchant/orders/page.tsx (order status)
 *   - /merchant/products/page.tsx (stock + product status)
 *   - MerchantInbox.tsx (signal chip family)
 *
 * Reads brand-aware status tokens from globals.css (--status-*-soft / --status-*-edge).
 * Server component, no 'use client'.
 *
 * Touch target: pass mobileTouchTarget for sites that need min-h-[44px] (mobile inbox).
 */
import type { LucideIcon } from 'lucide-react';

export type StatusChipTone = 'success' | 'warning' | 'error' | 'info' | 'neutral';
export type StatusChipSize = 'sm' | 'md';

type Props = {
  tone: StatusChipTone;
  label: string;
  count?: number;
  icon?: LucideIcon;
  /** Show colored dot when no icon is provided. Default true. */
  dot?: boolean;
  size?: StatusChipSize;
  href?: string;
  /** Add min-h-[44px] for mobile touch targets (e.g. MerchantInbox). */
  mobileTouchTarget?: boolean;
  className?: string;
  /** Optional aria-label override. Falls back to `${label}` (+ count). */
  ariaLabel?: string;
};

const TONE_VARS: Record<
  StatusChipTone,
  { color: string; soft: string; edge: string }
> = {
  success: {
    color: 'var(--success)',
    soft: 'var(--status-success-soft)',
    edge: 'var(--status-success-edge)',
  },
  warning: {
    color: 'var(--warning)',
    soft: 'var(--status-warning-soft)',
    edge: 'var(--status-warning-edge)',
  },
  error: {
    color: 'var(--error)',
    soft: 'var(--status-error-soft)',
    edge: 'var(--status-error-edge)',
  },
  info: {
    color: 'var(--info)',
    soft: 'var(--status-info-soft)',
    edge: 'var(--status-info-edge)',
  },
  neutral: {
    color: 'var(--ink-muted)',
    soft: 'var(--brand-tint-8)',
    edge: 'var(--brand-edge-18)',
  },
};

export function StatusChip({
  tone,
  label,
  count,
  icon: Icon,
  dot = true,
  size = 'sm',
  href,
  mobileTouchTarget = false,
  className = '',
  ariaLabel,
}: Props) {
  const { color, soft, edge } = TONE_VARS[tone];
  const pad =
    size === 'md' ? 'px-2.5 py-1 text-xs' : 'px-2 py-0.5 text-[11px]';
  const touch = mobileTouchTarget ? 'min-h-[44px] px-3 py-2 text-xs' : pad;

  const inner = (
    <>
      {Icon ? (
        <Icon
          className="h-3.5 w-3.5"
          strokeWidth={2.2}
          style={{ color }}
          aria-hidden="true"
        />
      ) : dot ? (
        <span
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: color }}
          aria-hidden="true"
        />
      ) : null}
      <span>{label}</span>
      {typeof count === 'number' && (
        <span className="font-mono tabular-nums opacity-80">· {count}</span>
      )}
    </>
  );

  const styles = {
    backgroundColor: soft,
    color,
    border: `1px solid ${edge}`,
    borderRadius: 'var(--brand-radius)',
  };

  const computedAria =
    ariaLabel ?? (typeof count === 'number' ? `${label} (${count})` : label);

  if (href) {
    return (
      <a
        href={href}
        className={`inline-flex items-center gap-1 font-medium transition hover:opacity-80 ${touch} ${className}`}
        style={styles}
        aria-label={computedAria}
      >
        {inner}
      </a>
    );
  }
  return (
    <span
      className={`inline-flex items-center gap-1 font-medium ${touch} ${className}`}
      style={styles}
      aria-label={computedAria}
    >
      {inner}
    </span>
  );
}
