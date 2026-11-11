/* منطق سرور مشترک آرنا — ساخت وضعیت اتاق از اسنپ‌شات لحظه‌ای و پاک‌سازی اتاق‌های راکد.
   سنگین‌ی کار به «arena-live» منتقل شده است: یک اسنپ‌شات کش‌شده به‌ازای هر اتاق
   که هم استریم SSE و هم مسیرهای GET از آن می‌خوانند. */

import { db } from "@/lib/db";
import { getRoomSnapshot, touchPresence, viewFromSnapshot } from "@/lib/arena-live";
import type { ArenaStateResponse } from "@/lib/types";

export { ONLINE_MS, parseState } from "@/lib/arena-live";
export type { ArenaState } from "@/lib/arena-live";

/** حذف اتاق‌های بی‌فعالیت بیش از ۴۵ دقیقه (به همراه اعضا و پاسخ‌ها — آبشاری) */
export async function housekeeping(): Promise<void> {
  const cutoff = new Date(Date.now() - 45 * 60 * 1000);
  await db.room.deleteMany({ where: { lastActivity: { lt: cutoff } } });
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
