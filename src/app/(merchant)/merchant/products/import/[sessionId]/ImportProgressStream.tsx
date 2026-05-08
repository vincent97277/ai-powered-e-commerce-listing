'use client';

/**
 * Polling-based progress UI (V1 #68)
 * 2s interval, stop when status in completed/failed
 * Reuse GenerationStream's visual language (cursor blink, gradual fill)
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, AlertCircle, Loader2, Package } from 'lucide-react';

type SessionStatus = 'pending' | 'fetching' | 'importing' | 'completed' | 'failed';

type SessionState = {
  status: SessionStatus;
  totalItems: number;
  completedItems: number;
  errors: Array<Record<string, unknown>>;
};

const STATUS_LABEL: Record<SessionStatus, string> = {
  pending: '排隊中...',
  fetching: '抓取頁面中...',
  importing: 'AI 重寫文案中...',
  completed: '完成',
  failed: '失敗',
};

export function ImportProgressStream({
  sessionId,
  initialStatus,
  initialTotal,
  initialCompleted,
  initialErrors,
}: {
  sessionId: string;
  initialStatus: SessionStatus | string;
  initialTotal: number;
  initialCompleted: number;
  initialErrors: Array<Record<string, unknown>>;
}) {
  const [state, setState] = useState<SessionState>({
    status: (initialStatus as SessionStatus) ?? 'pending',
    totalItems: initialTotal,
    completedItems: initialCompleted,
    errors: initialErrors ?? [],
  });

  useEffect(() => {
    if (state.status === 'completed' || state.status === 'failed') return;
    const tick = async () => {
      try {
        const res = await fetch(`/api/products/import/${sessionId}`, {
          cache: 'no-store',
        });
        if (!res.ok) return;
        const data = await res.json();
        setState({
          status: data.status as SessionStatus,
          totalItems: data.totalItems ?? 0,
          completedItems: data.completedItems ?? 0,
          errors: data.errors ?? [],
        });
      } catch {
        // ignore transient
      }
    };
    const interval = setInterval(tick, 2000);
    tick(); // fire one immediately
    return () => clearInterval(interval);
  }, [sessionId, state.status]);

  const pct =
    state.totalItems > 0 ? Math.min(100, (state.completedItems / state.totalItems) * 100) : 0;

  const isDone = state.status === 'completed' || state.status === 'failed';

  return (
    <div className="space-y-6">
      {/* Status header */}
      <div
        className="flex items-center gap-3 rounded p-5"
        style={{
          backgroundColor: 'color-mix(in srgb, var(--brand-primary) 5%, transparent)',
          border: '1px solid color-mix(in srgb, var(--brand-primary) 16%, transparent)',
          borderRadius: 'var(--brand-radius)',
        }}
      >
        {state.status === 'completed' ? (
          <CheckCircle2 className="h-5 w-5" style={{ color: 'var(--success)' }} />
        ) : state.status === 'failed' ? (
          <AlertCircle className="h-5 w-5" style={{ color: 'var(--error)' }} />
        ) : (
          <Loader2 className="h-5 w-5 animate-spin" style={{ color: 'var(--brand-primary)' }} />
        )}
        <div className="flex-1">
          <p className="font-medium" style={{ color: 'var(--brand-text)' }}>
            {STATUS_LABEL[state.status] ?? state.status}
          </p>
          {state.totalItems > 0 && (
            <p className="text-sm opacity-60 tabular-nums">
              {state.completedItems} / {state.totalItems} 件成功
              {state.errors.length > 0 && ` · ${state.errors.length} 件失敗`}
            </p>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {state.totalItems > 0 && (
        <div className="space-y-1">
          <div
            className="h-2 overflow-hidden"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--brand-primary) 12%, transparent)',
              borderRadius: 'calc(var(--brand-radius) / 2)',
            }}
          >
            <div
              className="h-full transition-all duration-500"
              style={{
                width: `${pct}%`,
                backgroundColor: 'var(--brand-primary)',
              }}
            />
          </div>
          <p className="text-right text-xs tabular-nums opacity-50">{pct.toFixed(0)}%</p>
        </div>
      )}

      {/* Errors detail */}
      {state.errors.length > 0 && (
        <div
          className="rounded p-4"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--error) 6%, transparent)',
            border: '1px solid color-mix(in srgb, var(--error) 24%, transparent)',
            borderRadius: 'var(--brand-radius)',
          }}
        >
          <p className="text-xs font-medium opacity-80" style={{ color: 'var(--error)' }}>
            失敗的 item ({state.errors.length})
          </p>
          <ul className="mt-2 space-y-1 text-xs opacity-70">
            {state.errors.slice(0, 5).map((e, i) => (
              <li key={i} className="truncate font-mono">
                {String(e.message ?? JSON.stringify(e))}
              </li>
            ))}
            {state.errors.length > 5 && (
              <li className="opacity-50">+ {state.errors.length - 5} 筆...</li>
            )}
          </ul>
        </div>
      )}

      {/* Done CTA */}
      {isDone && (
        <div className="flex flex-wrap items-center gap-3 pt-4">
          <Link
            href="/merchant/products"
            className="hover-lift inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold"
            style={{
              backgroundColor: 'var(--brand-primary)',
              color: 'var(--brand-bg)',
              borderRadius: 'var(--brand-radius)',
              fontFamily: 'var(--brand-font-heading)',
            }}
          >
            <Package className="h-4 w-4" strokeWidth={2} />
            看商品列表
          </Link>
          <Link
            href="/merchant/products/import"
            className="inline-flex items-center gap-2 px-4 py-3 text-sm"
            style={{
              border: '1px solid color-mix(in srgb, var(--brand-primary) 28%, transparent)',
              color: 'var(--brand-primary)',
              borderRadius: 'var(--brand-radius)',
            }}
          >
            再 import 一次
          </Link>
        </div>
      )}
    </div>
  );
}
