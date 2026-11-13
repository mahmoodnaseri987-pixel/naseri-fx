/* شمارندهٔ آنلاین‌های سایت — عمومی و بدون احراز هویت.
   «آنلاین» یعنی heartbeat (آخرین lastSeenAt) کمتر از ۹۰ ثانیه پیش —
   همان تعریف پنجرهٔ پنل مدیریت؛ ثابت این‌جا مستقل نوشته شده تا مسیر
   عمومی به مسیر ادمین وابسته نماند. کوئری سبک count است. */

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSetup } from "@/lib/public-data";

const ONLINE_WINDOW_MS = 90_000;

export async function GET() {
  await ensureSetup();

  let count = 0;
  try {
    count = await db.member.count({
      where: { lastSeenAt: { gte: new Date(Date.now() - ONLINE_WINDOW_MS) } },
    });
  } catch {
    /* خطای گذرا — کلاینت چیپ را مخفی می‌کند و دور بعد درست می‌شود */
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  return NextResponse.json(
    { count },
    { headers: { "Cache-Control": "no-store" } },
  );
}
