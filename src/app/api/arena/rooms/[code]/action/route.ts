/* آرنا — اکشن‌های اتاق: آماده، شروع، پاسخ، خروج، بازی دوباره */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSetup } from "@/lib/public-data";
import { memberGuard } from "@/lib/member-auth";
import type { Prisma } from "@prisma/client";
import { BOT_GAMES, BOT_NAMES, BOT_PREFIX, MIN_PLAYERS, ROUND_COUNT, computePhase, normalizeAgeGroup, scoreFor } from "@/lib/arena-game";
import { pickQuestionsSmart } from "@/lib/arena-bank";
import {
  MAX_BOOSTS,
  NABARD_GAME_SLUG,
  parseNabardState,
  pointsForRank,
  type NabardSig,
} from "@/lib/nabard-engine";
import {
  FIRE_GAME_SLUG,
  COUNTDOWN_MS,
  applyInputs,
  createFireState,
  parseFireInput,
  parseFireState,
  simulate,
  type FirePlayerInput,
} from "@/lib/fire-engine";
import {
  buildJadvalResult,
  createJadvalState,
  getJadvalWordAnswer,
  isJadvalAnswerCorrect,
  jadvalWordTotal,
  parseJadvalState,
} from "@/lib/jadval-engine";
import {
  JADVAL_GAME_SLUG,
  JADVAL_TEAM_A,
  JADVAL_TEAM_B,
  JADVAL_WRONG_LOCK_MS,
  JADVAL_WORD_POINTS,
  cleanAnswerInput,
  type JadvalTeam,
} from "@/lib/jadval-shared";
import {
  PIC_GAME_SLUG,
} from "@/lib/pic-shared";
import {
  createPicState,
  parsePicState,
  submitPicGuess,
} from "@/lib/pic-engine";
import {
  LUDO_GAME_SLUG,
  LUDO_MOVE_MS,
} from "@/lib/ludo-shared";
import {
  createLudoState,
  ludoApplyPass,
  ludoApplyPlayerAction,
  ludoEventTexts,
  ludoTeamsFlagOf,
  ludoTick,
  ludoTurnDeadline,
  maybeFinish,
  parseLudoState,
  rollDice,
} from "@/lib/ludo-engine";
import {
  SHER_GAME_SLUG,
  SHER_MODES,
  parseSherState,
  sherLobbyCategory,
  sherLobbyMode,
  sherModesFor,
  type SherCategory,
  type SherMode,
} from "@/lib/sher-shared";
import {
  createSherSongsPool,
  createSherState,
  sherAnswer,
  sherTick,
} from "@/lib/sher-engine";
import {
  SCENE_DIFFS,
  SCENE_GAME_SLUG,
  SCENE_MODES,
  sceneLobbyDifficulty,
  sceneLobbyMode,
  type SceneDifficulty,
  type SceneMode,
} from "@/lib/scene-shared";
import {
  createSceneState,
  parseSceneState,
  sceneGuess,
  sceneSetBoard,
  sceneTick,
  sceneValidateBoard,
} from "@/lib/scene-engine";
import { invalidateRoomSnapshot, parseState, persistFireState, persistLudoState, persistSceneState, persistSherState, settleLudo } from "@/lib/arena-live";

/** خواندن امن فرادادهٔ اتاق (مثل گروه سنی) از JSON خام state — قبل از شروع بازی */
function safeStateMeta(raw: string): { ageGroup?: unknown; jadvalSher?: unknown } {
  try {
    const data = JSON.parse(raw);
    return data && typeof data === "object" ? (data as { ageGroup?: unknown; jadvalSher?: unknown }) : {};
  } catch {
    return {};
  }
}

/** حالت شرح‌در‌متن اتاق جدول — از متادیتای ساخت اتاق یا خود state جدول
    (دومی تا «مسابقه دوباره» هم همان حالت را حفظ کند) */
function roomJadvalSher(room: { state: string }): boolean {
  const meta = safeStateMeta(room.state);
  if (meta.jadvalSher !== undefined) return meta.jadvalSher === true;
  try {
    const data = JSON.parse(room.state) as { sher?: unknown };
    return data?.sher === true;
  } catch {
    return false;
  }
}

/** گروه سنی مؤثر اتاق — ستون ageGroup اتاق مرجع است؛ برای اتاق‌های قدیمی
    که قبل از این ستون ساخته شده‌اند، مقدار داخل state اگر صریح باشد ترجیح می‌شود. */
function roomAgeGroup(room: { ageGroup: string; state: string }) {
  const meta = safeStateMeta(room.state);
  if (meta.ageGroup !== undefined) return normalizeAgeGroup(meta.ageGroup);
  return normalizeAgeGroup(room.ageGroup);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  await ensureSetup();
  const guard = await memberGuard();
  if ("denied" in guard) return guard.denied;

  const { code } = await params;
  const roomCode = decodeURIComponent(code).toUpperCase();
  const body = await req.json().catch(() => ({}));
  const type = String(body.type ?? "");

  const room = await db.room.findUnique({
    where: { code: roomCode },
    include: { members: { orderBy: { joinedAt: "asc" } } },
  });
  if (!room) return NextResponse.json({ error: "gone" }, { status: 404 });

  const me = room.members.find((m) => m.memberId === guard.member.id);
  if (!me) return NextResponse.json({ error: "gone" }, { status: 404 });

  await db.room.update({ where: { id: room.id }, data: { lastActivity: new Date() } });

  /* ================================================================
     اکشن‌های اختصاصی «نبرد دایره‌ها» — شبیه‌سازی قطعی روی کلاینت‌ها
     ================================================================ */
  if (room.gameSlug === NABARD_GAME_SLUG) {
    /* --- شروع مسابقه نبرد (میزبان، حداقل ۲ نفر، همه آماده) --- */
    if (type === "start") {
      if (room.status !== "lobby") {
        return NextResponse.json({ error: "conflict" }, { status: 409 });
      }
      if (room.hostId !== me.memberId) {
        return NextResponse.json({ error: "not host" }, { status: 403 });
      }
      if (room.members.length < MIN_PLAYERS) {
        return NextResponse.json({ error: "need players" }, { status: 409 });
      }
      if (!room.members.every((m) => m.isReady)) {
        return NextResponse.json({ error: "not ready" }, { status: 409 });
      }
      const nState = {
        game: NABARD_GAME_SLUG,
        startedAtMs: Date.now() + 3000, // ۳ ثانیه شمارش معکوس
        seed: Math.floor(Math.random() * 1_000_000_000),
        players: room.members.map((m) => ({ id: m.memberId, name: m.name })),
        bq: [],
        sig: [],
        snap: null,
        result: null,
      };
      await db.$transaction([
        db.room.update({
          where: { id: room.id },
          data: { status: "playing", state: JSON.stringify(nState) },
        }),
        db.roomMember.updateMany({ where: { roomId: room.id }, data: { isReady: false } }),
      ]);
      return NextResponse.json({ ok: true });
    }

    /* --- اسنپ‌شات مرجع از میزبان (هر ~۱ ثانیه) --- */
    if (type === "snap") {
      if (room.status !== "playing") {
        return NextResponse.json({ error: "conflict" }, { status: 409 });
      }
      if (room.hostId !== me.memberId) {
        return NextResponse.json({ error: "not host" }, { status: 403 });
      }
      const nState = parseNabardState(room.state);
      if (!nState) return NextResponse.json({ error: "gone" }, { status: 404 });

      const nowMs = Date.now();
      if (nState.snap && nowMs - nState.snap.t < 700) {
        return NextResponse.json({ error: "throttled" }, { status: 429 });
      }
      const el = Number(body.el);
      const cs = Array.isArray(body.cs) ? body.cs : null;
      if (!Number.isFinite(el) || !cs || cs.length === 0 || cs.length > 12) {
        return NextResponse.json({ error: "bad snap" }, { status: 400 });
      }
      const clean = cs
        .filter(
          (row: unknown): row is [string, number, number, number, number, number, number, number] =>
            Array.isArray(row) &&
            row.length === 8 &&
            typeof row[0] === "string" &&
            row.slice(1).every((v: unknown) => typeof v === "number" && Number.isFinite(v)),
        )
        .map((row) => row.slice(0, 8));
      if (clean.length === 0) {
        return NextResponse.json({ error: "bad snap" }, { status: 400 });
      }
      nState.snap = { t: nowMs, el, cs: clean };
      await db.room.update({
        where: { id: room.id },
        data: { state: JSON.stringify(nState) },
      });
      return NextResponse.json({ ok: true });
    }

    /* --- شتاب بازیکن (حداکثر ۲ بار در هر مسابقه).
       بدنهٔ عادی: خودم شتاب می‌گیرم. میزبان برای هم‌گامی مسیر مستقیم،
       شتاب دریافتی از مهمان را با «id» همان بازیکن ثبت می‌کند تا
       کلاینت‌های بدون DataChannel هم از مسیر سروری آن را ببینند؛
       کلاینت‌های مسیر مستقیم با «n» ضدتکرار می‌کنند. --- */
    if (type === "boost") {
      if (room.status !== "playing") {
        return NextResponse.json({ error: "conflict" }, { status: 409 });
      }
      const nState = parseNabardState(room.state);
      if (!nState) return NextResponse.json({ error: "gone" }, { status: 404 });
      if (!nState.players.some((p) => p.id === me.memberId)) {
        return NextResponse.json({ error: "not player" }, { status: 403 });
      }
      /* رلهٔ میزبان: فقط میزبان می‌تواند شتاب را به نام بازیکن دیگر ثبت کند */
      let target = me.memberId;
      if (typeof body.id === "string" && body.id !== me.memberId) {
        if (room.hostId !== me.memberId) {
          return NextResponse.json({ error: "not host" }, { status: 403 });
        }
        if (!nState.players.some((p) => p.id === body.id)) {
          return NextResponse.json({ error: "bad target" }, { status: 400 });
        }
        target = body.id;
      }
      const used = nState.bq.filter((b) => b.id === target).length;
      if (used >= MAX_BOOSTS) {
        return NextResponse.json({ error: "no boosts" }, { status: 409 });
      }
      const item: { id: string; t: number; n?: string } = { id: target, t: Date.now() };
      if (typeof body.n === "string" && body.n.length > 0 && body.n.length <= 64) item.n = body.n;
      nState.bq.push(item);
      if (nState.bq.length > 64) nState.bq = nState.bq.slice(-64);
      await db.room.update({
        where: { id: room.id },
        data: { state: JSON.stringify(nState) },
      });
      return NextResponse.json({ ok: true });
    }

    /* --- سیگنالینگ WebRTC (offer/answer/ICE) — بسته‌ای زودگذر خطاب به یک بازیکن.
       این فقط حمل‌کنندهٔ بسته‌ها برای ساخت پیوند مستقیم است؛ دادهٔ بازی نیست. --- */
    if (type === "rtc") {
      if (room.status !== "playing") {
        return NextResponse.json({ error: "conflict" }, { status: 409 });
      }
      const nState = parseNabardState(room.state);
      if (!nState) return NextResponse.json({ error: "gone" }, { status: 404 });
      if (!nState.players.some((p) => p.id === me.memberId)) {
        return NextResponse.json({ error: "not player" }, { status: 403 });
      }
      const to = typeof body.to === "string" ? body.to : "";
      if (to === me.memberId || !nState.players.some((p) => p.id === to)) {
        return NextResponse.json({ error: "bad target" }, { status: 400 });
      }
      const k = typeof body.k === "string" ? body.k : "";
      if (k !== "offer" && k !== "answer" && k !== "ice") {
        return NextResponse.json({ error: "bad kind" }, { status: 400 });
      }
      const sig: NabardSig = {
        i: `${me.memberId.slice(0, 10)}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        f: me.memberId,
        to,
        k,
        at: Date.now(),
      };
      if (k === "offer" || k === "answer") {
        const sdp = typeof body.sdp === "string" ? body.sdp : "";
        if (sdp.length === 0 || sdp.length > 12_000) {
          return NextResponse.json({ error: "bad sdp" }, { status: 400 });
        }
        sig.sdp = sdp;
      } else {
        if (!Array.isArray(body.cs) || body.cs.length === 0 || body.cs.length > 24) {
          return NextResponse.json({ error: "bad cs" }, { status: 400 });
        }
        const cs: NonNullable<NabardSig["cs"]> = [];
        for (const c of body.cs) {
          if (
            typeof c === "object" &&
            c !== null &&
            typeof (c as { candidate?: unknown }).candidate === "string" &&
            ((c as { candidate: string }).candidate as string).length <= 600 &&
            ((c as { candidate: string }).candidate as string).length > 0
          ) {
            const row: { candidate: string; sdpMid?: string | null; sdpMLineIndex?: number | null } = {
              candidate: (c as { candidate: string }).candidate,
            };
            const mid = (c as { sdpMid?: unknown }).sdpMid;
            if (typeof mid === "string" && mid.length <= 64) row.sdpMid = mid;
            const mli = (c as { sdpMLineIndex?: unknown }).sdpMLineIndex;
            if (typeof mli === "number" && Number.isInteger(mli) && mli >= 0 && mli <= 10) {
              row.sdpMLineIndex = mli;
            }
            cs.push(row);
          }
        }
        if (cs.length === 0) return NextResponse.json({ error: "bad cs" }, { status: 400 });
        sig.cs = cs;
      }
      /* هرس بسته‌های کهنه و سقف هر فرستنده — سیگنالینگ زودگذر است */
      const nowMs = Date.now();
      const old = (nState.sig ?? []).filter((s) => nowMs - s.at < 25_000);
      const mine = old.filter((s) => s.f === me.memberId);
      const rest = old.filter((s) => s.f !== me.memberId);
      nState.sig = [...rest.slice(-40), ...mine.slice(-24), sig];
      await db.room.update({
        where: { id: room.id },
        data: { state: JSON.stringify(nState) },
      });
      return NextResponse.json({ ok: true });
    }

    /* --- ثبت نتیجه نهایی (میزبان، وقتی شبیه‌سازی تمام شد) --- */
    if (type === "finish") {
      if (room.status !== "playing") {
        return NextResponse.json({ error: "conflict" }, { status: 409 });
      }
      if (room.hostId !== me.memberId) {
        return NextResponse.json({ error: "not host" }, { status: 403 });
      }
      const nState = parseNabardState(room.state);
      if (!nState) return NextResponse.json({ error: "gone" }, { status: 404 });
      if (nState.result) return NextResponse.json({ ok: true, duplicate: true });

      const ranking = Array.isArray(body.ranking) ? body.ranking : null;
      if (!ranking || ranking.length === 0 || ranking.length > nState.players.length) {
        return NextResponse.json({ error: "bad ranking" }, { status: 400 });
      }
      const playerIds = new Set(nState.players.map((p) => p.id));
      const clean = ranking
        .filter(
          (row: unknown): row is { id: string; rank: number } =>
            typeof row === "object" &&
            row !== null &&
            typeof (row as { id?: unknown }).id === "string" &&
            playerIds.has((row as { id: string }).id) &&
            Number.isFinite((row as { rank?: unknown }).rank),
        )
        .map((row) => ({
          id: row.id,
          rank: Math.max(1, Math.trunc(row.rank)),
          lines: Math.max(0, Math.trunc(Number((row as { lines?: unknown }).lines) || 0)),
          kills: Math.max(0, Math.trunc(Number((row as { kills?: unknown }).kills) || 0)),
          out: Boolean((row as { out?: unknown }).out),
        }));
      if (clean.length === 0) {
        return NextResponse.json({ error: "bad ranking" }, { status: 400 });
      }

      nState.result = clean;
      const ops: Prisma.PrismaPromise<unknown>[] = [
        db.room.update({
          where: { id: room.id },
          data: { status: "finished", state: JSON.stringify(nState) },
        }),
      ];
      for (const row of clean) {
        ops.push(
          db.roomMember.updateMany({
            where: { roomId: room.id, memberId: row.id },
            data: { score: pointsForRank(row.rank) },
          }),
        );
      }
      await db.$transaction(ops);
      return NextResponse.json({ ok: true });
    }

    /* ready / leave / again → منطق مشترک پایین اجرا می‌شود؛ answer در نبرد معنا ندارد */
  }

  /* ================================================================
     اکشن‌های اختصاصی «میدان آتش» — شبیه‌سازی کامل سمت سرور
     ================================================================ */
  if (room.gameSlug === FIRE_GAME_SLUG) {
    /* --- شروع مسابقه (میزبان، حداقل ۲ نفر، همه آماده) --- */
    if (type === "start") {
      if (room.status !== "lobby") {
        return NextResponse.json({ error: "conflict" }, { status: 409 });
      }
      if (room.hostId !== me.memberId) {
        return NextResponse.json({ error: "not host" }, { status: 403 });
      }
      if (room.members.length < MIN_PLAYERS) {
        return NextResponse.json({ error: "need players" }, { status: 409 });
      }
      if (!room.members.every((m) => m.isReady)) {
        return NextResponse.json({ error: "not ready" }, { status: 409 });
      }
      const state = createFireState(
        room.members.map((m) => ({ id: m.memberId, name: m.name })),
        Math.floor(Math.random() * 1_000_000_000),
        Date.now() + COUNTDOWN_MS,
      );
      await db.$transaction([
        db.room.update({
          where: { id: room.id },
          data: { status: "playing", state: JSON.stringify(state) },
        }),
        db.roomMember.updateMany({ where: { roomId: room.id }, data: { isReady: false } }),
      ]);
      return NextResponse.json({ ok: true });
    }

    /* --- ورودی لحظه‌ای بازیکن: حرکت + نشانه‌گیری + شلیک
       (نام قدیمی fire_input هم پذیرفته می‌شود تا کلاینت‌های کش‌شده بشکنند) --- */
    if (type === "input" || type === "fire_input") {
      if (room.status !== "playing") {
        return NextResponse.json({ error: "conflict" }, { status: 409 });
      }
      const fState = parseFireState(room.state);
      if (!fState) return NextResponse.json({ error: "gone" }, { status: 404 });
      if (!fState.players.some((p) => p.id === me.memberId)) {
        return NextResponse.json({ error: "not player" }, { status: 403 });
      }
      const mv =
        Array.isArray(body.mv) && body.mv.length === 2
          ? (body.mv as [number, number])
          : ([0, 0] as [number, number]);
      const aim = typeof body.aim === "number" && Number.isFinite(body.aim) ? body.aim : null;
      const fireAt = Boolean(body.fire) ? Date.now() : 0;

      /* ورودی در «ردیف خودِ بازیکن» ثبت می‌شود؛ هر بازیکن فقط ردیف خودش را
         می‌نویسد و هیچ رقابتی با نویسنده‌های وضعیت مسابقه ندارد؛
         سازندگان اسنپ‌شات این مقدار را می‌خوانند و پیش از هر تیک
         شبیه‌سازی اعمال می‌کنند. نام قدیمی fire_input هم پذیرفته می‌شود. */
      await db.roomMember.update({
        where: { id: me.id },
        data: { fireInput: JSON.stringify({ mv, aim, fireAt }) },
      });

      /* تلاش بی‌گارد برای جلوکشیدن پایه — ورودی خودم مستقیم هم اعمال می‌شود؛
         اگر CAS رد شد، سازندگان اسنپ‌شات جبران می‌کنند */
      try {
        const inputs: Record<string, FirePlayerInput> = {};
        for (const m of room.members) {
          const fi = parseFireInput(m.fireInput);
          if (fi) inputs[m.memberId] = fi;
        }
        inputs[me.memberId] = { mv, aim, fireAt };
        applyInputs(fState, inputs, Date.now());
        simulate(fState, Date.now());
        await persistFireState(room.id, fState);
      } catch {
        /* بهترین تلاش */
      }
      return NextResponse.json({ ok: true });
    }

    /* --- خروج از اتاق: بازیکن از شبیه‌سازی هم حذف شود --- */
    if (type === "leave") {
      if (room.status === "playing") {
        const fState = parseFireState(room.state);
        if (fState) {
          fState.players = fState.players.filter((p) => p.id !== me.memberId);
          fState.bullets = fState.bullets.filter((b) => b.o !== me.memberId);
          simulate(fState, Date.now());
          await persistFireState(room.id, fState);
        }
      }
      /* ادامه با منطق مشترک پایین */
    }
  }

  /* ================================================================
     اکشن‌های اختصاصی «رقابت جدول» — تیمی با چت مخفی هر تیم
     ================================================================ */
  if (room.gameSlug === JADVAL_GAME_SLUG) {
    const jadvalTeamLabel = (team: JadvalTeam): string =>
      team === JADVAL_TEAM_A ? "تیم سبز" : "تیم قرمز";

    /* --- شروع مسابقه: تیم‌بندی متوازن + انتخاب جدول + اعلان در چت مخفی هر تیم --- */
    if (type === "start") {
      if (room.status !== "lobby") {
        return NextResponse.json({ error: "conflict" }, { status: 409 });
      }
      if (room.hostId !== me.memberId) {
        return NextResponse.json({ error: "not host" }, { status: 403 });
      }
      if (room.members.length < MIN_PLAYERS) {
        return NextResponse.json({ error: "need players" }, { status: 409 });
      }
      if (!room.members.every((m) => m.isReady)) {
        return NextResponse.json({ error: "not ready" }, { status: 409 });
      }
      const jState = createJadvalState(
        room.members.map((m) => ({ memberId: m.memberId, name: m.name })),
        roomAgeGroup(room), // سطح جدول از گروه سنی میزبان: آسان/سخت/حرفه‌ای
        roomJadvalSher(room), // حالت کلاسیک یا شرح‌در‌متن — از انتخاب میزبان
      );
      const namesOf = (team: JadvalTeam): string =>
        room.members
          .filter((m) => jState.teams[m.memberId] === team)
          .map((m) => m.name)
          .join("، ") || "—";
      await db.$transaction([
        db.room.update({
          where: { id: room.id },
          data: { status: "playing", state: JSON.stringify(jState) },
        }),
        db.roomMember.updateMany({
          where: { roomId: room.id },
          data: { isReady: false, fireInput: "{}" },
        }),
        db.chatMessage.create({
          data: {
            scope: `${room.code}${JADVAL_TEAM_A}`,
            memberId: me.memberId,
            name: me.name,
            content: `مسابقه جدول شروع شد — تیم شما: ${jadvalTeamLabel(JADVAL_TEAM_A)} (اعضا: ${namesOf(JADVAL_TEAM_A)}). فقط اعضای همین تیم این چت را می‌بینند.`,
            kind: "system",
          },
        }),
        db.chatMessage.create({
          data: {
            scope: `${room.code}${JADVAL_TEAM_B}`,
            memberId: me.memberId,
            name: me.name,
            content: `مسابقه جدول شروع شد — تیم شما: ${jadvalTeamLabel(JADVAL_TEAM_B)} (اعضا: ${namesOf(JADVAL_TEAM_B)}). فقط اعضای همین تیم این چت را می‌بینند.`,
            kind: "system",
          },
        }),
      ]);
      return NextResponse.json({ ok: true });
    }

    /* --- ثبت پاسخ تیم: فقط یکی کافی است؛ هر هم‌تیمی می‌تواند بزند --- */
    if (type === "jadval_answer") {
      if (room.status !== "playing") {
        return NextResponse.json({ error: "conflict" }, { status: 409 });
      }
      const jState = parseJadvalState(room.state);
      if (!jState) return NextResponse.json({ error: "gone" }, { status: 404 });
      const team = jState.teams[me.memberId];
      if (!team) {
        return NextResponse.json({ error: "not player" }, { status: 403 });
      }
      const wordIdx = Number(body.wordIdx);
      const text = typeof body.text === "string" ? cleanAnswerInput(body.text) : "";
      const total = jadvalWordTotal(jState);
      if (!Number.isInteger(wordIdx) || wordIdx < 0 || wordIdx >= total) {
        return NextResponse.json({ error: "bad word" }, { status: 400 });
      }
      if (!text) {
        return NextResponse.json({ error: "empty" }, { status: 400 });
      }
      const rivalTeam: JadvalTeam = team === JADVAL_TEAM_A ? JADVAL_TEAM_B : JADVAL_TEAM_A;
      if (jState.solved[team].includes(wordIdx)) {
        return NextResponse.json({ ok: true, duplicate: true });
      }
      /* واژه‌ای که تیم رقیب زده — خط خورده و دیگر امتیازی ندارد (مقدم بر قفل) */
      if (jState.solved[rivalTeam].includes(wordIdx)) {
        return NextResponse.json({ error: "stolen" }, { status: 409 });
      }
      const nowMs = Date.now();
      if (nowMs < jState.lockUntil[team]) {
        return NextResponse.json(
          { error: "locked", lockMs: jState.lockUntil[team] - nowMs },
          { status: 429 },
        );
      }

      if (isJadvalAnswerCorrect(jState, wordIdx, text)) {
        const answer = getJadvalWordAnswer(jState, wordIdx) ?? "";
        jState.solved[team].push(wordIdx);
        jState.lockUntil[team] = 0;
        /* پایان مسابقه: اکثریت واژه‌ها یا تمام واژه‌ها گرفته شود */
        const claimed = jState.solved.A.length + jState.solved.B.length;
        const majority = jState.solved[team].length * 2 > total;
        const done = (majority || claimed >= total) && total > 0;
        if (done && !jState.result) {
          jState.result = buildJadvalResult(jState, room.members);
          jState.result.winner = majority
            ? team
            : jState.solved.A.length === jState.solved.B.length
              ? null
              : jState.solved[team].length > jState.solved[rivalTeam].length
                ? team
                : rivalTeam;
        }
        const ops = [
          db.room.update({
            where: { id: room.id },
            data: { state: JSON.stringify(jState) },
          }),
          db.roomMember.update({
            where: { id: me.id },
            data: { score: { increment: JADVAL_WORD_POINTS } },
          }),
          db.chatMessage.create({
            data: {
              scope: `${room.code}${team}`,
              memberId: me.memberId,
              name: me.name,
              content: `${me.name} واژهٔ «${answer}» را درست زد ✓ (+${JADVAL_WORD_POINTS} امتیاز)`,
              kind: "system",
            },
          }),
          db.chatMessage.create({
            data: {
              scope: `${room.code}${rivalTeam}`,
              memberId: me.memberId,
              name: me.name,
              content: `${jadvalTeamLabel(team)} واژهٔ «${answer}» را زد — این سؤال برای شما خط خورد؛ حروفش در جدول شما راهنمای بقیه است.`,
              kind: "system",
            },
          }),
        ];
        if (done) {
          ops.push(
            db.chatMessage.create({
              data: {
                scope: `${room.code}${rivalTeam}`,
                memberId: me.memberId,
                name: me.name,
                content: `${jadvalTeamLabel(team)} برنده شد — مسابقه تمام شد`,
                kind: "system",
              },
            }),
          );
        }
        await db.$transaction(ops);
        return NextResponse.json({ ok: true, correct: true, done });
      }

      /* پاسخ نادرست — قفل کوتاه تیمی جلوی حدس‌زنی پشت‌سرهم را می‌گیرد */
      jState.wrongs[team] += 1;
      jState.lockUntil[team] = Date.now() + JADVAL_WRONG_LOCK_MS;
      await db.$transaction([
        db.room.update({
          where: { id: room.id },
          data: { state: JSON.stringify(jState) },
        }),
        db.chatMessage.create({
          data: {
            scope: `${room.code}${team}`,
            memberId: me.memberId,
            name: me.name,
            content: `پاسخ برای واژهٔ شمارهٔ ${wordIdx + 1} نادرست بود — ${Math.round(JADVAL_WRONG_LOCK_MS / 1000)} ثانیه قفل`,
            kind: "system",
          },
        }),
      ]);
      return NextResponse.json({ ok: true, correct: false, lockMs: JADVAL_WRONG_LOCK_MS });
    }

    /* --- خروج وسط مسابقه: اگر تیم خالی شد، تیم رقیب برنده اعلام می‌شود --- */
    if (type === "leave" && room.status === "playing") {
      const jState = parseJadvalState(room.state);
      if (jState && !jState.result) {
        const remaining = room.members.filter((m) => m.memberId !== me.memberId);
        const myTeam = jState.teams[me.memberId];
        if (myTeam) {
          const rival: JadvalTeam = myTeam === JADVAL_TEAM_A ? JADVAL_TEAM_B : JADVAL_TEAM_A;
          const rivalAlive = remaining.some((m) => jState.teams[m.memberId] === rival);
          const myAlive = remaining.some((m) => jState.teams[m.memberId] === myTeam);
          if (rivalAlive && !myAlive) {
            jState.result = buildJadvalResult(jState, remaining);
            jState.result.winner = rival;
            await db.room.update({
              where: { id: room.id },
              data: { state: JSON.stringify(jState) },
            });
          }
        }
      }
      /* ادامه با منطق عمومی حذف عضو در پایین */
    }

    /* ready / again → منطق مشترک پایین اجرا می‌شود */
  }

  /* ================================================================
     اکشن‌های اختصاصی «حدس تصویر» — همه‌ضد همه؛ اولین پاسخ درست امتیاز دارد
     ================================================================ */
  if (room.gameSlug === PIC_GAME_SLUG) {
    /* --- شروع مسابقه --- */
    if (type === "start") {
      if (room.status !== "lobby") {
        return NextResponse.json({ error: "conflict" }, { status: 409 });
      }
      if (room.hostId !== me.memberId) {
        return NextResponse.json({ error: "not host" }, { status: 403 });
      }
      if (room.members.length < MIN_PLAYERS) {
        return NextResponse.json({ error: "need players" }, { status: 409 });
      }
      if (!room.members.every((m) => m.isReady)) {
        return NextResponse.json({ error: "not ready" }, { status: 409 });
      }
      const pState = createPicState();
      await db.$transaction([
        db.room.update({
          where: { id: room.id },
          data: { status: "playing", state: JSON.stringify(pState) },
        }),
        db.roomMember.updateMany({
          where: { roomId: room.id },
          data: { isReady: false, fireInput: "{}" },
        }),
        db.chatMessage.create({
          data: {
            scope: room.code,
            memberId: me.memberId,
            name: me.name,
            content: "مسابقهٔ حدس تصویر شروع شد — اولین پاسخ درست صاحب امتیاز است!",
            kind: "system",
          },
        }),
      ]);
      return NextResponse.json({ ok: true });
    }

    /* --- ثبت حدس --- */
    if (type === "pic_answer") {
      if (room.status !== "playing") {
        return NextResponse.json({ error: "conflict" }, { status: 409 });
      }
      const pState = parsePicState(room.state);
      if (!pState) return NextResponse.json({ error: "gone" }, { status: 404 });
      const text = typeof body.text === "string" ? cleanAnswerInput(body.text) : "";
      if (!text) {
        return NextResponse.json({ error: "empty" }, { status: 400 });
      }
      const nowMs = Date.now();
      const outcome = submitPicGuess(pState, me.memberId, text, nowMs);
      if (outcome.kind === "closed") {
        return NextResponse.json({ error: "closed" }, { status: 409 });
      }
      if (outcome.kind === "locked") {
        return NextResponse.json(
          { error: "locked", lockMs: outcome.lockMs },
          { status: 429 },
        );
      }
      if (outcome.kind === "wrong") {
        await db.room.update({
          where: { id: room.id },
          data: { state: JSON.stringify(pState) },
        });
        return NextResponse.json({ ok: true, correct: false, lockMs: outcome.lockMs });
      }
      /* پاسخ درست و اولین — امتیاز + ذخیرهٔ وضعیت */
      await db.$transaction([
        db.room.update({
          where: { id: room.id },
          data: { state: JSON.stringify(pState) },
        }),
        db.roomMember.update({
          where: { id: me.id },
          data: { score: { increment: outcome.points } },
        }),
        db.chatMessage.create({
          data: {
            scope: room.code,
            memberId: me.memberId,
            name: me.name,
            content: `${me.name} دور ${outcome.round + 1} را گرفت ✓ (+${outcome.points} امتیاز)`,
            kind: "system",
          },
        }),
      ]);
      return NextResponse.json({ ok: true, correct: true, points: outcome.points });
    }

    /* leave / ready / again → منطق مشترک پایین اجرا می‌شود */
  }

  /* ================================================================
     اکشن‌های اختصاصی «منچ» — تاس، حرکت مهره و تسویهٔ نتیجه
     ================================================================ */
  if (room.gameSlug === LUDO_GAME_SLUG) {
    /* --- شروع مسابقه (میزبان، حداقل ۲ نفر و حداکثر ۴، همه آماده) --- */
    if (type === "start") {
      if (room.status !== "lobby") {
        return NextResponse.json({ error: "conflict" }, { status: 409 });
      }
      if (room.hostId !== me.memberId) {
        return NextResponse.json({ error: "not host" }, { status: 403 });
      }
      if (room.members.length < MIN_PLAYERS) {
        return NextResponse.json({ error: "need players" }, { status: 409 });
      }
      if (!room.members.every((m) => m.isReady)) {
        return NextResponse.json({ error: "not ready" }, { status: 409 });
      }
      const lState = createLudoState(
        room.members.map((m) => ({ id: m.memberId, name: m.name })),
        // میزبان بازی تیمی را در لابی انتخاب می‌کند؛ «مسابقه دوباره» انتخاب قبلی را حفظ می‌کند
        { teams: body.teams === true || ludoTeamsFlagOf(room.state) },
      );
      const wantTeams = lState.teams === true;
      await db.$transaction([
        db.room.update({
          where: { id: room.id },
          data: { status: "playing", state: JSON.stringify(lState) },
        }),
        db.roomMember.updateMany({
          where: { roomId: room.id },
          data: { isReady: false, fireInput: "{}" },
        }),
        db.chatMessage.create({
          data: {
            scope: room.code,
            memberId: me.memberId,
            name: me.name,
            content: wantTeams
              ? "مسابقهٔ تیمی منچ شروع شد — قرمز+زرد در برابر سبز+آبی! ورود مهره‌ها با ۱ یا ۶؛ خانه‌های رنگی شروع امن هستند."
              : "مسابقهٔ منچ شروع شد — ورود مهره‌ها با ۱ یا ۶؛ خانه‌های رنگی شروع امن هستند!",
            kind: "system",
          },
        }),
      ]);
      invalidateRoomSnapshot(room.code); // تخته بلافاصله برای همه بالا بیاید
      return NextResponse.json({ ok: true });
    }

    /* --- پرتاب تاس / حرکت مهره / پاس — همه با تیک مهلت‌ها و گارد seq --- */
    if (type === "ludo_roll" || type === "ludo_move" || type === "ludo_pass") {
      if (room.status !== "playing") {
        return NextResponse.json({ error: "conflict" }, { status: 409 });
      }
      const lState = parseLudoState(room.state);
      if (!lState) return NextResponse.json({ error: "gone" }, { status: 404 });
      const nowMs = Date.now();
      const memberIds = new Set(room.members.map((m) => m.memberId));

      /* اول مهلت‌های عقب‌افتاده (ربات‌ها و غایب‌ها) پردازش می‌شود */
      const tick = ludoTick(lState, { now: nowMs, memberIds });
      if (tick.mutated) {
        const namesOf: Record<string, string> = {};
        for (const m of room.members) namesOf[m.memberId] = m.name;
        const persisted = await persistLudoState(room.id, lState);
        invalidateRoomSnapshot(room.code); // اسنپ‌شات کهنه همان‌جا باطله شود
        try {
          for (const content of ludoEventTexts(tick.events, namesOf)) {
            await db.chatMessage.create({
              data: { scope: room.code, memberId: "system", name: "منچ", content, kind: "system" },
            });
          }
        } catch {
          /* چت حیاتی نیست */
        }
        if (!persisted) {
          return NextResponse.json({ error: "conflict" }, { status: 409 });
        }
      }
      if (lState.result) {
        const namesOf: Record<string, string> = {};
        for (const m of room.members) namesOf[m.memberId] = m.name;
        await settleLudo(room.id, lState, namesOf);
        return NextResponse.json({ ok: true, settled: true });
      }
      if (lState.turnId !== me.memberId) {
        return NextResponse.json({ error: "not-turn" }, { status: 403 });
      }

      if (type === "ludo_roll") {
        if (lState.dice) {
          return NextResponse.json({ error: "already-rolled" }, { status: 409 });
        }
        if (nowMs > lState.deadline + 2_500) {
          return NextResponse.json({ error: "expired" }, { status: 409 });
        }
        lState.seq += 1;
        lState.dice = { ...rollDice(), at: lState.seq }; // «at» شناسهٔ پایدار این پرتاب برای کلاینت
        lState.rolls += 1;
        lState.deadline = nowMs + LUDO_MOVE_MS;
        const okp = await persistLudoState(room.id, lState);
        if (!okp) return NextResponse.json({ error: "conflict" }, { status: 409 });
        invalidateRoomSnapshot(room.code); // کلاینت بلافاصله تاس تازه را ببیند
        return NextResponse.json({ ok: true, v: lState.dice.v });
      }

      if (type === "ludo_move") {
        const piece = Number(body.piece);
        if (!Number.isInteger(piece) || piece < 0 || piece > 3) {
          return NextResponse.json({ error: "bad piece" }, { status: 400 });
        }
        const outcome = ludoApplyPlayerAction(lState, me.memberId, piece, nowMs);
        if (!outcome.ok) {
          return NextResponse.json({ error: outcome.reason ?? "illegal" }, { status: 409 });
        }
        const namesOf: Record<string, string> = {};
        for (const m of room.members) namesOf[m.memberId] = m.name;
        const persisted = await persistLudoState(room.id, lState);
        invalidateRoomSnapshot(room.code); // حرکت مهره بلافاصله برای همه دیده شود
        try {
          for (const content of ludoEventTexts(outcome.events, namesOf)) {
            await db.chatMessage.create({
              data: { scope: room.code, memberId: me.memberId, name: me.name, content, kind: "system" },
            });
          }
        } catch {
          /* چت حیاتی نیست */
        }
        if (!persisted) {
          return NextResponse.json({ error: "conflict" }, { status: 409 });
        }
        if (outcome.settled && lState.result) {
          await settleLudo(room.id, lState, namesOf);
        }
        return NextResponse.json({
          ok: true,
          captured: outcome.captured ?? null,
          surprise: outcome.surprise ?? null,
          extraRoll: outcome.extraRoll,
          finished: Boolean(outcome.finishedPlayer),
          settled: outcome.settled,
        });
      }

      /* پاس — فقط وقتی هیچ حرکت مجازی نیست */
      const outcome = ludoApplyPass(lState, me.memberId, nowMs);
      if (!outcome.ok) {
        return NextResponse.json({ error: outcome.reason ?? "illegal" }, { status: 409 });
      }
      const okp = await persistLudoState(room.id, lState);
      if (!okp) return NextResponse.json({ error: "conflict" }, { status: 409 });
      invalidateRoomSnapshot(room.code); // پاس — نوبت بعدی بلافاصله اعلام شود
      if (outcome.settled && lState.result) {
        const namesOf: Record<string, string> = {};
        for (const m of room.members) namesOf[m.memberId] = m.name;
        await settleLudo(room.id, lState, namesOf);
      }
      return NextResponse.json({ ok: true });
    }

    /* --- خروج وسط مسابقه — مهره‌ها می‌مانند و قابل زدن هستند؛ نوبت از او حذف می‌شود --- */
    if (type === "leave" && room.status === "playing") {
      const lState = parseLudoState(room.state);
      if (lState && !lState.result) {
        lState.order = lState.order.filter((id) => id !== me.memberId);
        lState.seq += 1;
        if (lState.turnId === me.memberId) {
          lState.turnId = lState.order[0] ?? "";
          lState.dice = null;
          lState.rolls = 0;
          /* مهلت کامل برای بازیکن بعد — نه چند میلی‌ثانیه (پرش نوبت) */
          lState.deadline = ludoTurnDeadline(lState, Date.now());
        }
        maybeFinish(lState, Date.now());
        await persistLudoState(room.id, lState);
        invalidateRoomSnapshot(room.code); // خروج از مسابقه — نوبت/نتایج تازه شود
        if (lState.result) {
          const namesOf: Record<string, string> = {};
          for (const m of room.members) namesOf[m.memberId] = m.name;
          await settleLudo(room.id, lState, namesOf);
        }
      }
      /* ادامه با منطق عمومی حذف عضو در پایین */
    }

    /* ready / again → منطق مشترک پایین اجرا می‌شود */
  }

  /* ================================================================
     اکشن‌های اختصاصی «شعر یادت نره» — موتور سمت سرور با تیک فازها
     ================================================================ */
  if (room.gameSlug === SHER_GAME_SLUG) {
    /* --- شروع مسابقه (میزبان، حداقل ۲ نفر، همه آماده) --- */
    if (type === "sher_start") {
      if (room.status !== "lobby") {
        return NextResponse.json({ error: "conflict" }, { status: 409 });
      }
      if (room.hostId !== me.memberId) {
        return NextResponse.json({ error: "not host" }, { status: 403 });
      }
      if (room.members.length < MIN_PLAYERS) {
        return NextResponse.json({ error: "need players" }, { status: 409 });
      }
      if (!room.members.every((m) => m.isReady)) {
        return NextResponse.json({ error: "not ready" }, { status: 409 });
      }
      /* آهنگ‌های فعال در لحظهٔ شروع — بدون تکرار در همان مسابقه.
         بخش انتخابی میزبان در لابی از همان JSON لابی اتاق می‌آید (الگوی sherMode):
         اگر بخش معتبر است و در دیتابیس دسته‌بندی وجود دارد، استخر فقط از همان بخش
         ساخته می‌شود؛ اتاق قدیمی بدون بخش یا دیتابیسِ بدون هیچ دسته‌بندی (ردیف‌های
         category="" قدیمی) → همهٔ آهنگ‌های فعال (سازگار با قبل). بخش خالی → 409. */
      const lobbyCategory = sherLobbyCategory(room.state);
      const allRows = await db.sherSong.findMany({ where: { active: true } });
      const poolRows =
        lobbyCategory && allRows.some((r) => r.category !== "")
          ? allRows.filter((r) => r.category === lobbyCategory)
          : allRows;
      const pool = createSherSongsPool(poolRows);
      if (pool.length === 0) {
        return NextResponse.json({ error: "sher-no-songs" }, { status: 409 });
      }
      /* مود: انتخاب میزبان اگر برای تعداد اعضا مجاز بود؛ وگرنه مود حفظ‌شدهٔ
         لابی (انتخاب دفعهٔ قبل)؛ وگرنه انفرادی */
      const allowed = sherModesFor(room.members.length);
      const requested = typeof body.mode === "string" ? body.mode : "";
      const lobbyMode = sherLobbyMode(room.state);
      const mode: SherMode =
        (SHER_MODES as readonly string[]).includes(requested) && allowed.includes(requested as SherMode)
          ? (requested as SherMode)
          : lobbyMode && allowed.includes(lobbyMode)
            ? lobbyMode
            : "ffa";
      const sState = createSherState(
        mode,
        room.members.map((m) => ({ id: m.memberId, name: m.name })),
        pool,
        Date.now(),
      );
      if (!sState) {
        return NextResponse.json({ error: "sher-no-songs" }, { status: 409 });
      }
      /* بخش اتاق در state مسابقه هم ثبت می‌شود تا «مسابقه دوباره» آن را حفظ کند —
         امضای createSherState دست‌نخورده می‌ماند (فیلتر استخر همین‌جاست) */
      if (lobbyCategory) sState.category = lobbyCategory;
      await db.$transaction([
        db.room.update({
          where: { id: room.id },
          data: { status: "playing", state: JSON.stringify(sState) },
        }),
        db.roomMember.updateMany({
          where: { roomId: room.id },
          data: { isReady: false, fireInput: "{}" },
        }),
        db.chatMessage.create({
          data: {
            scope: room.code,
            memberId: me.memberId,
            name: me.name,
            content: "مسابقهٔ «شعر یادت نره» شروع شد — کلیپ را گوش کن و بیت بعدی را حدس بزن!",
            kind: "system",
          },
        }),
      ]);
      invalidateRoomSnapshot(room.code); // مسابقه بلافاصله برای همه بالا بیاید
      return NextResponse.json({ ok: true });
    }

    /* --- ثبت حدس «بیت بعدی» — با تیک مهلت‌ها و گارد seq --- */
    if (type === "sher_answer") {
      if (room.status !== "playing") {
        return NextResponse.json({ error: "conflict" }, { status: 409 });
      }
      const sState = parseSherState(room.state);
      if (!sState) return NextResponse.json({ error: "gone" }, { status: 404 });
      if (!sState.players.some((p) => p.id === me.memberId)) {
        return NextResponse.json({ error: "not player" }, { status: 403 });
      }
      /* اول مهلت‌های عقب‌افتاده (فازها و ربات‌ها) پردازش می‌شود */
      sherTick(sState, {
        now: Date.now(),
        memberIds: new Set(room.members.map((m) => m.memberId)),
      });
      const level = Number(body.level);
      const payload = typeof body.payload === "string" ? body.payload : "";
      const outcome = sherAnswer(sState, me.memberId, level, payload);
      if (!outcome.ok) {
        if (outcome.reason === "bad-level" || outcome.reason === "bad-payload") {
          return NextResponse.json({ error: outcome.reason }, { status: 400 });
        }
        return NextResponse.json({ error: outcome.reason ?? "conflict" }, { status: 409 });
      }
      const persisted = await persistSherState(room.id, sState);
      invalidateRoomSnapshot(room.code); // شمارندهٔ پاسخ‌دهنده‌ها بلافاصله تازه شود
      if (!persisted) {
        return NextResponse.json({ error: "conflict" }, { status: 409 });
      }
      return NextResponse.json({ ok: true });
    }

    /* ready / leave / again → منطق مشترک پایین اجرا می‌شود */
  }

  /* ================================================================
     اکشن‌های اختصاصی «صحنه‌گردان» — پانتومیم کارتی بدون دوربین
     ================================================================ */
  if (room.gameSlug === SCENE_GAME_SLUG) {
    /* --- شروع مسابقه (میزبان، حداقل ۲ نفر، همه آماده) ---
       حالت از بدنهٔ درخواست یا انتخاب لابی (الگوی sher) — کلاسیک پیش‌فرض */
    if (type === "start") {
      if (room.status !== "lobby") {
        return NextResponse.json({ error: "conflict" }, { status: 409 });
      }
      if (room.hostId !== me.memberId) {
        return NextResponse.json({ error: "not host" }, { status: 403 });
      }
      if (room.members.length < MIN_PLAYERS) {
        return NextResponse.json({ error: "need players" }, { status: 409 });
      }
      if (!room.members.every((m) => m.isReady)) {
        return NextResponse.json({ error: "not ready" }, { status: 409 });
      }
      const requested = typeof body.mode === "string" ? body.mode : "";
      const lobby = sceneLobbyMode(room.state);
      const mode: SceneMode =
        (SCENE_MODES as readonly string[]).includes(requested)
          ? (requested as SceneMode)
          : (lobby ?? "classic");
      /* سختی به انتخاب گروه — بدنهٔ درخواست یا انتخاب لابی؛ پیش‌فرض آسان (۱۰ امتیاز) */
      const requestedDiff = typeof body.difficulty === "string" ? body.difficulty : "";
      const lobbyDiff = sceneLobbyDifficulty(room.state);
      const difficulty: SceneDifficulty =
        (SCENE_DIFFS as readonly string[]).includes(requestedDiff)
          ? (requestedDiff as SceneDifficulty)
          : (lobbyDiff ?? "easy");
      const scState = createSceneState(
        mode,
        difficulty,
        room.members.map((m) => ({ id: m.memberId, name: m.name })),
        roomAgeGroup(room),
        Date.now(),
      );
      if (!scState) {
        return NextResponse.json({ error: "need players" }, { status: 409 });
      }
      await db.$transaction([
        db.room.update({
          where: { id: room.id },
          data: { status: "playing", state: JSON.stringify(scState) },
        }),
        db.roomMember.updateMany({
          where: { roomId: room.id },
          data: { isReady: false, fireInput: "{}" },
        }),
        db.chatMessage.create({
          data: {
            scope: room.code,
            memberId: me.memberId,
            name: me.name,
            content: "مسابقهٔ «صحنه‌گردان» شروع شد — کارگردان صحنه را با کارت می‌چیند، بقیه حدس بزنید!",
            kind: "system",
          },
        }),
      ]);
      invalidateRoomSnapshot(room.code); // مسابقه بلافاصله برای همه بالا بیاید
      return NextResponse.json({ ok: true });
    }

    /* --- ثبت صحنهٔ کارگردان — فقط خودش، فقط در فاز چیدمان --- */
    if (type === "scene_set") {
      if (room.status !== "playing") {
        return NextResponse.json({ error: "conflict" }, { status: 409 });
      }
      const scState = parseSceneState(room.state);
      if (!scState) return NextResponse.json({ error: "gone" }, { status: 404 });
      sceneTick(scState, { now: Date.now() });
      const board = sceneValidateBoard(
        body.board,
        scState.mode,
        scState.rounds[scState.round - 1]?.toolbox ?? null,
      );
      const outcome = sceneSetBoard(scState, me.memberId, board);
      if (!outcome.ok) {
        return NextResponse.json({ error: outcome.reason ?? "conflict" }, { status: 409 });
      }
      const persisted = await persistSceneState(room.id, scState);
      invalidateRoomSnapshot(room.code); // صحنهٔ تازه برای همهٔ تماشاچی‌ها
      if (!persisted) {
        return NextResponse.json({ error: "conflict" }, { status: 409 });
      }
      return NextResponse.json({ ok: true });
    }

    /* --- ثبت حدس — هر غیرکارگردان؛ درست‌ها امتیاز می‌گیرند --- */
    if (type === "scene_guess") {
      if (room.status !== "playing") {
        return NextResponse.json({ error: "conflict" }, { status: 409 });
      }
      const scState = parseSceneState(room.state);
      if (!scState) return NextResponse.json({ error: "gone" }, { status: 404 });
      sceneTick(scState, { now: Date.now() });
      const text = typeof body.text === "string" ? body.text : "";
      const outcome = sceneGuess(scState, me.memberId, me.name, text, Date.now());
      if (!outcome.ok) {
        return NextResponse.json({ error: outcome.reason ?? "conflict" }, { status: 409 });
      }
      const persisted = await persistSceneState(room.id, scState);
      invalidateRoomSnapshot(room.code); // فید حدس‌ها و امتیازها بلافاصله تازه شود
      if (!persisted) {
        return NextResponse.json({ error: "conflict" }, { status: 409 });
      }
      if (outcome.correct) {
        try {
          await db.chatMessage.create({
            data: {
              scope: room.code,
              memberId: me.memberId,
              name: me.name,
              content: `${me.name} صحنه را حدس زد! ✓ (+${outcome.points} امتیاز)`,
              kind: "system",
            },
          });
          invalidateRoomSnapshot(room.code);
        } catch {
          /* چت حیاتی نیست */
        }
      }
      return NextResponse.json({ ok: true, correct: outcome.correct, points: outcome.points ?? 0 });
    }

    /* ready / leave / again → منطق مشترک پایین اجرا می‌شود */
  }

  /* --- پرکردن صندلی‌های خالی با ربات (میزبان، فقط لابی، فقط بازی‌های سؤالی) ---
     میزبان بین «انتظار برای تکمیل بازیکنان» و «شروع با ربات» آزاد است؛
     هر ربات بلافاصله آماده است و در مسابقه سؤالی/جدول/حدس تصویر واقعاً بازی می‌کند. */
  if (type === "fill_bots") {
    if (room.status !== "lobby") {
      return NextResponse.json({ error: "conflict" }, { status: 409 });
    }
    if (room.hostId !== me.memberId) {
      return NextResponse.json({ error: "not host" }, { status: 403 });
    }
    if (!BOT_GAMES.has(room.gameSlug)) {
      return NextResponse.json({ error: "bots unsupported" }, { status: 400 });
    }
    const seats = room.maxPlayers - room.members.length;
    if (seats <= 0) {
      return NextResponse.json({ ok: true, added: 0 });
    }
    /* نام‌های استفاده‌شده در اتاق تکرار نشوند */
    const usedNames = new Set(room.members.map((m) => m.name));
    const pool = BOT_NAMES.filter((n) => !usedNames.has(n));
    const rows: Prisma.PrismaPromise<unknown>[] = [];
    const added: { id: string; name: string }[] = [];
    for (let i = 0; i < seats; i++) {
      const name = pool[i % pool.length] ?? `ربات ${i + 1}`;
      const botId = `${BOT_PREFIX}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
      rows.push(
        db.roomMember.create({
          data: {
            roomId: room.id,
            memberId: botId,
            name,
            isReady: true, // ربات همیشه آماده است
          },
        }),
      );
      rows.push(
        db.chatMessage.create({
          data: {
            scope: room.code,
            memberId: botId,
            name,
            content: `${name} به اتاق پیوست 🤖`,
            kind: "system",
          },
        }),
      );
      added.push({ id: botId, name });
    }
    await db.$transaction(rows);
    return NextResponse.json({ ok: true, added: added.length });
  }

  /* --- حذف یک ربات از اتاق (میزبان، فقط لابی) — برای جا بازکردن برای بازیکن واقعی --- */
  if (type === "remove_bot") {
    if (room.status !== "lobby") {
      return NextResponse.json({ error: "conflict" }, { status: 409 });
    }
    if (room.hostId !== me.memberId) {
      return NextResponse.json({ error: "not host" }, { status: 403 });
    }
    const botId = typeof body.botId === "string" ? body.botId : "";
    if (!botId.startsWith(BOT_PREFIX)) {
      return NextResponse.json({ error: "not bot" }, { status: 400 });
    }
    const bot = room.members.find((m) => m.memberId === botId && m.memberId.startsWith(BOT_PREFIX));
    if (!bot) return NextResponse.json({ error: "not bot" }, { status: 404 });
    await db.$transaction([
      db.roomMember.delete({ where: { id: bot.id } }),
      db.chatMessage.create({
        data: {
          scope: room.code,
          memberId: me.memberId,
          name: me.name,
          content: `${bot.name} اتاق را ترک کرد`,
          kind: "system",
        },
      }),
    ]);
    return NextResponse.json({ ok: true });
  }

  /* --- آماده / لغو آمادگی (فقط در لابی) --- */
  if (type === "ready") {
    if (room.status !== "lobby") {
      return NextResponse.json({ error: "conflict" }, { status: 409 });
    }
    await db.roomMember.update({ where: { id: me.id }, data: { isReady: Boolean(body.value) } });
    return NextResponse.json({ ok: true });
  }

  /* --- شروع مسابقه (میزبان، حداقل ۲ نفر، همه آماده) --- */
  if (type === "start") {
    if (room.status !== "lobby") {
      return NextResponse.json({ error: "conflict" }, { status: 409 });
    }
    if (room.hostId !== me.memberId) {
      return NextResponse.json({ error: "not host" }, { status: 403 });
    }
    if (room.members.length < MIN_PLAYERS) {
      return NextResponse.json({ error: "need players" }, { status: 409 });
    }
    if (!room.members.every((m) => m.isReady)) {
      return NextResponse.json({ error: "not ready" }, { status: 409 });
    }
    /* گروه سنی اتاق از زمان ساخت اتاق حفظ شده است — سؤال‌ها متناسب با آن انتخاب می‌شوند */
    const ageGroup = roomAgeGroup(room);
    const state = { startedAtMs: Date.now() + 3000, qs: await pickQuestionsSmart(ROUND_COUNT, ageGroup) }; // ۳ ثانیه شمارش معکوس
    await db.$transaction([
      db.room.update({
        where: { id: room.id },
        data: { status: "playing", state: JSON.stringify(state) },
      }),
      db.roomMember.updateMany({ where: { roomId: room.id }, data: { isReady: false } }),
    ]);
    return NextResponse.json({ ok: true });
  }

  /* --- پاسخ به سؤال جاری --- */
  if (type === "answer") {
    if (room.status !== "playing") {
      return NextResponse.json({ error: "conflict" }, { status: 409 });
    }
    const state = parseState(room.state);
    const phase = computePhase(state.startedAtMs, Date.now());
    if (phase.status !== "playing" || phase.phase !== "answer") {
      return NextResponse.json({ error: "closed" }, { status: 409 });
    }
    const round = Number(body.round);
    const choice = Number(body.choice);
    if (round !== phase.round || !Number.isInteger(choice) || choice < 0 || choice > 3) {
      return NextResponse.json({ error: "bad answer" }, { status: 400 });
    }
    const q = state.qs[round];
    if (!q) return NextResponse.json({ error: "bad round" }, { status: 400 });

    /* ثبت اتمیک — قید یکتا (roomId, round, memberId) جلوی پاسخ دوباره را می‌گیرد */
    let created = false;
    try {
      await db.roomAnswer.create({
        data: { roomId: room.id, round, memberId: me.memberId, choice },
      });
      created = true;
    } catch {
      /* قبلاً برای این سؤال پاسخ داده */
    }
    if (!created) {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    if (choice === q.a) {
      await db.roomMember.update({
        where: { id: me.id },
        data: { score: { increment: scoreFor(phase.endsInMs) } },
      });
    }
    return NextResponse.json({ ok: true, correct: choice === q.a });
  }

  /* --- خروج از اتاق --- */
  if (type === "leave") {
    await db.roomMember.delete({ where: { id: me.id } });
    const remaining = room.members.filter((m) => m.memberId !== me.memberId);
    const humansLeft = remaining.filter((m) => !m.memberId.startsWith(BOT_PREFIX));
    if (humansLeft.length === 0) {
      /* اتاق فقط با بازیکن واقعی معنا دارد — با رفتن آخرین انسان، اتاق (به همراه ربات‌ها) تخلیه می‌شود */
      await db.room.delete({ where: { id: room.id } });
    } else if (room.hostId === me.memberId) {
      /* میزبان رفت → قدیمی‌ترین عضوِ انسانی میزبان می‌شود — ربات هرگز میزبان نمی‌شود */
      const next = [...humansLeft].sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime())[0];
      await db.$transaction([
        db.room.update({ where: { id: room.id }, data: { hostId: next.memberId } }),
        db.roomMember.update({ where: { id: next.id }, data: { isHost: true } }),
      ]);
    }
    return NextResponse.json({ ok: true });
  }

  /* --- مسابقه دوباره (میزبان، بعد از پایان) --- */
  if (type === "again") {
    if (room.status !== "finished") {
      return NextResponse.json({ error: "conflict" }, { status: 409 });
    }
    if (room.hostId !== me.memberId) {
      return NextResponse.json({ error: "not host" }, { status: 403 });
    }
    /* «شعر یادت نره»: مود و بخش انتخابی میزبان حفظ می‌شود تا مسابقهٔ دوباره با
       همان مود و همان بخش برگزار شود — اول از state لابی، وگرنه از مسابقهٔ گذشته */
    const lobbyState = (() => {
      if (room.gameSlug === SHER_GAME_SLUG) {
        const past = parseSherState(room.state);
        const sherMode = sherLobbyMode(room.state) ?? past?.mode ?? null;
        const sherCategory = sherLobbyCategory(room.state) ?? past?.category ?? null;
        const meta: { ageGroup: string; sherMode?: SherMode; sherCategory?: SherCategory } = {
          ageGroup: roomAgeGroup(room),
        };
        if (sherMode) meta.sherMode = sherMode;
        if (sherCategory) meta.sherCategory = sherCategory;
        return JSON.stringify(meta);
      }
      /* صحنه‌گردان: حالت و سختی انتخابی میزبان برای «مسابقه دوباره» حفظ می‌شود */
      if (room.gameSlug === SCENE_GAME_SLUG) {
        const past = parseSceneState(room.state);
        const sceneMode = sceneLobbyMode(room.state) ?? past?.mode ?? null;
        const sceneDifficulty = sceneLobbyDifficulty(room.state) ?? past?.difficulty ?? null;
        const meta: { ageGroup: string; sceneMode?: SceneMode; sceneDifficulty?: SceneDifficulty } = { ageGroup: roomAgeGroup(room) };
        if (sceneMode) meta.sceneMode = sceneMode;
        if (sceneDifficulty) meta.sceneDifficulty = sceneDifficulty;
        return JSON.stringify(meta);
      }
      /* منچ: بازی تیمی و گروه سنی برای مسابقهٔ بعدی هم می‌ماند */
      return JSON.stringify({
        ageGroup: roomAgeGroup(room),
        ludoTeams: parseLudoState(room.state)?.teams === true,
      });
    })();
    await db.$transaction([
      db.room.update({
        where: { id: room.id },
        /* گروه سنی اتاق حفظ می‌شود تا «بازی دوباره» با همان سؤال‌های سنی برگزار شود
           و انتخاب بازی تیمی منچ هم برای مسابقهٔ بعدی می‌ماند */
        data: {
          status: "lobby",
          ageGroup: roomAgeGroup(room), // گروه سنی انتخابی میزبان در «مسابقه دوباره» هم می‌ماند
          state: lobbyState,
        },
      }),
      db.roomMember.updateMany({ where: { roomId: room.id }, data: { score: 0, isReady: false, fireInput: "{}" } }),
      db.roomAnswer.deleteMany({ where: { roomId: room.id } }),
    ]);
    invalidateRoomSnapshot(room.code); // لابی تازه برای همه
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
