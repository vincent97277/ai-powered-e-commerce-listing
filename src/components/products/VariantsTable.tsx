'use client';

export function VariantsTable({ variants }: { variants: string[] }) {
  if (!variants.length) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-sm uppercase tracking-wider opacity-60">商品變體</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b" style={{ borderColor: 'var(--brand-primary)' + '40' }}>
            <th className="py-2 text-left font-normal opacity-60">規格</th>
            <th className="py-2 text-right font-normal opacity-60">SKU</th>
          </tr>
        </thead>
        <tbody>
          {variants.map((v, i) => (
            <tr key={v} className="border-b" style={{ borderColor: 'var(--brand-primary)' + '20' }}>
              <td className="py-3">{v}</td>
              <td className="py-3 text-right font-mono opacity-60">SKU-{String(i + 1).padStart(3, '0')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
