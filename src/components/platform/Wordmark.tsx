/**
 * Wordmark — Catalogify ownable brand mark (V1.9 T2)
 *
 * Replaces the rotated zinc-square placeholder used in 3 spots (homepage hero
 * kicker, legal page header, footer). Pairs an Inter 700 wordmark with a
 * stacked-rectangle glyph representing market stalls — primary stall in persimmon
 * (--platform-accent), shadow stall in --brand-text @ 18% opacity.
 *
 * Usage:
 *   <Wordmark size="md" />            // hero / header (default)
 *   <Wordmark size="sm" />            // footer / inline
 *   <Wordmark size="lg" />            // splash / og card
 *   <Wordmark showGlyph={false} />    // text-only when glyph would clash
 */
type Props = {
  size?: 'sm' | 'md' | 'lg';
  showGlyph?: boolean;
  className?: string;
};

export function Wordmark({ size = 'md', showGlyph = true, className = '' }: Props) {
  const fontSize = size === 'lg' ? 'text-2xl' : size === 'md' ? 'text-base' : 'text-sm';
  const glyphSize =
    size === 'lg'
      ? { w: 14, h: 18 }
      : size === 'md'
      ? { w: 10, h: 14 }
      : { w: 8, h: 11 };

  return (
    <span className={`inline-flex items-center gap-2 ${className}`.trim()}>
      {showGlyph && (
        <span
          className="relative inline-block"
          style={{ width: glyphSize.w + 3, height: glyphSize.h + 3 }}
          aria-hidden="true"
        >
          {/* Shadow rect (offset to lower-right) */}
          <span
            className="absolute"
            style={{
              right: 0,
              bottom: 0,
              width: glyphSize.w,
              height: glyphSize.h,
              backgroundColor: 'var(--brand-text)',
              opacity: 0.18,
            }}
          />
          {/* Primary rect (persimmon) */}
          <span
            className="absolute"
            style={{
              left: 0,
              top: 0,
              width: glyphSize.w,
              height: glyphSize.h,
              backgroundColor: 'var(--platform-accent)',
            }}
          />
        </span>
      )}
      <span
        className={`${fontSize} font-bold tracking-tight`}
        style={{ color: 'var(--brand-text)', letterSpacing: '-0.03em' }}
      >
        Catalogify
      </span>
    </span>
  );
}
