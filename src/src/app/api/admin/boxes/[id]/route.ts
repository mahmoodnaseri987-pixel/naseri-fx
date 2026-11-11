import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guard } from "@/lib/admin";

const strField = (v: unknown, fallback = ""): string =>
  typeof v === "string" ? v.trim() : fallback;

/** ویرایش باکس */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "درخواست نامعتبر است." }, { status: 400 });
  }

  const titleFa = strField(body.titleFa);
  if (!titleFa) {
    return NextResponse.json({ error: "عنوان باکس (فارسی) الزامی است." }, { status: 400 });
  }

  try {
    const box = await db.contentBox.update({
      where: { id },
      data: {
        titleFa,
        titleEn: strField(body.titleEn) || titleFa,
        bodyFa: strField(body.bodyFa),
        bodyEn: strField(body.bodyEn),
        icon: strField(body.icon, "Sparkles"),
        color: strField(body.color, "emerald"),
        imageUrl: strField(body.imageUrl),
        videoUrl: strField(body.videoUrl),
        linkUrl: strField(body.linkUrl) || null,
        linkLabelFa: strField(body.linkLabelFa),
        linkLabelEn: strField(body.linkLabelEn),
        published: body.published === true,
        sortOrder:
          typeof body.sortOrder === "number" && Number.isFinite(body.sortOrder)
            ? Math.round(body.sortOrder)
            : 0,
      },
    });
    return NextResponse.json({ box });
  } catch {
    return NextResponse.json({ error: "باکس پیدا نشد." }, { status: 404 });
  }
}

/** حذف باکس */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await params;
  try {
    await db.contentBox.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "باکس پیدا نشد." }, { status: 404 });
  }
}
