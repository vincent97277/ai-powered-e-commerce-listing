'use client';

import { useState, useTransition } from 'react';
import { motion } from 'framer-motion';
import { Edit3, X, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { updateProductAction } from '@/app/(merchant)/merchant/products/[id]/actions';

export function EditableProductFields({
  productId,
  initialTitle,
  initialDescription,
  initialPriceCents,
  initialStockQuantity,
}: {
  productId: string;
  initialTitle: string;
  initialDescription: string;
  initialPriceCents: number;
  initialStockQuantity: number;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [priceTwd, setPriceTwd] = useState((initialPriceCents / 100).toString());
  const [stock, setStock] = useState(String(initialStockQuantity));
  const [pending, start] = useTransition();

  const handleSave = () => {
    const cents = Math.round(Number(priceTwd) * 100);
    if (Number.isNaN(cents) || cents < 0) {
      toast.error('價格必須是有效數字');
      return;
    }

    const stockQty = parseInt(stock, 10);
    if (Number.isNaN(stockQty) || stockQty < 0 || stockQty > 99999) {
      toast.error('庫存必須是 0-99999 的整數');
      return;
    }

    start(async () => {
      const r = await updateProductAction(productId, {
        title,
        description,
        priceCents: cents,
        stockQuantity: stockQty,
      });
      if (r.success) {
        toast.success('已儲存');
        setEditing(false);
      } else {
        toast.error(r.error ?? '儲存失敗');
      }
    });
  };

  const handleCancel = () => {
    setTitle(initialTitle);
    setDescription(initialDescription);
    setPriceTwd((initialPriceCents / 100).toString());
    setStock(String(initialStockQuantity));
    setEditing(false);
  };

  if (!editing) {
    return (
      <div className="flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setEditing(true)}
          className="inline-flex items-center gap-2"
          style={{ color: 'var(--brand-primary)' }}
        >
          <Edit3 className="h-3.5 w-3.5" strokeWidth={2.2} />
          編輯文案 / 價格
        </Button>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4 border p-6"
      style={{
        borderColor: 'var(--brand-primary)',
        borderRadius: 'calc(var(--brand-radius) + 2px)',
        backgroundColor: 'color-mix(in srgb, var(--brand-primary) 5%, var(--brand-bg))',
        boxShadow: 'var(--elev-2)',
      }}
    >
      <p className="t-caption" style={{ color: 'var(--brand-primary)' }}>
        編輯模式 — AI 生成的文字商家可以微調
      </p>

      <div className="space-y-2">
        <label className="t-small font-medium opacity-70">標題</label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={60}
          style={{
            borderColor: 'color-mix(in srgb, var(--brand-primary) 28%, transparent)',
            borderRadius: 'var(--brand-radius)',
          }}
        />
      </div>

      <div className="space-y-2">
        <label className="t-small font-medium opacity-70">描述</label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={6}
          maxLength={800}
          style={{
            borderColor: 'color-mix(in srgb, var(--brand-primary) 28%, transparent)',
            borderRadius: 'var(--brand-radius)',
          }}
        />
        <p className="t-caption opacity-50 tabular-nums">{description.length} / 800</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="t-small font-medium opacity-70">售價 (NT$)</label>
          <Input
            type="number"
            min={0}
            max={100000}
            step={1}
            value={priceTwd}
            onChange={(e) => setPriceTwd(e.target.value)}
            className="font-mono"
            style={{
              borderColor: 'color-mix(in srgb, var(--brand-primary) 28%, transparent)',
              borderRadius: 'var(--brand-radius)',
            }}
          />
        </div>
        <div className="space-y-2">
          <label className="t-small font-medium opacity-70">庫存</label>
          <Input
            type="number"
            min={0}
            max={99999}
            step={1}
            value={stock}
            onChange={(e) => setStock(e.target.value)}
            className="font-mono"
            placeholder="0"
            style={{
              borderColor: 'color-mix(in srgb, var(--brand-primary) 28%, transparent)',
              borderRadius: 'var(--brand-radius)',
            }}
          />
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button
          variant="ghost"
          onClick={handleCancel}
          disabled={pending}
          className="inline-flex items-center gap-1"
        >
          <X className="h-3.5 w-3.5" strokeWidth={2.2} />
          取消
        </Button>
        <Button
          onClick={handleSave}
          disabled={pending}
          className="hover-lift inline-flex items-center gap-2"
          style={{
            backgroundColor: 'var(--brand-primary)',
            color: 'var(--brand-bg)',
            borderRadius: 'var(--brand-radius)',
          }}
        >
          <Save className="h-3.5 w-3.5" strokeWidth={2.2} />
          {pending ? '儲存中...' : '儲存'}
        </Button>
      </div>
    </motion.div>
  );
}
