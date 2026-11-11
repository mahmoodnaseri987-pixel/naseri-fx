import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guard } from "@/lib/admin";
import { ensureSetup } from "@/lib/public-data";
import { decryptCode } from "@/lib/notify";
import type { AdminPasswordReset } from "@/lib/types";

/* کدهای بازیابی رمز در انتظار — برای وقتی سرویس پیامک/ایمیل تنظیم نیست
   و کد باید از طریق مدیر به عضو برسد. فقط ۳۰ دقیقه آخر برمی‌گردد. */

export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  await ensureSetup();

  const rows = await db.passwordReset.findMany({
    where: {
      usedAt: null,
      expiresAt: { gt: new Date() },
      createdAt: { gt: new Date(Date.now() - 30 * 60 * 1000) },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  if (rows.length === 0) return NextResponse.json({ resets: [] });

  const members = await db.member.findMany({
    where: { id: { in: rows.map((r) => r.memberId) } },
    select: { id: true, name: true },
  });
  const nameMap = new Map(members.map((m) => [m.id, m.name]));

  const resets: AdminPasswordReset[] = [];
  for (const r of rows) {
    const code = await decryptCode(r.codeEnc);
    if (!code) continue;
    const channel: AdminPasswordReset["channel"] =
      r.channel === "sms" || r.channel === "email" ? r.channel : "admin";
    resets.push({
      id: r.id,
      name: nameMap.get(r.memberId) ?? "—",
      username: r.username,
      channel,
      code,
      createdAt: r.createdAt.toISOString(),
      expiresAt: r.expiresAt.toISOString(),
    });
  }

  return NextResponse.json({ resets });
}
