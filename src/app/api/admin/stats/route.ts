import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guard } from "@/lib/admin";
import { ensureSetup } from "@/lib/public-data";

/** آمار کلی برای داشبورد مدیریت */
export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  await ensureSetup();

  const [appsTotal, appsPublished, boxesTotal, boxesPublished, mediaAgg, contentCount, membersTotal, gamesTotal, gamesPublished, playsTotal] =
    await Promise.all([
      db.app.count(),
      db.app.count({ where: { published: true } }),
      db.contentBox.count(),
      db.contentBox.count({ where: { published: true } }),
      db.media.aggregate({ _count: true, _sum: { size: true } }),
      db.siteContent.count(),
      db.member.count(),
      db.game.count(),
      db.game.count({ where: { published: true } }),
      db.game.aggregate({ _sum: { plays: true } }),
    ]);

  return NextResponse.json({
    stats: {
      appsTotal,
      appsPublished,
      boxesTotal,
      boxesPublished,
      mediaCount: mediaAgg._count ?? 0,
      mediaBytes: mediaAgg._sum.size ?? 0,
      contentCount,
      membersTotal,
      gamesTotal,
      gamesPublished,
      playsTotal: playsTotal._sum.plays ?? 0,
    },
  });
}
