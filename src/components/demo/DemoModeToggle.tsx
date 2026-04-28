'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

export type DemoMode = 'on' | 'off';

export function useDemoMode() {
  const [mode, setMode] = useState<DemoMode>('on');
  useEffect(() => {
    const stored = (localStorage.getItem('demoMode') as DemoMode | null) ?? 'on';
    setMode(stored);
  }, []);
  const toggle = () => {
    const next: DemoMode = mode === 'on' ? 'off' : 'on';
    localStorage.setItem('demoMode', next);
    setMode(next);
  };
  return { mode, toggle };
}

export function DemoModeToggle() {
  const { mode, toggle } = useDemoMode();
  return (
    <Button
      onClick={toggle}
      size="sm"
      variant={mode === 'on' ? 'default' : 'outline'}
      className="fixed bottom-4 right-4 z-50 shadow-lg"
      style={{
        backgroundColor: mode === 'on' ? 'var(--brand-primary)' : 'transparent',
        borderRadius: 'var(--brand-radius)',
      }}
    >
      Demo Mode: {mode.toUpperCase()}
    </Button>
  );
}
