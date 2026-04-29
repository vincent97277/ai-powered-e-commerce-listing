'use client';

import { useRouter } from 'next/navigation';

const SORT_OPTIONS = {
  gmv: 'GMV (高 → 低)',
  productCount: '商品數 (多 → 少)',
  orderCount: '訂單數 (多 → 少)',
  createdAt: '註冊時間 (新 → 舊)',
} as const;

export function SortDropdown({ current }: { current: string }) {
  const router = useRouter();
  return (
    <div className="flex items-center gap-3">
      <label htmlFor="sort" className="text-sm text-zinc-600">
        排序
      </label>
      <select
        id="sort"
        defaultValue={current}
        className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 outline-none focus:border-zinc-900"
        onChange={(e) => {
          router.push(`/admin?sort=${e.currentTarget.value}`);
        }}
      >
        {Object.entries(SORT_OPTIONS).map(([k, label]) => (
          <option key={k} value={k}>
            {label}
          </option>
        ))}
      </select>
    </div>
  );
}
