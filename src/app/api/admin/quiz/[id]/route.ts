import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guard } from "@/lib/admin";
import { validateQuestion } from "@/lib/quiz-bank";
import type { Prisma } from "@prisma/client";

/* ویرایش/فعال‌غیرفعال‌سازی/حذف یک سؤال بانک */

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await params;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  /* حالت سبک: فقط کلید active */
  if (Object.keys(body).length === 1 && "active" in body) {
    const row = await db.quizQuestion.update({
      where: { id },
      data: { active: Boolean(body.active) },
    });
    return NextResponse.json({ item: { id: row.id, active: row.active } });
  }

  const invalid = validateQuestion(body);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
  const row = await db.quizQuestion.update({
    where: { id },
    data: {
      text: String(body.text).trim(),
      options: body.options as Prisma.InputJsonValue,
      correct: Number(body.correct),
      category: String(body.category),
      age: String(body.age ?? "adult"),
    },
  });
  return NextResponse.json({ item: { id: row.id } });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await params;
  await db.quizQuestion.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
