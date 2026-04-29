'use client';

import { useState, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Trash2, Minus, Plus, ShoppingBag } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCart } from '@/lib/cart';
import { placeOrderAction } from '../actions';

export default function CartPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const router = useRouter();
  const cart = useCart(slug);
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleCheckout = async () => {
    if (cart.items.length === 0) {
      toast.error('購物車是空的');
      return;
    }
    if (!email.includes('@')) {
      toast.error('請輸入正確的 Email');
      return;
    }

    setSubmitting(true);
    const result = await placeOrderAction({
      slug,
      customerEmail: email,
      items: cart.items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
    });
    setSubmitting(false);

    if (!result.success) {
      toast.error(result.error);
      return;
    }

    cart.clear();
    toast.success('訂單成立 🎉');
    router.push(`/store/${slug}/order/${result.orderId}`);
  };

  return (
    <main
      className="min-h-screen px-6 py-10 md:px-12"
      style={{ backgroundColor: 'var(--brand-bg)', color: 'var(--brand-text)' }}
    >
      <div className="mx-auto max-w-4xl">
        <h1 className="t-h1 mb-8" style={{ fontFamily: 'var(--brand-font-heading)' }}>
          購物車
        </h1>

        {cart.items.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center gap-4 py-24 text-center"
            style={{
              borderRadius: 'calc(var(--brand-radius) * 4)',
              backgroundColor: 'color-mix(in srgb, var(--brand-primary) 4%, transparent)',
              border: '1px dashed color-mix(in srgb, var(--brand-primary) 22%, transparent)',
            }}
          >
            <ShoppingBag className="h-12 w-12 opacity-50" strokeWidth={1.4} style={{ color: 'var(--brand-primary)' }} />
            <p className="t-h3" style={{ fontFamily: 'var(--brand-font-heading)' }}>
              購物車是空的
            </p>
            <Link
              href={`/store/${slug}`}
              className="t-small underline"
              style={{ color: 'var(--brand-primary)' }}
            >
              回去逛逛
            </Link>
          </div>
        ) : (
          <div className="grid gap-8 lg:grid-cols-[1fr,360px]">
            {/* 左: 商品清單 */}
            <div className="space-y-3">
              {cart.items.map((it) => (
                <motion.div
                  key={it.productId}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-center gap-4 border p-4"
                  style={{
                    borderColor: 'color-mix(in srgb, var(--brand-primary) 16%, transparent)',
                    borderRadius: 'var(--brand-radius)',
                    backgroundColor: 'color-mix(in srgb, var(--brand-primary) 2%, var(--brand-bg))',
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <p
                      className="t-body line-clamp-2 font-medium"
                      style={{ fontFamily: 'var(--brand-font-heading)' }}
                    >
                      {it.title}
                    </p>
                    <p
                      className="t-tabular t-small mt-1"
                      style={{ color: 'color-mix(in srgb, var(--brand-text) 60%, transparent)' }}
                    >
                      NT$ {(it.unitPriceCents / 100).toLocaleString()} × {it.quantity}
                    </p>
                  </div>

                  <div
                    className="inline-flex items-center overflow-hidden border"
                    style={{
                      borderColor: 'color-mix(in srgb, var(--brand-primary) 28%, transparent)',
                      borderRadius: 'var(--brand-radius)',
                    }}
                  >
                    <button
                      type="button"
                      className="px-2.5 py-1.5 hover:bg-brand-soft"
                      onClick={() => cart.setQuantity(it.productId, it.quantity - 1)}
                    >
                      <Minus className="h-3.5 w-3.5" strokeWidth={2.4} />
                    </button>
                    <span className="min-w-8 text-center text-sm font-semibold tabular-nums">{it.quantity}</span>
                    <button
                      type="button"
                      className="px-2.5 py-1.5 hover:bg-brand-soft"
                      onClick={() => cart.setQuantity(it.productId, it.quantity + 1)}
                    >
                      <Plus className="h-3.5 w-3.5" strokeWidth={2.4} />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => cart.removeFromCart(it.productId)}
                    className="p-2 opacity-60 transition-opacity hover:opacity-100"
                    aria-label="移除"
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={2.2} />
                  </button>
                </motion.div>
              ))}
            </div>

            {/* 右: 結帳區 */}
            <div
              className="space-y-5 self-start border p-6"
              style={{
                borderColor: 'color-mix(in srgb, var(--brand-primary) 22%, transparent)',
                borderRadius: 'calc(var(--brand-radius) + 2px)',
                backgroundColor: 'color-mix(in srgb, var(--brand-primary) 4%, var(--brand-bg))',
                boxShadow: 'var(--elev-1)',
              }}
            >
              <div className="flex items-baseline justify-between">
                <span className="t-caption" style={{ color: 'var(--brand-primary)' }}>
                  總金額
                </span>
                <span
                  className="t-tabular text-3xl font-semibold"
                  style={{ color: 'var(--brand-primary)', fontFamily: 'var(--brand-font-heading)' }}
                >
                  NT$ {(cart.totalCents / 100).toLocaleString()}
                </span>
              </div>

              <hr style={{ borderColor: 'color-mix(in srgb, var(--brand-primary) 18%, transparent)' }} />

              <div className="space-y-2">
                <Label htmlFor="email" className="t-caption" style={{ color: 'var(--brand-primary)' }}>
                  Email (收訂單通知)
                </Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  style={{
                    borderColor: 'color-mix(in srgb, var(--brand-primary) 28%, transparent)',
                    borderRadius: 'var(--brand-radius)',
                  }}
                />
              </div>

              <Button
                onClick={handleCheckout}
                disabled={submitting}
                size="lg"
                className="hover-lift w-full py-6 text-base font-semibold elev-2"
                style={{
                  backgroundColor: 'var(--brand-primary)',
                  color: 'var(--brand-bg)',
                  borderRadius: 'var(--brand-radius)',
                  fontFamily: 'var(--brand-font-heading)',
                }}
              >
                {submitting ? '處理中...' : `送出訂單 (${cart.totalQuantity} 件)`}
              </Button>

              <p className="t-caption opacity-50">
                · 金流整合中, 訂單已建立並記入商家後台供對帳
              </p>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
