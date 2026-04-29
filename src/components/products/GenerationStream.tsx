'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { StreamingField } from './StreamingField';
import { useStreamingPipeline } from '@/hooks/useStreamingPipeline';
import { useDemoMode } from '@/components/demo/DemoModeToggle';
import { useImperativeHandle, forwardRef, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ArrowRight, Plus, Eye } from 'lucide-react';
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
    const [savedProductId, setSavedProductId] = useState<string | null>(null);

    useImperativeHandle(ref, () => ({
      async kickoff(file: File | null) {
        // 直接從 localStorage 讀最新 mode (避開 useDemoMode hook 的 stale closure)
        const liveMode =
          typeof window !== 'undefined'
            ? ((localStorage.getItem('demoMode') as 'on' | 'off' | null) ?? mode)
            : mode;

        console.log('[GenerationStream] kickoff', {
          hookMode: mode,
          liveMode,
          hasFile: !!file,
        });

        // 預覽模式: 走 fixture (不打 OpenAI)
        if (liveMode === 'on') {
          toast.info('預覽模式 — 用範例資料展示流程', { duration: 2000 });
          await new Promise((r) => setTimeout(r, 500));
          const res = await fetch('/fixtures/products/teacup.json');
          const data: ProductOutput = await res.json();
          start(data);
          return;
        }

        // 真實模式: 真打 GPT-4o
        if (!file) {
          toast.error('找不到上傳檔案，請重新拖曳照片');
          const fb = await fetch('/fixtures/products/teacup.json');
          start(await fb.json());
          return;
        }

        try {
          // Step 1: 上傳檔案到 /api/uploads (寫入 public/uploads/)
          console.log('[GenerationStream] uploading file', file.name, file.size);
          toast.loading('上傳照片中...', { id: 'upload' });
          const formData = new FormData();
          formData.append('file', file);
          const uploadRes = await fetch('/api/uploads', { method: 'POST', body: formData });
          const uploadJson = await uploadRes.json();
          console.log('[GenerationStream] upload result', uploadRes.status, uploadJson);
          if (!uploadRes.ok || !uploadJson.success) {
            throw new Error(uploadJson.error ?? `上傳失敗 (HTTP ${uploadRes.status})`);
          }
          toast.dismiss('upload');
          toast.success('照片上傳完成', { duration: 1500 });

          // Step 2: 同步呼叫 GPT-4o vision
          console.log('[GenerationStream] calling GPT-4o vision');
          toast.loading('GPT-4o 正在看照片...這通常 3-8 秒', { id: 'vision' });
          const aiRes = await fetch('/api/products/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ storageKey: uploadJson.key }),
          });
          const aiJson = await aiRes.json();
          console.log('[GenerationStream] AI result', aiRes.status, aiJson);
          toast.dismiss('vision');

          if (!aiRes.ok || !aiJson.success) {
            throw new Error(aiJson.error ?? `AI 生成失敗 (HTTP ${aiRes.status})`);
          }

          // Step 3: 拿到 ProductOutput → 進 streaming 動畫
          toast.success(
            `已用「${aiJson.merchantSlug ?? '當前商家'}」品牌語氣生成`,
            {
              description: aiJson.brandVoiceUsed
                ? `語氣樣本: ${aiJson.brandVoiceUsed}`
                : undefined,
              duration: 3500,
            },
          );
          if (aiJson.productId) setSavedProductId(aiJson.productId);
          start(aiJson.data as ProductOutput);
        } catch (err) {
          toast.dismiss('upload');
          toast.dismiss('vision');
          const msg = err instanceof Error ? err.message : '未知錯誤';
          console.error('[GenerationStream] error', err);
          toast.error('AI 生成失敗', {
            description: `${msg}。改用 fixture demo 繼續。`,
            duration: 6000,
          });
          // Fallback: 萬一 AI 掛了，仍跑 fixture demo 不讓畫面卡死
          const fb = await fetch('/fixtures/products/teacup.json');
          start(await fb.json());
        }
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

          {/* 完成後 CTA — 引導下一步 */}
          {state.done && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.5 }}
              className="space-y-3 border-t pt-6"
              style={{ borderColor: 'color-mix(in srgb, var(--brand-primary) 18%, transparent)' }}
            >
              <p className="t-caption" style={{ color: 'var(--brand-primary)' }}>
                完成 — 接下來
              </p>
              <div className="flex flex-wrap gap-3">
                {savedProductId ? (
                  <Link
                    href={`/merchant/products/${savedProductId}`}
                    className="hover-lift inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold elev-2"
                    style={{
                      backgroundColor: 'var(--brand-primary)',
                      color: 'var(--brand-bg)',
                      borderRadius: 'var(--brand-radius)',
                      fontFamily: 'var(--brand-font-heading)',
                    }}
                  >
                    <Eye className="h-4 w-4" strokeWidth={2.4} />
                    查看商品 / 編輯 / 上架
                    <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.4} />
                  </Link>
                ) : (
                  <Link
                    href="/merchant/products"
                    className="hover-lift inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold elev-2"
                    style={{
                      backgroundColor: 'var(--brand-primary)',
                      color: 'var(--brand-bg)',
                      borderRadius: 'var(--brand-radius)',
                    }}
                  >
                    <Eye className="h-4 w-4" strokeWidth={2.4} />
                    商品列表
                    <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.4} />
                  </Link>
                )}

                <Link
                  href="/merchant/products/new"
                  className="hover-lift inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium"
                  onClick={() => {
                    // 強制 hard reload 重置 state (再上一張不卡到上一次的 streaming state)
                    if (typeof window !== 'undefined') {
                      setTimeout(() => window.location.reload(), 50);
                    }
                  }}
                  style={{
                    border: '1px solid var(--brand-primary)',
                    color: 'var(--brand-primary)',
                    borderRadius: 'var(--brand-radius)',
                  }}
                >
                  <Plus className="h-4 w-4" strokeWidth={2.4} />
                  再上一件
                </Link>
              </div>
              {savedProductId && (
                <p className="t-caption opacity-60">
                  · 已自動存入商品庫 (草稿狀態) — 詳情頁可編輯文字 / 改價格 / 上架
                </p>
              )}
            </motion.div>
          )}
        </div>
      </div>
    );
  }
);
