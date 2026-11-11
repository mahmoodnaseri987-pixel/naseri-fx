/* محافظ خودایمنی سایت — از پنل مدیریت.
   سلامت نسخهٔ درحال‌سرویس، اتصال دیتابیس و سر بودنِ فهرست بازی‌های آرنا را
   می‌سنجد تا هر خرابی محسوس پیش از رسیدن به کاربران دیده شود.
   نسخهٔ درحال‌سرویس از /api/health هم به‌صورت عمومی قابل خواندن است. */

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSetup } from "@/lib/public-data";
import { guard } from "@/lib/admin";
import { APP_VERSION, APP_VERSION_DATE } from "@/lib/version";
import { ARENA_CATALOG_DEFS } from "@/lib/arena-catalog";

export const dynamic = "force-dynamic";

export type GuardCheck = {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
};

export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  await ensureSetup();

  const checks: GuardCheck[] = [];

  /* نسخهٔ درحال‌سرویس */
  checks.push({
    id: "version",
    label: "نسخهٔ سایت",
    ok: true,
    detail: `${APP_VERSION} — ${APP_VERSION_DATE}`,
  });

  /* اتصال دیتابیس و سلامت جدول‌ها */
  try {
    const [members, games, apps, activeRooms, chat] = await Promise.all([
      db.member.count({ where: { blocked: false } }),
      db.game.count({ where: { published: true } }),
      db.app.count(),
      db.room.count({ where: { status: { in: ["lobby", "playing"] } } }),
      db.chatMessage.count(),
    ]);
    checks.push({
      id: "db",
      label: "دیتابیس (Neon)",
      ok: true,
      detail: `اعضا: ${members} — بازی منتشرشده: ${games} — اپ: ${apps} — اتاق فعال: ${activeRooms} — پیام چت: ${chat}`,
    });

    /* فهرست بازی‌های آرنا — هیچ بازی تأییدشده‌ای نباید از فهرست افتاده باشد */
    const configs = await db.arenaGameConfig.findMany();
    const enabledBySlug = new Map(configs.map((c) => [c.slug, c.enabled]));
    const absent = ARENA_CATALOG_DEFS.filter((g) => !enabledBySlug.has(g.slug)).map((g) => g.slug);
    checks.push({
      id: "arena-registry",
      label: "فهرست بازی‌های آرنا",
      ok: absent.length === 0,
      detail:
        absent.length === 0
          ? `${ARENA_CATALOG_DEFS.length} بازی ثبت‌شده — همه سر جای خود هستند`
          : `ثبت‌نشده: ${absent.join("، ")}`,
    });
  } catch {
    checks.push({
      id: "db",
      label: "دیتابیس (Neon)",
      ok: false,
      detail: "اتصال به دیتابیس برقرار نشد",
    });
  }

  return NextResponse.json({
    ok: checks.every((c) => c.ok),
    version: APP_VERSION,
    versionDate: APP_VERSION_DATE,
    at: new Date().toISOString(),
    checks,
  });
}
