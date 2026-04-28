/**
 * 平台後台 stub — 列出所有商家
 * 用 dbAdmin (BYPASSRLS) — 受 ESLint 保護，只允許這個目錄 import
 */
import { dbAdmin } from '@/db/admin-only';
import { merchants } from '@/db/schema';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const all = await dbAdmin.select().from(merchants);

  return (
    <main className="min-h-screen px-12 py-8 bg-neutral-900 text-white">
      <h1 className="text-4xl font-bold">平台管理</h1>
      <p className="text-sm opacity-60 mt-2">所有商家列表 (BYPASSRLS)</p>

      <table className="mt-8 w-full text-sm">
        <thead>
          <tr className="border-b border-white/20">
            <th className="py-2 text-left font-normal opacity-60">slug</th>
            <th className="py-2 text-left font-normal opacity-60">名稱</th>
            <th className="py-2 text-left font-normal opacity-60">建立時間</th>
          </tr>
        </thead>
        <tbody>
          {all.map((m) => (
            <tr key={m.id} className="border-b border-white/10">
              <td className="py-3 font-mono">{m.slug}</td>
              <td className="py-3">{m.name}</td>
              <td className="py-3 opacity-60">{m.createdAt.toISOString().slice(0, 10)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
