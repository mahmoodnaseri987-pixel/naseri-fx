/* منطق سرور مشترک آرنا — ساخت وضعیت اتاق از اسنپ‌شات لحظه‌ای و پاک‌سازی اتاق‌های راکد.
   سنگین‌ی کار به «arena-live» منتقل شده است: یک اسنپ‌شات کش‌شده به‌ازای هر اتاق
   که هم استریم SSE و هم مسیرهای GET از آن می‌خوانند. */

import { db } from "@/lib/db";
import { BOT_PREFIX } from "@/lib/arena-game";
import { getRoomSnapshot, touchPresence, viewFromSnapshot } from "@/lib/arena-live";
import type { ArenaStateResponse } from "@/lib/types";

export { ONLINE_MS, parseState } from "@/lib/arena-live";
export type { ArenaState } from "@/lib/arena-live";

/**
 * پاک‌سازی دوره‌ای اتاق‌ها — روی هر خواندن فهرست اتاق‌ها و ساخت اتاق اجرا می‌شود:
 *  ۱) اتاق تمام‌شده که «بازی دوباره» نشد — بعد از ۱۰ دقیقه تخلیه می‌شود
 *  ۲) اتاق بی‌فعالیت بیش از ۴۵ دقیقه — کامل حذف می‌شود (اعضا و پاسخ‌ها آبشاری)
 *  ۳) عضو انسانیِ آفلاین — بعد از ۳ دقیقه بی‌حضوری خودکار از اتاق خارج می‌شود؛
 *     فقط بازیکنان آنلاین اتاق را تصرف می‌کنند (ربات‌ها مستثنا هستند)
 *  ۴) اتاق بدون هیچ عضو انسانی (فقط ربات مانده) — تخلیه می‌شود؛
 *     هیچ اتاقی به میزبان‌بودن ربات اعتماد نمی‌کند
 */
export async function housekeeping(): Promise<void> {
  const now = Date.now();
  await db.$transaction([
    db.room.deleteMany({
      where: { status: "finished", lastActivity: { lt: new Date(now - 10 * 60_000) } },
    }),
    db.room.deleteMany({ where: { lastActivity: { lt: new Date(now - 45 * 60_000) } } }),
    db.roomMember.deleteMany({
      where: {
        lastSeenAt: { lt: new Date(now - 3 * 60_000) },
        memberId: { not: { startsWith: BOT_PREFIX } },
      },
    }),
  ]);

  /* اتاق‌های بی‌مهمان یا فقط-رباتی — هیچ‌کدام حق ادامهٔ زندگی ندارند */
  const rooms = await db.room.findMany({
    where: { status: { in: ["lobby", "playing"] } },
    select: {
      id: true,
      hostId: true,
      members: { select: { memberId: true } },
    },
  });
  const dead = rooms
    .filter((r) => {
      if (r.members.length === 0) return true;
      if (r.members.every((m) => m.memberId.startsWith(BOT_PREFIX))) return true;
      /* اتاقی که میزبانش ربات است (میراث رکوردهای قدیمی) هم تخلیه می‌شود */
      return r.hostId.startsWith(BOT_PREFIX);
    })
    .map((r) => r.id);
  if (dead.length > 0) {
    await db.room.deleteMany({ where: { id: { in: dead } } });
  }
}

/**
 * ساخت پاسخ کامل وضعیت اتاق برای یک عضو — از اسنپ‌شات کش‌شده مشترک.
 * همه منطق‌های قطعی (پایان مسابقه، ارتقای میزبانِ غایب) داخل خود اسنپ‌شات
 * اجرا می‌شوند؛ اینجا فقط حضور عضو تازه می‌شود و نمای اختصاصی او ساخته می‌شود.
 */
export async function buildStateResponse(
  code: string,
  memberId: string,
): Promise<ArenaStateResponse | null> {
  const snap = await getRoomSnapshot(code);
  if (!snap) return null;
  await touchPresence(snap.room.id, memberId);
  return viewFromSnapshot(snap, memberId, Date.now());
}
