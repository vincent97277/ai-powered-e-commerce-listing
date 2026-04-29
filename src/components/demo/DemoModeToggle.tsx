'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';
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

// 估算「真實成本」(GPT-4o vision + text generation)
// vision: ~1100 input tokens (image), text out: ~600 tokens
// 4o input $2.5/M, output $10/M → 2.5 * 1100 / 1e6 + 10 * 600 / 1e6 ≈ $0.00875
// 用台幣 32 匯率 ≈ NT$ 0.28，hackathon 可以說「跑一張 < NT$ 0.3」
const REAL_COST_USD = 0.00275 + 0.006; // = 0.00875
const REAL_COST_TWD = (REAL_COST_USD * 32).toFixed(2);

export function DemoModeToggle() {
  const { mode, toggle } = useDemoMode();
  const [emoji, setEmoji] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const tapCount = useRef(0);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sawHint = useRef(false);

  const handleClick = () => {
    // 5 連點彩蛋 A
    tapCount.current += 1;
    if (tapTimer.current) clearTimeout(tapTimer.current);
    tapTimer.current = setTimeout(() => {
      tapCount.current = 0;
    }, 1200);
    if (tapCount.current >= 5) {
      tapCount.current = 0;
      setShowSecret(true);
      return; // 不切 mode
    }

    toggle();
    setShake(true);
    setTimeout(() => setShake(false), 320);
    const next: DemoMode = mode === 'on' ? 'off' : 'on';
    setEmoji(next === 'off' ? '👻' : '🎭');
    setTimeout(() => setEmoji(null), 900);

    // 第一次按出現 hint toast (Easter-egg-y)
    if (!sawHint.current && typeof window !== 'undefined') {
      const k = 'whimsy-demo-hint';
      if (!localStorage.getItem(k)) {
        localStorage.setItem(k, '1');
        toast('Demo Mode 是 hackathon 的安全網。喔你發現了。', {
          icon: '🎭',
          duration: 3500,
        });
      }
      sawHint.current = true;
    }
  };

  return (
    <>
      <div className="fixed bottom-4 right-4 z-50">
        <motion.div
          animate={shake ? { x: [-2, 2, -2, 2, 0] } : { x: 0 }}
          transition={{ duration: 0.32 }}
          className="relative"
        >
          <Button
            onClick={handleClick}
            size="sm"
            variant={mode === 'on' ? 'default' : 'outline'}
            className="shadow-lg"
            style={{
              backgroundColor: mode === 'on' ? 'var(--brand-primary)' : 'transparent',
              borderRadius: 'var(--brand-radius)',
            }}
          >
            Demo Mode: {mode.toUpperCase()}
          </Button>
          <AnimatePresence>
            {emoji && (
              <motion.span
                key={emoji + Date.now()}
                className="whimsy-emoji-float"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                aria-hidden
              >
                {emoji}
              </motion.span>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* 彩蛋 A: 真實成本 secret panel */}
      <AnimatePresence>
        {showSecret && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-sm"
            onClick={() => setShowSecret(false)}
          >
            <motion.div
              initial={{ scale: 0.85, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 26 }}
              onClick={(e) => e.stopPropagation()}
              className="max-w-md space-y-3 p-8 text-center"
              style={{
                backgroundColor: 'var(--brand-bg)',
                color: 'var(--brand-text)',
                borderRadius: 'calc(var(--brand-radius) * 4)',
                border: '1px solid var(--brand-primary)',
                boxShadow: 'var(--elev-3)',
              }}
            >
              <p className="text-xs uppercase tracking-widest opacity-60">
                You found a secret
              </p>
              <h3
                className="text-2xl"
                style={{ fontFamily: 'var(--brand-font-heading)' }}
              >
                跑一張商品的真實成本
              </h3>
              <p
                className="text-5xl font-bold"
                style={{ color: 'var(--brand-primary)' }}
              >
                NT$ {REAL_COST_TWD}
              </p>
              <p className="text-sm opacity-70">
                GPT-4o vision (~1.1k tokens) + text gen (~600 tokens)
                <br />
                ≈ ${REAL_COST_USD.toFixed(4)} USD per product
              </p>
              <button
                onClick={() => setShowSecret(false)}
                className="mt-4 text-xs underline opacity-60 hover:opacity-100"
              >
                關掉 (按 ESC 也行)
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
