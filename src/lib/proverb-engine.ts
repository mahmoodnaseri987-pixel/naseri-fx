/* ================================================================
   «ضرب‌المثل‌چین» — مغز سمت سرور
   الگوی وضعیت «صحنه‌گردان»: seq فقط رو به جلو، فازهای زنجیره‌ای
   قطعی، ربات‌ها با hash32 بدون RNG مشترک. ضرب‌المثل مخفی فقط برای
   چینش‌گر دور جاری بیرون می‌آید (buildPcView با memberId قفل می‌کند)
   و در «تلفن‌چی» بعد از دور اول حتی چینش‌گر هم فقط تصویر می‌بیند.
   ================================================================ */

import {
  PC_BUILD_MS, PC_DECOYS, PC_HINT1_MS, PC_HINT2_MS, PC_HISTORY_CAP, PC_MAX_CARDS, PC_MAX_ROUNDS,
  PC_MINIMALIST_CARDS, PC_POINTS_DIRECTOR, PC_POINTS_FULL_FIRST, PC_POINTS_FULL_LATER, PC_POINTS_HINT_PENALTY,
  PC_POINTS_MINIMALIST, PC_POINTS_MISSING_BONUS, PC_POINTS_NEAR, PC_POINTS_SWAP_PENALTY, PC_REVEAL_MS,
  PC_REVEAL_MS_PHONE, PC_START_DELAY_MS, PC_VOTE_MAX, PC_GAME_SLUG,
  type PcBoard, type PcMode, type PcPlaced, type PcResult, type PcRoomState, type PcRound, type PcView,
} from "@/lib/proverb-shared";
import { PC_CARD_MAP } from "@/lib/proverb-cards";
import { isBotId } from "@/lib/arena-registry";
import puzzlesData from "@/data/proverb-puzzles.json";

/* ---------- بانک ضرب‌المثل‌ها — فقط سمت سرور ---------- */

type RawPuzzle = { id: number; t: string; keys: string[]; cards: string[]; alts: Record<string, string[]>; decoys: string[] };
const PUZZLES = (puzzlesData.puzzles as RawPuzzle[]).filter((p) => p.t && p.cards.length > 0);
const PUZZLE_MAP = new Map(PUZZLES.map((p) => [p.id, p]));

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function hash32(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/* ---------- نرمال‌سازی و تطبیق حدس ---------- */

/** یکدست‌سازی حروف و فاصله‌ها — ی/ک عربی، اعراب، نیم‌فاصله، علائم */
function norm(s: string): string {
  return s
    .replace(/[\u064B-\u0652\u0670\u0640]/g, "") // اعراب و کشیده
    .replace(/[\u0649\u064A]/g, "ی")
    .replace(/\u0643/g, "ک")
    .replace(/[\u0623\u0625\u0671]/g, "ا")
    .replace(/\u0622/g, "ا")
    .replace(/[\u200c\u200f\u200e]/g, "") // نیم‌فاصله و کنترل‌ها
    .replace(/[.,!؟?«»"'():؛،\-–]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** برهنه‌سازی تصریف‌های پرتکرار برای تطبیق توکنی */
function stem(tok: string): string {
  return tok
    .replace(/^(نمی|می)‌?/, "")
    .replace(/(‌?ها|ترین|‌?تر|اند|‌?ست|ند|اش|ام|ات|ش)$/u, "");
}

/** تطبیق یک کلمهٔ کلیدی با توکن‌های حدس — برابر، پسوند/پیشوند کوچک، یا جایگزین‌ها */
function keyHit(key: string, tokens: string[], guessNorm: string, alts: Record<string, string[]>): boolean {
  const k = norm(key);
  const wordHit = (base: string, k: string): boolean => {
    if (!base) return false;
    if (base === k) return true;
    if (k.length >= 2 && base.startsWith(k) && base.length - k.length <= 2) return true;
    if (k.length >= 2 && base.endsWith(k) && base.length - k.length <= 2) return true;
    return k.length >= 4 && base.length >= 4 && (base.includes(k) || k.includes(base));
  };
  for (const tok of tokens) {
    if (wordHit(tok, k) || wordHit(stem(tok), k)) return true;
  }
  for (const a of alts[key] ?? []) {
    const an = norm(a);
    if (!an) continue;
    if (an.includes(" ")) {
      if (guessNorm.includes(an)) return true;
    } else {
      for (const tok of tokens) {
        if (wordHit(tok, an) || wordHit(stem(tok), an)) return true;
      }
    }
  }
  return false;
}

export type PcMatchGrade = "full" | "near" | "wrong";

/** درجهٔ حدس: کامل (همهٔ کلیدها)، نزدیک (حداقل نصف)، یا نادرست */
export function gradePcGuess(guess: string, puzzleId: number): { grade: PcMatchGrade; matched: number; total: number } {
  const puzzle = PUZZLE_MAP.get(puzzleId);
  if (!puzzle) return { grade: "wrong", matched: 0, total: 0 };
  const g = norm(guess);
  if (!g) return { grade: "wrong", matched: 0, total: 0 };
  const tokens = g.split(" ");
  let matched = 0;
  for (const key of puzzle.keys) {
    if (keyHit(key, tokens, g, puzzle.alts ?? {})) matched += 1;
  }
  const total = puzzle.keys.length;
  if (matched >= total) return { grade: "full", matched, total };
  if (total >= 2 && matched * 2 >= total) return { grade: "near", matched, total };
  return { grade: "wrong", matched, total };
}

/** حدس «کارت گم‌شده» در حالت ناقص — فقط خودِ کلمه */
function isMissingWordGuess(guess: string, missing: string | null): boolean {
  if (!missing) return false;
  const word = missing.replace(/^[wm]\./, "");
  const g = norm(guess);
  const tokens = g.split(" ");
  return tokens.some((t) => t === norm(word) || stem(t) === stem(norm(word)));
}

/* ---------- ساخت وضعیت شروع ---------- */

function roundCountOf(mode: PcMode, players: number): number {
  return mode === "phone" ? Math.min(8, Math.max(2, players)) : Math.min(PC_MAX_ROUNDS, Math.max(2, players * 2));
}

function revealMsOf(mode: PcMode): number {
  return mode === "phone" ? PC_REVEAL_MS_PHONE : PC_REVEAL_MS;
}

function emptyBoard(): PcBoard {
  return { items: [] };
}

/** انتخاب ۳ کارت ممنوعه — اولویت با کارت‌های اسم؛ قطعی با hash */
function pickLocked(puzzle: RawPuzzle, seed: string): string[] {
  const names = [...new Set(puzzle.cards.filter((k) => PC_CARD_MAP.get(k)?.t === "name"))];
  const others = [...new Set(puzzle.cards.filter((k) => PC_CARD_MAP.get(k)?.t !== "name"))];
  const pool = [...names, ...others];
  const count = Math.min(3, Math.max(1, pool.length - 2)); // حداقل ۲ کارت بماند
  const h = hash32(seed);
  const picked: string[] = [];
  let i = h % pool.length;
  while (picked.length < count && picked.length < pool.length - 2) {
    const k = pool[i % pool.length];
    if (!picked.includes(k)) picked.push(k);
    i += 1 + (hash32(seed + i) % 3);
  }
  return picked;
}

/** ساخت جعبه کارت یک دور: کارت‌های ضرب‌المثل + فریبنده‌ها + جوکر */
function buildTray(puzzle: RawPuzzle, locked: string[], missing: string | null, seed: string): string[] {
  const tray: string[] = [];
  for (const k of puzzle.cards) {
    if (locked.includes(k) || k === missing) continue;
    tray.push(k);
  }
  /* فریبنده‌ها: authored یا از کاتالوگ اسم‌ها؛ هرگز هم‌پوشان با کارت‌های ضرب‌المثل */
  const own = new Set([...puzzle.cards, ...tray]);
  const decoys = puzzle.decoys.filter((k) => !own.has(k) && PC_CARD_MAP.has(k)).slice(0, PC_DECOYS);
  if (decoys.length < PC_DECOYS) {
    const namePool = PC_CARDS_POOL.filter((k) => !own.has(k) && !decoys.includes(k));
    const h = hash32(seed);
    for (let i = 0; decoys.length < PC_DECOYS && i < 40; i++) {
      const k = namePool[(h + i * 37) % namePool.length];
      if (!decoys.includes(k)) decoys.push(k);
    }
  }
  tray.push(...decoys);
  tray.push("j.پرسش", "j.دایره", "j.مربع", "j.خط"); // جوکرها همیشه در دسترس
  return [...new Set(tray)];
}

/* استخر کارت‌های اسم برای فریبنده‌های تصادفی — ماژول‌سطح، یک‌بار */
const PC_CARDS_POOL: string[] = [...PC_CARD_MAP.values()].filter((c) => c.t === "name").map((c) => c.k);

/** چینش‌گرها به‌ترتیب ورود، هرکدام ۲ بار؛ ضرب‌المثل‌ها بی‌تکرار از ۵۰ تا */
export function createPcState(
  mode: PcMode,
  players: { id: string; name: string }[],
  now: number,
): PcRoomState | null {
  const clean = players.filter((p) => p.id && p.name);
  if (clean.length < 2) return null;
  const totalRounds = roundCountOf(mode, clean.length);
  const picked = shuffle(PUZZLES).slice(0, totalRounds);
  if (picked.length < totalRounds) return null;
  const rounds = picked.map((puzzle, i) => {
    const arranger = clean[i % clean.length];
    const seed = `pc:${i}:${now}`;
    const locked = mode === "banned" ? pickLocked(puzzle, seed) : [];
    const missing = mode === "incomplete" ? (puzzle.cards.find((k) => PC_CARD_MAP.get(k)?.t === "name" && !locked.includes(k)) ?? null) : null;
    return {
      puzzleId: puzzle.id,
      arrangerId: arranger.id,
      arrangerName: arranger.name,
      board: emptyBoard(),
      history: [emptyBoard()],
      tray: buildTray(puzzle, locked, missing, seed),
      locked,
      missing,
      hints: { h1: false, h2: false, word: null },
      swapped: false,
      guesses: [],
      scorers: [],
      reactions: [],
      votes: {},
    };
  });
  const scores: Record<string, number> = {};
  clean.forEach((p) => {
    scores[p.id] = 0;
  });
  return {
    game: PC_GAME_SLUG,
    startedAtMs: now + PC_START_DELAY_MS,
    seq: 1,
    mode,
    players: clean,
    round: 1,
    totalRounds,
    phase: "build",
    phaseEnds: now + PC_START_DELAY_MS + PC_BUILD_MS,
    rounds,
    scores,
    result: null,
  };
}

export function parsePcState(raw: string): PcRoomState | null {
  try {
    const data = JSON.parse(raw) as PcRoomState;
    if (
      data &&
      data.game === PC_GAME_SLUG &&
      typeof data.startedAtMs === "number" &&
      typeof data.seq === "number" &&
      Array.isArray(data.rounds) &&
      data.players &&
      data.scores
    ) {
      return data;
    }
  } catch {
    /* خراب — حالت خالی */
  }
  return null;
}

/* ---------- اعتبارسنجی صحنه ---------- */

export function cardCountOf(board: PcBoard): number {
  return board.items.length;
}

function clampPlaced(p: PcPlaced, tray: string[]): PcPlaced | null {
  if (typeof p?.k !== "string" || !tray.includes(p.k)) return null;
  const def = PC_CARD_MAP.get(p.k);
  if (!def) return null;
  const num = (v: unknown, lo: number, hi: number, d: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
  };
  const out: PcPlaced = {
    k: p.k,
    x: num(p.x, 2, 98, 50),
    y: num(p.y, 2, 98, 50),
  };
  const r = Number(p.r);
  if (Number.isFinite(r) && r !== 0) out.r = Math.min(45, Math.max(-45, r));
  /* صفت سوارِ کارت اسم می‌شود — کارت مادر باید همان صحنه باشد */
  if (def.t === "mod" && typeof p.p === "string") {
    const parent = tray.includes(p.p) ? p.p : undefined; // اعتبار مادر در pcSetBoard با items چک می‌شود
    if (parent) out.p = parent;
  }
  return out;
}

/** صحنهٔ ارسالی چینش‌گر را تمیز و قانونی می‌کند؛ نامعتبر → null */
export function pcValidateBoard(board: unknown, round: PcRound): PcBoard | null {
  if (!board || typeof board !== "object") return null;
  const b = board as { items?: unknown };
  if (!Array.isArray(b.items)) return null;
  if (b.items.length > PC_MAX_CARDS) return null;
  const items: PcPlaced[] = [];
  for (const raw of b.items) {
    const c = clampPlaced(raw as PcPlaced, round.tray);
    if (!c) return null; // کلید خارج از جعبه = تقلب → کل صحنه مردود
    items.push(c);
  }
  /* مادرِ هر صفت باید در همین صحنه و از نوع اسم/فعل باشد */
  for (const it of items) {
    if (!it.p) continue;
    const parent = items.find((o) => o.k === it.p);
    const pdef = parent ? PC_CARD_MAP.get(it.p) : null;
    if (!parent || !pdef || (pdef.t !== "name" && pdef.t !== "joker")) return null;
    if (it.k === it.p) return null;
  }
  return { items };
}

/* ---------- ثبت صحنهٔ چینش‌گر ---------- */

export type PcSetOutcome = { ok: boolean; reason?: "phase" | "not-arranger" | "bad-board" };

export function pcSetBoard(st: PcRoomState, memberId: string, board: PcBoard | null): PcSetOutcome {
  if (st.phase !== "build") return { ok: false, reason: "phase" };
  const round = st.rounds[st.round - 1];
  if (!round || round.arrangerId !== memberId) return { ok: false, reason: "not-arranger" };
  if (!board) return { ok: false, reason: "bad-board" };
  round.board = board;
  const last = round.history[round.history.length - 1];
  if (JSON.stringify(last) !== JSON.stringify(board)) {
    round.history.push(board);
    if (round.history.length > PC_HISTORY_CAP) {
      round.history.splice(1, round.history.length - PC_HISTORY_CAP);
    }
  }
  st.seq += 1;
  return { ok: true };
}

/* ---------- داوری حدس ---------- */

export type PcGuessOutcome = {
  ok: boolean;
  grade?: PcMatchGrade | "miss-word";
  points?: number;
  reason?: "phase" | "unknown" | "arranger" | "already" | "bad-text" | "phone";
};

function tierAwarded(round: PcRound, id: string, tier: "full" | "near" | "miss-word"): boolean {
  return round.scorers.some((s) => s.id === id && s.tier === tier);
}

/** حدس در فاز build — کامل/نزدیک/کارت‌گم‌شده؛ در تلفن‌چی حدسی وجود ندارد */
export function pcGuess(st: PcRoomState, playerId: string, name: string, text: string, now: number): PcGuessOutcome {
  if (st.mode === "phone") return { ok: false, reason: "phone" };
  if (st.phase !== "build") return { ok: false, reason: "phase" };
  const player = st.players.find((p) => p.id === playerId);
  if (!player) return { ok: false, reason: "unknown" };
  const round = st.rounds[st.round - 1];
  if (!round) return { ok: false, reason: "phase" };
  if (round.arrangerId === playerId) return { ok: false, reason: "arranger" };
  const clean = typeof text === "string" ? text.trim().slice(0, 160) : "";
  if (!clean) return { ok: false, reason: "bad-text" };
  const puzzle = PUZZLE_MAP.get(round.puzzleId)!;

  /* ۱) کارت گم‌شده — امتیاز جدا، یک‌بار برای هر نفر */
  if (isMissingWordGuess(clean, round.missing) && !tierAwarded(round, playerId, "miss-word")) {
    round.scorers.push({ id: playerId, name, points: PC_POINTS_MISSING_BONUS, atMs: now, tier: "miss-word" });
    st.scores[playerId] = (st.scores[playerId] ?? 0) + PC_POINTS_MISSING_BONUS;
    round.guesses.push({ id: playerId, name, text: clean, atMs: now, tier: "miss-word" });
    st.seq += 1;
    return { ok: true, grade: "miss-word", points: PC_POINTS_MISSING_BONUS };
  }

  const { grade } = gradePcGuess(clean, round.puzzleId);
  round.guesses.push({ id: playerId, name, text: clean, atMs: now, tier: grade });
  if (round.guesses.length > 40) round.guesses.splice(0, round.guesses.length - 40);

  let points = 0;
  if (grade === "full" && !tierAwarded(round, playerId, "full")) {
    const first = !round.scorers.some((s) => s.tier === "full");
    const tier = first ? PC_POINTS_FULL_FIRST : PC_POINTS_FULL_LATER;
    const nearAlready = tierAwarded(round, playerId, "near") ? PC_POINTS_NEAR : 0;
    points = Math.max(0, tier - nearAlready);
    if (points > 0) {
      round.scorers.push({ id: playerId, name, points, atMs: now, tier: "full" });
      st.scores[playerId] = (st.scores[playerId] ?? 0) + points;
      st.scores[round.arrangerId] = (st.scores[round.arrangerId] ?? 0) + PC_POINTS_DIRECTOR;
    }
  } else if (grade === "near" && !tierAwarded(round, playerId, "near") && !tierAwarded(round, playerId, "full")) {
    points = PC_POINTS_NEAR;
    round.scorers.push({ id: playerId, name, points, atMs: now, tier: "near" });
    st.scores[playerId] = (st.scores[playerId] ?? 0) + points;
  }
  st.seq += 1;
  return { ok: true, grade, points };
}

/* ---------- تعویض ضرب‌المثل — یک‌بار، −۲ ---------- */

export type PcSwapOutcome = { ok: boolean; reason?: "phase" | "not-arranger" | "once" };

export function pcSwap(st: PcRoomState, memberId: string): PcSwapOutcome {
  if (st.phase !== "build") return { ok: false, reason: "phase" };
  const round = st.rounds[st.round - 1];
  if (!round || round.arrangerId !== memberId) return { ok: false, reason: "not-arranger" };
  if (round.swapped) return { ok: false, reason: "once" };
  const h = hash32(`pc-swap:${st.round}:${st.startedAtMs}:${st.seq}`);
  const others = PUZZLES.filter((p) => p.id !== round.puzzleId);
  const next = others[h % others.length];
  round.puzzleId = next.id;
  round.swapped = true;
  round.hints = { h1: false, h2: false, word: null };
  round.board = emptyBoard();
  round.history = [emptyBoard()];
  const locked = st.mode === "banned" ? pickLocked(next, `${st.round}:${st.startedAtMs}:sw`) : [];
  const missing = st.mode === "incomplete" ? (next.cards.find((k) => PC_CARD_MAP.get(k)?.t === "name") ?? null) : null;
  round.locked = locked;
  round.missing = missing;
  round.tray = buildTray(next, locked, missing, `pc:${st.round}:sw:${st.startedAtMs}`);
  st.scores[memberId] = (st.scores[memberId] ?? 0) - PC_POINTS_SWAP_PENALTY;
  st.seq += 1;
  return { ok: true };
}

/* ---------- رأی خلاقیت و واکنش‌ها — فقط در افشا ---------- */

export type PcVoteOutcome = { ok: boolean; reason?: "phase" | "unknown" | "arranger" | "once" | "range" };

export function pcVote(st: PcRoomState, voterId: string, value: number): PcVoteOutcome {
  if (st.phase !== "reveal") return { ok: false, reason: "phase" };
  const round = st.rounds[st.round - 1];
  if (!round) return { ok: false, reason: "phase" };
  if (round.arrangerId === voterId) return { ok: false, reason: "arranger" };
  if (!st.players.some((p) => p.id === voterId)) return { ok: false, reason: "unknown" };
  const v = Math.round(Number(value));
  if (!Number.isFinite(v) || v < 1 || v > PC_VOTE_MAX) return { ok: false, reason: "range" };
  if (round.votes[voterId] !== undefined) return { ok: false, reason: "once" };
  round.votes[voterId] = v;
  st.scores[round.arrangerId] = (st.scores[round.arrangerId] ?? 0) + v;
  st.seq += 1;
  return { ok: true };
}

export type PcReactOutcome = { ok: boolean; reason?: "phase" | "bad" };

export function pcReact(st: PcRoomState, playerId: string, name: string, k: string): PcReactOutcome {
  if (st.phase !== "reveal") return { ok: false, reason: "phase" };
  const round = st.rounds[st.round - 1];
  if (!round) return { ok: false, reason: "phase" };
  const clean = typeof k === "string" ? k.trim() : "";
  if (!["clap", "laugh", "facepalm", "towel", "vala", "perfect", "tea", "sitdown", "busted"].includes(clean)) {
    return { ok: false, reason: "bad" };
  }
  round.reactions.push({ id: playerId, name, k: clean, atMs: Date.now() });
  if (round.reactions.length > 30) round.reactions.splice(0, round.reactions.length - 30);
  st.seq += 1;
  return { ok: true };
}

/* ---------- ربات‌ها — قطعی با hash32 ---------- */

const BOT_PLACE_STEP_MS = 6_500;

/** طرح چینش‌گرِ ربات — خود کارت‌های ضرب‌المثل را به‌ترتیب می‌گذارد */
function botPlan(round: PcRound, st: PcRoomState): string[] {
  if (st.mode === "phone") {
    if (st.round === 1) {
      const puzzle = PUZZLE_MAP.get(round.puzzleId)!;
      return puzzle.cards.filter((k) => !round.locked.includes(k) && k !== round.missing);
    }
    const target = st.rounds[st.round - 2]?.board;
    return target ? target.items.map((it) => it.k) : [];
  }
  const puzzle = PUZZLE_MAP.get(round.puzzleId)!;
  return puzzle.cards.filter((k) => !round.locked.includes(k) && k !== round.missing && PC_CARD_MAP.has(k));
}

function botSlot(i: number, h: number): { x: number; y: number; r: number } {
  const x = 14 + ((i * 19 + (h % 9)) % 70);
  const y = 22 + ((i * 29 + (h % 5)) % 56);
  const r = [-15, 0, 0, 12, -12, 20][h % 6];
  return { x, y, r };
}

function botArrangerStep(botId: string, st: PcRoomState, elapsed: number): void {
  const round = st.rounds[st.round - 1];
  const keys = botPlan(round, st);
  const placed = cardCountOf(round.board);
  if (placed >= keys.length) return;
  const dueAt = (placed + 1) * BOT_PLACE_STEP_MS;
  if (elapsed < dueAt) return;
  const h = hash32(`pc-slot:${botId}:${st.round}:${st.startedAtMs}:${placed}`);
  const k = keys[placed];
  const def = PC_CARD_MAP.get(k);
  if (!def) return;
  if (st.mode === "phone" && st.round > 1) {
    const target = st.rounds[st.round - 2]?.board;
    const src = target?.items[placed];
    if (src) {
      round.board.items.push({ k: src.k, x: Math.min(98, Math.max(2, src.x + ((h % 7) - 3))), y: Math.min(98, Math.max(2, src.y + ((h % 5) - 2))), r: src.r });
    }
  } else {
    const slot = botSlot(placed, h);
    const item: PcPlaced = { k, x: slot.x, y: slot.y };
    if (slot.r !== 0) item.r = slot.r;
    /* صفت سوارِ آخرین کارت اسمِ چیده‌شده می‌شود */
    if (def.t === "mod") {
      const last = [...round.board.items].reverse().find((it) => PC_CARD_MAP.get(it.k)?.t === "name");
      if (last) item.p = last.k;
    }
    round.board.items.push(item);
  }
  const last = round.history[round.history.length - 1];
  if (JSON.stringify(last) !== JSON.stringify(round.board)) {
    round.history.push(JSON.parse(JSON.stringify(round.board)) as PcBoard);
    if (round.history.length > PC_HISTORY_CAP) {
      round.history.splice(1, round.history.length - PC_HISTORY_CAP);
    }
  }
  st.seq += 1;
}

/** حدس ربات — کامل/نزدیک/نادرست؛ در ناقص گاهی کارت گم‌شده را می‌یابد */
function botGuesserStep(botId: string, st: PcRoomState, now: number, elapsed: number): void {
  const round = st.rounds[st.round - 1];
  const puzzle = PUZZLE_MAP.get(round.puzzleId)!;
  if (round.scorers.some((s) => s.id === botId && s.tier === "full")) return;
  if (round.guesses.some((g) => g.id === botId && g.tier !== "miss-word" && g.tier !== "near")) return;
  const delay = 6_000 + (hash32(`pc-delay:${botId}:${st.round}:${st.startedAtMs}`) % 10_000);
  if (elapsed < delay) return;
  const h = hash32(`pc-knows:${botId}:${st.round}:${st.startedAtMs}`);
  const knows = h % 100 < 40;
  const nearRoll = !knows && h % 100 >= 40 && h % 100 < 65;
  let text: string;
  if (st.mode === "incomplete" && round.missing && h % 100 < 30 && !round.scorers.some((s) => s.id === botId && s.tier === "miss-word")) {
    text = round.missing.replace(/^[wm]\./, "");
  } else if (knows) {
    text = puzzle.t;
  } else if (nearRoll) {
    const half = Math.max(1, Math.ceil(puzzle.keys.length / 2));
    text = puzzle.keys.slice(0, half).join(" و ");
  } else {
    const others = PUZZLES.filter((p) => p.id !== round.puzzleId);
    text = others[h % others.length].t;
  }
  pcGuess(st, botId, st.players.find((p) => p.id === botId)?.name ?? "ربات", text, now);
}

/** رأی خلاقیت ربات در افشا — ۱ تا ۳ */
function botVoteStep(botId: string, st: PcRoomState): void {
  const round = st.rounds[st.round - 1];
  if (round.votes[botId] !== undefined) return;
  if (round.arrangerId === botId) return;
  const v = 1 + (hash32(`pc-vote:${botId}:${st.round}:${st.startedAtMs}`) % PC_VOTE_MAX);
  pcVote(st, botId, v);
}

/* ---------- نتیجهٔ نهایی و جوایز ---------- */

function buildPcResult(st: PcRoomState): PcResult {
  const rows = st.players
    .map((p) => ({ id: p.id, name: p.name, score: st.scores[p.id] ?? 0, rank: 0 }))
    .sort((a, b) => b.score - a.score);
  let prevScore = -1;
  let prevRank = 0;
  rows.forEach((r, i) => {
    if (i > 0 && r.score === prevScore) r.rank = prevRank;
    else {
      r.rank = i + 1;
      prevRank = r.rank;
    }
    prevScore = r.score;
  });

  const awards: PcResult["awards"] = {};
  const nameOf = (id: string) => st.players.find((p) => p.id === id)?.name ?? "";

  /* پیکاسوی جمع — بیشترین رأی خلاقیت */
  const voteStats = new Map<string, number>();
  for (const r of st.rounds) {
    const sum = Object.values(r.votes).reduce((a, b) => a + b, 0);
    if (sum > 0) voteStats.set(r.arrangerId, (voteStats.get(r.arrangerId) ?? 0) + sum);
  }
  const picasso = [...voteStats.entries()].sort((a, b) => b[1] - a[1])[0];
  if (picasso && picasso[1] > 0) {
    awards.picasso = { id: picasso[0], name: nameOf(picasso[0]), detail: `${picasso[1]} رأی خلاقیت` };
  }
  /* کارگردان اسکار — بیشترین حدس کامل */
  const oscarStats = new Map<string, number>();
  for (const r of st.rounds) {
    const full = r.scorers.filter((s) => s.tier === "full").length;
    if (full > 0) oscarStats.set(r.arrangerId, (oscarStats.get(r.arrangerId) ?? 0) + full);
  }
  const oscar = [...oscarStats.entries()].sort((a, b) => b[1] - a[1])[0];
  if (oscar && oscar[1] > 0) {
    awards.oscar = { id: oscar[0], name: nameOf(oscar[0]), detail: `${oscar[1]} حدس کامل` };
  }
  /* سورئالیست دوره — بیشترین کارت عجیب: صفت، جوکر و فریبنده روی صحنه */
  const surrealStats = new Map<string, number>();
  for (const r of st.rounds) {
    const puzzle = PUZZLE_MAP.get(r.puzzleId);
    if (!puzzle) continue;
    const own = new Set(puzzle.cards);
    const weird = r.board.items.filter((it) => {
      const def = PC_CARD_MAP.get(it.k);
      const isOwn = own.has(it.k) && def?.t === "name";
      return !isOwn; // صفت/جوکر/فریبنده/ربط
    }).length;
    if (weird > 0) surrealStats.set(r.arrangerId, (surrealStats.get(r.arrangerId) ?? 0) + weird);
  }
  const surreal = [...surrealStats.entries()].sort((a, b) => b[1] - a[1])[0];
  if (surreal && surreal[1] > 0) {
    awards.surreal = { id: surreal[0], name: nameOf(surreal[0]), detail: `${surreal[1]} کارت عجیب` };
  }
  /* لاکونیک‌ترین — کمترین کارت روی صحنهٔ حدس‌کامل‌شده */
  let laconic: { id: string; cards: number } | null = null;
  for (const r of st.rounds) {
    if (!r.scorers.some((s) => s.tier === "full")) continue;
    const cards = cardCountOf(r.board);
    if (cards > PC_MINIMALIST_CARDS) continue;
    if (!laconic || cards < laconic.cards) laconic = { id: r.arrangerId, cards };
  }
  if (laconic) {
    awards.laconic = { id: laconic.id, name: nameOf(laconic.id), detail: `${laconic.cards} کارت` };
  }
  return { rows, awards };
}

/* ---------- تیک خودکار — فازها، کمک‌ها، ربات‌ها ---------- */

export function pcTick(st: PcRoomState, opts: { now: number }): { mutated: boolean } {
  if (st.phase === "done") return { mutated: false };
  const { now } = opts;
  if (now < st.startedAtMs) return { mutated: false };
  let mutated = false;
  for (let i = 0; i < 48; i++) {
    if (st.phase === "build") {
      const round = st.rounds[st.round - 1];
      const buildStart = st.phaseEnds - PC_BUILD_MS;
      const elapsed = now - buildStart;
      if (round) {
        /* کمک‌ها — هر کدام −۲ برای چینش‌گر */
        if (st.mode !== "phone" && !round.hints.h1 && elapsed >= PC_HINT1_MS) {
          round.hints.h1 = true;
          st.scores[round.arrangerId] = (st.scores[round.arrangerId] ?? 0) - PC_POINTS_HINT_PENALTY;
          st.seq += 1;
          mutated = true;
        }
        if (st.mode !== "phone" && !round.hints.h2 && elapsed >= PC_HINT2_MS) {
          round.hints.h2 = true;
          const puzzle = PUZZLE_MAP.get(round.puzzleId)!;
          const h = hash32(`pc-hint:${st.round}:${st.startedAtMs}`);
          round.hints.word = puzzle.keys[h % puzzle.keys.length] ?? null;
          st.scores[round.arrangerId] = (st.scores[round.arrangerId] ?? 0) - PC_POINTS_HINT_PENALTY;
          st.seq += 1;
          mutated = true;
        }
        /* چینش‌گرِ ربات */
        if (isBotId(round.arrangerId) && elapsed >= BOT_PLACE_STEP_MS / 2) {
          const before = st.seq;
          botArrangerStep(round.arrangerId, st, elapsed);
          if (st.seq !== before) mutated = true;
        }
        /* حدس‌زن‌های ربات */
        if (st.mode !== "phone") {
          for (const p of st.players) {
            if (!isBotId(p.id) || p.id === round.arrangerId) continue;
            const before = st.seq;
            botGuesserStep(p.id, st, now, elapsed);
            if (st.seq !== before) mutated = true;
          }
        }
      }
      if (now < st.phaseEnds) break;
      st.phase = "reveal";
      st.phaseEnds = st.phaseEnds + revealMsOf(st.mode);
      st.seq += 1;
      mutated = true;
      continue;
    }
    /* reveal — رأی ربات‌ها، سپس دور بعد یا پایان */
    if (st.mode !== "phone") {
      for (const p of st.players) {
        if (!isBotId(p.id)) continue;
        const before = st.seq;
        botVoteStep(p.id, st);
        if (st.seq !== before) mutated = true;
      }
    }
    if (now < st.phaseEnds) break;
    if (st.round >= st.totalRounds) {
      st.phase = "done";
      st.result = buildPcResult(st);
      st.seq += 1;
      mutated = true;
      break;
    }
    st.round += 1;
    st.phase = "build";
    st.phaseEnds = st.phaseEnds + PC_BUILD_MS;
    st.seq += 1;
    mutated = true;
  }
  return { mutated };
}

/* ---------- نمای هر عضو ---------- */

/** ضرب‌المثل فقط برای چینش‌گر دور جاری در فاز build بیرون می‌آید —
    در تلفن‌چی بعد از دور اول حتی چینش‌گر هم فقط تصویر می‌بیند؛
    در reveal به‌جز تلفن‌چی برای همه گشوده می‌شود. */
export function buildPcView(
  st: PcRoomState,
  memberId: string,
  members: { id: string; name: string; bot: boolean; online: boolean }[],
  now: number,
): PcView {
  const round = st.rounds[st.round - 1] ?? null;
  const reveal = st.phase === "reveal" || st.phase === "done";
  const isArranger = Boolean(round && round.arrangerId === memberId);
  const puzzle = round ? PUZZLE_MAP.get(round.puzzleId) : undefined;
  /* کمک‌ها فقط پس از گذر زمان بیرون می‌آیند — بر اساس tick؛ اینجا فقط نمایش */
  const h1 = st.mode !== "phone" && round?.hints.h1 === true;
  const h2 = st.mode !== "phone" && round?.hints.h2 === true;
  let puzzleText: string | null = null;
  if (puzzle) {
    if (st.mode === "phone") {
      puzzleText = st.round === 1 && st.phase === "build" && isArranger ? puzzle.t : reveal && st.phase === "done" ? puzzle.t : null;
    } else {
      puzzleText = reveal ? puzzle.t : isArranger ? puzzle.t : null;
    }
  }
  const targetBoard = st.mode === "phone" && st.round > 1 ? (st.rounds[st.round - 2]?.board ?? null) : null;
  const scoresOf = (id: string) => st.scores[id] ?? 0;
  return {
    startedAtMs: st.startedAtMs,
    now,
    seq: st.seq,
    mode: st.mode,
    round: st.round,
    totalRounds: st.totalRounds,
    phase: st.phase,
    phaseEnds: st.phaseEnds,
    players: st.players.map((p) => {
      const info = members.find((m) => m.id === p.id);
      return {
        id: p.id,
        name: info?.name ?? p.name,
        bot: info?.bot ?? isBotId(p.id),
        online: info?.online ?? isBotId(p.id),
        score: scoresOf(p.id),
      };
    }),
    arrangerId: round?.arrangerId ?? "",
    arrangerName: round?.arrangerName ?? "",
    isMyTurn: isArranger,
    puzzle: puzzleText,
    puzzleWordCount: h1 && puzzle ? puzzle.t.split(/\s+/).length : null,
    puzzleHintWord: h2 ? (round?.hints.word ?? null) : null,
    tray: isArranger && st.phase === "build" ? (round?.tray ?? null) : null,
    lockedCount: isArranger && st.phase === "build" ? (round?.locked.length ?? 0) : st.mode === "banned" && st.phase === "build" ? (round?.locked.length ?? 0) : 0,
    hasMissing: st.mode === "incomplete",
    targetBoard,
    board: round ? round.board : null,
    history: reveal && round ? round.history : null,
    cardCount: round ? cardCountOf(round.board) : 0,
    maxCards: PC_MAX_CARDS,
    guesses: round ? round.guesses.slice(-24) : [],
    scorers: round ? round.scorers : [],
    reactions: round ? round.reactions.slice(-14) : [],
    votes: round ? round.votes : {},
    myVote: round ? (round.votes[memberId] ?? 0) : 0,
    votesTotal: round ? Object.values(round.votes).reduce((a, b) => a + b, 0) : 0,
    swapped: round?.swapped ?? false,
    scores: st.scores,
    finished: st.phase === "done",
    result: st.result,
  };
}
