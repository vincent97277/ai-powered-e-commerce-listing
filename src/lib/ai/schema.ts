/**
 * Zod productSchema — GPT-4o vision 輸出的結構化驗證
 *
 * 來源：engineering-handoff-specs §2.2
 *
 * 設計重點：
 * - 整個 schema 用 .strict() — 不允許 GPT 多塞 extra fields（防 prompt
 *   injection 順便偷夾資料）
 * - safeText helper 會掃過去禁字（醫療療效 / 仿冒 / URL / 聯絡方式），
 *   命中任何一個就直接 fail validation，讓 worker 走 retry / fallback
 * - title、description、tags 全部都過 safeText
 * - confidence 0–1，給下游 UI 決定「要不要顯示警示」
 */

import { z } from 'zod';

// ============================================================
// 禁字 regex — 命中即 fail
// ============================================================

// 醫療療效詞 — 台灣藥事法 / 食安法 / 化妝品衛生安全管理法都禁
export const FORBIDDEN_MEDICAL =
  /(治療|療效|根治|治癒|預防(癌|病|症)|抗癌|降血壓|降血糖|消炎|殺菌|藥效|藥用|處方|醫療級|臨床證實)/;

// 仿冒 / 灰色暗示
export const FORBIDDEN_COUNTERFEIT =
  /(正品代購|A\s*貨|超A|高仿|一比一|原單|尾單|工廠流出|海關沒收|莆田|外貿原單)/;

// URL / email / 電話 / LINE ID — 防止 GPT 在描述中塞外連
export const URL_OR_CONTACT =
  /(https?:\/\/|www\.|\b[\w.-]+@[\w.-]+\.\w+|line\s*[:：]|加\s*line|微信|wechat|tg\s*[:：]|t\.me\/|\b09\d{2}[-\s]?\d{3}[-\s]?\d{3}\b)/i;

// ============================================================
// safeText helper — 字串長度 + 禁字檢查
// ============================================================

const safeText = (min: number, max: number) =>
  z
    .string()
    .min(min, `太短（< ${min}）`)
    .max(max, `太長（> ${max}）`)
    .refine((s) => !FORBIDDEN_MEDICAL.test(s), { message: '含醫療療效詞' })
    .refine((s) => !FORBIDDEN_COUNTERFEIT.test(s), { message: '含仿冒暗示' })
    .refine((s) => !URL_OR_CONTACT.test(s), { message: '含外連 / 聯絡方式' });

// ============================================================
// 商品分類 enum — hackathon scope 先定 8 類，之後再擴
// ============================================================

export const CATEGORY_ENUM = [
  '服飾配件',
  '美妝保養',
  '食品飲料',
  '居家生活',
  '3C 周邊',
  '文具書籍',
  '運動戶外',
  '其他',
] as const;

// ============================================================
// 主 schema
// ============================================================

// Hackathon: 放寬 min length 讓 fallback 也能 pass (max + 禁字 refine 仍嚴格)
export const productSchema = z
  .object({
    // 商品標題 — 1-60 字 (放寬以容納 fallback「需人工審核」)
    title: safeText(1, 60),

    // 描述 — 1-800 字
    description: safeText(1, 800),

    // 分類
    category: z.enum(CATEGORY_ENUM),

    // SEO tags — 0-10 個 (fallback 可以空)
    seo_tags: z.array(safeText(1, 20)).max(10).default([]),

    // 變體 — 0-6 個
    variants: z
      .array(
        z
          .object({
            name: safeText(1, 20),
            options: z.array(safeText(1, 20)).min(1).max(10),
          })
          .strict(),
      )
      .max(6)
      .default([]),

    // 定價建議 (新台幣)
    price_twd: z
      .object({
        min: z.number().int().nonnegative().max(1_000_000),
        max: z.number().int().nonnegative().max(1_000_000),
      })
      .strict()
      .refine((p) => p.max >= p.min, { message: 'price_twd.max 必須 >= min' }),

    // 模型自評 confidence 0–1
    confidence: z.number().min(0).max(1),
  })
  .strict(); // 不允許 GPT 多塞欄位

export type ProductOutput = z.infer<typeof productSchema>;
