import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guard } from "@/lib/admin";
import { QUIZ_CATEGORIES, serialize, validateQuestion } from "@/lib/quiz-bank";
import type { Prisma } from "@prisma/client";

/* بخش «بانک سؤال» پنل مدیریت — فهرست، جست‌وجو، افزودن دستی */

export async function GET(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;

  const sp = req.nextUrl.searchParams;
  const page = Math.max(1, Number(sp.get("page") ?? "1") || 1);
  const pageSize = Math.min(100, Math.max(10, Number(sp.get("pageSize") ?? "25") || 25));
  const q = (sp.get("q") ?? "").trim();
  const category = sp.get("category") ?? "";

  const where: Prisma.QuizQuestionWhereInput = {
    ...(q ? { text: { contains: q } } : {}),
    ...(QUIZ_CATEGORIES.includes(category) ? { category } : {}),
  };

  /* اگر جدول بانک هنوز نساخته شده (پنجرهٔ بین دیپلوی و بارگذاری) به‌جای خطا، خالی برگردان */
  try {
    const [items, total, groups, activeCount] = await Promise.all([
      db.quizQuestion.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.quizQuestion.count({ where }),
      db.quizQuestion.groupBy({ by: ["category"], _count: true }),
      db.quizQuestion.count({ where: { active: true } }),
    ]);

    const byCategory: Record<string, number> = {};
    for (const g of groups) byCategory[g.category] = g._count;

    return NextResponse.json({
      items: items.map(serialize),
      total,
      page,
      pageSize,
      stats: { total: groups.reduce((s, g) => s + g._count, 0), active: activeCount, byCategory },
    });
  } catch {
    return NextResponse.json({
      items: [],
      total: 0,
      page,
      pageSize,
      stats: { total: 0, active: 0, byCategory: {} },
    });
  }
}

export async function POST(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const invalid = validateQuestion(body);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  const row = await db.quizQuestion.create({
    data: {
      text: String(body.text).trim(),
      options: body.options as Prisma.InputJsonValue,
      correct: Number(body.correct),
      category: String(body.category),
      age: String(body.age ?? "adult"),
    },
  });
  return NextResponse.json({ item: serialize(row) }, { status: 201 });
}
