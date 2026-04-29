'use client';

/**
 * PrintTrigger — 找 page.tsx 上 [data-print-trigger] 按鈕, 接 window.print()
 * (page.tsx 是 server component, 不能直接 onClick → 用 ref 從這個 client island 啟動)
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
