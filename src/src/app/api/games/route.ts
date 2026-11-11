import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSetup } from "@/lib/public-data";

/* فهرست عمومی بازی‌های منتشرشده (بدون محتوای فایل) */
export async function GET() {
  await ensureSetup();
  const rows = await db.game.findMany({
    where: { published: true },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      slug: true,
      titleFa: true,
      titleEn: true,
      descFa: true,
      descEn: true,
      icon: true,
      color: true,
      coverUrl: true,
      plays: true,
      sortOrder: true,
    },
  });
  return NextResponse.json({ games: rows });
}
