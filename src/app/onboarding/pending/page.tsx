/**
 * /onboarding/pending — waiting page after a merchant submits the signup (V1.7 D1)
 *
 * Why this page exists:
 *   V1.7 D1 changed "self-signup" to "submit first, wait for admin approval"; it no longer sets a
 *   cookie and lands the user in the backend immediately. After submit, the server action redirects
 *   here and shows the "under review" message.
 *   Also serves as the fallback message page for the honeypot fake-success path (see pendingFake in
 *   the onboarding form).
 *
 * Pure server component, no cookie / DB query — just a static info page.
 */
import Link from 'next/link';
import { Clock } from 'lucide-react';
import { EmptyState } from '@/components/feedback/EmptyState';

export const dynamic = 'force-static';

export default function OnboardingPendingPage() {
  return (
    <main
      className="relative min-h-screen overflow-hidden"
      style={{ backgroundColor: 'var(--brand-bg)', color: 'var(--brand-text)' }}
    >
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-6 py-16">
        <EmptyState
          icon={Clock}
          title="商家註冊已送出, 等待 admin 審核"
          body="V1 階段所有新商家由平台 admin 人工核可後才能進後台 / 上架商品 / 對外營業. 通常 1 個工作天內處理完畢. 你不需要重新註冊, 也不會 email 通知 (V1 沒上 email infra) — 過幾小時回來再點下方連結看看."
          primaryCTA={{ label: '回平台首頁', href: '/' }}
          secondaryCTA={{ label: '逛逛阿明選物', href: '/store/akami' }}
          scope="section"
        />
        <p className="mt-8 text-center text-xs opacity-50">
          已經被審核過? 直接到{' '}
          <Link href="/onboarding" className="underline" style={{ color: 'var(--brand-primary)' }}>
            註冊頁
          </Link>{' '}
          重新填一次也可以 (rate limit 24h 1 次).
        </p>
      </div>
    </main>
  );
}
