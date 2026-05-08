'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { ProductOutput } from '@/lib/types';

/**
 * Shopee CSV export — simplified 7 columns (for demo)
 * Full 18-column real spec is in shopee-tw-mass-upload-sample.csv
 */
export function ShopeeExportTab({ product }: { product: ProductOutput }) {
  const handleDownload = () => {
    const headers = ['商品名稱', '商品描述', '分類', '變體', '最低價', '最高價', '標籤'];
    const row = [
      product.title,
      product.description.replace(/\n/g, ' '),
      product.category,
      product.variants.join('|'),
      product.price_twd.min,
      product.price_twd.max,
      product.seo_tags.join('|'),
    ];
    const csv = [headers.join(','), row.map((c) => `"${c}"`).join(',')].join('\n');
    // BOM ensures Excel opens Chinese without garbled chars
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `shopee-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Tabs defaultValue="shopee">
      <TabsList style={{ borderRadius: 'var(--brand-radius)' }}>
        <TabsTrigger value="shopee">蝦皮規格</TabsTrigger>
        <TabsTrigger value="ig">Instagram</TabsTrigger>
        <TabsTrigger value="line">LINE 購物</TabsTrigger>
      </TabsList>
      <TabsContent value="shopee">
        <Card className="space-y-4 p-6" style={{ borderRadius: 'var(--brand-radius)' }}>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="opacity-60">分類</p>
              <p>{product.category}</p>
            </div>
            <div>
              <p className="opacity-60">變體數</p>
              <p>{product.variants.length}</p>
            </div>
          </div>
          <Button onClick={handleDownload}
            style={{ backgroundColor: 'var(--brand-primary)', borderRadius: 'var(--brand-radius)' }}>
            下載 CSV →
          </Button>
        </Card>
      </TabsContent>
      <TabsContent value="ig">
        <Card className="p-6 opacity-60">即將推出</Card>
      </TabsContent>
      <TabsContent value="line">
        <Card className="p-6 opacity-60">即將推出</Card>
      </TabsContent>
    </Tabs>
  );
}
