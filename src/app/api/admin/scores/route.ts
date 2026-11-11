/* پنل مدیریت — مدیریت رکوردهای جدول برترین‌ها.
   GET    ?gameSlug=…  → ۱۰۰ رکورد اخیر (+ فهرست بازی‌ها با تعداد رکورد)
   DELETE {id}         → حذف یک رکورد
   DELETE {gameSlug,all:true} → پاک‌سازی همه رکوردهای یک بازی */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSetup } from "@/lib/public-data";
import { guard } from "@/lib/admin";

export async function GET(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;
  await ensureSetup();

  const gameSlug = (new URL(req.url).searchParams.get("gameSlug") ?? "")
    .trim()
    .slice(0, 60);

  const rows = await db.gameScore.findMany({
    where: gameSlug ? { gameSlug } : undefined,
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const games = await db.gameScore.groupBy({
    by: ["gameSlug"],
    _count: { _all: true },
  });

  return NextResponse.json({
    scores: rows.map((r) => ({
      id: r.id,
      gameSlug: r.gameSlug,
      name: r.name,
      score: r.score,
      isMember: r.memberId !== "",
      detail: r.detail,
      createdAt: r.createdAt.toISOString(),
    })),
    games: games
      .map((g) => ({ gameSlug: g.gameSlug, count: g._count._all }))
      .sort((a, b) => b.count - a.count),
  });
}

export async function DELETE(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));

  if (typeof body.id === "string" && body.id) {
    const deleted = await db.gameScore
      .delete({ where: { id: body.id } })
      .catch(() => null);
    return NextResponse.json({ ok: true, deleted: deleted ? 1 : 0 });
  }

  const gameSlug =
    typeof body.gameSlug === "string" ? body.gameSlug.trim().slice(0, 60) : "";
  if (gameSlug && body.all === true) {
    const res = await db.gameScore.deleteMany({ where: { gameSlug } });
    return NextResponse.json({ ok: true, deleted: res.count });
  }

  return NextResponse.json({ error: "bad request" }, { status: 400 });
}
