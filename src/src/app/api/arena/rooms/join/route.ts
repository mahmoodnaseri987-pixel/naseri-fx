/* آرنا — عضویت در اتاق با کد */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSetup } from "@/lib/public-data";
import { memberGuard } from "@/lib/member-auth";

export async function POST(req: NextRequest) {
  await ensureSetup();
  const guard = await memberGuard();
  if ("denied" in guard) return guard.denied;

  const body = await req.json().catch(() => ({}));
  const code = String(body.code ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (code.length !== 5) {
    return NextResponse.json({ error: "bad code" }, { status: 400 });
  }

  const room = await db.room.findUnique({ where: { code }, include: { members: true } });
  if (!room || room.status === "finished") {
    return NextResponse.json({ error: "gone" }, { status: 404 });
  }

  /* اگر قبلاً داخل اتاق است، فقط حضورش را تازه کن — حتی وسط مسابقه
     (رفرش صفحه نباید بازیکن را از اتاق خودش بیرون بیندازد) */
  const already = room.members.find((m) => m.memberId === guard.member.id);
  if (already) {
    await db.roomMember.update({ where: { id: already.id }, data: { lastSeenAt: new Date() } });
    return NextResponse.json({ code: room.code });
  }

  if (room.status === "playing") {
    return NextResponse.json({ error: "playing" }, { status: 409 });
  }

  if (room.members.length >= room.maxPlayers) {
    return NextResponse.json({ error: "full" }, { status: 409 });
  }

  await db.roomMember.create({
    data: { roomId: room.id, memberId: guard.member.id, name: guard.member.name },
  });
  await db.room.update({ where: { id: room.id }, data: { lastActivity: new Date() } });

  return NextResponse.json({ code: room.code });
}
