/* آرنا — لیست اتاق‌های باز و ساخت اتاق جدید.
   حداکثر ۳۰ اتاق فعال همزمان؛ هر اتاق شماره نمایشی ۱ تا ۳۰ می‌گیرد و
   ساخت آن به‌صورت اعلان خودکار در چت عمومی لابی منتشر می‌شود تا اعضا
   با یک کلیک روی کد، به اتاق بپیوندند. */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSetup } from "@/lib/public-data";
import { memberGuard } from "@/lib/member-auth";
import { ARENA_GAME_SLUG, MAX_PLAYERS, MIN_PLAYERS, normalizeAgeGroup, generateRoomCode } from "@/lib/arena-game";
import { NABARD_GAME_SLUG } from "@/lib/nabard-engine";
import { JADVAL_GAME_SLUG } from "@/lib/jadval-shared";
import { PIC_GAME_SLUG } from "@/lib/pic-shared";
import { LUDO_GAME_SLUG } from "@/lib/ludo-shared";
import { SHER_GAME_SLUG, isSherCategory } from "@/lib/sher-shared";
import { getArenaGameDef } from "@/lib/arena-registry";
import { housekeeping } from "@/lib/arena-server";
import { getArenaCatalog, isRoomGameEnabled } from "@/lib/arena-catalog";
import type { ArenaRoomSummary } from "@/lib/types";

/* «میدان آتش» آنلاین کنار گذاشته شد — نسخه آفلاین تک‌نفره در /fire سرو می‌شود */
const GAME_SLUGS = new Set([ARENA_GAME_SLUG, NABARD_GAME_SLUG, JADVAL_GAME_SLUG, PIC_GAME_SLUG, LUDO_GAME_SLUG, SHER_GAME_SLUG]);
const MAX_ACTIVE_ROOMS = 30;

export async function GET() {
  await ensureSetup();
  const guard = await memberGuard();
  if ("denied" in guard) return guard.denied;

  await housekeeping();

  const rooms = await db.room.findMany({
    where: {
      status: { in: ["lobby", "playing"] },
      lastActivity: { gte: new Date(Date.now() - 3 * 60_000) },
    },
    include: { members: true },
    orderBy: { createdAt: "desc" },
    take: MAX_ACTIVE_ROOMS,
  });

  const list: ArenaRoomSummary[] = rooms.map((r) => ({
    code: r.code,
    gameSlug: r.gameSlug,
    roomNumber: r.roomNumber,
    status: r.status,
    memberCount: r.members.length,
    maxPlayers: r.maxPlayers,
    hostName: r.members.find((m) => m.isHost)?.name ?? "",
    createdAt: r.createdAt.toISOString(),
  }));

  /* ترتیب و وضعیت بازی‌های لابی — تنظیم مدیر (پنل آرنا) */
  const games = (await getArenaCatalog()).map((g) => ({ slug: g.slug, enabled: g.enabled }));

  return NextResponse.json({ rooms: list, maxRooms: MAX_ACTIVE_ROOMS, games });
}

/** کوچک‌ترین شماره آزاد بین ۱ تا ۳۰ بین اتاق‌های فعال */
async function nextRoomNumber(): Promise<number | null> {
  const active = await db.room.findMany({
    where: { status: { in: ["lobby", "playing"] } },
    select: { roomNumber: true },
  });
  const taken = new Set(active.map((r) => r.roomNumber));
  for (let n = 1; n <= MAX_ACTIVE_ROOMS; n++) {
    if (!taken.has(n)) return n;
  }
  return null;
}

export async function POST(req: NextRequest) {
  await ensureSetup();
  const guard = await memberGuard();
  if ("denied" in guard) return guard.denied;

  const body = await req.json().catch(() => ({}));
  const gameSlug = typeof body.gameSlug === "string" ? body.gameSlug : ARENA_GAME_SLUG;
  if (!GAME_SLUGS.has(gameSlug)) {
    return NextResponse.json({ error: "unknown game" }, { status: 400 });
  }

  /* تعداد بازیکن — محدود به بازهٔ مجاز خود بازی (منچ ۲ تا ۴، بقیه ۲ تا ۸) */
  const def = getArenaGameDef(gameSlug);
  const capMax = def?.maxPlayers ?? MAX_PLAYERS;
  const capMin = Math.max(def?.minPlayers ?? MIN_PLAYERS, MIN_PLAYERS);
  const rawMax = Number(body.maxPlayers);
  const maxPlayers =
    Number.isInteger(rawMax) && rawMax >= capMin && rawMax <= capMax
      ? rawMax
      : capMax;

  /* گروه سنی اتاق — سؤال‌ها (چالش سرعتی و جدول) متناسب با آن تنظیم می‌شوند؛
     انتخاب میزبان روی پروفایل خودش هم ذخیره می‌شود تا دفعه بعد پیش‌فرض باشد */
  const ageGroup = normalizeAgeGroup(body.ageGroup);
  void db.member
    .update({ where: { id: guard.member.id }, data: { ageGroup } })
    .catch(() => undefined);

  /* بخش آهنگ‌های «شعر یادت نره» — فقط برای sher اعتبارسنجی و در JSON لابی
     ذخیره می‌شود (همان الگوی sherMode)؛ نامعتبر/نیامده → پیش‌فرض nostalgia.
     استخر آهنگ‌ها هنگام شروع مسابقه از همین بخش ساخته می‌شود. */
  const isSherRoom = gameSlug === SHER_GAME_SLUG;
  const sherCategory = isSherRoom
    ? isSherCategory(body.sherCategory)
      ? body.sherCategory
      : "nostalgia"
    : "";

  /* بازی ممکن است موقتاً توسط مدیر از آرنا حذف/غیرفعال شده باشد */
  if (!(await isRoomGameEnabled(gameSlug))) {
    return NextResponse.json({ error: "game-disabled" }, { status: 403 });
  }

  await housekeeping();

  /* حداکثر ۳۰ اتاق فعال همزمان در کل آرنا */
  const activeCount = await db.room.count({
    where: { status: { in: ["lobby", "playing"] } },
  });
  if (activeCount >= MAX_ACTIVE_ROOMS) {
    return NextResponse.json({ error: "rooms-full" }, { status: 429 });
  }

  /* حداکثر ۳ اتاق فعال همزمان برای هر عضو */
  const openCount = await db.roomMember.count({
    where: { memberId: guard.member.id, room: { status: { in: ["lobby", "playing"] } } },
  });
  if (openCount >= 3) {
    return NextResponse.json({ error: "too many rooms" }, { status: 429 });
  }

  const roomNumber = await nextRoomNumber();
  if (roomNumber === null) {
    return NextResponse.json({ error: "rooms-full" }, { status: 429 });
  }

  /* ساخت اتاق با کد یکتا — در صورت تکراری‌بودن کد، دوباره تلاش می‌شود */
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateRoomCode();
    try {
      const room = await db.room.create({
        data: {
          code,
          gameSlug,
          roomNumber,
          hostId: guard.member.id,
          status: "lobby",
          maxPlayers,
          ageGroup, // گروه سنی اتاق روی خود اتاق — تا «مسابقه دوباره» حفظ می‌شود
          // JSON لابی: گروه سنی + برای sher بخش آهنگ‌ها و برای جدول حالت شرح‌در‌متن تا لحظهٔ شروع حفظ شود
          state: JSON.stringify(
            isSherRoom ? { ageGroup, sherCategory } : { ageGroup, jadvalSher: body.jadvalSher === true },
          ),
        },
      });
      await db.roomMember.create({
        data: { roomId: room.id, memberId: guard.member.id, name: guard.member.name, isHost: true },
      });

      /* اعلان خودکار در چت لابی: «حمید اتاق ۵ را ساخت — کد: ABC12»
         متن سمت کلاینت و بسته به زبان کاربر رندر می‌شود */
      await db.chatMessage.create({
        data: {
          scope: "lobby",
          memberId: guard.member.id,
          name: guard.member.name,
          content: "",
          kind: "system",
          roomCode: room.code,
          roomNumber,
          gameSlug,
        },
      });

      return NextResponse.json({ code: room.code, roomNumber });
    } catch {
      /* کد تکراری — تلاش بعدی */
    }
  }

  return NextResponse.json({ error: "could not create room" }, { status: 500 });
}
