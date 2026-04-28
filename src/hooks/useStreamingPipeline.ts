'use client';

import { useEffect, useRef, useState } from 'react';
import type { ProductOutput } from '@/lib/types';

/**
 * 7 個欄位 streaming timeline (18 秒)
 * 用 setTimeout 模擬 GPT-4o token stream，build day demo 不一定真連 streaming API
 *
 * Timeline:
 * 0-3s   標題 typewriter (60ms/char)
 * 3-12s  描述 streaming (~30ms/char)
 * 6s     tags pop in (300ms 間隔)
 * 8-15s  variants table 錯位 fade in
 * 15s    price card fade in
 * 18s    shopee tab pulse
 */
export type StreamState = {
  title: string | null;
  titleChars: number;
  description: string | null;
  descriptionChars: number;
  tags: string[] | null;
  tagsVisible: number;
  variants: string[] | null;
  variantsVisible: number;
  price: ProductOutput['price_twd'] | null;
  shopeeReady: boolean;
  done: boolean;
};

const INITIAL: StreamState = {
  title: null, titleChars: 0,
  description: null, descriptionChars: 0,
  tags: null, tagsVisible: 0,
  variants: null, variantsVisible: 0,
  price: null,
  shopeeReady: false,
  done: false,
};

export function useStreamingPipeline() {
  const [state, setState] = useState<StreamState>(INITIAL);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const reset = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setState(INITIAL);
  };

  const start = (data: ProductOutput) => {
    reset();
    const push = (fn: () => void, ms: number) => {
      timers.current.push(setTimeout(fn, ms));
    };

    // 0s: title 出現
    push(() => setState((s) => ({ ...s, title: data.title })), 0);
    // 0-3s: typewriter 60ms/char
    for (let i = 1; i <= data.title.length; i++) {
      push(() => setState((s) => ({ ...s, titleChars: i })), i * 60);
    }

    // 3s: description 開始
    push(() => setState((s) => ({ ...s, description: data.description })), 3000);
    const descSpeed = 9000 / Math.max(data.description.length, 1);
    for (let i = 1; i <= data.description.length; i++) {
      push(() => setState((s) => ({ ...s, descriptionChars: i })), 3000 + i * descSpeed);
    }

    // 6s: tags pop in
    push(() => setState((s) => ({ ...s, tags: data.seo_tags })), 6000);
    data.seo_tags.forEach((_, i) => {
      push(() => setState((s) => ({ ...s, tagsVisible: i + 1 })), 6000 + i * 300);
    });

    // 8s: variants 錯位 fade in
    push(() => setState((s) => ({ ...s, variants: data.variants })), 8000);
    const varSpan = 7000 / Math.max(data.variants.length, 1);
    data.variants.forEach((_, i) => {
      push(() => setState((s) => ({ ...s, variantsVisible: i + 1 })), 8000 + i * varSpan);
    });

    // 15s: price card
    push(() => setState((s) => ({ ...s, price: data.price_twd })), 15000);

    // 18s: shopee tab pulse
    push(() => setState((s) => ({ ...s, shopeeReady: true, done: true })), 18000);
  };

  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  return { state, start, reset };
}
