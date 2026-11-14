/* ================================================================
   «ضرب‌المثل‌چین» — مغز سمت سرور
   الگوی وضعیت «صحنه‌گردان»: seq فقط رو به جلو، فازهای زنجیره‌ای
   قطعی، ربات‌ها با hash32 بدون RNG مشترک. ضرب‌المثل مخفی فقط برای
   چینش‌گر دور جاری بیرون می‌آید و حدس‌ها خصوصی‌اند — هر عضو فقط
   حدس خودش را می‌بیند و درجهٔ جواب دیگران هرگز منتشر نمی‌شود.
   امتیاز سرعتی: کامل از ۶ تا ۱۲ بر حسب زمان باقی‌مانده؛ اشتباه −۲
   (با سقف جریمه). حالت رقابتی تیمی: نوبتی ۶ دقیقه برای هر تیم،
   چینش‌گر می‌چیند و هم‌تیمی‌ها حدس می‌زنند، نقش‌ها به‌فاصله عوض
   می‌شوند (۲ نفره هر ۳ دقیقه / ۳ نفره هر ۲ دقیقه / ۴ نفره هر ۱.۵).
   ================================================================ */

import {
  PC_BUILD_MS, PC_DECOYS, PC_DECOYS_PRO, PC_HINT1_MS, PC_HINT2_MS, PC_HISTORY_CAP, PC_MAX_CARDS, PC_MAX_ROUNDS,
  PC_MINIMALIST_CARDS, PC_POINTS_DIRECTOR, PC_POINTS_FULL_MAX, PC_POINTS_FULL_MIN, PC_POINTS_HINT_PENALTY,
  PC_POINTS_MINIMALIST, PC_POINTS_MISSING_BONUS, PC_POINTS_NEAR_SHARE, PC_POINTS_SWAP_PENALTY, PC_POINTS_WRONG,
  PC_RACE_AWARD_FAST, PC_RACE_AWARD_MID, PC_RACE_AWARD_SLOW, PC_RACE_BREAK_MS, PC_RACE_FAST_MS, PC_RACE_MID_MS,
  PC_RACE_TURN_MS, PC_RACE_WRONG_CAP, PC_REVEAL_MS, PC_START_DELAY_MS, PC_TEAM_DEFS, PC_VOTE_MAX, PC_WRONG_CAP,
  PC_GAME_SLUG, pcSwapSchedule,
  type PcBoard, type PcMode, type PcPlaced, type PcResult, type PcRoomState, type PcRound, type PcTeam, type PcView,
} from "@/lib/proverb-shared";
import { PC_CARD_MAP } from "@/lib/proverb-cards";
import { isBotId } from "@/lib/arena-registry";
import puzzlesData from "@/data/proverb-puzzles.json";

/* ---------- بانک ضرب‌المثل‌ها — فقط سمت سرور ---------- */

type RawPuzzle = { id: number; t: string; keys: string[]; cards: string[]; alts: Record<string, string[]>; decoys: string[]; hard?: boolean };
const PUZZLES = (puzzlesData.puzzles as RawPuzzle[]).filter((p) => p.t && p.cards.length > 0);
const PUZZLE_MAP = new Map(PUZZLES.map((p) => [p.id, p]));
const HARD_POOL = PUZZLES.filter((p) => p.hard);

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
  const poolLen = mode === "pro" ? HARD_POOL.length : PUZZLES.length;
  return Math.min(PC_MAX_ROUNDS, poolLen, Math.max(2, players * 2));
}

function revealMsOf(mode: PcMode): number {
  return mode === "race" ? PC_RACE_BREAK_MS : PC_REVEAL_MS;
}

function emptyBoard(): PcBoard {
  return { items: [] };
}

/** تیم‌بندی متوازن — تقسیم بعد از شافل قطعی */
function makeTeams(players: { id: string; name: string }[], teamCount: number, seed: string): PcTeam[] {
  const order = [...players];
  const h = hash32(seed);
  for (let i = order.length - 1; i > 0; i--) {
    const j = h % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  const base = Math.floor(order.length / teamCount);
  const extra = order.length % teamCount;
  const teams: PcTeam[] = [];
  let cursor = 0;
  for (let t = 0; t < teamCount; t++) {
    const size = base + (t < extra ? 1 : 0);
    const memberIds = order.slice(cursor, cursor + size).map((p) => p.id);
    cursor += size;
    const def = PC_TEAM_DEFS[t] ?? PC_TEAM_DEFS[PC_TEAM_DEFS.length - 1];
    teams.push({ id: `t${t + 1}`, name: def.name, color: def.color, memberIds });
  }
  return teams.filter((t) => t.memberIds.length > 0);
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

/* استخر کارت‌های اسم برای فریبنده‌های تصادفی — ماژول‌سطح، یک‌بار */
const PC_CARDS_POOL: string[] = [...PC_CARD_MAP.values()].filter((c) => c.t === "name").map((c) => c.k);

/** ساخت جعبه کارت یک دور: کارت‌های ضرب‌المثل + فریبنده‌ها + جوکر */
function buildTray(puzzle: RawPuzzle, locked: string[], missing: string | null, seed: string, decoyCount: number): string[] {
  const tray: string[] = [];
  for (const k of puzzle.cards) {
    if (locked.includes(k) || k === missing) continue;
    tray.push(k);
  }
  /* فریبنده‌ها: authored یا از کاتالوگ اسم‌ها؛ هرگز هم‌پوشان با کارت‌های ضرب‌المثل */
  const own = new Set([...puzzle.cards, ...tray]);
  const decoys = puzzle.decoys.filter((k) => !own.has(k) && PC_CARD_MAP.has(k)).slice(0, decoyCount);
  if (decoys.length < decoyCount) {
    const namePool = PC_CARDS_POOL.filter((k) => !own.has(k) && !decoys.includes(k));
    const h = hash32(seed);
    for (let i = 0; decoys.length < decoyCount && i < 40; i++) {
      const k = namePool[(h + i * 37) % namePool.length];
      if (!decoys.includes(k)) decoys.push(k);
    }
  }
  tray.push(...decoys);
  tray.push("j.پرسش", "j.دایره", "j.مربع", "j.خط"); // جوکرها همیشه در دسترس
  return [...new Set(tray)];
}

/** یک تلاش تازه — رقابتی یا کلاسیک */
function makeRound(
  puzzle: RawPuzzle,
  arrangerId: string,
  arrangerName: string,
  mode: PcMode,
  now: number,
  seed: string,
  teamId?: string,
): PcRound {
  const locked = mode === "banned" ? pickLocked(puzzle, seed) : [];
  const missing = mode === "incomplete" ? (puzzle.cards.find((k) => PC_CARD_MAP.get(k)?.t === "name" && !locked.includes(k)) ?? null) : null;
  const decoyCount = mode === "pro" ? PC_DECOYS_PRO : PC_DECOYS;
  return {
    puzzleId: puzzle.id,
    arrangerId,
    arrangerName,
    teamId,
    startedMs: now,
    board: emptyBoard(),
    history: [emptyBoard()],
    tray: buildTray(puzzle, locked, missing, seed, decoyCount),
    locked,
    missing,
    hints: { h1: false, h2: false, word: null },
    swapped: false,
    wrongPen: {},
    guesses: [],
    scorers: [],
    reactions: [],
    votes: {},
  };
}

/** چینش‌گرها به‌ترتیب ورود، هرکدام ۲ بار؛ ضرب‌المثل‌ها بی‌تکرار از بانک */
export function createPcState(
  mode: PcMode,
  players: { id: string; name: string }[],
  now: number,
  teamsCount = 2,
): PcRoomState | null {
  const clean = players.filter((p) => p.id && p.name);
  if (clean.length < 2) return null;
  if (mode === "race") {
    const teamCount = teamsCount === 4 && clean.length >= 4 ? 4 : 2;
    if (clean.length < teamCount * 2) return null; // هر تیم حداقل ۲ نفر
    const totalRounds = teamCount;
    const teams = makeTeams(clean, teamCount, `pc-teams:${now}`);
    const pool = shuffle(PUZZLES);
    const scores: Record<string, number> = {};
    clean.forEach((p) => {
      scores[p.id] = 0;
    });
    const teamScores: Record<string, number> = {};
    teams.forEach((t) => {
      teamScores[t.id] = 0;
    });
    const firstTeam = teams[0];
    const arrangerId = firstTeam.memberIds[0];
    const puzzle = pool[0];
    const first = makeRound(puzzle, arrangerId, clean.find((p) => p.id === arrangerId)?.name ?? "", mode, now + PC_START_DELAY_MS, `pc:${now}:a1`, firstTeam.id);
    return {
      game: PC_GAME_SLUG,
      startedAtMs: now + PC_START_DELAY_MS,
      seq: 1,
      mode,
      players: clean,
      round: 1,
      totalRounds,
      phase: "build",
      phaseEnds: now + PC_START_DELAY_MS + PC_RACE_TURN_MS,
      rounds: [first],
      scores,
      teams,
      turn: 1,
      roleIdx: 0,
      swapIdx: 0,
      teamScores,
      poolIds: pool.map((p) => p.id),
      poolIdx: 1,
      result: null,
    };
  }
  const totalRounds = roundCountOf(mode, clean.length);
  const pool = shuffle(mode === "pro" ? HARD_POOL : PUZZLES);
  if (pool.length < totalRounds) return null;
  const rounds = pool.slice(0, totalRounds).map((puzzle, i) => {
    const arranger = clean[i % clean.length];
    const seed = `pc:${i}:${now}`;
    return makeRound(puzzle, arranger.id, arranger.name, mode, now + PC_START_DELAY_MS, seed);
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
    poolIds: pool.map((p) => p.id),
    poolIdx: totalRounds,
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
      /* مهاجرت از r22-r23 — حالت «تلفن‌چی» حذف شده: به کلاسیک می‌رود */
      if ((data.mode as string) === "phone") data.mode = "classic";
      if (data.rounds.length > 0) {
        for (const r of data.rounds) {
          if (!r.wrongPen) r.wrongPen = {};
          if (!r.hints) r.hints = { h1: false, h2: false, word: null };
          if (!r.history || r.history.length === 0) r.history = [r.board ?? emptyBoard()];
        }
      }
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
  reason?: "phase" | "unknown" | "arranger" | "already" | "bad-text" | "team" | "wrongcap";
};

function tierAwarded(round: PcRound, id: string, tier: "full" | "near" | "miss-word"): boolean {
  return round.scorers.some((s) => s.id === id && s.tier === tier);
}

/** امتیاز سرعتی کامل — کلاسیک: از زمان باقی‌مانده؛ رقابتی: از سن تلاش */
function speedAward(st: PcRoomState, round: PcRound, now: number): number {
  if (st.mode === "race") {
    const age = Math.max(0, now - round.startedMs);
    if (age < PC_RACE_FAST_MS) return PC_RACE_AWARD_FAST;
    if (age < PC_RACE_MID_MS) return PC_RACE_AWARD_MID;
    return PC_RACE_AWARD_SLOW;
  }
  const remaining = Math.max(0, st.phaseEnds - now);
  const frac = Math.min(1, remaining / PC_BUILD_MS);
  return Math.round(PC_POINTS_FULL_MIN + (PC_POINTS_FULL_MAX - PC_POINTS_FULL_MIN) * frac);
}

/** حدس در فاز build — کامل/نزدیک/کارت‌گم‌شده/اشتباه منفی.
    حدس‌ها خصوصی‌اند؛ درجهٔ جواب فقط به خود حدس‌زن برمی‌گردد. */
export function pcGuess(st: PcRoomState, playerId: string, name: string, text: string, now: number): PcGuessOutcome {
  if (st.phase !== "build") return { ok: false, reason: "phase" };
  const player = st.players.find((p) => p.id === playerId);
  if (!player) return { ok: false, reason: "unknown" };
  const round = st.rounds[st.round - 1];
  if (!round) return { ok: false, reason: "phase" };
  if (round.arrangerId === playerId) return { ok: false, reason: "arranger" };
  /* رقابتی: فقط هم‌تیمی‌های چینش‌گر حق حدس دارند */
  if (st.mode === "race") {
    const team = (st.teams ?? []).find((t) => t.id === round.teamId);
    if (!team || !team.memberIds.includes(playerId)) return { ok: false, reason: "team" };
  }
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

  /* ۲) اشتباه — −۲ با سقف جریمه؛ جواب درست و حدس دیگران هرگز منتشر نمی‌شود */
  if (grade === "wrong") {
    const pen = round.wrongPen[playerId] ?? 0;
    const cap = st.mode === "race" ? PC_RACE_WRONG_CAP : PC_WRONG_CAP;
    if (pen >= cap) return { ok: true, grade: "wrong", points: 0 };
    round.wrongPen[playerId] = pen + 1;
    if (st.mode === "race") {
      const team = (st.teams ?? []).find((t) => t.id === round.teamId);
      if (team) st.teamScores![team.id] = (st.teamScores?.[team.id] ?? 0) - PC_POINTS_WRONG;
    } else {
      st.scores[playerId] = (st.scores[playerId] ?? 0) - PC_POINTS_WRONG;
    }
    st.seq += 1;
    return { ok: true, grade: "wrong", points: -PC_POINTS_WRONG };
  }

  /* ۳) کامل — امتیاز سرعتی؛ نزدیک — نصفِ همان امتیاز */
  if (grade === "full" && !tierAwarded(round, playerId, "full")) {
    const award = speedAward(st, round, now);
    const nearAlready = tierAwarded(round, playerId, "near") ? Math.max(1, Math.round(award / PC_POINTS_NEAR_SHARE)) : 0;
    const points = Math.max(1, award - nearAlready);
    round.scorers.push({ id: playerId, name, points, atMs: now, tier: "full" });
    if (st.mode === "race") {
      const team = (st.teams ?? []).find((t) => t.id === round.teamId);
      if (team) st.teamScores![team.id] = (st.teamScores?.[team.id] ?? 0) + points;
    } else {
      st.scores[playerId] = (st.scores[playerId] ?? 0) + points;
      st.scores[round.arrangerId] = (st.scores[round.arrangerId] ?? 0) + PC_POINTS_DIRECTOR;
    }
    st.seq += 1;
    if (st.mode === "race") raceNextAttempt(st, now);
    return { ok: true, grade: "full", points };
  }
  if (grade === "near" && !tierAwarded(round, playerId, "near") && !tierAwarded(round, playerId, "full")) {
    const award = Math.max(1, Math.round(speedAward(st, round, now) / PC_POINTS_NEAR_SHARE));
    round.scorers.push({ id: playerId, name, points: award, atMs: now, tier: "near" });
    if (st.mode === "race") {
      const team = (st.teams ?? []).find((t) => t.id === round.teamId);
      if (team) st.teamScores![team.id] = (st.teamScores?.[team.id] ?? 0) + award;
    } else {
      st.scores[playerId] = (st.scores[playerId] ?? 0) + award;
    }
    st.seq += 1;
    return { ok: true, grade: "near", points: award };
  }
  st.seq += 1;
  return { ok: true, grade, points: 0 };
}

/* ---------- تعویض ضرب‌المثل — یک‌بار، −۲ (فقط حالت‌های کلاسیک) ---------- */

export type PcSwapOutcome = { ok: boolean; reason?: "phase" | "not-arranger" | "once" };

export function pcSwap(st: PcRoomState, memberId: string): PcSwapOutcome {
  if (st.mode === "race") return { ok: false, reason: "phase" };
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
  round.tray = buildTray(next, locked, missing, `pc:${st.round}:sw:${st.startedAtMs}`, st.mode === "pro" ? PC_DECOYS_PRO : PC_DECOYS);
  st.scores[memberId] = (st.scores[memberId] ?? 0) - PC_POINTS_SWAP_PENALTY;
  st.seq += 1;
  return { ok: true };
}

/* ---------- رأی خلاقیت و واکنش‌ها — فقط در افشای حالت‌های کلاسیک ---------- */

export type PcVoteOutcome = { ok: boolean; reason?: "phase" | "unknown" | "arranger" | "once" | "range" };

export function pcVote(st: PcRoomState, voterId: string, value: number): PcVoteOutcome {
  if (st.mode === "race") return { ok: false, reason: "phase" };
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

/* ---------- حالت رقابتی تیمی — تلاش بعدی، تعویض نقش، نوبت بعد ---------- */

/** تلاش بعدی برای تیم جاری — ضرب‌المثل تازه از صف بی‌تکرار */
function raceNextAttempt(st: PcRoomState, now: number): void {
  const pool = st.poolIds ?? [];
  let idx = st.poolIdx ?? 0;
  if (idx >= pool.length) {
    const reshuffled = shuffle(pool); // صف تمام شد — با همان کارت‌ها از نو
    st.poolIds = reshuffled;
    idx = 0;
    st.poolIdx = 0;
  }
  const puzzle = PUZZLE_MAP.get(st.poolIds![st.poolIdx!]) ?? PUZZLES[0];
  st.poolIdx = (st.poolIdx ?? 0) + 1;
  const round = st.rounds[st.round - 1];
  const team = (st.teams ?? []).find((t) => t.id === round.teamId) ?? (st.teams ?? [])[0];
  const arrangerId = team.memberIds[(st.roleIdx ?? 0) % team.memberIds.length];
  const next = makeRound(
    puzzle,
    arrangerId,
    st.players.find((p) => p.id === arrangerId)?.name ?? "",
    st.mode,
    now,
    `pc:${st.turn}:a${st.round + 1}:${now}`,
    team.id,
  );
  st.rounds.push(next);
  st.round += 1;
  st.seq += 1;
}

/** تعویض نقش — چینش‌گر بعدیِ تیم؛ صحنهٔ جاری می‌ماند تا ادامه یابد */
function raceSwapRoles(st: PcRoomState): void {
  const round = st.rounds[st.round - 1];
  const team = (st.teams ?? []).find((t) => t.id === round.teamId);
  if (!team || team.memberIds.length < 2) return;
  st.roleIdx = ((st.roleIdx ?? 0) + 1) % team.memberIds.length;
  const arrangerId = team.memberIds[st.roleIdx!];
  round.arrangerId = arrangerId;
  round.arrangerName = st.players.find((p) => p.id === arrangerId)?.name ?? "";
  st.swapIdx = (st.swapIdx ?? 0) + 1;
  st.seq += 1;
}

/** شروع نوبت تیم بعد — یا پایان مسابقه */
function raceNextTurn(st: PcRoomState, now: number): void {
  const teams = st.teams ?? [];
  const turn = (st.turn ?? 1) + 1;
  if (turn > teams.length) {
    st.phase = "done";
    st.result = buildPcResult(st);
    st.seq += 1;
    return;
  }
  st.turn = turn;
  st.phase = "build";
  st.phaseEnds = st.phaseEnds + PC_RACE_TURN_MS;
  st.roleIdx = 0;
  st.swapIdx = 0;
  const team = teams[turn - 1];
  const pool = st.poolIds ?? [];
  let idx = st.poolIdx ?? 0;
  if (idx >= pool.length) {
    st.poolIds = shuffle(pool);
    idx = 0;
    st.poolIdx = 0;
  }
  const puzzle = PUZZLE_MAP.get(st.poolIds![st.poolIdx!]) ?? PUZZLES[0];
  st.poolIdx = (st.poolIdx ?? 0) + 1;
  const arrangerId = team.memberIds[0];
  const next = makeRound(puzzle, arrangerId, st.players.find((p) => p.id === arrangerId)?.name ?? "", st.mode, st.phaseEnds - PC_RACE_TURN_MS, `pc:turn${turn}:${now}`, team.id);
  st.rounds.push(next);
  st.round += 1;
  st.seq += 1;
}

/* ---------- ربات‌ها — قطعی با hash32 ---------- */

const BOT_PLACE_STEP_MS = 6_500;

/** طرح چینش‌گرِ ربات — خود کارت‌های ضرب‌المثل را به‌ترتیب می‌گذارد */
function botPlan(round: PcRound): string[] {
  const puzzle = PUZZLE_MAP.get(round.puzzleId)!;
  return puzzle.cards.filter((k) => !round.locked.includes(k) && k !== round.missing && PC_CARD_MAP.has(k));
}

function botSlot(i: number, h: number): { x: number; y: number; r: number } {
  const x = 14 + ((i * 19 + (h % 9)) % 70);
  const y = 22 + ((i * 29 + (h % 5)) % 56);
  const r = [-15, 0, 0, 12, -12, 20][h % 6];
  return { x, y, r };
}

function botArrangerStep(botId: string, st: PcRoomState, elapsed: number, now: number): void {
  const round = st.rounds[st.round - 1];
  const keys = botPlan(round);
  const placed = cardCountOf(round.board);
  if (placed >= keys.length) return;
  const started = st.mode === "race" ? now - round.startedMs : elapsed;
  const dueAt = (placed + 1) * BOT_PLACE_STEP_MS;
  if (started < dueAt) return;
  const h = hash32(`pc-slot:${botId}:${st.round}:${st.startedAtMs}:${placed}`);
  const k = keys[placed];
  const def = PC_CARD_MAP.get(k);
  if (!def) return;
  const slot = botSlot(placed, h);
  const item: PcPlaced = { k, x: slot.x, y: slot.y };
  if (slot.r !== 0) item.r = slot.r;
  /* صفت سوارِ آخرین کارت اسمِ چیده‌شده می‌شود */
  if (def.t === "mod") {
    const last = [...round.board.items].reverse().find((it) => PC_CARD_MAP.get(it.k)?.t === "name");
    if (last) item.p = last.k;
  }
  round.board.items.push(item);
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
  const started = st.mode === "race" ? now - round.startedMs : elapsed;
  const delay = (st.mode === "race" ? 4_000 : 6_000) + (hash32(`pc-delay:${botId}:${st.round}:${st.startedAtMs}`) % (st.mode === "race" ? 8_000 : 10_000));
  if (started < delay) return;
  const h = hash32(`pc-knows:${botId}:${st.round}:${st.startedAtMs}`);
  const knows = h % 100 < (st.mode === "race" ? 60 : 40);
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
  const isRace = st.mode === "race";
  const rows = st.players
    .map((p) => {
      let score = st.scores[p.id] ?? 0;
      if (isRace) {
        const team = (st.teams ?? []).find((t) => t.memberIds.includes(p.id));
        score = team ? (st.teamScores?.[team.id] ?? 0) : 0;
      }
      return { id: p.id, name: p.name, score, rank: 0 };
    })
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

  const result: PcResult = { rows, awards: {} };
  if (isRace) {
    const teams = (st.teams ?? []).map((t) => ({ id: t.id, name: t.name, color: t.color, score: st.teamScores?.[t.id] ?? 0, rank: 0 }));
    teams.sort((a, b) => b.score - a.score);
    let prev = -1;
    let prevRank = 0;
    teams.forEach((t, i) => {
      t.rank = i + 1;
      if (i > 0 && t.score === prev) t.rank = prevRank;
      else prevRank = t.rank;
      prev = t.score;
    });
    result.teams = teams;
    return result;
  }

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
  result.awards = awards;
  return result;
}

/* ---------- تیک خودکار — فازها، کمک‌ها، تعویض نقش، ربات‌ها ---------- */

export function pcTick(st: PcRoomState, opts: { now: number }): { mutated: boolean } {
  if (st.phase === "done") return { mutated: false };
  const { now } = opts;
  if (now < st.startedAtMs) return { mutated: false };
  let mutated = false;
  for (let i = 0; i < 64; i++) {
    if (st.phase === "build") {
      const round = st.rounds[st.round - 1];
      if (round) {
        if (st.mode === "race") {
          /* تعویض نقش — جدول زمانی به حسب اندازهٔ تیم */
          const team = (st.teams ?? []).find((t) => t.id === round.teamId) ?? (st.teams ?? [])[0];
          const turnStart = st.phaseEnds - PC_RACE_TURN_MS;
          const turnElapsed = now - turnStart;
          const schedule = pcSwapSchedule(team.memberIds.length);
          const swapIdx = st.swapIdx ?? 0;
          if (swapIdx < schedule.length && team.memberIds.length > 1 && turnElapsed >= schedule[swapIdx]) {
            raceSwapRoles(st);
            mutated = true;
            continue;
          }
          /* چینش‌گرِ ربات */
          if (isBotId(round.arrangerId)) {
            const before = st.seq;
            botArrangerStep(round.arrangerId, st, 0, now);
            if (st.seq !== before) mutated = true;
          }
          /* حدس‌زن‌های رباتِ تیم فعال */
          const activeTeam = (st.teams ?? []).find((t) => t.id === round.teamId);
          for (const p of st.players) {
            if (!isBotId(p.id) || !activeTeam || !activeTeam.memberIds.includes(p.id) || p.id === round.arrangerId) continue;
            const before = st.seq;
            botGuesserStep(p.id, st, now, 0);
            if (st.seq !== before) mutated = true;
          }
        } else {
          const buildStart = st.phaseEnds - PC_BUILD_MS;
          const elapsed = now - buildStart;
          /* کمک‌ها — هر کدام −۲ برای چینش‌گر */
          if (!round.hints.h1 && elapsed >= PC_HINT1_MS) {
            round.hints.h1 = true;
            st.scores[round.arrangerId] = (st.scores[round.arrangerId] ?? 0) - PC_POINTS_HINT_PENALTY;
            st.seq += 1;
            mutated = true;
          }
          if (!round.hints.h2 && elapsed >= PC_HINT2_MS) {
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
            botArrangerStep(round.arrangerId, st, elapsed, now);
            if (st.seq !== before) mutated = true;
          }
          /* حدس‌زن‌های ربات */
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
    /* reveal — کلاسیک: رأی ربات‌ها؛ رقابتی: وقفه بین نوبت‌ها */
    if (st.mode !== "race") {
      for (const p of st.players) {
        if (!isBotId(p.id)) continue;
        const before = st.seq;
        botVoteStep(p.id, st);
        if (st.seq !== before) mutated = true;
      }
    }
    if (now < st.phaseEnds) break;
    if (st.mode === "race") {
      raceNextTurn(st, now);
      mutated = true;
      if (st.result) break;
      continue;
    }
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

/* ---------- نمای هر عضو — حدس‌ها خصوصی ---------- */

/** ضرب‌المثل فقط برای چینش‌گر دور جاری در فاز چیدمان بیرون می‌آید؛
    در reveal به‌جز وقفهٔ رقابتی برای همه گشوده می‌شود.
    حدس‌های دیگران و درجهٔ جواب‌شان هرگز منتشر نمی‌شود. */
export function buildPcView(
  st: PcRoomState,
  memberId: string,
  members: { id: string; name: string; bot: boolean; online: boolean }[],
  now: number,
): PcView {
  const round = st.rounds[st.round - 1] ?? null;
  const reveal = st.phase === "reveal" || st.phase === "done";
  const isRace = st.mode === "race";
  const isArranger = Boolean(round && round.arrangerId === memberId);
  const puzzle = round ? PUZZLE_MAP.get(round.puzzleId) : undefined;
  const h1 = round?.hints.h1 === true;
  const h2 = round?.hints.h2 === true;
  let puzzleText: string | null = null;
  if (puzzle) {
    if (isRace) {
      /* رقابتی: در وقفه فقط ضرب‌المثل‌های حل‌شدهٔ نوبت گشوده می‌شوند — تلاش جاری اگر حل‌نشده باشد مخفی می‌ماند */
      puzzleText = reveal ? (round.scorers.some((s) => s.tier === "full") ? puzzle.t : null) : isArranger ? puzzle.t : null;
    } else {
      puzzleText = reveal ? puzzle.t : isArranger ? puzzle.t : null;
    }
  }
  const scoresOf = (id: string) => {
    if (isRace) {
      const team = (st.teams ?? []).find((t) => t.memberIds.includes(id));
      return team ? (st.teamScores?.[team.id] ?? 0) : 0;
    }
    return st.scores[id] ?? 0;
  };
  const myTeam = (st.teams ?? []).find((t) => t.memberIds.includes(memberId)) ?? null;
  const activeTeam = isRace && round ? (st.teams ?? []).find((t) => t.id === round.teamId) ?? null : null;
  /* نقش من — چینش‌گر، حدس‌زنِ تیم فعال، یا تماشاچی */
  const myRole: PcView["myRole"] = isArranger ? "arranger" : activeTeam && activeTeam.memberIds.includes(memberId) ? "guesser" : "spectator";
  /* تعویض نقش بعدی — از جدول زمانی تیم فعال */
  let nextSwapInMs: number | null = null;
  if (isRace && activeTeam && activeTeam.memberIds.length > 1 && st.phase === "build") {
    const schedule = pcSwapSchedule(activeTeam.memberIds.length);
    const swapIdx = st.swapIdx ?? 0;
    if (swapIdx < schedule.length) {
      const turnStart = st.phaseEnds - PC_RACE_TURN_MS;
      nextSwapInMs = Math.max(0, turnStart + schedule[swapIdx] - now);
    }
  }
  /* ضرب‌المثل‌های حل‌شدهٔ نوبت جاری */
  const turn = st.turn ?? 1;
  const turnRounds = isRace
    ? st.rounds.filter((r) => r.teamId === (activeTeam?.id ?? ""))
    : [];
  const turnSolved = turnRounds.filter((r) => r.scorers.some((s) => s.tier === "full")).length;
  const turnPuzzles = reveal && isRace
    ? turnRounds
        .filter((r) => r.scorers.some((s) => s.tier === "full"))
        .map((r) => PUZZLE_MAP.get(r.puzzleId)?.t ?? "")
        .filter(Boolean)
    : [];
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
    puzzleWordCount: h1 && puzzle && !isRace ? puzzle.t.split(/\s+/).length : null,
    puzzleHintWord: h2 && !isRace ? (round?.hints.word ?? null) : null,
    tray: isArranger && st.phase === "build" ? (round?.tray ?? null) : null,
    lockedCount: isArranger && st.phase === "build" ? (round?.locked.length ?? 0) : 0,
    hasMissing: st.mode === "incomplete",
    board: round ? round.board : null,
    history: reveal && round ? round.history : null,
    cardCount: round ? cardCountOf(round.board) : 0,
    maxCards: PC_MAX_CARDS,
    /* خصوصی — فقط حدس‌های خودم */
    guesses: round ? round.guesses.filter((g) => g.id === memberId).slice(-12) : [],
    scorers: reveal ? (round ? round.scorers : []) : [],
    reactions: round ? round.reactions.slice(-14) : [],
    votes: round ? round.votes : {},
    myVote: round ? (round.votes[memberId] ?? 0) : 0,
    votesTotal: round ? Object.values(round.votes).reduce((a, b) => a + b, 0) : 0,
    swapped: round?.swapped ?? false,
    scores: st.scores,
    isRace,
    teams: (st.teams ?? []).map((t) => ({ ...t, score: st.teamScores?.[t.id] ?? 0 })),
    turn,
    activeTeamId: activeTeam?.id ?? null,
    myTeamId: myTeam?.id ?? null,
    myRole,
    nextSwapInMs,
    turnSolved,
    turnPuzzles,
    finished: st.phase === "done",
    result: st.result,
  };
}
