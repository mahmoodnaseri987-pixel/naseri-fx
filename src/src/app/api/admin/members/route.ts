import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guard } from "@/lib/admin";
import { ensureSetup } from "@/lib/public-data";
import type { AdminMember } from "@/lib/types";

/* فهرست اعضای سایت + تعداد اجرای بازی هر عضو */
export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  await ensureSetup();

  const [members, playCounts] = await Promise.all([
    db.member.findMany({ orderBy: { createdAt: "desc" } }),
    db.gamePlay.groupBy({ by: ["memberId"], _count: true }),
  ]);

  const playMap = new Map(playCounts.map((p) => [p.memberId, p._count]));
  const list: AdminMember[] = members.map((m) => ({
    id: m.id,
    name: m.name,
    username: m.username,
    avatarUrl: m.avatarUrl,
    createdAt: m.createdAt.toISOString(),
    blocked: m.blocked,
    lastLoginAt: m.lastLoginAt ? m.lastLoginAt.toISOString() : null,
    playCount: playMap.get(m.id) ?? 0,
  }));

  return NextResponse.json({ members: list });
}
