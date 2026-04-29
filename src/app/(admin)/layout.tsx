/**
 * (admin) route group layout — wraps every /admin/* page with PlatformShell
 * (V1 #49, RA5)
 */
import type { ReactNode } from 'react';
import { PlatformShell } from '@/components/platform/PlatformShell';

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <PlatformShell className="min-h-screen">{children}</PlatformShell>;
}
