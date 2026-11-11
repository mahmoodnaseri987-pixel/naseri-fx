import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guard } from "@/lib/admin";
import { ensureSetup } from "@/lib/public-data";
import { getArenaCatalog, saveArenaGameConfigs } from "@/lib/arena-catalog";
import type { AdminArenaGame, AdminArenaRoom } from "@/lib/types";

/* بخش «آرنا» پنل مدیریت:
   GET  → بازی‌های آرنا (ترتیب/وضعیت) + اتاق‌های فعال
   PUT  → ذخیرهٔ ترتیب و فعال/غیرفعال‌کردن بازی‌ها — بدنه: { games: [{slug, enabled}] } */

export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  await ensureSetup();

  const [catalog, rooms] = await Promise.all([
    getArenaCatalog(),
    db.room.findMany({
      where: { status: { in: ["lobby", "playing"] } },
      include: { members: true },
      orderBy: { createdAt: "desc" },
      take: 60,
    }),
  ]);

  const games: AdminArenaGame[] = catalog.map((g) => ({
    slug: g.slug,
    kind: g.kind,
    titleFa: g.titleFa,
    titleEn: g.titleEn,
    descFa: g.descFa,
    descEn: g.descEn,
    icon: g.icon,
    enabled: g.enabled,
    activeRooms: rooms.filter((r) => r.gameSlug === g.slug).length,
  }));

  const list: AdminArenaRoom[] = rooms.map((r) => ({
    code: r.code,
    gameSlug: r.gameSlug,
    roomNumber: r.roomNumber,
    status: r.status,
    memberCount: r.members.length,
    maxPlayers: r.maxPlayers,
    hostName: r.members.find((m) => m.isHost)?.name ?? "",
    createdAt: r.createdAt.toISOString(),
    lastActivity: r.lastActivity.toISOString(),
  }));

  return NextResponse.json({ games, rooms: list });
}

export async function PUT(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;
  await ensureSetup();

  const body = await req.json().catch(() => ({}));
  const games = Array.isArray(body?.games) ? body.games : null;

  const saved = await saveArenaGameConfigs(
    games.map((g: unknown) => {
      const item = g as { slug?: unknown; enabled?: unknown };
      return { slug: String(item?.slug ?? ""), enabled: Boolean(item?.enabled) };
    }),
  );
  if (!saved) {
    return NextResponse.json({ error: "فهرست بازی‌ها نامعتبر است." }, { status: 400 });
  }

  const rooms = await db.room.findMany({
    where: { status: { in: ["lobby", "playing"] } },
    include: { members: true },
    orderBy: { createdAt: "desc" },
    take: 60,
  });

  return NextResponse.json({
    games: saved.map((g) => ({
      slug: g.slug,
      kind: g.kind,
      titleFa: g.titleFa,
      titleEn: g.titleEn,
      descFa: g.descFa,
      descEn: g.descEn,
      icon: g.icon,
      enabled: g.enabled,
      activeRooms: rooms.filter((r) => r.gameSlug === g.slug).length,
    })),
  });
}
