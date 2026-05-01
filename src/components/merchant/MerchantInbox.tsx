/**
 * MerchantInbox — 商家 dashboard 統一行動清單 (V1.6 Track B5)
 *
 * 取代 V1 #72 PendingCallout + V1.5 B1 HealthCallout, 把 7 種 signal type 攤平
 * 顯示在一個容器裡, 依 severity P1→P5 分組.
 *
 * 設計決定:
 *   - 不做 escalate-all-to-red (V1.5 B1 那個 count > 10 就整個變紅), 改 per-chip 顏色.
 *   - 不做 scorecard, 不做 collapse — chip family 直接攤平.
 *   - Per-group cap = 5 chips. 超過 → "+N more →" 連去 first non-shown chip 的 filterUrl.
 *   - items=[] → return null (preserve V1 hide-when-zero behavior).
 *   - Mobile: chip min-h-[44px] 觸控目標 + 標題/chip 自動 wrap.
 *
 * Server component, 沒 client 互動.
 */
import Link from 'next/link';
import {
  ClipboardList,
  Truck,
  PackageX,
  DollarSign,
  AlertTriangle,
  Camera,
  Type,
  Clock,
  type LucideIcon,
} from 'lucide-react';
import type { InboxItem, InboxSeverity, InboxSignalType } from '@/lib/merchant/inbox';

const SIGNAL_ICON: Record<InboxSignalType, LucideIcon> = {
  paid_unshipped: Truck,
  zero_stock: PackageX,
  zero_price: DollarSign,
  low_stock: AlertTriangle,
  no_photo: Camera,
  short_title: Type,
  pending_unpaid: Clock,
};

/** Per-chip CSS color var (no escalate-all-to-red rule) */
const SIGNAL_COLOR: Record<InboxSignalType, string> = {
  paid_unshipped: 'var(--error)',
  zero_stock: 'var(--error)',
  zero_price: 'var(--error)',
  low_stock: 'var(--warning)',
  no_photo: 'var(--warning)',
  short_title: 'var(--brand-primary)',
  pending_unpaid: 'var(--brand-primary)',
};

const GROUP_LABEL: Record<InboxSeverity, string> = {
  P1: '營收 / 訂單',
  P2: '商品上架阻塞',
  P3: '商品風險',
  P4: '商品品質',
  P5: '顧客等待中',
};

const SEVERITY_ORDER: InboxSeverity[] = ['P1', 'P2', 'P3', 'P4', 'P5'];

/** 每個 group 最多顯示 chip 數 — 超過用 "+N more" link 收掉 */
const GROUP_CHIP_CAP = 5;

export function MerchantInbox({ items }: { items: InboxItem[] }) {
  if (items.length === 0) {
    return null;
  }

  // 依 severity 分組 (items 已 sort 好 by severity asc → count desc)
  const grouped = new Map<InboxSeverity, InboxItem[]>();
  for (const item of items) {
    const arr = grouped.get(item.severity) ?? [];
    arr.push(item);
    grouped.set(item.severity, arr);
  }

  const totalCount = items.reduce((s, i) => s + i.count, 0);

  return (
    <section
      role="region"
      aria-labelledby="inbox-heading"
      className="rounded p-4 sm:p-5"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--brand-primary) 4%, var(--brand-bg))',
        border: '1px solid color-mix(in srgb, var(--brand-primary) 18%, transparent)',
        borderRadius: 'var(--brand-radius)',
      }}
    >
      {/* Header */}
      <header className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 sm:mb-4">
        <ClipboardList
          className="h-4 w-4 shrink-0 self-center"
          style={{ color: 'var(--brand-primary)' }}
          strokeWidth={2.4}
        />
        <h2
          id="inbox-heading"
          className="t-small font-semibold"
          style={{ color: 'var(--brand-text)' }}
        >
          商家行動清單
        </h2>
        <span className="t-caption tabular-nums opacity-60">
          共 {totalCount} 件 · {items.length} 類
        </span>
      </header>

      {/* Severity groups */}
      <div className="space-y-3">
        {SEVERITY_ORDER.flatMap((severity) => {
          const groupItems = grouped.get(severity);
          if (!groupItems || groupItems.length === 0) return [];

          const visible = groupItems.slice(0, GROUP_CHIP_CAP);
          const overflow = groupItems.slice(GROUP_CHIP_CAP);

          return [
            <div
              key={severity}
              className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2"
            >
              <span
                className="t-caption shrink-0 font-medium opacity-60"
                style={{ minWidth: '6rem' }}
              >
                {GROUP_LABEL[severity]}
              </span>
              <div className="flex flex-wrap items-center gap-2">
                {visible.map((item) => (
                  <InboxChip key={item.type} item={item} />
                ))}
                {overflow.length > 0 && (
                  <Link
                    href={overflow[0].filterUrl}
                    className="hover-lift inline-flex min-h-[44px] items-center gap-1 px-3 py-2 text-xs font-medium"
                    style={{
                      color: 'var(--brand-primary)',
                      borderRadius: 'var(--brand-radius)',
                    }}
                  >
                    +{overflow.length} more →
                  </Link>
                )}
              </div>
            </div>,
          ];
        })}
      </div>
    </section>
  );
}

function InboxChip({ item }: { item: InboxItem }) {
  const Icon = SIGNAL_ICON[item.type];
  const color = SIGNAL_COLOR[item.type];

  return (
    <Link
      href={item.filterUrl}
      className="hover-lift inline-flex min-h-[44px] items-center gap-1.5 px-3 py-2 text-xs font-medium tabular-nums"
      style={{
        backgroundColor: 'var(--brand-bg)',
        color,
        border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
        borderRadius: 'var(--brand-radius)',
      }}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={2.4} />
      {item.label}
    </Link>
  );
}
