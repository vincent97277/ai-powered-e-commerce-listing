/**
 * KpiCard — shared KPI display block (V1 #47)
 *
 * Extracted from src/app/(merchant)/merchant/page.tsx (RA4).
 * Uses brand vars (--brand-primary / --brand-bg / --brand-text / --brand-radius).
 * Inside a .platform wrapper these vars are aliased to the platform palette (see #48 globals.css).
 *
 * Server component, no client interaction.
 */
import Link from 'next/link';
import type { ComponentType, SVGProps } from 'react';

export type KpiCardProps = {
  href: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  value: string | number;
  sub: string;
};

export function KpiCard({ href, icon: Icon, label, value, sub }: KpiCardProps) {
  return (
    <Link
      href={href}
      className="hover-lift block border p-5"
      style={{
        borderColor: 'color-mix(in srgb, var(--brand-primary) 18%, transparent)',
        borderRadius: 'var(--brand-radius)',
        backgroundColor: 'color-mix(in srgb, var(--brand-primary) 3%, var(--brand-bg))',
        boxShadow: 'var(--elev-1)',
      }}
    >
      <div className="mb-3 flex items-center gap-2">
        <Icon
          className="h-4 w-4"
          strokeWidth={2.2}
          style={{ color: 'var(--brand-primary)' }}
        />
        <span className="t-caption" style={{ color: 'var(--brand-primary)' }}>
          {label}
        </span>
      </div>
      <p
        className="t-tabular text-3xl font-semibold leading-none"
        style={{ color: 'var(--brand-text)', fontFamily: 'var(--brand-font-heading)' }}
      >
        {value}
      </p>
      <p
        className="t-small mt-2"
        style={{ color: 'color-mix(in srgb, var(--brand-text) 55%, transparent)' }}
      >
        {sub}
      </p>
    </Link>
  );
}
