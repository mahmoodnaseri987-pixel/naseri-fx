/* نشانه حضور عضو در سایت — «آنلاین‌های الان» پنل مدیریت.
   کلاینت هر ۳۰ ثانیه یک POST بی‌صدا می‌فرستد؛ سرور با کش ۲۰ ثانیه‌ای
   فقط یک بار در هر بازه دیتابیس را می‌نویسد. */

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSetup } from "@/lib/public-data";
import { memberGuard } from "@/lib/member-auth";

const TOUCH_MS = 20_000;
const touchMap = new Map<string, number>();

export async function POST() {
  await ensureSetup();
  const guard = await memberGuard();
  if ("denied" in guard) return guard.denied;

  const id = guard.member.id;
  const now = Date.now();
  if (now - (touchMap.get(id) ?? 0) < TOUCH_MS) {
    return NextResponse.json({ ok: true, skipped: true });
  }
  touchMap.set(id, now);
  if (touchMap.size > 800) {
    for (const [k, t] of touchMap) if (now - t > 15 * 60_000) touchMap.delete(k);
  }

  try {
    await db.member.update({ where: { id }, data: { lastSeenAt: new Date() } });
  } catch {
    /* خطای گذرا — دور بعد */
  }
  return NextResponse.json({ ok: true });
}
