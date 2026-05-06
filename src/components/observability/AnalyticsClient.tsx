'use client';

/**
 * Client-side wrapper for Vercel Analytics. The root layout is a server
 * component and cannot pass a function prop (`beforeSend`) across the
 * server→client boundary — Next.js App Router refuses to serialize
 * functions. Wrapping in a client component lets the function be imported
 * and bound on the client side.
 */
import { Analytics } from '@vercel/analytics/next';
import { analyticsBeforeSend } from '@/lib/observability/analytics-filter';

export function AnalyticsClient() {
  return <Analytics beforeSend={analyticsBeforeSend} />;
}
