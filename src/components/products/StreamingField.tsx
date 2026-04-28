'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';

type Mode = 'text' | 'tags' | 'variants';

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
  return (
    <div className="space-y-2">
      <p className="text-xs uppercase tracking-wider opacity-60">{label}</p>
      {loading || value === null ? (
        <Skeleton className="h-6 w-full" />
      ) : mode === 'text' ? (
        <p className="leading-relaxed" style={{ color: 'var(--brand-text)', fontFamily: 'var(--brand-font-heading)' }}>
          {(value as string).slice(0, typewriter ?? (value as string).length)}
          {typewriter !== undefined && typewriter < (value as string).length && (
            <motion.span
              animate={{ opacity: [1, 0] }}
              transition={{ duration: 0.6, repeat: Infinity }}
              className="ml-0.5 inline-block h-[1em] w-[2px] align-middle"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            />
          )}
        </p>
      ) : mode === 'tags' ? (
        <div className="flex flex-wrap gap-2">
          <AnimatePresence>
            {(value as string[]).slice(0, visibleCount).map((t, i) => (
              <motion.div
                key={t + i}
                initial={{ opacity: 0, scale: 0.5, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              >
                <Badge variant="secondary" style={{
                  backgroundColor: 'var(--brand-primary)' + '20',
                  color: 'var(--brand-primary)',
                  borderRadius: 'var(--brand-radius)',
                }}>
                  #{t}
                </Badge>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      ) : (
        <div className="space-y-1">
          <AnimatePresence>
            {(value as string[]).slice(0, visibleCount).map((v, i) => (
              <motion.div
                key={v + i}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.08 }}
                className="flex items-center justify-between border-b py-2 text-sm"
                style={{ borderColor: 'var(--brand-primary)' + '20' }}
              >
                <span>{v}</span>
                <span className="opacity-50">—</span>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
