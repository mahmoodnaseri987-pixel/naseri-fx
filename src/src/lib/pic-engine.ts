/* بازی «حدس تصویر» — مغز سمت سرور.
   ⚠️ فقط در مسیرهای سرور ایمپورت شود: این ماژول پاسخ‌های پازل‌ها را می‌داند
   و نباید هیچ‌گاه در بستهٔ کلاینت ظاهر شود. کلاینت فقط pic-shared.ts. */

import puzzleData from "@/data/pic-puzzles.json";
import {
  PIC_REVEAL_MS,
  PIC_ROUNDS,
  PIC_ROUND_MS,
  PIC_START_DELAY_MS,
  PIC_WRONG_LOCK_MS,
  picPhase,
  type PicRoomState,
  type PicView,
} from "@/lib/pic-shared";
import { normalizeFa } from "@/lib/jadval-shared";

type RawPuzzle = { id: string; e: string; a: string };

const PUZZLES = puzzleData.puzzles as unknown as RawPuzzle[];

export function picPuzzleCount(): number {
  return PUZZLES.length;
}

/* ---------- ساخت وضعیت شروع ---------- */

export function createPicState(): PicRoomState {
  /* انتخاب بدون تکرار از بانک */
  const idx = Array.from({ length: PUZZLES.length }, (_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return {
    game: "pic-guess",
    startedAtMs: Date.now() + PIC_START_DELAY_MS,
    rounds: idx.slice(0, PIC_ROUNDS),
    wins: Array.from({ length: PIC_ROUNDS }, () => null),
    wrongUntil: {},
  };
}

/** پاسخ رسمی دور r — فقط سمت سرور (برای ربات‌ها و پیام‌های سیستمی) */
export function getPicAnswer(state: PicRoomState, round: number): string {
  return PUZZLES[state.rounds[round]]?.a ?? "";
}

/* ---------- خواندن وضعیت از JSON خام ---------- */

export function parsePicState(raw: string): PicRoomState | null {
  try {
    const data = JSON.parse(raw) as PicRoomState;
    if (
      data &&
      data.game === "pic-guess" &&
      typeof data.startedAtMs === "number" &&
      Array.isArray(data.rounds) &&
      data.rounds.length === PIC_ROUNDS &&
      Array.isArray(data.wins) &&
      data.wins.length === PIC_ROUNDS &&
      data.rounds.every((r) => Number.isInteger(r) && r >= 0 && r < PUZZLES.length)
    ) {
      return data;
    }
  } catch {
    /* خراب — حالت خالی */
  }
  return null;
}

/** امتیاز اولین پاسخ درست — هرچه سریع‌تر، بیشتر */
export function picPointsFor(endsInMs: number): number {
  return 60 + Math.max(0, Math.min(60, Math.round((endsInMs / PIC_ROUND_MS) * 60)));
}

/* ---------- بررسی پاسخ ---------- */

export type PicAnswerOutcome =
  | { kind: "correct"; round: number; points: number; answer: string }
  | { kind: "locked"; lockMs: number }
  | { kind: "wrong"; lockMs: number }
  | { kind: "closed" };

/** ثبت حدس بازیکن — تمیزِ ورودی بیرون انجام شده است.
    ⚠️ state را درجا تغییر می‌دهد؛ فراخوانی مسئول ذخیره است. */
export function submitPicGuess(
  state: PicRoomState,
  memberId: string,
  text: string,
  now: number,
): PicAnswerOutcome {
  const phase = picPhase(state, now);
  if (phase.status !== "playing" || phase.phase !== "answer") {
    return { kind: "closed" };
  }
  const lockUntil = state.wrongUntil[memberId] ?? 0;
  if (now < lockUntil) {
    return { kind: "locked", lockMs: lockUntil - now };
  }
  const puzzle = PUZZLES[state.rounds[phase.round]];
  if (!puzzle) return { kind: "closed" };
  if (state.wins[phase.round]) return { kind: "closed" };
  if (normalizeFa(text) !== normalizeFa(puzzle.a)) {
    state.wrongUntil[memberId] = now + PIC_WRONG_LOCK_MS;
    return { kind: "wrong", lockMs: PIC_WRONG_LOCK_MS };
  }
  /* اولین پاسخ درست برندهٔ دور است */
  const points = picPointsFor(phase.endsInMs);
  state.wins[phase.round] = { w: memberId, at: now };
  return { kind: "correct", round: phase.round, points, answer: puzzle.a };
}

/* ---------- نمای اختصاصی هر عضو ---------- */

export function buildPicView(
  state: PicRoomState,
  memberId: string,
  names: Record<string, string>,
  now: number,
): PicView | null {
  const phase = picPhase(state, now);
  const total = state.rounds.length;

  if (phase.status === "countdown") {
    return {
      startedAtMs: state.startedAtMs,
      rounds: total,
      status: "countdown",
      round: 0,
      phase: "answer",
      endsInMs: Math.max(0, state.startedAtMs - now),
      emoji: PUZZLES[state.rounds[0]]?.e ?? "",
      len: 0,
      myLockUntilMs: 0,
      history: [],
    };
  }

  if (phase.status === "finished") {
    const full: PicView["history"] = state.rounds.map((pi, r) => {
      const puzzle = PUZZLES[pi];
      const win = state.wins[r] ?? null;
      return {
        emoji: puzzle.e,
        answer: puzzle.a,
        winnerName: win ? (names[win.w] ?? null) : null,
        winnerId: win?.w ?? null,
        mine: win?.w === memberId,
        points: win ? picPointsFor(Math.max(0, answerEndOf(state, r) - win.at)) : 0,
      };
    });
    return {
      startedAtMs: state.startedAtMs,
      rounds: total,
      status: "finished",
      round: total - 1,
      phase: "reveal",
      endsInMs: 0,
      emoji: "",
      len: 0,
      myLockUntilMs: 0,
      history: full,
    };
  }

  /* در جریان — تاریخچهٔ دورهای گذشته + دور جاری */
  const history: PicView["history"] = [];
  for (let r = 0; r < phase.round; r++) {
    const puzzle = PUZZLES[state.rounds[r]];
    if (!puzzle) return null;
    const win = state.wins[r] ?? null;
    history.push({
      emoji: puzzle.e,
      answer: puzzle.a, // دورهای گذشته آشکارند
      winnerName: win ? (names[win.w] ?? null) : null,
      winnerId: win?.w ?? null,
      mine: win?.w === memberId,
      points: win ? picPointsFor(Math.max(0, answerEndOf(state, r) - win.at)) : 0,
    });
  }

  const cur = PUZZLES[state.rounds[phase.round]];
  if (!cur) return null;
  const curWin = state.wins[phase.round] ?? null;
  history.push({
    emoji: cur.e,
    answer: phase.phase === "reveal" ? cur.a : null, // در فاز پاسخ‌دهی پاسخ مخفی است
    winnerName: curWin ? (names[curWin.w] ?? null) : null,
    winnerId: curWin?.w ?? null,
    mine: curWin?.w === memberId,
    points: phase.phase === "reveal" && curWin ? picPointsFor(Math.max(0, answerEndOf(state, phase.round) - curWin.at)) : 0,
  });

  return {
    startedAtMs: state.startedAtMs,
    rounds: total,
    status: "playing",
    round: phase.round,
    phase: phase.phase,
    endsInMs: phase.endsInMs,
    emoji: cur.e,
    len: cur.a.length,
    myLockUntilMs: (state.wrongUntil[memberId] ?? 0) > now ? state.wrongUntil[memberId] : 0,
    history,
  };
}

/* پایان پنجرهٔ پاسخ‌دهی دور r — برد اگر رخ داده باشد زودتر می‌بندد */
function answerEndOf(state: PicRoomState, r: number): number {
  const win = state.wins[r] ?? null;
  return Math.min(roundStartOf(state, r) + PIC_ROUND_MS, win ? win.at : Number.POSITIVE_INFINITY);
}

function roundStartOf(state: PicRoomState, r: number): number {
  let cursor = state.startedAtMs;
  for (let i = 0; i < r; i++) {
    cursor = answerEndOf(state, i) + PIC_REVEAL_MS;
  }
  return cursor;
}
