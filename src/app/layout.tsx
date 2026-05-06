import type { Metadata } from 'next';
import './globals.css';
import { Geist, Noto_Serif_TC, Noto_Sans_TC } from 'next/font/google';
import { cn } from '@/lib/utils';
import { AnalyticsClient } from '@/components/observability/AnalyticsClient';
import { Toaster } from 'sonner';

const geist = Geist({ subsets: ['latin'], variable: '--font-sans' });

const notoSerif = Noto_Serif_TC({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-noto-serif-tc',
  display: 'swap',
  preload: true,
});

const notoSans = Noto_Sans_TC({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-noto-sans-tc',
  display: 'swap',
  preload: true,
});

export const metadata: Metadata = {
  title: 'Catalogify — AI 商品上架機器',
  description:
    '商家拍 1 張照片，AI 60 秒生 7 件事 (標題 / 描述 / SEO / 去背 / 變體 / 定價 / 蝦皮)',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="zh-Hant"
      className={cn('font-sans', geist.variable, notoSerif.variable, notoSans.variable)}
    >
      <body>
        {children}
        <AnalyticsClient />
        <Toaster
          position="top-right"
          richColors
          closeButton
          toastOptions={{
            style: {
              fontFamily: 'var(--brand-font-heading), system-ui, sans-serif',
              borderRadius: 'var(--brand-radius)',
            },
          }}
        />
      </body>
    </html>
  );
}
