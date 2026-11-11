import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/* ================================================================
   پاک‌سازی خودکار — روزانه با Vercel Cron (see vercel.json)
   زمان اجرا: ۲۰:۳۰ UTC = ۰۰:۳۰ به وقت تهران — درست در پایان هر روز شمسی:
     • همهٔ پیام‌های چت — پاک‌سازی کامل پایان روز تا فضا پر نشود
     • اتاق‌های تمام‌شده که تکرار نشدند — بعد از ۱۵ دقیقه تخلیه
       (اعضا و پاسخ‌ها با حذف آبشاری پاک می‌شوند)
     • اتاق‌های رهاشدهٔ هر وضعیتی با بیش از ۳ روز بی‌فعالیتی
     • رکوردهای اجرای بازی قدیمی‌تر از ۱۲۰ روز
   محافظت: اگر CRON_SECRET در محیط تعریف شده باشد، هدر
   Authorization: Bearer <CRON_SECRET> لازم است (ورکِن cron ورکل همین
   هدر را خودکار می‌فرستد). بدون تعریف سِکِرت، فراخوانی آزاد است.
   ================================================================ */

const FINISHED_ROOM_RETAIN_MINUTES = 15; // اتاق تمام‌شده که تکرار نشد — بعد از ۱۵ دقیقه تخلیه
const STALE_ROOM_RETAIN_DAYS = 3;
const PLAY_LOG_RETAIN_DAYS = 120;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization") || "";
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const now = Date.now();
  const finishedCutoff = new Date(now - FINISHED_ROOM_RETAIN_MINUTES * 60_000);
  const staleCutoff = new Date(now - STALE_ROOM_RETAIN_DAYS * 86_400_000);
  const playCutoff = new Date(now - PLAY_LOG_RETAIN_DAYS * 86_400_000);

  try {
    const [chat, finishedRooms, staleRooms, plays] = await Promise.all([
      /* پایان هر روز — همهٔ پیام‌های چت (لابی و اتاق‌ها و تیم‌ها) پاک می‌شوند */
      db.chatMessage.deleteMany({}),
      db.room.deleteMany({
        where: { status: "finished", lastActivity: { lt: finishedCutoff } },
      }),
      db.room.deleteMany({ where: { lastActivity: { lt: staleCutoff } } }),
      db.gamePlay.deleteMany({ where: { playedAt: { lt: playCutoff } } }),
    ]);

    return NextResponse.json({
      ok: true,
      at: new Date().toISOString(),
      deleted: {
        chatMessages: chat.count,
        finishedRooms: finishedRooms.count,
        staleRooms: staleRooms.count,
        gamePlays: plays.count,
      },
    });
  } catch {
    return NextResponse.json({ ok: false, error: "cleanup-failed" }, { status: 500 });
  }
}
