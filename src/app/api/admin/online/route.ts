/* پنل مدیریت — فهرست افراد آنلاینِ همین لحظه سایت.
   «آنلاین» یعنی heartbeat کمتر از ۹۰ ثانیه پیش — همان تعریف آرنا. */

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSetup } from "@/lib/public-data";
import { guard } from "@/lib/admin";
import type { OnlineMember } from "@/lib/types";

export const ONLINE_WINDOW_MS = 90_000;

export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  await ensureSetup();

  const members = await db.member.findMany({
    where: { lastSeenAt: { gte: new Date(Date.now() - ONLINE_WINDOW_MS) } },
    select: { id: true, name: true, username: true, lastSeenAt: true },
    orderBy: { lastSeenAt: "desc" },
    take: 100,
  });

  const list: OnlineMember[] = members.map((m) => ({
    id: m.id,
    name: m.name,
    username: m.username,
    lastSeenAt: (m.lastSeenAt ?? new Date()).toISOString(),
  }));

  return NextResponse.json({ online: list, count: list.length });
}
