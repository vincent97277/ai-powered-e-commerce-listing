/**
 * MerchantCard — 平台首頁 marketplace 店鋪卡 (V1 #58)
 * Linear-tone: dense, sharp, 邊框細, 1 個 emoji + 名 + brand voice 一行 + 商品數 + GMV
 */
import Link from 'next/link';
import type { FeaturedMerchant } from '@/lib/platform/featured-merchants';

export function MerchantCard({
  m,
  showGmv = true,
}: {
  m: FeaturedMerchant;
  showGmv?: boolean;
}) {
  const tagline = m.brandVoice ? m.brandVoice.slice(0, 30) : null;
  return (
    <Link
      href={`/store/${m.slug}`}
      className="group block rounded border border-zinc-200 bg-white p-5 transition hover:border-zinc-900"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="text-2xl leading-none">{m.emoji ?? '🏪'}</div>
        <span className="font-mono text-xs text-zinc-400">/{m.slug}</span>
      </div>
      <h3 className="mt-3 truncate text-base font-semibold tracking-tight text-zinc-900 group-hover:text-zinc-900">
        {m.name}
      </h3>
      {tagline ? (
        <p className="mt-1 line-clamp-2 text-xs text-zinc-500">{tagline}</p>
      ) : (
        <p className="mt-1 text-xs italic text-zinc-400">尚未設定品牌語氣</p>
      )}
      <div className="mt-4 flex items-center justify-between text-xs text-zinc-500">
        <span className="tabular-nums">{m.productCount} 件商品</span>
        {showGmv && m.gmvCents > 0 ? (
          <span className="tabular-nums font-medium text-zinc-700">
            NT$ {(m.gmvCents / 100).toLocaleString()}
          </span>
        ) : (
          <span className="text-zinc-400">—</span>
        )}
      </div>
    </Link>
  );
}
