'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { createMerchantAction, type CreateMerchantState } from './actions';

export default function OnboardingPage() {
  const [state, formAction, pending] = useActionState<CreateMerchantState, FormData>(
    createMerchantAction,
    {},
  );

  return (
    <main
      className="relative min-h-screen overflow-hidden"
      style={{ backgroundColor: 'var(--brand-bg)', color: 'var(--brand-text)' }}
    >
      {/* 背景光暈 */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 -z-10 h-[600px] w-[1100px] -translate-x-1/2 opacity-40 blur-3xl"
        style={{
          background:
            'radial-gradient(ellipse at center, color-mix(in srgb, var(--brand-primary) 30%, transparent) 0%, transparent 60%)',
        }}
      />

      <div className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-6 py-16">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full"
        >
          <div className="mb-10 text-center">
            <span
              className="mb-4 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs"
              style={{
                borderColor: 'color-mix(in srgb, var(--brand-primary) 28%, transparent)',
                backgroundColor: 'color-mix(in srgb, var(--brand-primary) 6%, transparent)',
                color: 'var(--brand-primary)',
              }}
            >
              <Sparkles className="h-3 w-3" strokeWidth={2.4} />
              開新店面
            </span>
            <h1 className="t-h1" style={{ fontFamily: 'var(--brand-font-heading)' }}>
              60 秒開一家店
            </h1>
            <p
              className="t-body mt-3"
              style={{ color: 'color-mix(in srgb, var(--brand-text) 65%, transparent)' }}
            >
              填三件事 → 進後台 → 拍照上架第一件商品。
            </p>
          </div>

          <form
            action={formAction}
            className="space-y-6 p-8"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--brand-primary) 3%, var(--brand-bg))',
              border: '1px solid color-mix(in srgb, var(--brand-primary) 18%, transparent)',
              borderRadius: 'calc(var(--brand-radius) + 4px)',
              boxShadow: 'var(--elev-2)',
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="name" className="t-caption" style={{ color: 'var(--brand-primary)' }}>
                店名
              </Label>
              <Input
                id="name"
                name="name"
                required
                maxLength={60}
                placeholder="例: 永康街選物店"
                style={{
                  borderColor: 'color-mix(in srgb, var(--brand-primary) 28%, transparent)',
                  borderRadius: 'var(--brand-radius)',
                }}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="slug" className="t-caption" style={{ color: 'var(--brand-primary)' }}>
                店面網址 (slug)
              </Label>
              <div className="flex items-stretch overflow-hidden border" style={{ borderColor: 'color-mix(in srgb, var(--brand-primary) 28%, transparent)', borderRadius: 'var(--brand-radius)' }}>
                <span
                  className="t-small flex items-center px-3 font-mono"
                  style={{
                    backgroundColor: 'color-mix(in srgb, var(--brand-primary) 8%, transparent)',
                    color: 'color-mix(in srgb, var(--brand-text) 60%, transparent)',
                  }}
                >
                  /store/
                </span>
                <Input
                  id="slug"
                  name="slug"
                  required
                  pattern="[a-z0-9][a-z0-9-]{1,30}[a-z0-9]"
                  minLength={3}
                  maxLength={32}
                  placeholder="sweet-bakery"
                  className="flex-1 border-0 font-mono"
                  style={{ borderRadius: 0 }}
                />
              </div>
              <p className="t-caption opacity-50">
                小寫英數加橫線, 3-32 字, 顧客會看到的網址
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="brandVoice" className="t-caption" style={{ color: 'var(--brand-primary)' }}>
                品牌語氣 (給 AI 寫文案參考用)
              </Label>
              <Textarea
                id="brandVoice"
                name="brandVoice"
                maxLength={200}
                rows={3}
                placeholder="例: 永康街選物店, 質感日系, 文字偏內斂, 不堆形容詞"
                style={{
                  borderColor: 'color-mix(in srgb, var(--brand-primary) 28%, transparent)',
                  borderRadius: 'var(--brand-radius)',
                }}
              />
              <p className="t-caption opacity-50">
                AI 會用這段定調你的商品文案。可以晚點再改, 寫一兩句最有感的就好。
              </p>
            </div>

            {state.error && (
              <div
                className="border p-3 text-sm"
                style={{
                  borderColor: 'var(--error)',
                  backgroundColor: 'color-mix(in srgb, var(--error) 8%, transparent)',
                  color: 'var(--error)',
                  borderRadius: 'var(--brand-radius)',
                }}
              >
                {state.error}
              </div>
            )}

            <Button
              type="submit"
              disabled={pending}
              className="hover-lift group inline-flex w-full items-center justify-center gap-2 py-6 text-base font-semibold elev-2"
              style={{
                backgroundColor: 'var(--brand-primary)',
                color: 'var(--brand-bg)',
                borderRadius: 'var(--brand-radius)',
                fontFamily: 'var(--brand-font-heading)',
              }}
            >
              {pending ? '建立中...' : '開店, 進後台'}
              {!pending && (
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" strokeWidth={2.4} />
              )}
            </Button>
          </form>

          <p className="mt-6 text-center text-xs opacity-50">
            或者
            <Link href="/store/akami" className="ml-1 underline" style={{ color: 'var(--brand-primary)' }}>
              先逛逛阿明選物
            </Link>
            看別家店長什麼樣
          </p>
        </motion.div>
      </div>
    </main>
  );
}
