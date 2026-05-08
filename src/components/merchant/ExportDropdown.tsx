'use client';

/**
 * ExportDropdown — unified export button for merchant-admin toolbar (V1.5 Track B2)
 *
 * Usage:
 *   <ExportDropdown kind="orders" currentFilter={{ status: 'paid' }} />
 *   <ExportDropdown kind="products" currentFilter={{ filter: 'low-stock' }} />
 *
 * No external dropdown lib — Tailwind + native onBlur to collapse, keyboard-closeable (ESC).
 * Click an item → directly triggers GET /api/export/...?format=...&...filters via window.location,
 * browser auto-fires the download dialog.
 *
 * V1.6 B4 update: download-complete hint switched to Sonner toast (replacing inline ad-hoc div).
 * Sonner Toaster is mounted globally at src/app/layout.tsx:39.
 */
import { useEffect, useRef, useState } from 'react';
import { Download, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';

type Kind = 'orders' | 'products';

type Props = {
  kind: Kind;
  /** Forwarded to /api/export/.../?...filters; undefined / empty values are auto-ignored */
  currentFilter?: Record<string, string | undefined | null>;
};

export function ExportDropdown({ kind, currentFilter }: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // ESC / click outside → close
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  function buildHref(format: 'xlsx' | 'shopee_csv'): string {
    const base = kind === 'orders' ? '/api/export/orders' : '/api/export/products';
    const params = new URLSearchParams();
    params.set('format', format);
    if (currentFilter) {
      for (const [k, v] of Object.entries(currentFilter)) {
        if (v != null && v !== '') params.set(k, v);
      }
    }
    return `${base}?${params.toString()}`;
  }

  function handleDownload(format: 'xlsx' | 'shopee_csv') {
    setOpen(false);
    // Avoid history pollution: use a hidden <a> instead of window.location.
    // V1.5 review M6: don't set a.download — filename comes from server-side Content-Disposition: attachment
    //                 header (more authoritative, agreed with reviewer on option 2).
    const a = document.createElement('a');
    a.href = buildHref(format);
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();

    if (format === 'shopee_csv') {
      toast.success('CSV 已下載 (UTF-8 BOM). 若 Excel 開啟見亂碼, 請選 UTF-8 編碼匯入.');
    } else {
      toast.success('Excel 已下載.');
    }
  }

  const items: Array<{ label: string; sub?: string; format: 'xlsx' | 'shopee_csv' }> =
    kind === 'orders'
      ? [{ label: 'Excel (.xlsx)', sub: '訂單 13 欄 + 狀態時間軸 · 單次最多 5000 筆', format: 'xlsx' }]
      : [
          { label: 'Excel (.xlsx)', sub: '商品 9 欄 + 變體 JSON · 單次最多 5000 筆', format: 'xlsx' },
          { label: '蝦皮 CSV (UTF-8 BOM)', sub: '21 欄完整規格 · 單次最多 5000 筆', format: 'shopee_csv' },
        ];

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition"
        style={{
          border: '1px solid color-mix(in srgb, var(--brand-primary) 28%, transparent)',
          color: 'var(--brand-text)',
          borderRadius: 'var(--brand-radius)',
          backgroundColor: open
            ? 'color-mix(in srgb, var(--brand-primary) 8%, transparent)'
            : 'transparent',
        }}
      >
        <Download className="h-3.5 w-3.5" strokeWidth={2.2} />
        匯出
        <ChevronDown
          className="h-3 w-3 transition-transform"
          strokeWidth={2.2}
          style={{ transform: open ? 'rotate(180deg)' : undefined }}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1 min-w-[240px] py-1 elev-2"
          style={{
            backgroundColor: 'var(--brand-bg)',
            border: '1px solid color-mix(in srgb, var(--brand-primary) 18%, transparent)',
            borderRadius: 'var(--brand-radius)',
          }}
        >
          {items.map((it) => (
            <button
              key={it.format}
              type="button"
              role="menuitem"
              onClick={() => handleDownload(it.format)}
              className="block w-full px-3 py-2 text-left text-xs hover:bg-brand-soft transition"
              style={{ color: 'var(--brand-text)' }}
            >
              <div className="font-medium">{it.label}</div>
              {it.sub && (
                <div className="mt-0.5 opacity-50" style={{ fontSize: '0.7rem' }}>
                  {it.sub}
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
