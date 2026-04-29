'use client';

/**
 * 購物車 hook — localStorage per merchant slug
 * Hackathon: 不接 server，純 client 狀態
 */
import { useEffect, useState, useCallback } from 'react';

export type CartItem = {
  productId: string;
  title: string;
  unitPriceCents: number;
  quantity: number;
};

const keyFor = (slug: string) => `cart:${slug}`;

export function useCart(slug: string) {
  const [items, setItems] = useState<CartItem[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(keyFor(slug));
      if (raw) setItems(JSON.parse(raw));
    } catch {}
  }, [slug]);

  const persist = useCallback(
    (next: CartItem[]) => {
      setItems(next);
      try {
        localStorage.setItem(keyFor(slug), JSON.stringify(next));
      } catch {}
    },
    [slug],
  );

  const addToCart = useCallback(
    (item: Omit<CartItem, 'quantity'>, qty = 1) => {
      const idx = items.findIndex((i) => i.productId === item.productId);
      if (idx >= 0) {
        const next = [...items];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + qty };
        persist(next);
      } else {
        persist([...items, { ...item, quantity: qty }]);
      }
    },
    [items, persist],
  );

  const removeFromCart = useCallback(
    (productId: string) => persist(items.filter((i) => i.productId !== productId)),
    [items, persist],
  );

  const setQuantity = useCallback(
    (productId: string, qty: number) => {
      if (qty <= 0) {
        persist(items.filter((i) => i.productId !== productId));
        return;
      }
      persist(items.map((i) => (i.productId === productId ? { ...i, quantity: qty } : i)));
    },
    [items, persist],
  );

  const clear = useCallback(() => persist([]), [persist]);

  const totalCents = items.reduce((sum, i) => sum + i.unitPriceCents * i.quantity, 0);
  const totalQuantity = items.reduce((sum, i) => sum + i.quantity, 0);

  return { items, addToCart, removeFromCart, setQuantity, clear, totalCents, totalQuantity };
}
