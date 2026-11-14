/* لایه لحظه‌ای آرنا — اسنپ‌شات کش‌شده هر اتاق + نمای به‌ازای هر عضو.
   به‌جای این‌که هر درخواست جداگانه دیتابیس را بخواند، برای هر اتاق یک
   اسنپ‌شات مشترک با عمر کوتاه (۴۰۰ تا ۹۰۰ میلی‌ثانیه) ساخته می‌شود و همه
   خواننده‌ها — استریم SSE و مسیرهای GET — از همان استفاده می‌کنند.
   نتیجه: بار دیتابیس کم می‌شود و تاخیر انتشار هر تغییر حداکثر به اندازه
   عمر کش است، نه یک دور کامل polling کلاینت. */

import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { ANSWER_MS, ROUND_COUNT, isBotId, computePhase, scoreFor } from "@/lib/arena-game";
import { NABARD_GAME_SLUG, parseNabardState, pointsForRank } from "@/lib/nabard-engine";
import {
  FIRE_GAME_SLUG,
  applyInputs,
  buildFireView,
  parseFireInput,
  parseFireState,
  simulate,
  type FirePlayerInput,
  type FireState,
} from "@/lib/fire-engine";
import { JADVAL_GAME_SLUG, JADVAL_TEAM_A, JADVAL_TEAM_B, JADVAL_WORD_POINTS } from "@/lib/jadval-shared";
import { PIC_GAME_SLUG, PIC_ROUND_MS, picPhase } from "@/lib/pic-shared";
import { buildPicView, getPicAnswer, parsePicState, submitPicGuess } from "@/lib/pic-engine";
import { LUDO_GAME_SLUG, type LudoRoomState } from "@/lib/ludo-shared";
import {
  buildLudoView,
  ludoEventTexts,
  ludoTeamsFlagOf,
  ludoTick,
  parseLudoState,
} from "@/lib/ludo-engine";
import { SHER_GAME_SLUG, parseSherState, type SherRoomState } from "@/lib/sher-shared";
import { buildSherView, sherTick } from "@/lib/sher-engine";
import { PC_GAME_SLUG, type PcRoomState } from "@/lib/proverb-shared";
import { buildPcView, parsePcState, pcTick } from "@/lib/proverb-engine";
import { RB_GAME_SLUG, rbParseState, type RbState } from "@/lib/rangbaz-shared";
import { buildRbView, rbTick } from "@/lib/rangbaz-engine";
import {
  buildJadvalResult,
  buildJadvalView,
  getJadvalWordAnswer,
  jadvalWordTotal,
  parseJadvalState,
} from "@/lib/jadval-engine";
import type { JadvalRoomState, JadvalTeam } from "@/lib/jadval-shared";
import type { ArenaGameView, ArenaMemberView, ArenaStateResponse, NabardView } from "@/lib/types";

/** حداکثر فاصله زمانی برای آنلاین حساب‌شدن عضو */
export const ONLINE_MS = 45_000;

/** هش قطعی برای تصمیم‌های ربات — هر بار برای همان (اتاق، ربات، دور) همان تصمیم */
function hashInt(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/* ================================================================
   ربات‌های «چالش سرعتی» — با تاخیر انسانی و دقت متغیر پاسخ می‌دهند
   ================================================================ */

async function runQuizBots(
  roomId: string,
  members: { memberId: string; name: string }[],
  state: ArenaState,
  phase: { round: number; phase: string; endsInMs: number },
  answered: Record<string, number>,
): Promise<void> {
  if (phase.phase !== "answer") return;
  const q = state.qs[phase.round];
  if (!q) return;
  const elapsed = ANSWER_MS - phase.endsInMs; // از شروع پنجرهٔ پاسخ
  for (const m of members) {
    if (!isBotId(m.memberId) || m.memberId in answered) continue;
    const seed = hashInt(`${roomId}:${m.memberId}:${phase.round}`);
    const reaction = 1800 + (seed % 5700); // ۱/۸ تا ۷/۵ ثانیه
    if (elapsed < reaction) continue;
    const acc = 55 + (hashInt(`acc:${roomId}:${m.memberId}:${phase.round}`) % 26); // ۵۵ تا ۸۰٪
    const correct = seed % 100 < acc;
    const choice = correct ? q.a : (q.a + 1 + (seed % 3)) % 4;
    try {
      await db.roomAnswer.create({
        data: { roomId, round: phase.round, memberId: m.memberId, choice },
      });
      answered[m.memberId] = choice;
      if (choice === q.a) {
        await db.roomMember.updateMany({
          where: { roomId, memberId: m.memberId },
          data: { score: { increment: scoreFor(phase.endsInMs) } },
        });
      }
    } catch {
      /* قبلاً ثبت شده — بی‌اثر */
    }
  }
}

export type ArenaState = {
  startedAtMs: number;
  qs: { q: string; o: string[]; a: number; c: string }[];
};

export function parseState(raw: string): ArenaState {
  try {
    const data = JSON.parse(raw) as ArenaState;
    if (typeof data.startedAtMs === "number" && Array.isArray(data.qs)) return data;
  } catch {
    /* خراب — حالت خالی */
  }
  return { startedAtMs: 0, qs: [] };
}

/* ================================================================
   ذخیرهٔ وضعیت «میدان آتش» — با گارد «فقط رو به جلو»
   روی سرورless چند نمونه همزمان وضعیت را می‌خوانند و می‌نویسند؛
   بدون این گارد، نوشتهٔ نمونهٔ کهنه روی پایهٔ تازه‌تر بازنویسی می‌شد
   و شبیه‌سازی عملاً به عقب برمی‌گشت (علت اصلی «حرکت نمی‌کند»).
   ================================================================ */

/** فاصلهٔ جلوکشیدن پایهٔ دیتاب توسط اسنپ‌شات — ورودی بازیکنان بلافاصله ذخیره می‌کنند */
const FIRE_BASE_MS = 1_000;

export async function persistFireState(
  roomId: string,
  fState: FireState,
  opts?: { settle?: boolean },
): Promise<boolean> {
  const json = JSON.stringify(fState);
  try {
    if (opts?.settle) {
      /* پایان مسابقه — گارد روی status؛ تکرارش بی‌اثر است */
      const n = await db.$executeRaw`
        UPDATE "Room" SET state = ${json}, status = 'finished', "lastActivity" = now()
        WHERE id = ${roomId} AND status = 'playing'`;
      return n > 0;
    }
    const sim = fState.simMs;
    const n = await db.$executeRaw`
      UPDATE "Room" SET state = ${json}, "lastActivity" = now()
      WHERE id = ${roomId} AND status = 'playing'
        AND COALESCE(NULLIF(state, '')::jsonb ->> 'simMs', '0')::double precision < ${sim}`;
    return n > 0;
  } catch {
    return false;
  }
}

/* ================================================================
   ذخیرهٔ وضعیت «منچ» — با گارد «فقط رو به جلو» روی seq
   ================================================================ */

export async function persistLudoState(roomId: string, lState: LudoRoomState): Promise<boolean> {
  const json = JSON.stringify(lState);
  try {
    const n = await db.$executeRaw`
      UPDATE "Room" SET state = ${json}, "lastActivity" = now()
      WHERE id = ${roomId} AND status = 'playing'
        AND COALESCE(NULLIF(state, '')::jsonb ->> 'seq', '0')::double precision < ${lState.seq}`;
    return n > 0;
  } catch {
    return false;
  }
}

/** تسویهٔ نهایی منچ — امتیاز رتبه‌ها + بستن اتاق؛ فقط یک‌بار اجرا می‌شود */
export async function settleLudo(
  roomId: string,
  lState: LudoRoomState,
  names: Record<string, string>,
): Promise<void> {
  if (!lState.result) return;
  try {
    await db.$transaction(async (tx) => {
      const n = await tx.$executeRaw`
        UPDATE "Room" SET status = 'finished', state = ${JSON.stringify(lState)}, "lastActivity" = now()
        WHERE id = ${roomId} AND status = 'playing'`;
      if (n === 0) return; // نمونهٔ دیگر تسویه کرده است
      for (const row of lState.result!) {
        await tx.roomMember.updateMany({
          where: { roomId, memberId: row.id },
          data: { score: pointsForRank(row.rank) },
        });
      }
      const winner = lState.result!.find((r) => r.rank === 1);
      if (winner) {
        await tx.chatMessage.create({
          data: {
            scope: await tx.room.findUnique({ where: { id: roomId } }).then((r) => r?.code ?? ""),
            memberId: winner.id,
            name: names[winner.id] ?? "بازیکن",
            content: `${names[winner.id] ?? "بازیکن"} برندهٔ منچ شد! 🎲`,
            kind: "system",
          },
        });
      }
    });
  } catch {
    /* خطای گذرا — اسنپ‌شات بعدی دوباره تلاش می‌کند */
  }
}

/* ================================================================
   ذخیرهٔ وضعیت «شعر یادت نره» — با گارد «فقط رو به جلو» روی seq
   ================================================================ */

export async function persistSherState(roomId: string, sState: SherRoomState): Promise<boolean> {
  const json = JSON.stringify(sState);
  try {
    const n = await db.$executeRaw`
      UPDATE "Room" SET state = ${json}, "lastActivity" = now()
      WHERE id = ${roomId} AND status = 'playing'
        AND COALESCE(NULLIF(state, '')::jsonb ->> 'seq', '0')::double precision < ${sState.seq}`;
    return n > 0;
  } catch {
    return false;
  }
}

/** تسویهٔ نهایی «شعر یادت نره» — امتیاز مسابقهٔ هر عضو + بستن اتاق؛ فقط یک‌بار اجرا می‌شود */
export async function settleSher(roomId: string, sState: SherRoomState): Promise<void> {
  if (!sState.result) return;
  try {
    await db.$transaction(async (tx) => {
      const n = await tx.$executeRaw`
        UPDATE "Room" SET status = 'finished', state = ${JSON.stringify(sState)}, "lastActivity" = now()
        WHERE id = ${roomId} AND status = 'playing'`;
      if (n === 0) return; // نمونهٔ دیگر تسویه کرده است
      for (const row of sState.result!.rows) {
        await tx.roomMember.updateMany({
          where: { roomId, memberId: row.id },
          data: { score: row.score },
        });
      }
    });
  } catch {
    /* خطای گذرا — اسنپ‌شات بعدی دوباره تلاش می‌کند */
  }
}

/* ================================================================
   ذخیرهٔ وضعیت «ضرب‌المثل‌چین» — با گارد «فقط رو به جلو» روی seq
   ================================================================ */

export async function persistPcState(roomId: string, pcState: PcRoomState): Promise<boolean> {
  const json = JSON.stringify(pcState);
  try {
    const n = await db.$executeRaw`
      UPDATE "Room" SET state = ${json}, "lastActivity" = now()
      WHERE id = ${roomId} AND status = 'playing'
        AND COALESCE(NULLIF(state, '')::jsonb ->> 'seq', '0')::double precision < ${pcState.seq}`;
    return n > 0;
  } catch {
    return false;
  }
}

/** ذخیرهٔ وضعیت «رنگ‌باز» — با شمارهٔ ترتیبی برای جلوگیری از بازنویسی هم‌زمان */
export async function persistRbState(roomId: string, rbState: RbState): Promise<boolean> {
  rbState.seq += 1;
  const json = JSON.stringify(rbState);
  try {
    const n = await db.$executeRaw`
      UPDATE "Room" SET state = ${json}, "lastActivity" = now()
      WHERE id = ${roomId} AND status = 'playing'
        AND COALESCE(NULLIF(state, '')::jsonb ->> 'seq', '0')::double precision < ${rbState.seq}`;
    return n > 0;
  } catch {
    return false;
  }
}

/* ================================================================
   قطعی‌سازی «رقابت جدول» — پایان با تایم‌اوت یا تکمیل جدول
   ================================================================ */

async function settleJadval(
  roomId: string,
  jState: JadvalRoomState,
  members: { memberId: string; name: string }[],
): Promise<void> {
  if (!jState.result || jState.resultWritten) return;
  jState.resultWritten = true;
  const ops: Prisma.PrismaPromise<unknown>[] = [
    db.room.update({
      where: { id: roomId },
      data: { status: "finished", state: JSON.stringify(jState), lastActivity: new Date() },
    }),
  ];
  for (const row of jState.result.members) {
    ops.push(
      db.roomMember.updateMany({
        where: { roomId, memberId: row.id },
        data: { score: { increment: row.bonus } },
      }),
    );
  }
  await db.$transaction(ops);
}

/** برندهٔ جدول با شمارش واژه‌ها — برای تایم‌اوت */
function jadvalTimeoutWinner(jState: JadvalRoomState): JadvalTeam | null {
  const a = jState.solved.A.length;
  const b = jState.solved.B.length;
  return a === b ? null : a > b ? "A" : "B";
}

/* ================================================================
   اسنپ‌شات اتاق — سطح اتاق و مشترک بین همه اعضا
   ================================================================ */

type SnapMember = {
  id: string; // memberId
  name: string;
  isReady: boolean;
  score: number;
  lastSeenMs: number; // سبد ۱۰ ثانیه‌ای — برای اثر انگشت پایدار
};

export type RoomSnapshot = {
  room: {
    id: string;
    code: string;
    gameSlug: string;
    roomNumber: number;
    status: string;
    hostId: string;
    maxPlayers: number;
    ageGroup: string; // گروه سنی اتاق — نمایش و انتخاب سؤال‌ها
    ludoTeams: boolean; // منچ — بازی تیمی ۲به۲ انتخاب میزبان
  };
  members: SnapMember[];
  answeredRound: number; // شماره سؤالی که answered به آن تعلق دارد
  answered: Record<string, number>; // پاسخ‌های سؤال جاری
  state: ArenaState;
  rawState: string; // JSON خام — اسنپ‌شات نبرد را هم پوشش می‌دهد
  fireState: FireState | null; // شبیه‌سازی «میدان آتش» بعد از پیش‌روی
  fingerprint: string; // اثر انگشت تغییرها برای انتشار رویداد
  computedAt: number;
};

/* عمر کش اسنپ‌شات بر اساس وضعیت اتاق — هر میلی‌ثانیه بیشتر یعنی کوئری
   کمتر به دیتابیس (مصرف CU نئون). بازی اکشن در جریان تندترین، اتاق‌های
   منتظر ملایم‌ترین؛ تاخیر دید کاربر حداکثر به اندازهٔ همین عمر کش است. */
const SNAPSHOT_TTL = 900; // اتاق منتظر / تمام‌شده — تغییرها کُند
const SNAPSHOT_TTL_PLAY = 700; // کوییز در جریان — فازها چندثانیهای
const SNAPSHOT_TTL_FAST = 400; // نبرد دایره‌ها در جریان — نوتِ میزبان ۱ثانیه

/* کش اسنپ‌شات باید «یک نمونهٔ مشترک» بین همهٔ مسیرها باشد — Next.js کد lib را
   برای هر مسیر جدا باندل می‌کند؛ اگر Map در ماژول باشد، هر مسیر کش خودش را
   دارد و باطله‌کردن از مسیر اکشن به مسیر state/SSE نمی‌رسد (تاس کهنه دیده
   می‌شود). با globalThis همهٔ باندل‌ها به یک Map می‌رسند. */
const snapCache: Map<
  string,
  { at: number; ttl: number; p: Promise<RoomSnapshot | null> }
> = (() => {
  const g = globalThis as { __naseriSnapCache?: Map<string, { at: number; ttl: number; p: Promise<RoomSnapshot | null> }> };
  if (!g.__naseriSnapCache) g.__naseriSnapCache = new Map();
  return g.__naseriSnapCache;
})();

async function buildSnapshot(code: string): Promise<RoomSnapshot | null> {
  const room = await db.room.findUnique({
    where: { code },
    include: { members: { orderBy: { joinedAt: "asc" } } },
  });
  if (!room) return null;

  const isNabard = room.gameSlug === NABARD_GAME_SLUG;
  const isFire = room.gameSlug === FIRE_GAME_SLUG;
  const isJadval = room.gameSlug === JADVAL_GAME_SLUG;
  const isPic = room.gameSlug === PIC_GAME_SLUG;
  const isLudo = room.gameSlug === LUDO_GAME_SLUG;
  const isSher = room.gameSlug === SHER_GAME_SLUG;
  const isPc = room.gameSlug === PC_GAME_SLUG;
  const state = parseState(room.state);
  const now = Date.now();
  let status = room.status;
  let hostId = room.hostId;
  let fireState: FireState | null = null;

  /* «میدان آتش»: شبیه‌سازی سمت سرور تا همین لحظه — سپس ذخیره با نرخ ملایم.
     پایان مسابقه (نتیجه نهایی) بلافاصله و بدون تrottle قطعی می‌شود. */
  if (isFire && status === "playing") {
    const fs = parseFireState(room.state);
    if (fs) {
      /* بازیکنانی که عضو اتاق نیستند (خروج وسط مسابقه) از میدان حذف شوند */
      const memberIds = new Set(room.members.map((m) => m.memberId));
      fs.players = fs.players.filter((p) => memberIds.has(p.id));
      /* ورودی‌های لحظه‌ای از ردیف اعضا خوانده و پیش از شبیه‌سازی اعمال می‌شوند */
      const inputs: Record<string, FirePlayerInput> = {};
      for (const m of room.members) {
        const fi = parseFireInput(m.fireInput);
        if (fi) inputs[m.memberId] = fi;
      }
      applyInputs(fs, inputs, now);
      const beforeSim = fs.simMs;
      simulate(fs, now);
      fireState = fs; // نما همیشه تا «همین لحظه» تازه است — حتی بدون ذخیره
      const settled = Boolean(fs.result) && !fs.resultWritten;
      /* پایهٔ دیتاب فقط هر ~۱ ثانیه (یا هنگام پایان مسابقه) جلو کشیده می‌شود؛
         ذخیره رو به جلو است تا هرگز روی پایهٔ تازه‌تر بازنویسی نشود */
      if (settled || fs.simMs - beforeSim >= FIRE_BASE_MS) {
        if (settled) fs.resultWritten = true;
        await persistFireState(room.id, fs, settled ? { settle: true } : undefined);
        if (settled) {
          status = "finished";
          if (fs.result) {
            await Promise.all(
              fs.result.map((row) =>
                db.roomMember.updateMany({
                  where: { roomId: room.id, memberId: row.id },
                  data: { score: pointsForRank(row.rank) },
                }),
              ),
            );
          }
        }
      }
    }
  }

  /* «رقابت جدول»: اکثریت، تکمیل رقابت واژه‌ها یا تایم‌اوت → قطعی‌سازی در دیتابیس */
  if (isJadval && status === "playing") {
    const jState = parseJadvalState(room.state);
    if (jState) {
      const nowMs = Date.now();
      if (!jState.result) {
        const total = jadvalWordTotal(jState);

        /* ربات‌های جدول — هر تیمی که ربات دارد، هر ~۱۱ تا ۲۷ ثانیه یک واژه می‌زند
           (تا پاسخ درست؛ قفل تیمی و واژه‌های خط‌خورده مثل بازیکن واقعی رعایت می‌شود) */
        const botMembers = room.members.filter((m) => isBotId(m.memberId));
        if (botMembers.length > 0 && total > 0 && nowMs >= jState.startedAtMs + 3000) {
          const ops: Prisma.PrismaPromise<unknown>[] = [];
          let mutated = false;
          for (const team of [JADVAL_TEAM_A, JADVAL_TEAM_B] as JadvalTeam[]) {
            const teamBots = botMembers.filter((m) => jState.teams[m.memberId] === team);
            if (teamBots.length === 0) continue;
            if (jState.solved[team].length >= total) continue;
            if (nowMs < (jState.lockUntil[team] ?? 0)) continue;
            /* بدون botNext ذخیره‌شده، لنگر زمانی = شروع مسابقه (نه «الان») — وگرنه مهلت هرگز نمی‌رسد */
            const next =
              jState.botNext?.[team] ??
              jState.startedAtMs + 6000 + (hashInt(`jd:${room.id}:${team}`) % 12000);
            if (nowMs < next) continue;
            const remaining: number[] = [];
            for (let i = 0; i < total; i++) {
              if (!jState.solved.A.includes(i) && !jState.solved.B.includes(i)) remaining.push(i);
            }
            if (remaining.length === 0) continue;
            const pick = remaining[hashInt(`jd:${room.id}:${team}:${jState.solved[team].length}`) % remaining.length];
            const solver = teamBots[hashInt(`jd:${room.id}:${team}:${pick}`) % teamBots.length];
            const answer = getJadvalWordAnswer(jState, pick) ?? "";
            const rivalTeam: JadvalTeam = team === JADVAL_TEAM_A ? JADVAL_TEAM_B : JADVAL_TEAM_A;
            jState.solved[team].push(pick);
            jState.lockUntil[team] = 0;
            jState.botNext = {
              A: jState.botNext?.A ?? 0,
              B: jState.botNext?.B ?? 0,
              [team]: nowMs + 11000 + Math.floor(Math.random() * 16000),
            };
            mutated = true;
            ops.push(
              db.roomMember.updateMany({
                where: { roomId: room.id, memberId: solver.memberId },
                data: { score: { increment: JADVAL_WORD_POINTS } },
              }),
              db.chatMessage.create({
                data: {
                  scope: `${room.code}${team}`,
                  memberId: solver.memberId,
                  name: solver.name,
                  content: `${solver.name} واژهٔ «${answer}» را درست زد ✓ (+${JADVAL_WORD_POINTS} امتیاز)`,
                  kind: "system",
                },
              }),
              db.chatMessage.create({
                data: {
                  scope: `${room.code}${rivalTeam}`,
                  memberId: solver.memberId,
                  name: solver.name,
                  content: `ربات ${team === JADVAL_TEAM_A ? "تیم سبز" : "تیم قرمز"} واژهٔ «${answer}» را زد — این سؤال برای شما خط خورد؛ حروفش در جدول شما راهنمای بقیه است.`,
                  kind: "system",
                },
              }),
            );
          }
          if (mutated) {
            ops.unshift(db.room.update({ where: { id: room.id }, data: { state: JSON.stringify(jState) } }));
            await db.$transaction(ops);
            room.state = JSON.stringify(jState);
          }
        }

        const aCount = jState.solved.A.length;
        const bCount = jState.solved.B.length;
        const claimed = aCount + bCount;
        const aMajority = total > 0 && aCount * 2 > total;
        const bMajority = total > 0 && bCount * 2 > total;
        if (aMajority || bMajority || (total > 0 && claimed >= total)) {
          /* اکثریت واژه‌ها گرفته شد یا همهٔ واژه‌ها صاحب پیدا کردند — پایان همین حالا */
          jState.result = buildJadvalResult(jState, room.members);
          jState.result.winner = aMajority
            ? "A"
            : bMajority
              ? "B"
              : aCount === bCount
                ? null
                : aCount > bCount
                  ? "A"
                  : "B";
        } else if (nowMs >= jState.startedAtMs + jState.matchMs) {
          jState.result = buildJadvalResult(jState, room.members);
          jState.result.winner = jadvalTimeoutWinner(jState);
        }
        if (jState.result) {
          await db.room.update({
            where: { id: room.id },
            data: { state: JSON.stringify(jState) },
          });
        }
      }
      if (jState.result) {
        await settleJadval(room.id, jState, room.members);
        status = "finished";
      }
    }
  }

  /* «حدس تصویر»: ربات‌ها حدس می‌زنند؛ تمام دورها تمام شد → قطعی‌سازی وضعیت اتاق */
  if (isPic && status === "playing") {
    const pState = parsePicState(room.state);
    if (pState) {
      const ph = picPhase(pState, Date.now());
      const picOps: Prisma.PrismaPromise<unknown>[] = [];
      if (ph.status === "playing" && ph.phase === "answer") {
        const answer = getPicAnswer(pState, ph.round);
        for (const m of room.members) {
          if (!isBotId(m.memberId) || pState.wins[ph.round]) continue;
          const seed = hashInt(`pg:${room.id}:${m.memberId}:${ph.round}`);
          const elapsed = PIC_ROUND_MS - ph.endsInMs;
          const reaction = 2500 + (seed % 7000); // ۲/۵ تا ۹/۵ ثانیه
          if (elapsed < reaction) continue;
          const correct = seed % 100 < 50 + ((seed >>> 5) % 30); // ۵۰ تا ۷۹٪
          const outcome = submitPicGuess(pState, m.memberId, correct ? answer : "ـــــ", Date.now());
          if (outcome.kind === "correct") {
            picOps.push(
              db.roomMember.updateMany({
                where: { roomId: room.id, memberId: m.memberId },
                data: { score: { increment: outcome.points } },
              }),
              db.chatMessage.create({
                data: {
                  scope: room.code,
                  memberId: m.memberId,
                  name: m.name,
                  content: `${m.name} دور ${outcome.round + 1} را گرفت ✓ (+${outcome.points} امتیاز)`,
                  kind: "system",
                },
              }),
            );
          }
        }
      }
      if (picOps.length > 0) {
        picOps.push(db.room.update({ where: { id: room.id }, data: { state: JSON.stringify(pState) } }));
        await db.$transaction(picOps);
        room.state = JSON.stringify(pState);
      }
      if (picPhase(pState, Date.now()).status === "finished") {
        await db.room.update({
          where: { id: room.id },
          data: { status: "finished", lastActivity: new Date() },
        });
        status = "finished";
      }
    }
  }

  /* «منچ»: تیک خودکار — مهلت‌ها، ربات‌ها و تسویهٔ نتیجه */
  let ludoState: LudoRoomState | null = null;
  if (isLudo && (status === "playing" || status === "finished")) {
    ludoState = parseLudoState(room.state);
  }
  if (isLudo && status === "playing" && ludoState) {
    const memberIds = new Set(room.members.map((m) => m.memberId));
    const namesOf: Record<string, string> = {};
    for (const m of room.members) namesOf[m.memberId] = m.name;
    const tick = ludoTick(ludoState, { now: Date.now(), memberIds });
    if (tick.mutated) {
      room.state = JSON.stringify(ludoState);
      await persistLudoState(room.id, ludoState);
      /* رخدادهای تیک (ربات‌ها و مهلت‌خورده‌ها) به چت اتاق می‌رود */
      try {
        const texts = ludoEventTexts(tick.events, namesOf);
        for (const content of texts) {
          await db.chatMessage.create({
            data: { scope: room.code, memberId: "system", name: "منچ", content, kind: "system" },
          });
        }
      } catch {
        /* چت حیاتی نیست */
      }
    }
    if (ludoState.result) {
      await settleLudo(room.id, ludoState, namesOf);
      status = "finished";
    }
  }

  /* «شعر یادت نره»: تیک خودکار — گذر فازها، جواب‌دهی ربات‌ها و تسویهٔ نتیجه */
  let sherState: SherRoomState | null = null;
  if (isSher && (status === "playing" || status === "finished")) {
    sherState = parseSherState(room.state);
  }
  if (isSher && status === "playing" && sherState) {
    const memberIds = new Set(room.members.map((m) => m.memberId));
    const tick = sherTick(sherState, { now: Date.now(), memberIds });
    if (tick.mutated) {
      room.state = JSON.stringify(sherState);
      await persistSherState(room.id, sherState);
    }
    if (sherState.result) {
      await settleSher(room.id, sherState);
      status = "finished";
    }
  }

  /* «ضرب‌المثل‌چین»: تیک خودکار — گذر فازها، چیدن چینش‌گرِ ربات، حدس و رأی ربات‌ها */
  let pcState: PcRoomState | null = null;
  if (isPc && (status === "playing" || status === "finished")) {
    pcState = parsePcState(room.state);
  }
  if (isPc && status === "playing" && pcState) {
    const tick = pcTick(pcState, { now: Date.now() });
    if (tick.mutated) {
      room.state = JSON.stringify(pcState);
      await persistPcState(room.id, pcState);
    }
    if (pcState.result) {
      await db.room.update({
        where: { id: room.id },
        data: { status: "finished", state: JSON.stringify(pcState), lastActivity: new Date() },
      });
      for (const row of pcState.result!.rows) {
        await db.roomMember.updateMany({
          where: { roomId: room.id, memberId: row.id },
          data: { score: row.score },
        });
      }
      status = "finished";
    }
  }

  /* «رنگ‌باز»: تیک خودکار — تایم‌اوت نوبت، انقضای پنجرهٔ لو دادن و مه */
  const isRb = room.gameSlug === RB_GAME_SLUG;
  let rbState: RbState | null = null;
  if (isRb && (status === "playing" || status === "finished")) {
    rbState = rbParseState(room.state);
  }
  if (isRb && status === "playing" && rbState) {
    const tick = rbTick(rbState, { now: Date.now() });
    if (tick.mutated) {
      room.state = JSON.stringify(rbState);
      await persistRbState(room.id, rbState);
    }
    if (rbState.result) {
      await db.room.update({
        where: { id: room.id },
        data: { status: "finished", state: JSON.stringify(rbState), lastActivity: new Date() },
      });
      for (const row of rbState.result.rows) {
        await db.roomMember.updateMany({
          where: { roomId: room.id, memberId: row.id },
          data: { score: row.score },
        });
      }
      status = "finished";
    }
  }

  /* اگر مسابقه کوییز زمانش تمام شده، وضعیت را در دیتابیس قطعی کن
     (بازی‌های با وضعیت اختصاصی مستثنا هستند) */
  if (
    !isNabard && !isFire && !isJadval && !isPic && !isLudo && !isSher && !isPc && !isRb &&
    status === "playing" &&
    computePhase(state.startedAtMs, now).status === "finished"
  ) {
    await db.room.update({
      where: { id: room.id },
      data: { status: "finished", lastActivity: new Date() },
    });
    status = "finished";
  }

  /* نبرد: اگر میزبان نتیجه نهایی را ثبت کرده، مسابقه قطعی تمام است */
  if (isNabard && status === "playing" && parseNabardState(room.state)?.result) {
    await db.room.update({
      where: { id: room.id },
      data: { status: "finished", lastActivity: new Date() },
    });
    status = "finished";
  }

  /* میزبانِ غایب → قدیمی‌ترین عضوِ انسانیِ آنلاین میزبان می‌شود تا اتاق قفل نشود
     (ربات هرگز میزبان نمی‌شود — حتی اگر تنها عضو آنلاینِ حاضر باشد) */
  if (status === "lobby") {
    const host = room.members.find((m) => m.memberId === hostId);
    if (!host || now - host.lastSeenAt.getTime() > 60_000) {
      const candidate = room.members
        .filter((m) => !isBotId(m.memberId) && now - m.lastSeenAt.getTime() <= ONLINE_MS)
        .sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime())[0];
      if (candidate && candidate.memberId !== hostId) {
        await db.$transaction([
          db.room.update({ where: { id: room.id }, data: { hostId: candidate.memberId } }),
          db.roomMember.update({ where: { id: candidate.id }, data: { isHost: true } }),
          db.roomMember.updateMany({
            where: { roomId: room.id, memberId: hostId },
            data: { isHost: false },
          }),
        ]);
        hostId = candidate.memberId;
      }
    }
  }

  /* پاسخ‌های سؤال جاری + کلید فاز — انتشار تغییر سؤال به همه */
  let answeredRound = -1;
  let answered: Record<string, number> = {};
  let phaseKey = "";
  if (
    !isNabard && !isFire && !isJadval && !isPic && !isLudo && !isSher && !isPc && status === "playing"
  ) {
    const phase = computePhase(state.startedAtMs, Date.now());
    if (phase.status === "playing") {
      answeredRound = phase.round;
      phaseKey = `${phase.round}:${phase.phase}`;
      const answers = await db.roomAnswer.findMany({
        where: { roomId: room.id, round: phase.round },
        select: { memberId: true, choice: true },
      });
      answered = Object.fromEntries(answers.map((a) => [a.memberId, a.choice]));
      /* ربات‌های چالش سرعتی — پاسخ‌هایشان مثل بازیکن واقعی ثبت و امتیاز می‌گیرند */
      if (phase.phase === "answer") {
        await runQuizBots(room.id, room.members, state, phase, answered);
      }
    }
  }
  if (isNabard && status === "playing") {
    const nState = parseNabardState(room.state);
    phaseKey = `nb:${nState?.snap?.t ?? 0}:${nState?.bq?.length ?? 0}`;
  }
  if (isFire && status === "playing") {
    phaseKey = `fr:${Math.max(0, Math.floor(fireState?.simMs ?? 0))}`;
  }
  if (isJadval && status === "playing") {
    const jState = parseJadvalState(room.state);
    phaseKey = `jd:${jState?.solved.A.length ?? 0}:${jState?.solved.B.length ?? 0}`;
  }
  if (isPic && status === "playing") {
    const pState = parsePicState(room.state);
    const ph = pState ? picPhase(pState, now) : null;
    phaseKey = ph && ph.status === "playing" ? `pg:${ph.round}:${ph.phase}` : `pg:${ph?.status ?? "?"}`;
  }
  if (isLudo && status === "playing") {
    phaseKey = `lu:${ludoState?.seq ?? 0}`;
  }
  if (isSher && status === "playing") {
    phaseKey = `sh:${sherState?.seq ?? 0}`;
  }

  const members: SnapMember[] = room.members.map((m) => ({
    id: m.memberId,
    name: m.name,
    isReady: m.isReady,
    score: m.score,
    lastSeenMs: Math.floor(m.lastSeenAt.getTime() / 10_000) * 10_000,
  }));

  const fingerprint = JSON.stringify([
    status,
    hostId,
    room.gameSlug,
    room.roomNumber,
    room.maxPlayers,
    members.map((m) => [m.id, m.name, m.isReady, m.score, m.lastSeenMs]),
    Object.entries(answered).sort(),
    phaseKey,
    room.state,
  ]);

  return {
    room: {
      id: room.id,
      code: room.code,
      gameSlug: room.gameSlug,
      roomNumber: room.roomNumber,
      status,
      hostId,
      maxPlayers: room.maxPlayers,
      ageGroup: room.ageGroup,
      ludoTeams: ludoTeamsFlagOf(room.state),
    },
    members,
    answeredRound,
    answered,
    state,
    rawState: room.state,
    fireState,
    fingerprint,
    computedAt: Date.now(),
  };
}

/** باطله‌کردن اسنپ‌شات کش‌شدهٔ اتاق — بعد از هر تغییر سمت سرور (اکشن بازیکن)
    باید صدا زده شود تا مسیر state و جریان SSE همان لحظه دادهٔ تازه ببینند؛
    وگرنه اسنپ‌شات کهنه تا ۷۰۰میلی‌ثانیه وضعیتِ قبل از اکشن را برمی‌گرداند
    و کلاینت انگار «پرتاب/حرکت» را دیده و ندیده، دو بار واکنش نشان می‌دهد. */
export function invalidateRoomSnapshot(code: string): void {
  snapCache.delete(code);
}

/** اسنپ‌شات کش‌شده اتاق — همه اتصال‌های یک نمونه از یک کوئری مشترک می‌خوانند */
export async function getRoomSnapshot(code: string): Promise<RoomSnapshot | null> {
  const prev = snapCache.get(code);
  const now = Date.now();
  if (prev && now - prev.at < prev.ttl) return prev.p;

  const p = buildSnapshot(code);
  const entry: { at: number; ttl: number; p: Promise<RoomSnapshot | null> } = {
    at: now,
    ttl: prev?.ttl ?? SNAPSHOT_TTL_PLAY,
    p,
  };
  snapCache.set(code, entry);
  try {
    const snap = await p;
    if (snap) {
      const playing = snap.room.status === "playing";
      const fast =
        (snap.room.gameSlug === NABARD_GAME_SLUG || snap.room.gameSlug === FIRE_GAME_SLUG) &&
        playing;
      entry.ttl = fast ? SNAPSHOT_TTL_FAST : playing ? SNAPSHOT_TTL_PLAY : SNAPSHOT_TTL;
    }
  } catch {
    snapCache.delete(code);
  }
  return p;
}

/* ================================================================
   نمای هر عضو — خالص و بدون کوئری، از دل اسنپ‌شات
   ================================================================ */

export function viewFromSnapshot(
  snap: RoomSnapshot,
  memberId: string,
  now: number,
): ArenaStateResponse | null {
  const me = snap.members.find((m) => m.id === memberId);
  if (!me) return null;

  const { room } = snap;
  const isNabard = room.gameSlug === NABARD_GAME_SLUG;
  const isFire = room.gameSlug === FIRE_GAME_SLUG;
  const isJadval = room.gameSlug === JADVAL_GAME_SLUG;
  const isPic = room.gameSlug === PIC_GAME_SLUG;
  const isLudo = room.gameSlug === LUDO_GAME_SLUG;
  const isSher = room.gameSlug === SHER_GAME_SLUG;
  const isPc = room.gameSlug === PC_GAME_SLUG;
  const onlineCutoff = now - ONLINE_MS;

  const members: ArenaMemberView[] = snap.members.map((m) => ({
    id: m.id,
    name: m.name,
    isHost: m.id === room.hostId,
    isReady: m.isReady,
    score: m.score,
    online: isBotId(m.id) || m.lastSeenMs >= onlineCutoff,
    answered: snap.answeredRound === currentRoundOf(snap, now) && m.id in snap.answered,
  }));

  let game: ArenaGameView | null = null;
  if (!isNabard && !isFire && !isJadval && !isPic && !isSher && room.status === "playing") {
    const phase = computePhase(snap.state.startedAtMs, now);
    if (phase.status === "playing") {
      const q = snap.state.qs[phase.round];
      if (q) {
        const myAnswers = snap.answeredRound === phase.round ? snap.answered : {};
        game = {
          round: phase.round,
          rounds: ROUND_COUNT,
          phase: phase.phase,
          endsInMs: Math.max(0, Math.round(phase.endsInMs)),
          question:
            phase.phase === "answer"
              ? { q: q.q, o: q.o, correctIndex: null, cat: q.c }
              : { q: q.q, o: q.o, correctIndex: q.a, cat: q.c },
          myChoice: myAnswers[memberId] ?? null,
        };
      }
    }
  }

  /* داده شبیه‌سازی «نبرد دایره‌ها» — فقط وقتی مسابقه در جریان است */
  let nabard: NabardView | null = null;
  if (isNabard && room.status === "playing") {
    const nState = parseNabardState(snap.rawState);
    if (nState) {
      nabard = {
        startedAtMs: nState.startedAtMs,
        seed: nState.seed,
        players: nState.players,
        snap: nState.snap,
        bq: nState.bq,
        /* سیگنالینگ WebRTC فقط خطاب به همین عضو — بسته‌های دیگران دیده نمی‌شود */
        sig: (nState.sig ?? [])
          .filter((s) => s.to === memberId)
          .map((s) => ({ i: s.i, f: s.f, to: s.to, k: s.k, sdp: s.sdp, cs: s.cs })),
        isHost: room.hostId === memberId,
      };
    }
  }

  /* اسنپ‌شات فشرده «میدان آتش» — شبیه‌سازی سمت سرور */
  let fire: ReturnType<typeof buildFireView> | null = null;
  if (isFire && room.status === "playing" && snap.fireState) {
    fire = buildFireView(snap.fireState);
  }

  /* نمای اختصاصی «رقابت جدول» — حروف فقط تیم خودِ عضو؛ رقیب فقط تعداد */
  let jadval: import("@/lib/jadval-shared").JadvalView | null = null;
  if (isJadval && (room.status === "playing" || room.status === "finished")) {
    const jState = parseJadvalState(snap.rawState);
    if (jState) {
      jadval = buildJadvalView(jState, memberId, now);
    }
  }

  /* نمای اختصاصی «حدس تصویر» — پاسخ دور جاری در فاز پاسخ‌دهی مخفی است */
  let pic: import("@/lib/pic-shared").PicView | null = null;
  if (isPic && (room.status === "playing" || room.status === "finished")) {
    const pState = parsePicState(snap.rawState);
    if (pState) {
      const names: Record<string, string> = {};
      for (const m of snap.members) names[m.id] = m.name;
      pic = buildPicView(pState, memberId, names, now);
    }
  }

  /* نمای «منچ» — کل صفحه برای همه دیده می‌شود؛ فقط حضور آنلاین هر عضو محاسبه می‌شود */
  let ludo: import("@/lib/ludo-shared").LudoView | null = null;
  if (isLudo && (room.status === "playing" || room.status === "finished")) {
    const ls = parseLudoState(snap.rawState);
    if (ls) {
      const names: Record<string, string> = {};
      const onlineIds = new Set<string>();
      for (const m of snap.members) {
        names[m.id] = m.name;
        if (isBotId(m.id) || m.lastSeenMs >= onlineCutoff) onlineIds.add(m.id);
      }
      ludo = buildLudoView(ls, memberId, names, now, onlineIds);
    }
  }

  /* نمای «شعر یادت نره» — جواب دور در فازهای listen/guess هرگز بیرون نمی‌رود */
  let sher: import("@/lib/sher-shared").SherView | null = null;
  if (isSher && (room.status === "playing" || room.status === "finished")) {
    const ss = parseSherState(snap.rawState);
    if (ss) {
      const sherMembers = snap.members.map((m) => ({
        id: m.id,
        name: m.name,
        bot: isBotId(m.id),
        online: isBotId(m.id) || m.lastSeenMs >= onlineCutoff,
      }));
      sher = buildSherView(ss, memberId, sherMembers, now);
    }
  }

  /* نمای «ضرب‌المثل‌چین» — ضرب‌المثل فقط برای چینش‌گر دور جاری در فاز چیدمان */
  let proverb: import("@/lib/proverb-shared").PcView | null = null;
  if (isPc && (room.status === "playing" || room.status === "finished")) {
    const pc = parsePcState(snap.rawState);
    if (pc) {
      const pcMembers = snap.members.map((m) => ({
        id: m.id,
        name: m.name,
        bot: isBotId(m.id),
        online: isBotId(m.id) || m.lastSeenMs >= onlineCutoff,
      }));
      proverb = buildPcView(pc, memberId, pcMembers, now);
    }
  }

  /* نمای «رنگ‌باز» — دست من و کارت رو پشته؛ تعداد بقیه با مه پنهان می‌شود */
  let rangbaz: import("@/lib/rangbaz-shared").RbView | null = null;
  if (room.gameSlug === RB_GAME_SLUG && (room.status === "playing" || room.status === "finished")) {
    const rb = rbParseState(snap.rawState);
    if (rb) {
      const rbMembers = snap.members.map((m) => ({
        id: m.id,
        name: m.name,
        bot: isBotId(m.id),
        online: isBotId(m.id) || m.lastSeenMs >= onlineCutoff,
      }));
      rangbaz = buildRbView(rb, memberId, rbMembers, now);
    }
  }

  return {
    now,
    me: memberId,
    room: {
      code: room.code,
      gameSlug: room.gameSlug,
      roomNumber: room.roomNumber,
      status: room.status,
      hostId: room.hostId,
      maxPlayers: room.maxPlayers,
      ageGroup: room.ageGroup,
      ludoTeams: ludoTeamsFlagOf(snap.rawState) || (ludo?.teams ?? false),
    },
    members,
    game,
    nabard,
    fire,
    jadval,
    pic,
    ludo,
    sher,
    proverb,
    rangbaz,
  };
}

/** شماره سؤال جاری از دید زمان «همین لحظه» — برای هم‌راستایی نشانگر پاسخ */
function currentRoundOf(snap: RoomSnapshot, now: number): number {
  const phase = computePhase(snap.state.startedAtMs, now);
  return phase.status === "playing" ? phase.round : -1;
}

/* ================================================================
   حضور — تازه‌کردن lastSeenAt با نرخ ملایم (یک‌بار در ۴ ثانیه)
   ================================================================ */

const TOUCH_MS = 4_000;
const touchMap = new Map<string, number>();

export async function touchPresence(roomId: string, memberId: string): Promise<void> {
  const key = `${roomId}:${memberId}`;
  const now = Date.now();
  if (now - (touchMap.get(key) ?? 0) < TOUCH_MS) return;
  touchMap.set(key, now);

  /* نگهداری حافظه — کلیدهای کهنه هر از گاهی پاک می‌شوند */
  if (touchMap.size > 600) {
    for (const [k, t] of touchMap) {
      if (now - t > 10 * 60_000) touchMap.delete(k);
    }
  }

  try {
    await db.roomMember.updateMany({
      where: { roomId, memberId },
      data: { lastSeenAt: new Date() },
    });
  } catch {
    /* خطای لحظه‌ای — دور بعد */
  }
}
