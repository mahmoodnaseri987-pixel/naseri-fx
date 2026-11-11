/* پاک‌سازی اتاق‌های چت از پنل مدیریت.
   GET  → آمار پیام‌های فعلی (تعداد، قدیمی‌ترین پیام، پیام هر scope)
   POST {scope?: "all" | "lobby" | کد اتاق} → حذف پیام‌ها
   پاک‌سازی روزانهٔ خودکار در پایان هر روز با /api/cron/cleanup انجام می‌شود. */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSetup } from "@/lib/public-data";
import { guard } from "@/lib/admin";

export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  await ensureSetup();

  const [total, byScope, oldest] = await Promise.all([
    db.chatMessage.count(),
    db.chatMessage.groupBy({ by: ["scope"], _count: { _all: true } }),
    db.chatMessage.findFirst({ orderBy: { id: "asc" }, select: { createdAt: true } }),
  ]);

  return NextResponse.json({
    total,
    oldestAt: oldest?.createdAt.toISOString() ?? null,
    scopes: byScope
      .map((s) => ({ scope: s.scope, count: s._count._all }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 40),
  });
}

export async function POST(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;
  await ensureSetup();

  const body = await req.json().catch(() => ({}));
  const scope = typeof body.scope === "string" ? body.scope.trim().slice(0, 24) : "";

  /* scope خالی یا "all" = پاک‌سازی همهٔ چت‌ها (لابی و همهٔ اتاق‌ها و تیم‌ها) */
  const res = await db.chatMessage.deleteMany(scope && scope !== "all" ? { where: { scope } } : {});
  return NextResponse.json({ ok: true, deleted: res.count });
}
