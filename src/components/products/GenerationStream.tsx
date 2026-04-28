'use client';

import { motion } from 'framer-motion';
import { StreamingField } from './StreamingField';
import { useStreamingPipeline } from '@/hooks/useStreamingPipeline';
import { useDemoMode } from '@/components/demo/DemoModeToggle';
import { useImperativeHandle, forwardRef } from 'react';
import type { ProductOutput } from '@/lib/types';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

export type GenerationStreamHandle = { kickoff: (file: File | null) => Promise<void> };

export const GenerationStream = forwardRef<GenerationStreamHandle, { previewUrl: string | null }>(
  function GenerationStream({ previewUrl }, ref) {
    const { state, start } = useStreamingPipeline();
    const { mode } = useDemoMode();

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
        // OFF: 真打 Inngest API；落空仍 fallback fixture
        const res = await fetch('/api/products/generate', { method: 'POST' }).catch(() => null);
        const data: ProductOutput = res
          ? await res.json()
          : await (await fetch('/fixtures/products/teacup.json')).json();
        start(data);
      },
    }));

    return (
      <div className="grid grid-cols-2 gap-8">
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
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
              <Card className="p-4" style={{ borderRadius: 'var(--brand-radius)', borderColor: 'var(--brand-primary)' }}>
                <p className="text-xs uppercase opacity-60">建議定價</p>
                <p className="text-3xl font-semibold" style={{ color: 'var(--brand-primary)', fontFamily: 'var(--brand-font-heading)' }}>
                  NT$ {state.price.min} – {state.price.max}
                </p>
              </Card>
            </motion.div>
          )}

          {state.shopeeReady && (
            <motion.div animate={{ scale: [1, 1.03, 1] }} transition={{ duration: 1.2, repeat: 3 }}>
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
