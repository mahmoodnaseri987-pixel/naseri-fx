import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guard } from "@/lib/admin";
import { ensureSetup } from "@/lib/public-data";

const strField = (v: unknown, fallback = ""): string =>
  typeof v === "string" ? v.trim() : fallback;

export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  await ensureSetup();
  const apps = await db.app.findMany({ orderBy: { sortOrder: "asc" } });
  return NextResponse.json({ apps });
}

/** افزودن اپ جدید */
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

  const nameFa = strField(body.nameFa);
  const nameEn = strField(body.nameEn) || nameFa;
  if (!nameFa) {
    return NextResponse.json({ error: "نام اپ (فارسی) الزامی است." }, { status: 400 });
  }

  const maxOrder = await db.app.aggregate({ _max: { sortOrder: true } });

  const app = await db.app.create({
    data: {
      nameFa,
      nameEn,
      categoryFa: strField(body.categoryFa, "اپلیکیشن موبایل"),
      categoryEn: strField(body.categoryEn, "Mobile app"),
      descFa: strField(body.descFa, "توضیحات به‌زودی اضافه می‌شود."),
      descEn: strField(body.descEn, "Description coming soon."),
      icon: strField(body.icon, "Sparkles"),
      color: strField(body.color, "emerald"),
      installsFa: strField(body.installsFa, "۰"),
      installsEn: strField(body.installsEn, "0"),
      rating: strField(body.rating, "4.5"),
      bazaarUrl: strField(body.bazaarUrl) || null,
      playUrl: strField(body.playUrl) || null,
      published: body.published === true,
      sortOrder:
        typeof body.sortOrder === "number" && Number.isFinite(body.sortOrder)
          ? Math.round(body.sortOrder)
          : (maxOrder._max.sortOrder ?? 0) + 10,
    },
  });

  return NextResponse.json({ app }, { status: 201 });
}
