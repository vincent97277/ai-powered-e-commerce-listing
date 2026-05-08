'use client';

/**
 * PrintTrigger — finds [data-print-trigger] buttons on page.tsx and wires them to window.print()
 * (page.tsx is a server component and can't onClick directly → trigger via this client island)
 */
import { useEffect } from 'react';

export function PrintTrigger() {
  useEffect(() => {
    const handler = () => window.print();
    const buttons = document.querySelectorAll<HTMLButtonElement>('[data-print-trigger]');
    buttons.forEach((b) => b.addEventListener('click', handler));
    return () => {
      buttons.forEach((b) => b.removeEventListener('click', handler));
    };
  }, []);
  return null;
}
