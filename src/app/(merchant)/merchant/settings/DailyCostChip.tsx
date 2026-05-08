/**
 * DailyCostChip — shows "today's AI usage" on the merchant settings page
 *
 * Colors:
 *   - <50%   green (var(--success), default fallback teal)
 *   - 50-80% orange (var(--warning))
 *   - >80%   red (var(--error))
 *
 * Server component, pure display (same style as PendingCallout chip)
 *
 * V1.5 Track A2 — visible cap is what makes it meaningful; only then will merchants tune dailyAiCostCentsCap
 */
import { AlertCircle, CheckCircle2, AlertTriangle } from 'lucide-react';

export function DailyCostChip({
  usedCents,
  capCents,
}: {
  usedCents: number;
  capCents: number;
}) {
  const ratio = capCents > 0 ? usedCents / capCents : 0;
  const usedTwd = Math.round(usedCents / 100);
  const capTwd = Math.round(capCents / 100);

  // Three-tier color: <50 green, 50-80 orange, >80 red
  const tone =
    ratio >= 0.8 ? 'error' : ratio >= 0.5 ? 'warning' : 'success';

  const colorVar =
    tone === 'error'
      ? 'var(--error)'
      : tone === 'warning'
        ? 'var(--warning)'
        : 'var(--success, #16a34a)'; // success var may not always be defined → fallback green-600

  const Icon =
    tone === 'error' ? AlertCircle : tone === 'warning' ? AlertTriangle : CheckCircle2;

  const label =
    tone === 'error'
      ? '今日 AI 額度即將用完'
      : tone === 'warning'
        ? '今日 AI 用量過半'
        : '今日 AI 用量正常';

  return (
    <div
      className="inline-flex max-w-full items-start gap-2 rounded px-3 py-1.5 text-xs font-medium tabular-nums sm:items-center"
      style={{
        backgroundColor: `color-mix(in srgb, ${colorVar} 8%, transparent)`,
        border: `1px solid color-mix(in srgb, ${colorVar} 30%, transparent)`,
        color: colorVar,
        borderRadius: 'var(--brand-radius)',
      }}
      role="status"
      aria-label={label}
    >
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 sm:mt-0" strokeWidth={2.2} />
      <span className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-1">
        <span>{label}</span>
        <span className="hidden sm:inline">—</span>
        <span>今日已用 NT${usedTwd} / 上限 NT${capTwd}</span>
      </span>
    </div>
  );
}
