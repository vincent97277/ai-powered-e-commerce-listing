/**
 * /onboarding/pending — 商家註冊送出後的等待頁 (V1.7 D1)
 *
 * 為什麼有這頁:
 *   V1.7 D1 把「自助註冊」改成「先送出, 等 admin approve」, 不再立刻 set cookie 進後台.
 *   送出後 server action redirect 到這頁, 顯示「審核中」訊息.
 *   也是 honeypot fake-success 的 fallback message page (見 onboarding form 的 pendingFake).
 *
 * 純 server component, 沒任何 cookie / DB query — 只是個靜態說明頁.
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
