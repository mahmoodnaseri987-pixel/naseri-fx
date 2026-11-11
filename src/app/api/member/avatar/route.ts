/* ست‌کردن / تغییر عکس پروفایل عضو واردشده */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { memberGuard } from "@/lib/member-auth";
import { parseAvatar, avatarDataUrl } from "@/lib/avatar";

export async function POST(req: NextRequest) {
  const guard = await memberGuard();
  if ("denied" in guard) return guard.denied;

  const body = await req.json().catch(() => ({}));
  const parsed = parseAvatar(body.avatar);
  if (!parsed) {
    return NextResponse.json({ error: "bad avatar" }, { status: 400 });
  }

  await db.member.update({
    where: { id: guard.member.id },
    data: { avatarUrl: avatarDataUrl(parsed) },
  });

  return NextResponse.json({ ok: true });
}
