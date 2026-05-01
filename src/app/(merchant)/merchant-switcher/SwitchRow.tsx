'use client';

/**
 * SwitchRow — clickable card row in /merchant-switcher full-list page (V1.7 D2)
 *
 * Why client component: 設 cookie 行為跟 ThemeProvider.setCurrentId 一致 — 客戶端
 * `document.cookie =` (跟既有 MerchantSwitcher 切換 path 完全相同, 不引入新 server
 * action). 點 row → 設 cookie → router.push('/merchant') → middleware 拿到新 cookie
 * 解析新 tenant.
 */
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

type Props = {
  id: string;
  slug: string;
  name: string;
  isCurrent: boolean;
};

export function SwitchRow({ id, slug, name, isCurrent }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    document.cookie = `demo-merchant-id=${id}; path=/; max-age=31536000`;
    startTransition(() => router.push('/merchant'));
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      aria-label={`切換到 ${name}`}
      className="flex w-full items-center justify-between gap-3 rounded border bg-white px-4 py-3 text-left transition hover:border-zinc-400 hover:bg-zinc-50 disabled:opacity-60"
      style={{
        borderColor: isCurrent
          ? 'color-mix(in srgb, var(--brand-primary) 40%, transparent)'
          : undefined,
        backgroundColor: isCurrent
          ? 'color-mix(in srgb, var(--brand-primary) 6%, white)'
          : undefined,
        minHeight: '44px',
      }}
    >
      <div className="flex flex-col">
        <span className="text-sm font-medium" style={{ color: 'var(--brand-text)' }}>
          {name}
        </span>
        <span className="font-mono text-xs text-zinc-500">{slug}</span>
      </div>
      {isCurrent ? (
        <span
          className="shrink-0 rounded bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700"
          aria-label="當前商家"
        >
          當前
        </span>
      ) : (
        <span aria-hidden className="text-zinc-400">
          →
        </span>
      )}
    </button>
  );
}
