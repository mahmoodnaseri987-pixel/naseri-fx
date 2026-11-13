import { CATEGORY_LABELS } from "@/lib/arena-game";
import type { Prisma } from "@prisma/client";

/* توابع مشترک «بانک سؤال» — چون فایل‌های route.ts فقط می‌توانند هندلر HTTP
   اکسپورت کنند، این helperها در lib زندگی می‌کنند و مسیرها import می‌کنند. */

export const QUIZ_CATEGORIES = Object.keys(CATEGORY_LABELS);
const AGES = new Set(["kid", "adult", "pro"]);

export type QuizRow = {
  id: string;
  category: string;
  age: string;
  text: string;
  options: Prisma.JsonValue;
  correct: number;
  active: boolean;
  createdAt: Date;
};

export function serialize(r: QuizRow) {
  return {
    id: r.id,
    category: r.category,
    age: r.age,
    text: r.text,
    options: r.options,
    correct: r.correct,
    active: r.active,
    createdAt: r.createdAt.toISOString(),
  };
}

/* اعتبارسنجی افزودن/ویرایش دستی — خروجی: پیام خطا یا null */
export function validateQuestion(body: Record<string, unknown>): string | null {
  const text = typeof body.text === "string" ? body.text.trim() : "";
  const options = Array.isArray(body.options) ? body.options : [];
  const correct = Number(body.correct);
  const category = String(body.category ?? "");
  const age = String(body.age ?? "adult");
  if (text.length < 5 || text.length > 300) return "متن سؤال باید بین ۵ تا ۳۰۰ نویسه باشد.";
  if (options.length !== 4 || options.some((o) => typeof o !== "string" || !o.trim()))
    return "دقیقاً ۴ گزینهٔ غیرخالی لازم است.";
  if (new Set(options.map((o) => String(o).trim())).size !== 4) return "گزینه‌ها نباید تکراری باشند.";
  if (!Number.isInteger(correct) || correct < 0 || correct > 3) return "اندیس گزینهٔ درست باید ۰ تا ۳ باشد.";
  if (!QUIZ_CATEGORIES.includes(category)) return "دسته نامعتبر است.";
  if (!AGES.has(age)) return "گروه سنی نامعتبر است.";
  return null;
}

/* نرمال‌سازی سؤال ورود گروهی — قالب کوتاه {c,q,o,a} یا بلند {category,text,options,correct} */
export function normalizeImported(r: Record<string, unknown>): {
  text: string;
  options: string[];
  correct: number;
  category: string;
} | null {
  const text =
    typeof r.q === "string" && r.q.trim() ? r.q.trim() : typeof r.text === "string" ? r.text.trim() : "";
  const optsRaw = Array.isArray(r.o) ? r.o : Array.isArray(r.options) ? r.options : [];
  const options = optsRaw.map((o) => String(o ?? "").trim());
  const correct = Number(r.a ?? r.correct);
  const category = String(r.c ?? r.category ?? "").trim();
  if (text.length < 5 || text.length > 300) return null;
  if (options.length !== 4 || options.some((o) => !o)) return null;
  if (new Set(options).size !== 4) return null;
  if (!Number.isInteger(correct) || correct < 0 || correct > 3) return null;
  if (!QUIZ_CATEGORIES.includes(category)) return null;
  return { text, options, correct, category };
}
