import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guard } from "@/lib/admin";
import { ensureSetup } from "@/lib/public-data";

/* کلیدهای مجاز متن‌های سایت — هر چیزی خارج از این فهرست رد می‌شود */
export const CONTENT_KEYS = [
  "hero_badge_fa",
  "hero_badge_en",
  "hero_title_a_fa",
  "hero_title_a_en",
  "hero_title_b_fa",
  "hero_title_b_en",
  "hero_subtitle_fa",
  "hero_subtitle_en",
  "hero_stat1_value_fa",
  "hero_stat1_value_en",
  "hero_stat1_label_fa",
  "hero_stat1_label_en",
  "hero_stat2_value_fa",
  "hero_stat2_value_en",
  "hero_stat2_label_fa",
  "hero_stat2_label_en",
  "hero_stat3_value_fa",
  "hero_stat3_value_en",
  "hero_stat3_label_fa",
  "hero_stat3_label_en",
  "hero_stat4_value_fa",
  "hero_stat4_value_en",
  "hero_stat4_label_fa",
  "hero_stat4_label_en",
  "apps_title_fa",
  "apps_title_en",
  "apps_subtitle_fa",
  "apps_subtitle_en",
  "boxes_title_fa",
  "boxes_title_en",
  "boxes_subtitle_fa",
  "boxes_subtitle_en",
  "about_title_fa",
  "about_title_en",
  "about_p1_fa",
  "about_p1_en",
  "about_p2_fa",
  "about_p2_en",
  "footer_madewith_fa",
  "footer_madewith_en",
] as const;

/** دریافت همه متن‌های ذخیره‌شده */
export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  await ensureSetup();
  const rows = await db.siteContent.findMany();
  const content: Record<string, string> = {};
  for (const row of rows) {
    if (row.key.startsWith("mail_")) continue; // رازهای پنل در ویرایشگر متن‌ها نمی‌آیند
    content[row.key] = row.value;
  }
  return NextResponse.json({ content });
}

/** ذخیره متن‌ها — بدنه: { key: value, ... } فقط کلیدهای مجاز */
export async function PUT(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;
  await ensureSetup();

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "درخواست نامعتبر است." }, { status: 400 });
  }

  const updates = Object.entries(body).filter(
    ([key, value]) =>
      (CONTENT_KEYS as readonly string[]).includes(key) && typeof value === "string",
  );
  if (updates.length === 0) {
    return NextResponse.json({ error: "هیچ کلید معتبری برای ذخیره پیدا نشد." }, { status: 400 });
  }

  for (const [key, value] of updates) {
    const clean = (value as string).slice(0, 2000);
    await db.siteContent.upsert({
      where: { key },
      update: { value: clean },
      create: { key, value: clean },
    });
  }

  const rows = await db.siteContent.findMany();
  const content: Record<string, string> = {};
  for (const row of rows) {
    if (row.key.startsWith("mail_")) continue;
    content[row.key] = row.value;
  }
  return NextResponse.json({ content });
}
