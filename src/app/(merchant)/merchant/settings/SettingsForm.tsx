'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Save, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { THEME_PRESETS } from '@/lib/themes/presets';
import { updateMerchantAction } from './actions';

const FONT_OPTIONS = [
  { value: "'Noto Serif TC', serif", label: '思源宋體 (質感日系)' },
  { value: "'Noto Sans TC', sans-serif", label: '思源黑體 (現代簡潔)' },
];

const RADIUS_OPTIONS = [
  { value: '2px', label: '銳利 (2px)' },
  { value: '6px', label: '微圓 (6px)' },
  { value: '12px', label: '圓潤 (12px)' },
  { value: '20px', label: '柔和 (20px)' },
];

export function SettingsForm({
  name: initialName,
  slug: initialSlug,
  brandVoice: initialBrandVoice,
  themeVars: initialThemeVars,
  lowStockThreshold: initialThreshold,
  dailyAiCostCentsCap: initialCostCap,
}: {
  name: string;
  slug: string;
  brandVoice: string;
  themeVars: Record<string, string>;
  lowStockThreshold: number;
  dailyAiCostCentsCap: number;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [slug, setSlug] = useState(initialSlug);
  const [brandVoice, setBrandVoice] = useState(initialBrandVoice);
  const [primary, setPrimary] = useState(initialThemeVars['--brand-primary'] ?? '#8B7355');
  const [bg, setBg] = useState(initialThemeVars['--brand-bg'] ?? '#FAF8F5');
  const [text, setText] = useState(initialThemeVars['--brand-text'] ?? '#2C2416');
  const [radius, setRadius] = useState(initialThemeVars['--brand-radius'] ?? '6px');
  /**
   * V2.1.x: track which preset was last applied so the dropdown shows that preset name
   * instead of resetting to "Custom" (old UX issue). Manually changing any color/radius/font →
   * setAppliedPresetId(null).
   * Initial: if initialThemeVars exactly matches some preset → show that preset, otherwise "Custom".
   */
  const matchInitialPreset = (() => {
    const vars = initialThemeVars;
    return THEME_PRESETS.find(
      (p) =>
        p.themeVars['--brand-primary'].toLowerCase() === (vars['--brand-primary'] ?? '').toLowerCase() &&
        p.themeVars['--brand-bg'].toLowerCase() === (vars['--brand-bg'] ?? '').toLowerCase() &&
        p.themeVars['--brand-text'].toLowerCase() === (vars['--brand-text'] ?? '').toLowerCase() &&
        p.themeVars['--brand-radius'] === vars['--brand-radius'] &&
        p.themeVars['--brand-font-heading'] === vars['--brand-font-heading'],
    )?.id ?? '';
  })();
  const [appliedPresetId, setAppliedPresetId] = useState(matchInitialPreset);
  const [font, setFont] = useState(
    initialThemeVars['--brand-font-heading'] ?? "'Noto Sans TC', sans-serif",
  );
  const [lowStockThreshold, setLowStockThreshold] = useState<number>(initialThreshold);
  const [dailyAiCostCentsCap, setDailyAiCostCentsCap] = useState<number>(initialCostCap);
  const [pending, start] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const themeVars = {
        '--brand-primary': primary,
        '--brand-bg': bg,
        '--brand-text': text,
        '--brand-radius': radius,
        '--brand-font-heading': font,
      };

      const result = await updateMerchantAction({
        name,
        slug: slug !== initialSlug ? slug : undefined,
        brandVoice,
        themeVars,
        lowStockThreshold,
        dailyAiCostCentsCap,
      });

      if (!result.success) {
        toast.error(result.error ?? '儲存失敗');
        return;
      }
      toast.success('已儲存設定', {
        description:
          result.newSlug && result.newSlug !== initialSlug
            ? `店面網址改成 /store/${result.newSlug} 了`
            : '改變立刻套用到 storefront 跟 AI 文案生成',
        duration: 4000,
      });
      router.refresh();
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* Basic info */}
      <Section title="基本資訊">
        <div className="space-y-2">
          <Label className="t-caption" style={{ color: 'var(--brand-primary)' }}>
            店名
          </Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            required
            style={{
              borderColor: 'color-mix(in srgb, var(--brand-primary) 28%, transparent)',
              borderRadius: 'var(--brand-radius)',
            }}
          />
        </div>

        <div className="space-y-2">
          <Label className="t-caption" style={{ color: 'var(--brand-primary)' }}>
            店面網址 (slug)
          </Label>
          <div
            className="flex items-stretch overflow-hidden border"
            style={{
              borderColor: 'color-mix(in srgb, var(--brand-primary) 28%, transparent)',
              borderRadius: 'var(--brand-radius)',
            }}
          >
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
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase())}
              pattern="[a-z0-9][a-z0-9-]{1,30}[a-z0-9]"
              minLength={3}
              maxLength={32}
              required
              className="flex-1 border-0 font-mono"
              style={{ borderRadius: 0 }}
            />
          </div>
          {slug !== initialSlug && (
            <p className="t-caption" style={{ color: 'var(--warning)' }}>
              ⚠ 改 slug 後舊網址 /store/{initialSlug} 會 404, 通知過顧客的請小心
            </p>
          )}
        </div>
      </Section>

      {/* Brand voice */}
      <Section title="品牌語氣 (給 AI 文案用)">
        <div className="space-y-2">
          <Textarea
            value={brandVoice}
            onChange={(e) => setBrandVoice(e.target.value)}
            maxLength={200}
            rows={4}
            placeholder="例: 永康街選物店, 質感日系, 文字偏內斂, 不堆形容詞"
            style={{
              borderColor: 'color-mix(in srgb, var(--brand-primary) 28%, transparent)',
              borderRadius: 'var(--brand-radius)',
            }}
          />
          <p className="t-caption tabular-nums opacity-50">
            {brandVoice.length} / 200 · 改了之後下次 AI 生成商品文案會用這段語氣
          </p>
        </div>
      </Section>

      {/* Visual theme */}
      <Section title="視覺主題">
        {/* V2.1 preset theme dropdown — after applying you can fine-tune the 5 fields below; preset id is not stored in DB. */}
        <div className="space-y-2">
          <Label className="t-caption" style={{ color: 'var(--brand-primary)' }}>
            套用預設主題
          </Label>
          <select
            value={appliedPresetId}
            onChange={(e) => {
              const id = e.target.value;
              if (!id) {
                // User picked "Custom" — change nothing, dropdown reverts to ""
                setAppliedPresetId('');
                return;
              }
              const t = THEME_PRESETS.find((p) => p.id === id);
              if (!t) return;
              setPrimary(t.themeVars['--brand-primary']);
              setBg(t.themeVars['--brand-bg']);
              setText(t.themeVars['--brand-text']);
              setRadius(t.themeVars['--brand-radius']);
              setFont(t.themeVars['--brand-font-heading']);
              setAppliedPresetId(id);  // keep preset name in the dropdown
            }}
            className="w-full border bg-transparent px-3 py-2 text-sm"
            style={{
              borderColor: 'color-mix(in srgb, var(--brand-primary) 28%, transparent)',
              borderRadius: 'var(--brand-radius)',
              color: 'var(--brand-text)',
            }}
          >
            <option value="">— 自訂 —</option>
            {THEME_PRESETS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.emoji} {t.label} — {t.hint}
              </option>
            ))}
          </select>
          <p className="t-caption opacity-50">
            套用後會覆蓋下方 5 個欄位 (主色 / 底色 / 文字色 / 圓角 / 字型). 手動改任一欄會回到「自訂」.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <ColorField
            label="主色 (primary)"
            value={primary}
            onChange={(v) => { setPrimary(v); setAppliedPresetId(''); }}
          />
          <ColorField
            label="底色 (bg)"
            value={bg}
            onChange={(v) => { setBg(v); setAppliedPresetId(''); }}
          />
          <ColorField
            label="文字色"
            value={text}
            onChange={(v) => { setText(v); setAppliedPresetId(''); }}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label className="t-caption" style={{ color: 'var(--brand-primary)' }}>
              圓角風格
            </Label>
            <select
              value={radius}
              onChange={(e) => { setRadius(e.target.value); setAppliedPresetId(''); }}
              className="w-full border bg-transparent px-3 py-2 text-sm"
              style={{
                borderColor: 'color-mix(in srgb, var(--brand-primary) 28%, transparent)',
                borderRadius: 'var(--brand-radius)',
                color: 'var(--brand-text)',
              }}
            >
              {RADIUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label className="t-caption" style={{ color: 'var(--brand-primary)' }}>
              標題字型
            </Label>
            <select
              value={font}
              onChange={(e) => { setFont(e.target.value); setAppliedPresetId(''); }}
              className="w-full border bg-transparent px-3 py-2 text-sm"
              style={{
                borderColor: 'color-mix(in srgb, var(--brand-primary) 28%, transparent)',
                borderRadius: 'var(--brand-radius)',
                color: 'var(--brand-text)',
              }}
            >
              {FONT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Live preview */}
        <motion.div
          layout
          className="mt-4 p-6"
          style={{
            backgroundColor: bg,
            color: text,
            borderRadius: radius,
            border: `1px solid ${primary}33`,
            transition: 'all 600ms ease',
          }}
        >
          <p
            className="text-2xl font-bold"
            style={{ color: primary, fontFamily: font }}
          >
            {name || '你的店名'}
          </p>
          <p className="mt-2 text-sm opacity-70">
            這是 storefront 預覽 — 顧客打開 /store/{slug || initialSlug} 會看到的色調
          </p>
        </motion.div>
      </Section>

      {/* Operations settings */}
      <Section title="營運設定">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label className="t-caption" style={{ color: 'var(--brand-primary)' }}>
              低庫存警示閾值
            </Label>
            <Input
              type="number"
              min={0}
              max={10000}
              value={lowStockThreshold}
              onChange={(e) => setLowStockThreshold(Math.max(0, Math.min(10000, Number(e.target.value) || 0)))}
              required
              style={{
                borderColor: 'color-mix(in srgb, var(--brand-primary) 28%, transparent)',
                borderRadius: 'var(--brand-radius)',
              }}
            />
            <p className="t-caption opacity-50">
              庫存 ≤ 此值會在商品列表顯示紅徽章警示 (預設 5)
            </p>
          </div>

          <div className="space-y-2">
            <Label className="t-caption" style={{ color: 'var(--brand-primary)' }}>
              每日 AI 成本上限 (NT$)
            </Label>
            <Input
              type="number"
              min={100}
              max={100000}
              value={Math.floor(dailyAiCostCentsCap / 100)}
              onChange={(e) =>
                setDailyAiCostCentsCap(
                  Math.max(100, Math.min(100000, Number(e.target.value) || 0)) * 100,
                )
              }
              required
              style={{
                borderColor: 'color-mix(in srgb, var(--brand-primary) 28%, transparent)',
                borderRadius: 'var(--brand-radius)',
              }}
            />
            <p className="t-caption opacity-50">
              每天 IG/蝦皮 import + 上架 GPT-4o token 累計超過 → 暫停 (預設 NT$ 50)
            </p>
          </div>
        </div>
      </Section>

      <div className="flex items-center justify-between pt-4">
        <a
          href={`/store/${initialSlug}`}
          target="_blank"
          rel="noreferrer"
          className="t-small inline-flex items-center gap-1 underline"
          style={{ color: 'var(--brand-primary)' }}
        >
          <Eye className="h-3.5 w-3.5" strokeWidth={2.2} />
          查看 storefront
        </a>
        <Button
          type="submit"
          disabled={pending}
          className="hover-lift inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold elev-2"
          style={{
            backgroundColor: 'var(--brand-primary)',
            color: 'var(--brand-bg)',
            borderRadius: 'var(--brand-radius)',
            fontFamily: 'var(--brand-font-heading)',
          }}
        >
          <Save className="h-4 w-4" strokeWidth={2} />
          {pending ? '儲存中...' : '儲存設定'}
        </Button>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      className="space-y-4 border p-6"
      style={{
        borderColor: 'color-mix(in srgb, var(--brand-primary) 16%, transparent)',
        borderRadius: 'var(--brand-radius)',
        backgroundColor: 'color-mix(in srgb, var(--brand-primary) 2%, var(--brand-bg))',
      }}
    >
      <h2
        className="t-h3"
        style={{ fontFamily: 'var(--brand-font-heading)', color: 'var(--brand-text)' }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label className="t-caption" style={{ color: 'var(--brand-primary)' }}>
        {label}
      </Label>
      <div
        className="flex items-stretch overflow-hidden border"
        style={{
          borderColor: 'color-mix(in srgb, var(--brand-primary) 28%, transparent)',
          borderRadius: 'var(--brand-radius)',
        }}
      >
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-12 cursor-pointer border-0 bg-transparent"
          style={{ padding: 0 }}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={9}
          pattern="^#[0-9a-fA-F]{6,8}$"
          className="flex-1 border-0 bg-transparent px-2 font-mono text-sm outline-none"
          style={{ color: 'var(--brand-text)' }}
        />
      </div>
    </div>
  );
}
