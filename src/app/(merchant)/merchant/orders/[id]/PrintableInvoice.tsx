/**
 * PrintableInvoice — printable shipping slip (V1 #57)
 *
 * Hidden by default; on @media print:
 *   - all other page elements are hidden
 *   - invoice block fills the page
 *   - A4 portrait, 2cm margins
 *   - Times New Roman (gives the slip a traditional paper feel)
 *   - No QR / barcode (V2)
 *
 * Trigger: page.tsx's "Print shipping slip" button calls window.print()
 *   (the button uses PrintTrigger client component since server components can't onClick)
 */
import { PrintTrigger } from './PrintTrigger';

type Order = {
  id: string;
  customerName: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
  customerEmail: string;
  totalCents: number;
  trackingNumber: string | null;
  carrier: string | null;
  createdAt: Date;
};

type Item = {
  id: string;
  quantity: number;
  unitPriceCents: number;
  productTitle: string | null;
};

export function PrintableInvoice({
  merchantName,
  merchantSlug,
  order,
  items,
}: {
  merchantName: string;
  merchantSlug: string;
  order: Order;
  items: Item[];
}) {
  return (
    <>
      <PrintTrigger />
      <div
        id="printable-invoice"
        className="hidden print:block"
        style={{
          fontFamily: '"Times New Roman", "Noto Serif TC", serif',
          color: '#000',
          backgroundColor: '#fff',
          padding: '2cm',
        }}
      >
        {/* Merchant header */}
        <div className="flex items-baseline justify-between border-b-2 border-black pb-3">
          <div>
            <h1 className="text-2xl font-bold">{merchantName}</h1>
            <p className="mt-1 text-xs">store: {merchantSlug}</p>
          </div>
          <div className="text-right text-xs">
            <p>出貨單</p>
            <p className="font-mono">#{order.id.slice(0, 8)}</p>
          </div>
        </div>

        {/* Customer info */}
        <section className="mt-6 grid grid-cols-2 gap-6 text-sm">
          <div>
            <p className="text-xs uppercase tracking-wider">收件人</p>
            <p className="mt-1 text-base font-medium">{order.customerName ?? '—'}</p>
            <p className="mt-2 whitespace-pre-wrap">{order.customerAddress ?? '—'}</p>
            <p className="mt-1 font-mono">{order.customerPhone ?? '—'}</p>
            <p className="text-xs">{order.customerEmail}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider">物流</p>
            {order.carrier && order.trackingNumber ? (
              <>
                <p className="mt-1 text-base font-medium">{order.carrier}</p>
                <p className="mt-1 font-mono text-base">{order.trackingNumber}</p>
              </>
            ) : (
              <p className="mt-1 italic">尚未出貨</p>
            )}
            <p className="mt-3 text-xs">
              訂單建立: {order.createdAt.toLocaleDateString('zh-TW')}
            </p>
          </div>
        </section>

        {/* Items */}
        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="border-b border-black">
              <th className="py-2 text-left font-bold">商品</th>
              <th className="py-2 text-right font-bold">單價</th>
              <th className="py-2 text-right font-bold">數量</th>
              <th className="py-2 text-right font-bold">小計</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id} className="border-b border-zinc-300">
                <td className="py-2">{it.productTitle ?? '(已刪除)'}</td>
                <td className="py-2 text-right tabular-nums">
                  NT$ {(it.unitPriceCents / 100).toLocaleString()}
                </td>
                <td className="py-2 text-right tabular-nums">×{it.quantity}</td>
                <td className="py-2 text-right tabular-nums">
                  NT$ {((it.unitPriceCents * it.quantity) / 100).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-black">
              <td colSpan={3} className="pt-3 text-right font-bold">
                合計
              </td>
              <td className="pt-3 text-right text-xl font-bold tabular-nums">
                NT$ {(order.totalCents / 100).toLocaleString()}
              </td>
            </tr>
          </tfoot>
        </table>

        <p className="mt-12 text-center text-xs">
          列印時間: {new Date().toLocaleString('zh-TW')} · {merchantName} via Catalogify
        </p>
      </div>

      {/* @media print: hide everything except #printable-invoice */}
      <style>
        {`
        @media print {
          @page {
            size: A4 portrait;
            margin: 0;
          }
          body * {
            visibility: hidden;
          }
          #printable-invoice,
          #printable-invoice * {
            visibility: visible;
          }
          #printable-invoice {
            position: absolute;
            top: 0;
            left: 0;
            width: 210mm;
            height: 297mm;
            display: block !important;
          }
        }
      `}
      </style>
    </>
  );
}
