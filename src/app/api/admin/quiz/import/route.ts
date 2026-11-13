import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guard } from "@/lib/admin";
import { normalizeImported } from "@/lib/quiz-bank";

/* ورود گروهی سؤال به بانک — قالب: آرایه‌ای از
   { c, q, o: [۴ گزینه], a } یا { category, text, options: [۴ گزینه], correct }
   سؤال‌های تکراری (متن یکسان) و نامعتبرها رد می‌شوند و گزارش داده می‌شود. */

export async function POST(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;

  const body = (await req.json().catch(() => ({}))) as { questions?: Record<string, unknown>[] };
  const raw = Array.isArray(body.questions) ? body.questions : [];
  if (!raw.length) return NextResponse.json({ error: "آرایه‌ای از سؤال‌ها لازم است." }, { status: 400 });

  const existing = await db.quizQuestion.findMany({ select: { text: true } });
  const seen = new Set(existing.map((r) => r.text.replace(/\s+/g, " ").trim()));

  const toInsert: {
    text: string;
    options: string[];
    correct: number;
    category: string;
    age: string;
  }[] = [];
  let invalid = 0;
  let dup = 0;

  for (const r of raw) {
    const n = normalizeImported(r);
    if (!n) {
      invalid++;
      continue;
    }
    const key = n.text.replace(/\s+/g, " ").trim();
    if (seen.has(key)) {
      dup++;
      continue;
    }
    seen.add(key);
    toInsert.push({ ...n, age: "adult" });
  }

  if (toInsert.length) {
    await db.quizQuestion.createMany({ data: toInsert });
  }
  return NextResponse.json({ inserted: toInsert.length, duplicate: dup, invalid });
}
