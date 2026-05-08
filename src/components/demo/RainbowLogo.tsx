'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

/**
 * Easter egg C: tap logo 3x (1.2s window) → full-page hue-rotate for 5 seconds
 * Side effect: all brand colors rotate along, playful celebratory vibe
 */
export function RainbowLogo({ children }: { children: React.ReactNode }) {
  const tapCount = useRef(0);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [active, setActive] = useState(false);

  const handleClick = () => {
    tapCount.current += 1;
    if (tapTimer.current) clearTimeout(tapTimer.current);
    tapTimer.current = setTimeout(() => {
      tapCount.current = 0;
    }, 1200);
    if (tapCount.current >= 3) {
      tapCount.current = 0;
      setActive(true);
      toast('🌈 設計師模式 unlocked', {
        description: '連點 logo 3 次。你發現了。5 秒後恢復。',
        duration: 4000,
      });
    }
  };

  useEffect(() => {
    if (!active) return;
    document.documentElement.classList.add('whimsy-rainbow-mode');
    const t = setTimeout(() => {
      document.documentElement.classList.remove('whimsy-rainbow-mode');
      setActive(false);
    }, 5000);
    return () => {
      clearTimeout(t);
      document.documentElement.classList.remove('whimsy-rainbow-mode');
    };
  }, [active]);

  return (
    <span
      onClick={handleClick}
      className="cursor-pointer select-none"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') handleClick();
      }}
    >
      {children}
    </span>
  );
}
