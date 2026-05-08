'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { UploadDropzone } from '@/components/products/UploadDropzone';
import { GenerationStream, type GenerationStreamHandle } from '@/components/products/GenerationStream';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';

export default function NewProductPage() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const streamRef = useRef<GenerationStreamHandle>(null);
  const kickedOff = useRef(false);

  // Fix race condition: setStarted and ref attach happen on different ticks.
  // Use useEffect to wait until GenerationStream mounts (ref available) before calling kickoff
  useEffect(() => {
    if (started && !kickedOff.current && streamRef.current) {
      kickedOff.current = true;
      streamRef.current.kickoff(file);
    }
  }, [started, file]);

  const handleGenerate = () => {
    kickedOff.current = false;
    setStarted(true);
  };

  return (
    <main
      className="min-h-screen px-12 py-10"
      style={{ backgroundColor: 'var(--brand-bg)', color: 'var(--brand-text)' }}
    >
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mb-10 max-w-3xl"
      >
        <h1 className="t-h1" style={{ fontFamily: 'var(--brand-font-heading)' }}>
          來，把商品交給 AI
        </h1>
        <p
          className="t-body mt-3"
          style={{ color: 'color-mix(in srgb, var(--brand-text) 65%, transparent)' }}
        >
          60 秒後你會拿到：標題、描述、SEO、變體、定價建議、還有可以直接丟蝦皮的 CSV。
        </p>
      </motion.div>

      {!started ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.5 }}
          className="grid grid-cols-1 gap-10 lg:grid-cols-2"
        >
          <UploadDropzone
            onFile={(f, url) => {
              setFile(f);
              setPreviewUrl(url);
            }}
          />
          <div className="space-y-6">
            <p className="t-caption opacity-60">
              使用品牌語氣設定 ·{' '}
              <a
                href="/merchant/settings"
                className="underline"
                style={{ color: 'var(--brand-primary)' }}
              >
                去調整
              </a>
            </p>
            <Button
              size="lg"
              onClick={handleGenerate}
              disabled={!file}
              className="hover-lift group inline-flex w-full items-center justify-center gap-2 py-6 text-base font-semibold elev-2"
              style={{
                backgroundColor: 'var(--brand-primary)',
                color: 'var(--brand-bg)',
                borderRadius: 'var(--brand-radius)',
                fontFamily: 'var(--brand-font-heading)',
              }}
            >
              開始上架，60 秒後見
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" strokeWidth={2} />
            </Button>
            <p className="t-caption" style={{ color: 'color-mix(in srgb, var(--brand-text) 50%, transparent)' }}>
              · 預覽模式啟用時, 走範例資料不消耗 AI 額度 (右下角切換)
            </p>
          </div>
        </motion.div>
      ) : (
        <GenerationStream ref={streamRef} previewUrl={previewUrl} />
      )}
    </main>
  );
}
