/**
 * Zod productSchema — structured validation for GPT-4o vision output.
 *
 * Source: engineering-handoff-specs §2.2
 *
 * Design highlights:
 * - The entire schema uses .strict() — GPT cannot sneak in extra fields (prevents
 *   prompt-injection-piggybacked data exfiltration).
 * - The safeText helper scans for forbidden phrases (medical claims / counterfeit /
 *   URL / contact info); a hit fails validation immediately so the worker can
 *   retry or fall back.
 * - title, description, and tags all go through safeText.
 * - confidence is 0–1, letting downstream UI decide "should we show a warning".
 */

import { z } from 'zod';

// ============================================================
// Forbidden-phrase regex — any hit fails validation.
// ============================================================

// Medical efficacy claims — banned by Taiwan's Pharmaceutical Affairs Act, Food Safety Act, and Cosmetic Hygiene Act.
export const FORBIDDEN_MEDICAL =
  /(治療|療效|根治|治癒|預防(癌|病|症)|抗癌|降血壓|降血糖|消炎|殺菌|藥效|藥用|處方|醫療級|臨床證實)/;

// Counterfeit / grey-market hints.
export const FORBIDDEN_COUNTERFEIT =
  /(正品代購|A\s*貨|超A|高仿|一比一|原單|尾單|工廠流出|海關沒收|莆田|外貿原單)/;

// URL / email / phone / LINE ID — prevents GPT from sneaking outbound contact methods into descriptions.
export const URL_OR_CONTACT =
  /(https?:\/\/|www\.|\b[\w.-]+@[\w.-]+\.\w+|line\s*[:：]|加\s*line|微信|wechat|tg\s*[:：]|t\.me\/|\b09\d{2}[-\s]?\d{3}[-\s]?\d{3}\b)/i;

// ============================================================
// safeText helper — length check + forbidden-phrase check.
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
// Product category enum — V1 scope defines 8 categories; expand later.
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
// Main schema
// ============================================================

// V1: relaxed min length so fallback can pass (max + forbidden-phrase refine remain strict).
//
// V2.6.2: removed `.default([])` from seo_tags + variants. AI SDK v6 emits
// strict OpenAI structured-output schemas — every property must be in
// `required` or the API rejects with "Invalid schema for response_format
// 'response': 'required' is required to be supplied and to be an array
// including every key in properties." Default values mark fields as
// optional in zod's JSON schema output, breaking strict mode. Removing
// them just means the LLM must return both fields (even as `[]`) — which
// it now does under strict mode automatically.
export const productSchema = z
  .object({
    // Product title — 1-60 chars (relaxed to accommodate fallback "needs manual review").
    title: safeText(1, 60),

    // Description — 1-800 chars.
    description: safeText(1, 800),

    // Category.
    category: z.enum(CATEGORY_ENUM),

    // SEO tags — 0-10 entries (LLM may emit [] for fixture-fallback rows).
    seo_tags: z.array(safeText(1, 20)).max(10),

    // Variants — 0-6 entries.
    variants: z
      .array(
        z
          .object({
            name: safeText(1, 20),
            options: z.array(safeText(1, 20)).min(1).max(10),
          })
          .strict(),
      )
      .max(6),

    // Price suggestion (TWD).
    price_twd: z
      .object({
        min: z.number().int().nonnegative().max(1_000_000),
        max: z.number().int().nonnegative().max(1_000_000),
      })
      .strict()
      .refine((p) => p.max >= p.min, { message: 'price_twd.max 必須 >= min' }),

    // Model's self-rated confidence 0–1.
    confidence: z.number().min(0).max(1),
  })
  .strict(); // No extra fields from GPT.

export type ProductOutput = z.infer<typeof productSchema>;
