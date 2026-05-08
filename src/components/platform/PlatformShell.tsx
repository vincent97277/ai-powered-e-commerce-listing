/**
 * PlatformShell — Linear-tone wrapper for platform-level surfaces (V1 #47, RA5)
 *
 * Usage: wrap pages that don't inherit merchant branding — admin / platform homepage /
 *        about / privacy / terms.
 * Mechanism: className="platform" → globals.css `.platform { ... }` swaps brand vars
 *            for the Linear-tone palette (see #48 globals.css change).
 *
 * Not added at root layout because Next.js doesn't allow multiple root layouts to modify
 * <html>; instead apply className at layout / page wrapper level (CSS vars cascade through).
 *
 * Server component, no client interaction.
 */
import type { ReactNode } from 'react';

export function PlatformShell({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`platform ${className}`.trim()}>{children}</div>;
}
