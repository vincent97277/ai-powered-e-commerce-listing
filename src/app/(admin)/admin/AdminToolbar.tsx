'use client';

/**
 * AdminToolbar — top toolbar on the admin overview (V1.6 A1)
 *
 * 4 things merged into one client component, all written into URL searchParams:
 *   - q       search (name/slug ILIKE), 200ms debounce
 *   - status  'all' | 'active' | 'suspended'
 *   - attn    '1' | '0'  (needs-attention chip toggle)
 *   - sort    'gmv' | 'orders' | 'products' | 'created'
 *   - page    any filter change resets back to 1
 *
 * Replaces the existing SortDropdown (V1.6 Eng E1: three things in different components were
 * trampling each other's URL state).
 *
 * Mobile (<sm): vertical stack + full-width search;
 * Desktop (sm+): single row, search flex-1, others fixed.
 */

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { AlertCircle } from 'lucide-react';

const SORT_OPTIONS = {
  gmv: 'GMV (高 → 低)',
  orders: '訂單數 (多 → 少)',
  products: '商品數 (多 → 少)',
  created: '註冊時間 (新 → 舊)',
} as const;

const STATUS_OPTIONS = {
  all: '全部狀態',
  active: '營運中',
  suspended: '已停權',
} as const;

export type AdminSortKey = keyof typeof SORT_OPTIONS;
export type AdminStatusFilter = keyof typeof STATUS_OPTIONS;

type Props = {
  q: string;
  status: AdminStatusFilter;
  attn: boolean;
  sort: AdminSortKey;
};

export function AdminToolbar({ q, status, attn, sort }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  // Local controlled state for the search input — keeps typing snappy
  // Don't push URL on every keystroke; 200ms debounce
  const [qLocal, setQLocal] = useState(q);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // If URL q changes (e.g. clear-filter link), sync it back into the input
  useEffect(() => {
    setQLocal(q);
  }, [q]);

  function buildUrl(patch: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '' || v === 'all' || v === '0') {
        params.delete(k);
      } else {
        params.set(k, v);
      }
    }
    // Any filter change resets page = 1 (unless the patch itself specifies a page)
    if (!('page' in patch)) {
      params.delete('page');
    }
    const qs = params.toString();
    return qs ? `/admin?${qs}` : '/admin';
  }

  function pushUrl(patch: Record<string, string | null>) {
    startTransition(() => {
      router.push(buildUrl(patch));
    });
  }

  function onSearchChange(next: string) {
    setQLocal(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      pushUrl({ q: next });
    }, 200);
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
      {/* Search */}
      <div className="flex-1">
        <label htmlFor="admin-search" className="sr-only">
          搜尋商家名稱或 slug
        </label>
        <input
          id="admin-search"
          type="search"
          value={qLocal}
          onChange={(e) => onSearchChange(e.currentTarget.value)}
          placeholder="搜尋名稱或 slug…"
          className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-900"
          autoComplete="off"
        />
      </div>

      {/* Status filter */}
      <div>
        <label htmlFor="admin-status" className="sr-only">
          狀態
        </label>
        <select
          id="admin-status"
          value={status}
          onChange={(e) => pushUrl({ status: e.currentTarget.value })}
          className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-900 sm:w-auto"
        >
          {Object.entries(STATUS_OPTIONS).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {/* Needs-attention chip toggle */}
      <button
        type="button"
        onClick={() => pushUrl({ attn: attn ? '0' : '1' })}
        aria-pressed={attn}
        className={`inline-flex items-center justify-center gap-1.5 rounded border px-3 py-2 text-sm transition ${
          attn
            ? 'border-amber-400 bg-amber-50 text-amber-900'
            : 'border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400'
        }`}
      >
        <AlertCircle className="h-4 w-4" strokeWidth={2.2} />
        需關注
      </button>

      {/* Sort dropdown */}
      <div>
        <label htmlFor="admin-sort" className="sr-only">
          排序
        </label>
        <select
          id="admin-sort"
          value={sort}
          onChange={(e) => pushUrl({ sort: e.currentTarget.value })}
          className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-900 sm:w-auto"
        >
          {Object.entries(SORT_OPTIONS).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
