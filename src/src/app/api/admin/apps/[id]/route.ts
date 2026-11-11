import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { guard } from "@/lib/admin";

const patchSchema = z.object({
  nameFa: z.string().min(1, "نام فارسی الزامی است").optional(),
  nameEn: z.string().optional(),
  categoryFa: z.string().optional(),
  categoryEn: z.string().optional(),
  descFa: z.string().optional(),
  descEn: z.string().optional(),
  icon: z.string().optional(),
  color: z.string().optional(),
  installsFa: z.string().optional(),
  installsEn: z.string().optional(),
  rating: z.string().optional(),
  bazaarUrl: z.string().nullable().optional(),
  playUrl: z.string().nullable().optional(),
  published: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

type Params = { params: Promise<{ id: string }> };

/** ویرایش اپ (شامل سوییچ انتشار) */
export async function PATCH(req: NextRequest, { params }: Params) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "درخواست نامعتبر است." }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "داده نامعتبر است." },
      { status: 400 }
    );
  }

  const data = { ...parsed.data };
  // رشته خالی برای لینک‌ها یعنی «بدون لینک»
  if (data.bazaarUrl === "") data.bazaarUrl = null;
  if (data.playUrl === "") data.playUrl = null;

  try {
    const app = await db.app.update({ where: { id }, data });
    return NextResponse.json({ app });
  } catch {
    return NextResponse.json({ error: "اپ پیدا نشد." }, { status: 404 });
  }
}

/** حذف اپ */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await params;

  try {
    await db.app.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "اپ پیدا نشد." }, { status: 404 });
  }
}
