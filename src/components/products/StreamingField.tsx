'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';

type Mode = 'text' | 'tags' | 'variants';

/**
 * Whimsy: 偵測「完成瞬間」(typewriter 抵達 length / visibleCount 抵達 list 長度)
 * 一秒只能慶祝一次，避免被父層 re-render 連發。
 */
function useJustCompleted(
  value: string | string[] | null,
  mode: Mode,
  typewriter?: number,
  visibleCount?: number
) {
  const [celebrate, setCelebrate] = useState(false);
  const wasComplete = useRef(false);

  useEffect(() => {
    if (value === null) {
      wasComplete.current = false;
      return;
    }
    let isComplete = false;
    if (mode === 'text' && typewriter !== undefined) {
      isComplete =
        typewriter >= (value as string).length && (value as string).length > 0;
    } else if (mode === 'tags' || mode === 'variants') {
      const arr = value as string[];
      isComplete = (visibleCount ?? 0) >= arr.length && arr.length > 0;
    }
    if (isComplete && !wasComplete.current) {
      wasComplete.current = true;
      setCelebrate(true);
      const t = setTimeout(() => setCelebrate(false), 720);
      return () => clearTimeout(t);
    }
  }, [value, mode, typewriter, visibleCount]);

  return celebrate;
}

export function StreamingField({
  label, mode, value, visibleCount = 0, loading, typewriter,
}: {
  label: string;
  mode: Mode;
  value: string | string[] | null;
  visibleCount?: number;
  loading: boolean;
  typewriter?: number;
}) {
  const justDone = useJustCompleted(value, mode, typewriter, visibleCount);
  const isStreaming =
    mode === 'text' &&
    typewriter !== undefined &&
    value !== null &&
    typewriter < (value as string).length;

  return (
    <div className={`relative space-y-2.5 ${justDone ? 'whimsy-flash' : ''}`}>
      <div className="flex items-center gap-2">
        <p
          className="t-caption"
          style={{
            color: 'color-mix(in srgb, var(--brand-primary) 70%, var(--brand-text))',
          }}
        >
          {label}
        </p>
        {/* 完成 checkmark — spring，重量感比文字勾勾好 */}
        <AnimatePresence>
          {justDone && (
            <motion.span
              key="checkmark"
              initial={{ scale: 0, rotate: -90, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 18 }}
              className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold"
              style={{
                backgroundColor: 'var(--brand-primary)',
                color: 'var(--brand-bg)',
              }}
              aria-hidden
            >
              ✓
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {loading || value === null ? (
        <div
          className="skeleton-shimmer h-6 w-full"
          style={{ borderRadius: 'var(--brand-radius)' }}
        />
      ) : mode === 'text' ? (
        <p
          className={`relative leading-relaxed ${justDone ? 'whimsy-sparkle' : ''}`}
          style={{
            color: 'var(--brand-text)',
            fontFamily: 'var(--brand-font-heading)',
            fontSize: 'var(--fs-body)',
            lineHeight: 'var(--lh-loose)',
          }}
        >
          {(value as string).slice(0, typewriter ?? (value as string).length)}
          {isStreaming && (
            <span className="streaming-cursor whimsy-cursor" aria-hidden />
          )}
        </p>
      ) : mode === 'tags' ? (
        <div className={`relative flex flex-wrap gap-2 ${justDone ? 'whimsy-sparkle' : ''}`}>
          <AnimatePresence>
            {(value as string[]).slice(0, visibleCount).map((t, i) => {
              const isLatest = i === visibleCount - 1;
              return (
                <motion.div
                  key={t + i}
                  initial={{ opacity: 0, scale: 0.5, y: 8 }}
                  animate={{
                    opacity: 1,
                    scale: isLatest ? [0.5, 1.18, 1] : 1,
                    y: 0,
                  }}
                  whileHover={{ y: -2 }}
                  transition={{ type: 'spring', stiffness: 320, damping: 18 }}
                >
                  <Badge
                    variant="secondary"
                    className="cursor-default border px-2.5 py-1 text-xs font-medium"
                    style={{
                      backgroundColor:
                        'color-mix(in srgb, var(--brand-primary) 12%, transparent)',
                      borderColor:
                        'color-mix(in srgb, var(--brand-primary) 22%, transparent)',
                      color: 'var(--brand-primary)',
                      borderRadius: 'var(--brand-radius)',
                      boxShadow:
                        '0 1px 2px color-mix(in srgb, var(--brand-primary) 8%, transparent)',
                    }}
                  >
                    #{t}
                  </Badge>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      ) : (
        <div className={`relative space-y-0 ${justDone ? 'whimsy-sparkle' : ''}`}>
          <AnimatePresence>
            {(value as string[]).slice(0, visibleCount).map((v, i) => {
              const isLatest = i === visibleCount - 1;
              return (
                <motion.div
                  key={v + i}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{
                    opacity: 1,
                    x: 0,
                    backgroundColor: isLatest
                      ? [
                          'rgba(0,0,0,0)',
                          'color-mix(in srgb, var(--brand-primary) 14%, transparent)',
                          'rgba(0,0,0,0)',
                        ]
                      : 'rgba(0,0,0,0)',
                  }}
                  whileHover={{
                    backgroundColor:
                      'color-mix(in srgb, var(--brand-primary) 6%, transparent)',
                  }}
                  transition={{ delay: i * 0.04, duration: 0.55 }}
                  className="group flex items-center justify-between border-b px-3 py-2.5 text-sm"
                  style={{
                    borderColor:
                      'color-mix(in srgb, var(--brand-primary) 14%, transparent)',
                    borderRadius: 'var(--brand-radius)',
                  }}
                >
                  <span className="flex items-center gap-2.5">
                    <span
                      className="inline-block h-1.5 w-1.5 transition-transform group-hover:scale-150"
                      style={{
                        borderRadius: 'var(--brand-radius)',
                        backgroundColor: 'var(--brand-primary)',
                        opacity: 0.6,
                      }}
                    />
                    <span style={{ color: 'var(--brand-text)' }}>{v}</span>
                  </span>
                  <span
                    className="t-caption"
                    style={{ letterSpacing: '0.05em', opacity: 0.5 }}
                  >
                    選項 {i + 1}
                  </span>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
