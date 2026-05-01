'use client';

/**
 * SearchInput — debounced search box for /merchant-switcher (V1.7 D2)
 *
 * Mirrors AdminToolbar (V1.6 A1) pattern: 200ms debounce → router.push 寫 URL
 * searchParams ?q=. Page server component 拿 q 做 ILIKE 查詢. 任何 q 變動 reset
 * page=1.
 */
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { Search } from 'lucide-react';

export function SearchInput({ initialQ }: { initialQ: string }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [, startTransition] = useTransition();
  const [q, setQ] = useState(initialQ);
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setQ(initialQ);
  }, [initialQ]);

  function pushUrl(next: string) {
    const params = new URLSearchParams(sp.toString());
    if (next.trim() === '') {
      params.delete('q');
    } else {
      params.set('q', next.trim());
    }
    params.delete('page'); // reset on filter change
    const qs = params.toString();
    startTransition(() => {
      router.push(qs ? `/merchant-switcher?${qs}` : '/merchant-switcher');
    });
  }

  function onChange(next: string) {
    setQ(next);
    if (debRef.current) clearTimeout(debRef.current);
    debRef.current = setTimeout(() => pushUrl(next), 200);
  }

  return (
    <div className="relative">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-50"
        strokeWidth={2.2}
        aria-hidden
      />
      <label htmlFor="merchant-switcher-search" className="sr-only">
        搜尋商家名稱或 slug
      </label>
      <input
        id="merchant-switcher-search"
        type="search"
        value={q}
        onChange={(e) => onChange(e.currentTarget.value)}
        placeholder="搜尋名稱或 slug…"
        className="w-full rounded border border-zinc-300 bg-white pl-9 pr-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-900"
        autoComplete="off"
        style={{ minHeight: '44px' }}
      />
    </div>
  );
}
