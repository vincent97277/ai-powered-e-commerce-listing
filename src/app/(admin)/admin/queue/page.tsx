/**
 * /admin/queue — operator queue / merchant action list (V1.6 Track A8)
 *
 * "Which merchants need intervention + why" rendered as vertical inbox cards (NOT a table).
 * Each card = a (merchant × signal) tuple; one merchant can appear in multiple cards
 * (3 signals = 3 cards).
 *
 * Sort: severity asc (P1 first), count desc, name asc.
 *
 * Empty (all merchants healthy): EmptyState (CheckCircle2 icon, celebration state).
 * Error: ErrorState — query throw falls back to whole-page error.
 *
 * No bulk action / no snooze persistence — V2 work (cut per plan A5).
 * No live push — V1.6 = SSR snapshot per request; refresh via browser reload.
 */
import Link from 'next/link';
import { ArrowUpRight, ChevronRight, CheckCircle2 } from 'lucide-react';
import {
  getOperatorQueue,
  type QueueItem,
  type Severity,
} from '@/lib/admin/operator-queue';
import { EmptyState } from '@/components/feedback/EmptyState';
import { ErrorState } from '@/components/feedback/ErrorState';

export const dynamic = 'force-dynamic';

/* Severity chip color map — design spec A8:
 *   P1 red          (revenue blocker)
 *   P2 amber        (catalog blocker)
 *   P3 amber low    (risk, 50% opacity)
 *   P4 default      (quality nit)
 *   P5 default low  (customer pending)
 */
const SEVERITY_STYLE: Record<
  Severity,
  { bg: string; border: string; color: string; label: string }
> = {
  P1: {
    bg: 'color-mix(in srgb, var(--error) 12%, transparent)',
    border: 'color-mix(in srgb, var(--error) 40%, transparent)',
    color: 'var(--error)',
    label: 'P1',
  },
  P2: {
    bg: 'color-mix(in srgb, var(--warning) 14%, transparent)',
    border: 'color-mix(in srgb, var(--warning) 42%, transparent)',
    color: 'var(--warning)',
    label: 'P2',
  },
  P3: {
    bg: 'color-mix(in srgb, var(--warning) 7%, transparent)',
    border: 'color-mix(in srgb, var(--warning) 22%, transparent)',
    color: 'color-mix(in srgb, var(--warning) 70%, var(--brand-text))',
    label: 'P3',
  },
  P4: {
    bg: 'color-mix(in srgb, var(--brand-text) 6%, transparent)',
    border: 'color-mix(in srgb, var(--brand-text) 18%, transparent)',
    color: 'color-mix(in srgb, var(--brand-text) 70%, transparent)',
    label: 'P4',
  },
  P5: {
    bg: 'color-mix(in srgb, var(--brand-text) 4%, transparent)',
    border: 'color-mix(in srgb, var(--brand-text) 12%, transparent)',
    color: 'color-mix(in srgb, var(--brand-text) 50%, transparent)',
    label: 'P5',
  },
};

export default async function AdminQueuePage() {
  let queue: QueueItem[] | null = null;
  let queryError: Error | null = null;

  try {
    queue = await getOperatorQueue();
  } catch (err) {
    queryError = err instanceof Error ? err : new Error(String(err));
  }

  return (
    <main className="px-4 py-10 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-4xl space-y-8">
        {/* Header — sibling nav aligned with /admin overview */}
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
          <div className="space-y-2">
            <p className="font-mono text-xs uppercase tracking-wider text-ink-muted">
              Catalogify · 平台管理
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">客服佇列</h1>
            <p className="text-sm text-ink-muted">
              商家行動清單 · P1 優先 · 依嚴重度排序
            </p>
          </div>
          <nav className="flex items-center gap-3 text-sm" aria-label="平台管理導覽">
            <Link
              href="/admin"
              className="text-ink-muted underline-offset-4 hover:underline"
            >
              商家排行
            </Link>
            <span className="text-ink-faint" aria-hidden="true">·</span>
            <Link
              href="/admin/cost"
              className="text-ink-muted underline-offset-4 hover:underline"
            >
              AI 成本
            </Link>
            <span className="text-ink-faint" aria-hidden="true">·</span>
            <Link
              href="/"
              className="inline-flex items-center gap-1 text-ink-muted underline-offset-4 hover:underline"
            >
              前台首頁
              <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2.2} />
            </Link>
          </nav>
        </header>

        {/* Queue body */}
        {queryError ? (
          <div className="rounded border surface-card border-card-soft">
            <ErrorState error={queryError} retryHref="/admin/queue" scope="section" />
          </div>
        ) : !queue || queue.length === 0 ? (
          <div className="rounded border surface-card border-card-soft">
            <EmptyState
              icon={CheckCircle2}
              title="全部商家狀態良好"
              body={`下次更新: ${new Date().toLocaleString('zh-TW', {
                hour: '2-digit',
                minute: '2-digit',
              })} (重新載入頁面)`}
              scope="section"
            />
          </div>
        ) : (
          <>
            <p className="text-sm text-ink-muted">
              共 {queue.length} 件待處理 · 由上而下優先級遞減
            </p>
            <ul className="space-y-3" aria-label="客服佇列">
              {queue.map((item) => (
                <QueueCard
                  key={`${item.merchantId}-${item.signalType}`}
                  item={item}
                />
              ))}
            </ul>
          </>
        )}
      </div>
    </main>
  );
}

/* ─────────────────────────── QueueCard ─────────────────────────── */

function QueueCard({ item }: { item: QueueItem }) {
  const style = SEVERITY_STYLE[item.severity];

  return (
    <li
      className="flex items-start justify-between gap-4 rounded border p-4 transition-shadow hover:shadow-sm sm:items-center surface-card"
      style={{ borderColor: 'var(--border-card)' }}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3 sm:items-center">
        {/* Severity chip — keeps custom 32px min-width per A8 spec, otherwise mirrors StatusChip semantics */}
        <span
          className="inline-flex shrink-0 items-center justify-center rounded px-2 py-0.5 text-xs font-semibold tabular-nums"
          style={{
            backgroundColor: style.bg,
            border: `1px solid ${style.border}`,
            color: style.color,
            borderRadius: 'var(--brand-radius)',
            minWidth: '32px',
          }}
          aria-label={`嚴重度 ${style.label}`}
        >
          {style.label}
        </span>

        {/* Merchant + reason */}
        <div className="min-w-0 flex-1">
          <p
            className="truncate text-sm font-medium"
            style={{ color: 'var(--brand-text)' }}
          >
            <span className="font-mono text-xs text-ink-muted">{item.slug}</span>
            <span className="mx-1.5 text-ink-faint" aria-hidden="true">·</span>
            <span>{item.name}</span>
          </p>
          <p className="mt-0.5 text-xs text-ink-muted">{item.reason}</p>
        </div>
      </div>

      {/* View action */}
      <Link
        href={item.actionHref}
        className="inline-flex shrink-0 items-center gap-1 rounded border px-3 py-1.5 text-xs font-medium hover:bg-brand-soft"
        style={{
          backgroundColor: 'var(--brand-bg)',
          borderColor: 'var(--border-card)',
          color: 'var(--brand-text)',
        }}
        aria-label={`查看 ${item.name} 的 ${item.reason}`}
      >
        查看
        <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.2} />
      </Link>
    </li>
  );
}
