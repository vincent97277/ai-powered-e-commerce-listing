'use client';

import { useCallback, useState } from 'react';
import { Card } from '@/components/ui/card';

export function UploadDropzone({ onFile }: { onFile: (file: File, previewUrl: string) => void }) {
  const [hover, setHover] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  const handleFile = useCallback((file: File) => {
    const url = URL.createObjectURL(file);
    setPreview(url);
    onFile(file, url);
  }, [onFile]);

  return (
    <Card
      onDragOver={(e) => { e.preventDefault(); setHover(true); }}
      onDragLeave={() => setHover(false)}
      onDrop={(e) => {
        e.preventDefault(); setHover(false);
        const f = e.dataTransfer.files[0];
        if (f) handleFile(f);
      }}
      className="relative aspect-square w-full cursor-pointer overflow-hidden border-2 border-dashed transition-all"
      style={{
        borderColor: hover ? 'var(--brand-primary)' : 'var(--brand-primary)' + '40',
        backgroundColor: 'var(--brand-bg)',
        borderRadius: 'var(--brand-radius)',
      }}
    >
      <input type="file" accept="image/*" className="absolute inset-0 cursor-pointer opacity-0"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="預覽" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
          <span className="text-5xl">📷</span>
          <p style={{ color: 'var(--brand-text)', fontFamily: 'var(--brand-font-heading)' }} className="text-lg">
            拖曳商品照片到這裡
          </p>
          <p className="text-xs opacity-60">或點擊上傳・JPG/PNG/WebP</p>
        </div>
      )}
    </Card>
  );
}
