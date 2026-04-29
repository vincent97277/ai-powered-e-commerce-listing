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
}: {
  productId: string;
  initialTitle: string;
  initialDescription: string;
  initialPriceCents: number;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [priceTwd, setPriceTwd] = useState((initialPriceCents / 100).toString());
  const [pending, start] = useTransition();

  const handleSave = () => {
    const cents = Math.round(Number(priceTwd) * 100);
    if (Number.isNaN(cents) || cents < 0) {
      toast.error('價格必須是有效數字');
      return;
    }

    start(async () => {
      const r = await updateProductAction(productId, {
        title,
        description,
        priceCents: cents,
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
          <Edit3 className="h-3.5 w-3.5" strokeWidth={2.4} />
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

      <div className="space-y-2">
        <label className="t-small font-medium opacity-70">售價 (NT$)</label>
        <Input
          type="number"
          min={0}
          max={100000}
          value={priceTwd}
          onChange={(e) => setPriceTwd(e.target.value)}
          className="font-mono"
          style={{
            borderColor: 'color-mix(in srgb, var(--brand-primary) 28%, transparent)',
            borderRadius: 'var(--brand-radius)',
            maxWidth: '200px',
          }}
        />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button
          variant="ghost"
          onClick={handleCancel}
          disabled={pending}
          className="inline-flex items-center gap-1"
        >
          <X className="h-3.5 w-3.5" strokeWidth={2.4} />
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
          <Save className="h-3.5 w-3.5" strokeWidth={2.4} />
          {pending ? '儲存中...' : '儲存'}
        </Button>
      </div>
    </motion.div>
  );
}
