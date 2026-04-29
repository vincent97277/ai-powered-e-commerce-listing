'use client';

import { Button } from '@/components/ui/button';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export function RegenerateButton({ productId }: { productId: string }) {
  const [pending, start] = useTransition();
  const [spin, setSpin] = useState(false);
  const [hover, setHover] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [ripple, setRipple] = useState(false);
  const router = useRouter();

  const handle = () => {
    setSpin(true);
    start(async () => {
      void productId;
      await new Promise((r) => setTimeout(r, 800));
      router.refresh();
      setSpin(false);
      setRipple(true);
      setTimeout(() => setRipple(false), 720);
    });
  };

  // hover slow spin / click fast spin / pressed: 凹陷 1px (translateY)
  const iconAnimate = pending || spin
    ? { rotate: 360 }
    : hover
      ? { rotate: 360 }
      : { rotate: 0 };
  const iconTransition = pending || spin
    ? { duration: 0.6, repeat: Infinity, ease: 'linear' as const }
    : hover
      ? { duration: 2.4, repeat: Infinity, ease: 'linear' as const }
      : { duration: 0.4 };

  return (
    <motion.div
      className="relative inline-block"
      animate={pressed ? { y: 1 } : { y: 0 }}
      transition={{ duration: 0.08 }}
    >
      <Button
        variant="outline"
        onClick={handle}
        disabled={pending}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => { setHover(false); setPressed(false); }}
        onMouseDown={() => setPressed(true)}
        onMouseUp={() => setPressed(false)}
        style={{
          borderColor: 'var(--brand-primary)',
          color: 'var(--brand-primary)',
          borderRadius: 'var(--brand-radius)',
        }}
      >
        <motion.span animate={iconAnimate} transition={iconTransition} className="inline-block">
          <RefreshCw className="h-4 w-4" strokeWidth={2.2} />
        </motion.span>
        <span className="ml-2">用此風格重新生成</span>
      </Button>
      <AnimatePresence>
        {ripple && <span key="ripple" className="whimsy-ripple" aria-hidden />}
      </AnimatePresence>
    </motion.div>
  );
}
