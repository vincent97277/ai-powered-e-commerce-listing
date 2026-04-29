'use client';

import { motion } from 'framer-motion';
import { StreamingField } from './StreamingField';
import { useStreamingPipeline } from '@/hooks/useStreamingPipeline';
import { useDemoMode } from '@/components/demo/DemoModeToggle';
import { useImperativeHandle, forwardRef, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import type { ProductOutput } from '@/lib/types';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

export type GenerationStreamHandle = { kickoff: (file: File | null) => Promise<void> };

export const GenerationStream = forwardRef<GenerationStreamHandle, { previewUrl: string | null }>(
  function GenerationStream({ previewUrl }, ref) {
    const { state, start } = useStreamingPipeline();
    const { mode } = useDemoMode();
    const wrapRef = useRef<HTMLDivElement>(null);
    const celebrated = useRef(false);

    useImperativeHandle(ref, () => ({
      async kickoff() {
        // Hackathon: demo mode 一律 fallback fixture (500ms 假延遲)
        if (mode === 'on') {
          await new Promise((r) => setTimeout(r, 500));
          const res = await fetch('/fixtures/products/teacup.json');
          const data: ProductOutput = await res.json();
          start(data);
          return;
        }
        const res = await fetch('/api/products/generate', { method: 'POST' }).catch(() => null);
        const data: ProductOutput = res
          ? await res.json()
          : await (await fetch('/fixtures/products/teacup.json')).json();
        start(data);
      },
    }));

    // 18s done — bloom + AI 完成 toast (一次性)
    useEffect(() => {
      if (state.done && !celebrated.current) {
        celebrated.current = true;
        wrapRef.current?.classList.add('whimsy-bloom');
        setTimeout(() => wrapRef.current?.classList.remove('whimsy-bloom'), 1500);
        toast.success('AI 上架就緒', {
          description: '7 個欄位填好了。標題、描述、SEO、變體、定價、蝦皮規格、去背圖。',
          icon: '✨',
          duration: 4000,
        });
      }
      if (!state.done) celebrated.current = false;
    }, [state.done]);

    return (
      <div ref={wrapRef} className="grid grid-cols-2 gap-8 p-2">
        <Card className="aspect-square overflow-hidden" style={{ borderRadius: 'var(--brand-radius)' }}>
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="商品" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center opacity-30">尚未上傳</div>
          )}
        </Card>

        <div className="space-y-6">
          <StreamingField label="標題" mode="text" value={state.title} loading={state.title === null} typewriter={state.titleChars} />
          <StreamingField label="描述" mode="text" value={state.description} loading={state.description === null} typewriter={state.descriptionChars} />
          <StreamingField label="SEO 標籤" mode="tags" value={state.tags} visibleCount={state.tagsVisible} loading={state.tags === null} />
          <StreamingField label="商品變體" mode="variants" value={state.variants} visibleCount={state.variantsVisible} loading={state.variants === null} />

          {state.price && (
            <motion.div initial={{ opacity: 0, y: 12, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 22 }}>
              <Card className="p-4" style={{ borderRadius: 'var(--brand-radius)', borderColor: 'var(--brand-primary)' }}>
                <p className="text-xs uppercase opacity-60">建議定價</p>
                <p className="text-3xl font-semibold" style={{ color: 'var(--brand-primary)', fontFamily: 'var(--brand-font-heading)' }}>
                  NT$ {state.price.min} – {state.price.max}
                </p>
              </Card>
            </motion.div>
          )}

          {state.shopeeReady && (
            <motion.div animate={{ scale: [1, 1.04, 1] }} transition={{ duration: 1.0, repeat: 2 }}>
              <Tabs defaultValue="shopee">
                <TabsList style={{ borderRadius: 'var(--brand-radius)' }}>
                  <TabsTrigger value="shopee">蝦皮規格已就緒 →</TabsTrigger>
                </TabsList>
              </Tabs>
            </motion.div>
          )}
        </div>
      </div>
    );
  }
);
