'use client';

import { useCallback, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { ImagePlus, Upload } from 'lucide-react';

type FloatPlus = { id: number; x: number; y: number };

export function UploadDropzone({
  onFile,
}: {
  onFile: (file: File, previewUrl: string) => void;
}) {
  const [hover, setHover] = useState(false);
  const [wobble, setWobble] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [floats, setFloats] = useState<FloatPlus[]>([]);
  const idRef = useRef(0);

  const handleFile = useCallback(
    (file: File) => {
      const url = URL.createObjectURL(file);
      setPreview(url);
      onFile(file, url);
    },
    [onFile]
  );

  // 點擊上傳鍵時，附近浮現 +1
  const spawnFloat = (e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const id = ++idRef.current;
    setFloats((f) => [...f, { id, x, y }]);
    setTimeout(() => setFloats((f) => f.filter((p) => p.id !== id)), 900);
  };

  return (
    <motion.div
      // 上傳完成 morph：照片飛入時整個 Card 縮一下再彈回
      animate={preview ? { scale: [1, 0.96, 1] } : {}}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="relative"
    >
      <Card
        onDragOver={(e) => {
          e.preventDefault();
          if (!hover) setHover(true);
        }}
        onDragLeave={() => {
          setHover(false);
          setWobble(true);
          setTimeout(() => setWobble(false), 320);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setHover(false);
          const f = e.dataTransfer.files[0];
          if (f) handleFile(f);
        }}
        onClick={spawnFloat}
        className={`group relative aspect-square w-full cursor-pointer overflow-hidden border-2 border-dashed p-0 ${
          hover ? 'whimsy-breathe' : ''
        } ${wobble ? 'whimsy-wobble' : ''}`}
        style={{
          borderColor: hover
            ? 'var(--brand-primary)'
            : 'color-mix(in srgb, var(--brand-primary) 28%, transparent)',
          backgroundImage: preview
            ? 'none'
            : `radial-gradient(circle at 50% 30%, color-mix(in srgb, var(--brand-primary) 6%, transparent) 0%, transparent 70%), repeating-linear-gradient(45deg, transparent 0 12px, color-mix(in srgb, var(--brand-primary) 3%, transparent) 12px 13px)`,
          backgroundColor: 'var(--brand-bg)',
          borderRadius: 'var(--brand-radius)',
          boxShadow: hover
            ? `0 0 0 4px color-mix(in srgb, var(--brand-primary) 12%, transparent), var(--elev-2)`
            : 'var(--elev-1)',
          transition:
            'box-shadow 200ms cubic-bezier(0.4,0,0.2,1), border-color 200ms cubic-bezier(0.4,0,0.2,1)',
        }}
      >
        <input
          type="file"
          accept="image/*"
          className="absolute inset-0 z-10 cursor-pointer opacity-0"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />

        <AnimatePresence mode="wait">
          {preview ? (
            <motion.img
              key="preview"
              src={preview}
              alt="預覽"
              initial={{ scale: 1.08, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 220, damping: 24 }}
              className="h-full w-full object-cover"
            />
          ) : (
            <motion.div
              key="placeholder"
              initial={{ opacity: 1 }}
              exit={{ opacity: 0, scale: 0.92 }}
              transition={{ duration: 0.25 }}
              className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center"
            >
              {/* Icon container with circle bg + hover wiggle */}
              <motion.div
                animate={
                  hover
                    ? { y: [-2, 2, -2], rotate: [-2, 2, -2] }
                    : { y: 0, rotate: 0 }
                }
                transition={{ duration: 1.2, repeat: hover ? Infinity : 0 }}
                className="relative flex h-20 w-20 items-center justify-center transition-transform group-hover:scale-110"
                style={{
                  borderRadius: 'var(--brand-radius)',
                  backgroundColor:
                    'color-mix(in srgb, var(--brand-primary) 10%, transparent)',
                  border:
                    '1px solid color-mix(in srgb, var(--brand-primary) 22%, transparent)',
                }}
              >
                <ImagePlus
                  className="h-9 w-9"
                  strokeWidth={1.6}
                  style={{ color: 'var(--brand-primary)' }}
                />
                <span
                  className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center"
                  style={{
                    borderRadius: 'var(--brand-radius)',
                    backgroundColor: 'var(--brand-primary)',
                    color: 'var(--brand-bg)',
                    boxShadow: 'var(--elev-2)',
                  }}
                >
                  <Upload className="h-3.5 w-3.5" strokeWidth={2.4} />
                </span>
              </motion.div>

              <div className="space-y-1.5">
                <p
                  className="t-h3"
                  style={{
                    color: 'var(--brand-text)',
                    fontFamily: 'var(--brand-font-heading)',
                  }}
                >
                  {hover ? '放手就送進 AI' : '拖曳商品照片到這裡'}
                </p>
                <p
                  className="t-small"
                  style={{
                    color:
                      'color-mix(in srgb, var(--brand-text) 60%, transparent)',
                  }}
                >
                  或點擊上傳 · JPG / PNG / WebP
                </p>
                <p className="t-caption pt-2 opacity-0">{''}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* +1 浮動符號 (點擊回饋) */}
        <AnimatePresence>
          {floats.map((f) => (
            <motion.span
              key={f.id}
              initial={{ opacity: 0, y: 0, scale: 0.6 }}
              animate={{ opacity: [0, 1, 0], y: -40, scale: 1.1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
              className="pointer-events-none absolute z-20 select-none text-sm font-semibold"
              style={{
                left: f.x,
                top: f.y,
                color: 'var(--brand-primary)',
              }}
            >
              +1
            </motion.span>
          ))}
        </AnimatePresence>
      </Card>
    </motion.div>
  );
}
