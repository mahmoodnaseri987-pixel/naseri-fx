import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guard } from "@/lib/admin";
import { ensureSetup } from "@/lib/public-data";

const strField = (v: unknown, fallback = ""): string =>
  typeof v === "string" ? v.trim() : fallback;

/** فهرست همه باکس‌ها (منتشرشده و پیش‌نویس) */
export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  await ensureSetup();
  const boxes = await db.contentBox.findMany({ orderBy: { sortOrder: "asc" } });
  return NextResponse.json({ boxes });
}

/** افزودن باکس جدید */
export async function POST(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;
  await ensureSetup();

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

  const maxOrder = await db.contentBox.aggregate({ _max: { sortOrder: true } });

  const box = await db.contentBox.create({
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
          : (maxOrder._max.sortOrder ?? 0) + 10,
    },
  });

  return NextResponse.json({ box }, { status: 201 });
}
