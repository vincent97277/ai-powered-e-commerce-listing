'use client';

import { useRef, useState } from 'react';
import { UploadDropzone } from '@/components/products/UploadDropzone';
import { BrandVoiceSelect } from '@/components/products/BrandVoiceSelect';
import { GenerationStream, type GenerationStreamHandle } from '@/components/products/GenerationStream';
import { Button } from '@/components/ui/button';
import type { BrandVoice } from '@/lib/types';

export default function NewProductPage() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [voice, setVoice] = useState<BrandVoice>('minimal');
  const [started, setStarted] = useState(false);
  const streamRef = useRef<GenerationStreamHandle>(null);

  const handleGenerate = async () => {
    setStarted(true);
    await streamRef.current?.kickoff(file);
  };

  return (
    <main className="min-h-screen px-12 py-8" style={{ backgroundColor: 'var(--brand-bg)', color: 'var(--brand-text)' }}>
      <h1 className="mb-8 text-4xl" style={{ fontFamily: 'var(--brand-font-heading)' }}>
        新增商品
      </h1>

      {!started ? (
        <div className="grid grid-cols-2 gap-8">
          <UploadDropzone onFile={(f, url) => { setFile(f); setPreviewUrl(url); }} />
          <div className="space-y-6">
            <BrandVoiceSelect value={voice} onChange={setVoice} />
            <Button size="lg" onClick={handleGenerate} disabled={!file} className="w-full"
              style={{ backgroundColor: 'var(--brand-primary)', borderRadius: 'var(--brand-radius)' }}>
              開始 AI 生成 →
            </Button>
          </div>
        </div>
      ) : (
        <GenerationStream ref={streamRef} previewUrl={previewUrl} />
      )}
    </main>
  );
}
