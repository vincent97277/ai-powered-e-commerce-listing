// DEPRECATED V1.6: replaced by MerchantInbox. Kept one release for rollback. Delete in V1.7.
/**
 * HealthCallout — 商家 dashboard 賣場健康度 callout (V1.5 Track B1)
 *
 * 兄弟元件 PendingCallout (V1 #72) — 同 shell, 同 chip family.
 * 設計決定 D1: 不做單一 score, 用 chip family 顯示 issue 類型 + 數量.
 *
 * 顯示 top 3 issues (sort by count desc):
 *   - no_photo    → 缺照片 (Camera icon)
 *   - short_title → 標題太短 (Type icon)
 *   - zero_stock  → 缺貨 (PackageX icon)
 *   - zero_price  → 沒定價 (DollarSign icon)
 *
 * issues=[] → 整段不顯示
 * 任何 count > 10 → 整段升級成 error 紅色 (緊迫感)
 *
 * Server component, 沒 client 互動
 */
import Link from 'next/link';
import { ClipboardList, Camera, Type, PackageX, DollarSign, type LucideIcon } from 'lucide-react';
import type { HealthIssue, HealthIssueType } from '@/lib/merchant/health-checks';

const ISSUE_ICON: Record<HealthIssueType, LucideIcon> = {
  no_photo: Camera,
  short_title: Type,
  zero_stock: PackageX,
  zero_price: DollarSign,
};

export function HealthCallout({ issues }: { issues: HealthIssue[] }) {
  if (issues.length === 0) {
    return null;
  }

  // 任一 count > 10 → escalate 紅色; 否則 warning 黃色
  const escalated = issues.some((i) => i.count > 10);
  const accent = escalated ? 'var(--error)' : 'var(--warning)';

  return (
    <div
      className="flex flex-wrap items-center gap-3 rounded p-4"
      style={{
        backgroundColor: `color-mix(in srgb, ${accent} 8%, transparent)`,
        border: `1px solid color-mix(in srgb, ${accent} 24%, transparent)`,
        borderRadius: 'var(--brand-radius)',
      }}
    >
      <ClipboardList className="h-4 w-4 shrink-0" style={{ color: accent }} strokeWidth={2.4} />
      <span className="text-sm font-medium">📋 賣場健康度:</span>

      {issues.map((issue) => {
        const Icon = ISSUE_ICON[issue.type];
        return (
          <Link
            key={issue.type}
            href={issue.filterUrl}
            className="hover-lift inline-flex items-center gap-1.5 rounded px-3 py-1 text-xs font-medium tabular-nums"
            style={{
              backgroundColor: 'var(--brand-bg)',
              color: accent,
              border: `1px solid color-mix(in srgb, ${accent} 30%, transparent)`,
              borderRadius: 'var(--brand-radius)',
            }}
          >
            <Icon className="h-3 w-3" strokeWidth={2.4} />
            {issue.label}
          </Link>
        );
      })}
    </div>
  );
}
