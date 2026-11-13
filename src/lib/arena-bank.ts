import { db } from "@/lib/db";
import {
  ARENA_GAME_SLUG,
  type AgeGroup,
  type ArenaCategory,
  type ArenaQuestion,
  pickFromPool,
  pickQuestions,
} from "@/lib/arena-game";

/* بانک سؤال دیتابیسی «چالش سرعتی» — سؤال‌های اطلاعاتی عمومی که مدیر در بخش
   «بانک سؤال» پنل مدیریت اضافه/وارد می‌کند. اگر بانک به‌اندازهٔ کافی پر نبود
   یا خطا خورد، به بانک استاتیک داخل کد برمی‌گردیم تا شروع اتاق هرگز
   به خاطر بانک نلغزد. */
const MIN_DB_POOL = 40; // کمتر از این‌بار، بانک استاتیک مطمئن‌تر است

export async function pickQuestionsSmart(count: number, age: AgeGroup): Promise<ArenaQuestion[]> {
  if (age !== "kid") {
    try {
      const rows = await db.quizQuestion.findMany({
        where: { active: true, age: age === "pro" ? { in: ["adult", "pro"] } : "adult" },
      });
      if (rows.length >= Math.max(count, MIN_DB_POOL)) {
        const pool: ArenaQuestion[] = rows.map((r) => ({
          q: r.text,
          o: r.options as [string, string, string, string],
          a: r.correct,
          c: r.category as ArenaCategory,
        }));
        return pickFromPool(pool, count);
      }
    } catch {
      /* بانک دیتابیسی در دسترس نیست — بانک استاتیک */
    }
  }
  return pickQuestions(count, age);
}

/* خروجی SLUG برای جلوگیری از هشدار import بلااستفاده در بعضی ابزارها */
export const BANK_GAME_SLUG = ARENA_GAME_SLUG;
