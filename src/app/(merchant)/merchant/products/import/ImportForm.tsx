'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Sparkles } from 'lucide-react';

type SourceType = 'ig' | 'shopee';

export function ImportForm() {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [type, setType] = useState<SourceType>('ig');
  const [pending, start] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const res = await fetch('/api/products/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), type }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? `${res.status} 錯誤`);
        return;
      }
      toast.success('已送出, 後台處理中');
      router.push(data.redirectTo ?? `/merchant/products/import/${data.sessionId}`);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="t-caption block font-medium opacity-80">來源類型</label>
        <div className="mt-2 flex gap-2">
          <SourceChip value="ig" current={type} onClick={() => setType('ig')} label="IG" />
          <SourceChip value="shopee" current={type} onClick={() => setType('shopee')} label="蝦皮" />
        </div>
      </div>

      <div>
        <label htmlFor="url" className="t-caption block font-medium opacity-80">
          {type === 'ig' ? 'IG 帳號 / 商品連結' : '蝦皮店面 / 商品連結'}
        </label>
        <input
          id="url"
          type="url"
          required
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={
            type === 'ig'
              ? 'https://www.instagram.com/yourshop/'
              : 'https://shopee.tw/yourshop'
          }
          className="mt-1.5 block w-full border bg-transparent px-3 py-2 font-mono text-sm"
          style={{
            borderColor: 'color-mix(in srgb, var(--brand-primary) 28%, transparent)',
            borderRadius: 'var(--brand-radius)',
            color: 'var(--brand-text)',
          }}
          disabled={pending}
        />
        <p className="mt-1 text-xs opacity-50">
          一次最多 import 20 件商品, 私人帳號或結構特殊的頁面可能抓不到
        </p>
      </div>

      <button
        type="submit"
        disabled={pending || !url.trim()}
        className="hover-lift inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold elev-2"
        style={{
          backgroundColor: 'var(--brand-primary)',
          color: 'var(--brand-bg)',
          borderRadius: 'var(--brand-radius)',
          fontFamily: 'var(--brand-font-heading)',
        }}
      >
        <Sparkles className="h-4 w-4" strokeWidth={2.4} />
        {pending ? '送出中...' : '開始 import'}
      </button>
    </form>
  );
}

function SourceChip({
  value,
  current,
  onClick,
  label,
}: {
  value: SourceType;
  current: SourceType;
  onClick: () => void;
  label: string;
}) {
  const active = value === current;
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center rounded px-3 py-1.5 text-sm font-medium"
      style={
        active
          ? {
              backgroundColor: 'var(--brand-primary)',
              color: 'var(--brand-bg)',
              borderRadius: 'var(--brand-radius)',
            }
          : {
              border: '1px solid color-mix(in srgb, var(--brand-primary) 22%, transparent)',
              color: 'var(--brand-text)',
              borderRadius: 'var(--brand-radius)',
              backgroundColor: 'transparent',
            }
      }
    >
      {label}
    </button>
  );
}
