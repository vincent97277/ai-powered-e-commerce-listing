'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { TrendingUp, ShieldCheck, AlertTriangle, HandHeart } from 'lucide-react';

// Whimsy: 4 confidence tiers + different breathing rhythms (defined in globals.css whimsy-conf-*)
const TOKEN_INPUT = 1100;
const TOKEN_OUTPUT = 600;
const COST_USD = (TOKEN_INPUT * 2.5 + TOKEN_OUTPUT * 10) / 1_000_000;

export function PriceCard({ min, max, confidence }: { min: number; max: number; confidence: number }) {
  const mid = Math.round((min + max) / 2);
  const [showTokens, setShowTokens] = useState(false);

  // Confidence: 4 tiers (with emoji + breathing rhythm)
  const tier =
    confidence >= 0.85 ? 'high' :
    confidence >= 0.6  ? 'mid'  :
    confidence >= 0.3  ? 'low'  : 'fail';

  const tierColor = {
    high: 'var(--success)',
    mid:  'var(--warning)',
    low:  'var(--error)',
    fail: 'var(--error)',
  }[tier];

  const tierLabel = {
    high: 'AI 很有把握',
    mid:  'AI 算有把握',
    low:  'AI 不太確定',
    fail: 'AI 投降',
  }[tier];

  const tierBreath = {
    high: 'whimsy-conf-high',
    mid:  'whimsy-conf-mid',
    low:  'whimsy-conf-low',
    fail: 'whimsy-conf-fail',
  }[tier];

  const TierIcon =
    tier === 'high' ? ShieldCheck :
    tier === 'mid'  ? TrendingUp :
    tier === 'low'  ? AlertTriangle : HandHeart;

  return (
    <Card
      className="relative space-y-5 overflow-hidden border p-6"
      style={{
        borderRadius: 'var(--brand-radius)',
        borderColor: 'color-mix(in srgb, var(--brand-primary) 22%, transparent)',
        backgroundColor: 'color-mix(in srgb, var(--brand-primary) 3%, var(--brand-bg))',
        boxShadow: 'var(--elev-1)',
      }}
    >
      {/* Corner decoration */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 opacity-20"
        style={{
          background:
            'radial-gradient(circle, var(--brand-primary) 0%, transparent 70%)',
        }}
      />

      <div className="relative flex items-center justify-between">
        <h2 className="t-caption" style={{ color: 'var(--brand-primary)' }}>
          建議定價
        </h2>
        {/* Confidence badge — color tiers + breathing rhythm + hover token easter egg B */}
        <div
          className="relative cursor-help select-none"
          onMouseEnter={() => setShowTokens(true)}
          onMouseLeave={() => setShowTokens(false)}
        >
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium tabular-nums ${tierBreath}`}
            style={{
              borderColor: `color-mix(in srgb, ${tierColor} 40%, transparent)`,
              backgroundColor: `color-mix(in srgb, ${tierColor} 12%, transparent)`,
              color: tierColor,
              borderRadius: 'var(--brand-radius)',
            }}
          >
            <TierIcon className="h-3 w-3" strokeWidth={2.2} />
            {tierLabel} {(confidence * 100).toFixed(0)}%
          </span>
          <AnimatePresence>
            {showTokens && (
              <motion.div
                initial={{ opacity: 0, y: 4, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 4, scale: 0.96 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 top-full z-20 mt-2 w-60 space-y-1 p-3 text-xs"
                style={{
                  backgroundColor: 'var(--brand-bg)',
                  color: 'var(--brand-text)',
                  borderRadius: 'var(--brand-radius)',
                  border: '1px solid var(--brand-primary)',
                  boxShadow: 'var(--elev-3)',
                }}
              >
                <p className="font-semibold opacity-80">GPT-4o token 用量</p>
                <p className="font-mono opacity-70">input  {TOKEN_INPUT.toLocaleString()} tok</p>
                <p className="font-mono opacity-70">output {TOKEN_OUTPUT.toLocaleString()} tok</p>
                <p className="pt-1 opacity-60">
                  ≈ ${COST_USD.toFixed(4)} / NT$ {(COST_USD * 32).toFixed(2)} 一張
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Main price area — tabular-nums */}
      <div className="relative space-y-1">
        <p
          className="t-tabular leading-none"
          style={{
            color: 'var(--brand-primary)',
            fontFamily: 'var(--brand-font-heading)',
            fontSize: 'clamp(2rem, 4vw, 2.75rem)',
            fontWeight: 600,
            letterSpacing: '-0.02em',
          }}
        >
          <span className="mr-1 text-base font-normal opacity-60">NT$</span>
          {min.toLocaleString()}
          <span
            className="mx-2 inline-block opacity-40"
            style={{ fontSize: '0.7em', verticalAlign: 'middle' }}
          >
            —
          </span>
          {max.toLocaleString()}
        </p>
      </div>

      {/* Range slider — gradient track + glowing thumb */}
      <div className="relative space-y-2 pt-2">
        <div
          className="relative h-2.5"
          style={{
            backgroundColor:
              'color-mix(in srgb, var(--brand-primary) 12%, transparent)',
            borderRadius: '999px',
            boxShadow:
              'inset 0 1px 2px color-mix(in srgb, var(--brand-primary) 16%, transparent)',
          }}
        >
          {/* Active range with gradient */}
          <div
            className="absolute top-0 h-2.5"
            style={{
              left: '15%',
              width: '70%',
              borderRadius: '999px',
              background: `linear-gradient(90deg,
                color-mix(in srgb, var(--brand-primary) 60%, transparent) 0%,
                var(--brand-primary) 50%,
                color-mix(in srgb, var(--brand-primary) 60%, transparent) 100%)`,
              boxShadow:
                '0 1px 4px color-mix(in srgb, var(--brand-primary) 30%, transparent)',
            }}
          />
          {/* Thumb */}
          <div
            className="absolute top-1/2 h-5 w-5 -translate-y-1/2 cursor-grab"
            style={{
              left: 'calc(50% - 10px)',
              borderRadius: '999px',
              backgroundColor: 'var(--brand-bg)',
              border: '2px solid var(--brand-primary)',
              boxShadow:
                '0 2px 8px color-mix(in srgb, var(--brand-primary) 36%, transparent), 0 0 0 4px color-mix(in srgb, var(--brand-primary) 10%, transparent)',
            }}
          />
        </div>
        <div className="t-tabular flex justify-between text-xs">
          <span style={{ opacity: 0.55 }}>NT$ {min.toLocaleString()}</span>
          <span
            className="font-semibold"
            style={{ color: 'var(--brand-primary)' }}
          >
            建議 NT$ {mid.toLocaleString()}
          </span>
          <span style={{ opacity: 0.55 }}>NT$ {max.toLocaleString()}</span>
        </div>
      </div>
    </Card>
  );
}
