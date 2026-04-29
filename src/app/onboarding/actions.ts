'use server';

/**
 * 商家自助註冊 — Hackathon 簡化:
 * - 不做 email 驗證
 * - 不做 captcha
 * - 不做唯一性檢查 (slug UNIQUE constraint 會擋)
 * - 直接寫 merchants + 設 cookie
 */

import { dbAdmin } from '@/db/admin-only';
import { merchants } from '@/db/schema';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/; // lowercase letters/digits/dash, 3-32 chars

export type CreateMerchantState = {
  error?: string;
  slug?: string;
};

export async function createMerchantAction(
  _prev: CreateMerchantState,
  formData: FormData,
): Promise<CreateMerchantState> {
  const slug = String(formData.get('slug') ?? '').trim().toLowerCase();
  const name = String(formData.get('name') ?? '').trim();
  const brandVoice = String(formData.get('brandVoice') ?? '').trim();

  if (!SLUG_REGEX.test(slug)) {
    return { error: 'Slug 必須 3-32 字，只能包含小寫字母、數字、橫線 (中間)' };
  }
  if (name.length < 1 || name.length > 60) {
    return { error: '店名 1-60 字' };
  }

  // 隨機挑一套 theme (akami / afen) 當預設，商家後台再改
  const themePicks = [
    {
      '--brand-primary': '#8B7355',
      '--brand-bg': '#FAF8F5',
      '--brand-text': '#2C2416',
      '--brand-radius': '2px',
      '--brand-font-heading': "'Noto Serif TC', serif",
    },
    {
      '--brand-primary': '#E63946',
      '--brand-bg': '#FFF8E7',
      '--brand-text': '#1D3557',
      '--brand-radius': '12px',
      '--brand-font-heading': "'Noto Sans TC', sans-serif",
    },
    {
      '--brand-primary': '#2A9D8F',
      '--brand-bg': '#F4F9F7',
      '--brand-text': '#1B2D2A',
      '--brand-radius': '6px',
      '--brand-font-heading': "'Noto Sans TC', sans-serif",
    },
  ];
  const theme = themePicks[Math.floor(Math.random() * themePicks.length)];

  try {
    const inserted = await dbAdmin
      .insert(merchants)
      .values({
        slug,
        name,
        brandVoice: brandVoice.slice(0, 200),
        themeVars: theme,
      })
      .returning({ id: merchants.id, slug: merchants.slug });

    const newMerchantId = inserted[0].id;

    // 設 cookie 切到新 merchant — 用「動態」merchant 模式 (用 tenant uuid 當 cookie 值)
    const c = await cookies();
    c.set('demo-merchant-id', newMerchantId, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    });

    revalidatePath('/admin');
  } catch (err) {
    if (err instanceof Error && err.message.includes('duplicate')) {
      return { error: `slug 「${slug}」已被使用，換一個試試` };
    }
    return { error: err instanceof Error ? err.message : '建立失敗' };
  }

  // redirect 必須在 try 外面 (Next.js redirect 用 throw 機制)
  redirect('/merchant/products/new');
}
