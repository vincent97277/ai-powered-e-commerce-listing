import { cookies } from 'next/headers';
import { ThemeProvider } from '@/components/theme/ThemeProvider';
import { MerchantSwitcher } from '@/components/theme/MerchantSwitcher';
import { DemoModeToggle } from '@/components/demo/DemoModeToggle';
import { RainbowLogo } from '@/components/demo/RainbowLogo';
import type { MerchantId } from '@/lib/themes';

export default async function MerchantLayout({ children }: { children: React.ReactNode }) {
  const c = await cookies();
  const merchantId = (c.get('demo-merchant-id')?.value ?? 'akami') as MerchantId;
  return (
    <ThemeProvider initialMerchantId={merchantId}>
      <header className="flex items-center justify-between border-b px-12 py-4"
        style={{ backgroundColor: 'var(--brand-bg)', borderColor: 'var(--brand-primary)' + '20' }}>
        <RainbowLogo>
          <div style={{ fontFamily: 'var(--brand-font-heading)', color: 'var(--brand-primary)' }} className="text-xl">
            Catalogify
          </div>
        </RainbowLogo>
        <MerchantSwitcher />
      </header>
      {children}
      <DemoModeToggle />
    </ThemeProvider>
  );
}
