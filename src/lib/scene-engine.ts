/* ================================================================
   بازی «صحنه‌گردان» — مغز سمت سرور (پانتومیم کارتی بدون دوربین)
   الگوی وضعیت همان «شعر یادت نره» است: seq فقط رو به جلو، فازهای
   زنجیره‌ای قطعی، ربات‌ها با hash32 بدون RNG مشترک.
   واژهٔ مخفی هرگز از این ماژول به غیر از خودِ کارگردان نمی‌رسد
   (buildSceneView با memberId قفل می‌کند) و در جریان معمولی این
   ماژول فقط در مسیرهای سرور ایمپورت می‌شود.
   ================================================================ */

import { SCENE_BUILD_MS, SCENE_BUILD_MS_FRAMES, SCENE_DIFF_CATS, SCENE_DIFF_FIRST_POINTS, SCENE_HISTORY_CAP, SCENE_LIMITED_TOOLBOX, SCENE_MAX_CARDS, SCENE_MAX_CARDS_PER_FRAME, SCENE_MAX_ROUNDS, SCENE_MINIMALIST_CARDS, SCENE_POINTS_DIRECTOR, SCENE_POINTS_MINIMALIST, SCENE_REVEAL_MS, SCENE_START_DELAY_MS, SCENE_CARD_MAP, SCENE_CARDS, type SceneBoard, type SceneDifficulty, type ScenePlaced, type SceneResult, type SceneRoomState, type SceneView, type SceneMode } from "@/lib/scene-shared";
import type { AgeGroup } from "@/lib/arena-game";
import { isBotId } from "@/lib/arena-registry";
import { sherFuzzyMatch } from "@/lib/sher-shared";
import wordsData from "@/data/scene-words.json";

/* ---------- بانک واژه‌ها — فقط سمت سرور ---------- */

type RawWord = { t: string; c: string };
const WORDS = (wordsData.words as RawWord[]).filter((w) => w.t && typeof w.t === "string");

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ---------- کیت کارت‌ها — برای هر ضرب‌المثل/موقعیت، کارت‌های هماهنگ با معنی ----------
   خواستهٔ طرح: کارگردان نباید برای «کوه به کوه نمی‌رسد» بی‌کارتِ کوه بماند.
   کیت = کارت‌های پیشنهادی معنی‌محور که همیشه در دسترس‌اند و در جعبه ابزار
   بالای بقیه پین می‌شوند؛ در «حذفی‌ها» هم به جعبه تصادفی اضافه می‌شوند. */
const WORD_KITS: Record<string, string[]> = {
  /* ضرب‌المثل‌ها — کارت متناسب با معنی */
  "کوه به کوه نمی‌رسد": ["o.mountain", "o.apple", "e.x", "a.man", "e.check"],
  "آب در هاون کوبیدن": ["o.bowl", "o.water", "a.man", "e.wow"],
  "دل به دریا زدن": ["a.man", "o.water", "e.heart", "bg.sea"],
  "دست به دست کردن": ["o.hands", "a.man", "a.kid", "e.check"],
  "پا در یک کفش کردن": ["o.shoe", "a.man", "a.woman", "e.check"],
  "سروکله زدن": ["a.man", "e.talk", "e.question", "e.wow"],
  "آب از سرش پریدن": ["a.man", "o.water", "e.wow", "e.dizzy"],
  "دلش آب شد": ["e.heart", "o.water", "e.happy", "e.think"],
  "سروته کردن": ["s.line", "s.circle", "a.man", "e.dizzy"],
  "خروس‌جنگی کردن": ["a.chicken", "e.angry", "e.wow", "e.speed"],
  "شانه خالی کردن": ["o.basket", "a.man", "e.x", "e.sweat"],
  "جوجه‌ها را آخر پاییز می‌شمارند": ["o.egg", "a.chicken", "e.cold", "o.clock"],
  "از پشت کوه درآمدن": ["o.mountain", "a.man", "e.wow", "bg.mountain"],
  "مار گزیده از ریسمان می‌ترسد": ["o.snake", "o.rope", "a.man", "e.scared"],
  "تیشه به ریشه زدن": ["o.axe", "o.tree", "e.angry", "e.x"],
  "از آب گل‌آلود ماهی گرفتن": ["o.water", "a.fish", "a.man", "e.check"],
  "دست رو دست نگذاشتن": ["o.hands", "a.man", "e.check", "e.wow"],
  "آب پاکی ریختن": ["o.water", "e.check", "a.man", "s.circle"],
  "از پا افتادن": ["a.man", "e.sweat", "e.sleep", "s.line"],
  "زیر بار رفتن": ["o.basket", "a.man", "e.sweat", "e.check"],
  "از خجالت آب شدن": ["a.man", "o.water", "e.sweat", "e.cry"],
  "باد در غوزه انداختن": ["e.speed", "e.star", "e.wow", "e.x"],
  "کار از کار گذشت": ["s.line", "e.x", "e.question", "a.man"],
  "چراغ را کور کردن": ["o.lamp", "e.x", "e.think", "a.man"],
  "پای در میانه گذاشت": ["a.man", "s.line", "e.x", "e.question"],
  /* موقعیت‌های پرتکرار — کارت‌های صحنهٔ کلاسیک */
  "پدربزرگ سرما خورده": ["a.grandpa", "e.cold", "o.bed", "o.medicine"],
  "گربه روی درخت مانده": ["a.cat", "o.tree", "e.scared", "e.wow"],
  "بچه در باران دوید": ["a.kid", "o.umbrella", "e.speed", "bg.rain"],
  "خانواده دور سماور جمع شدند": ["a.grandpa", "a.grandma", "a.kid", "o.samovar", "e.happy"],
  "ماشین وسط جاده خوابید": ["o.car", "e.x", "e.sleep", "bg.street"],
  "مهمان ناخوانده رسید": ["a.man", "o.door", "e.wow", "e.question"],
  "گم شده در جنگل": ["a.man", "e.question", "e.cry", "bg.forest"],
  "شاگرد سر کلاس خوابش برد": ["a.kid", "e.sleep", "o.book", "e.think"],
  "بچه به دکتر گفت نمی‌خواهم آمپول": ["a.kid", "o.medicine", "e.cry", "e.x", "bg.hospital"],
  "پیرمرد در پارک نان به کبوترها داد": ["a.grandpa", "o.bread", "a.bird", "e.happy"],
  "بچه در تاریکی از سایه ترسید": ["a.kid", "e.scared", "e.wow", "bg.night"],
  "سگ چوب را آورد": ["a.dog", "s.line", "e.happy", "e.check"],
  "بچه از خواب پرید": ["a.kid", "o.bed", "e.wow", "e.sleep"],
  "دو دوست دعوای بی‌دلیلی کردند": ["a.man", "e.angry", "e.x", "e.talk"],
  "پدر بچه را روی شانه‌ها برد": ["a.man", "a.kid", "e.happy", "e.check"],
  "آشپزخانه شلوغ شب عید": ["o.food", "o.fire", "e.wow", "bg.kitchen"],
};

/** کیت امن واژه — فقط کلیدهای موجود در کاتالوگ (دفاع در برابر خطای تایپی) */
function kitOf(word: string): string[] | null {
  const kit = WORD_KITS[word]?.filter((k) => SCENE_CARD_MAP.has(k));
  return kit && kit.length > 0 ? kit : null;
}

/** امتیاز حدس اول در سختی جاری — بعدی‌ها نصف */
function firstPointsOf(difficulty: SceneDifficulty): number {
  return SCENE_DIFF_FIRST_POINTS[difficulty] ?? SCENE_DIFF_FIRST_POINTS.easy;
}

function laterPointsOf(difficulty: SceneDifficulty): number {
  return Math.max(1, Math.floor(firstPointsOf(difficulty) / 2));
}

/** دستهٔ واژه متناسب با سختی × گروه سنی × حالت — سه‌کادری روایت می‌خواهد */
function wordPool(age: AgeGroup, difficulty: SceneDifficulty, mode: SceneMode): string[] {
  /* گروه سنی محدودکنندهٔ محتوا: کودکان فقط واژه‌های ساده */
  const ageCats: string[] = age === "kid" ? ["easy"] : age === "pro" ? ["easy", "phrase", "proverb"] : ["easy", "phrase", "proverb"];
  const diffCats = SCENE_DIFF_CATS[difficulty] ?? SCENE_DIFF_CATS.easy;
  const cats = ageCats.filter((c) => diffCats.includes(c));
  if (cats.length === 0) cats.push(...diffCats); // تقاطع خالی → سختی حاکم است
  let pool = WORDS.filter((w) => cats.includes(w.c)).map((w) => w.t);
  if (mode === "frames") {
    const rich = WORDS.filter((w) => w.c === "proverb" || w.c === "phrase").map((w) => w.t);
    if (rich.length >= 4) pool = pool.filter((t) => rich.includes(t));
  }
  return pool;
}

/* ---------- ساخت وضعیت شروع ---------- */

function frameCountOf(mode: SceneMode): number {
  return mode === "frames" ? 3 : 1;
}

function buildMsOf(mode: SceneMode): number {
  return mode === "frames" ? SCENE_BUILD_MS_FRAMES : SCENE_BUILD_MS;
}

function emptyBoard(mode: SceneMode): SceneBoard {
  const n = frameCountOf(mode);
  return { bg: "", frames: Array.from({ length: n }, () => []) };
}

function maxCardsOf(mode: SceneMode): number {
  return mode === "frames" ? SCENE_MAX_CARDS_PER_FRAME : SCENE_MAX_CARDS;
}

/** کارگردان‌ها به‌ترتیب ورود می‌چرخند؛ واژه‌ها بی‌تکرار از بانک دسته‌محور */
export function createSceneState(
  mode: SceneMode,
  difficulty: SceneDifficulty,
  players: { id: string; name: string }[],
  age: AgeGroup,
  now: number,
): SceneRoomState | null {
  const clean = players.filter((p) => p.id && p.name);
  if (clean.length < 2) return null;
  const pool = wordPool(age, difficulty, mode);
  if (pool.length < 2) return null;
  const totalRounds = Math.min(SCENE_MAX_ROUNDS, clean.length);
  const words = shuffle(pool).slice(0, totalRounds);
  const rounds = words.map((word, i) => {
    const director = clean[i % clean.length];
    return {
      word,
      directorId: director.id,
      directorName: director.name,
      board: emptyBoard(mode),
      history: [emptyBoard(mode)],
      guesses: [] as SceneRoomState["rounds"][number]["guesses"],
      scorers: [] as SceneRoomState["rounds"][number]["scorers"],
      toolbox: null as string[] | null,
      kit: kitOf(word),
    };
  });
  /* حذفی‌ها: جعبه‌ابزار تصادفی ۸ کارتی برای هر دور — پس‌زمینه‌ها همیشه آزادند؛
     کارت‌های کیت همیشه به جعبه اضافه می‌شوند تا معنی واژه قابل روایت بماند */
  if (mode === "limited") {
    const nonBg = shuffle(SCENE_CARDS.filter((c) => c.cat !== "bg").map((c) => c.k));
    for (const r of rounds) {
      r.toolbox = nonBg.splice(0, SCENE_LIMITED_TOOLBOX);
      if (r.kit) {
        const extra = r.kit.filter((k) => SCENE_CARD_MAP.get(k)?.cat !== "bg" && !r.toolbox!.includes(k));
        r.toolbox = [...r.toolbox, ...extra];
      }
    }
  }
  const scores: Record<string, number> = {};
  clean.forEach((p) => {
    scores[p.id] = 0;
  });
  return {
    game: "scene-director",
    startedAtMs: now + SCENE_START_DELAY_MS,
    seq: 1,
    mode,
    difficulty,
    players: clean,
    round: 1,
    totalRounds,
    phase: "build",
    phaseEnds: now + SCENE_START_DELAY_MS + buildMsOf(mode),
    rounds,
    scores,
    result: null,
  };
}

export function parseSceneState(raw: string): SceneRoomState | null {
  try {
    const data = JSON.parse(raw) as SceneRoomState;
    if (
      data &&
      data.game === "scene-director" &&
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

/* ---------- اعتبارسنجی صحنه — کلیدها، سقف کارت، مختصات ---------- */

export function cardCountOf(board: SceneBoard): number {
  return board.frames.reduce((acc, f) => acc + f.length, 0);
}

function clampPlaced(p: ScenePlaced, toolbox: string[] | null): ScenePlaced | null {
  if (typeof p?.k !== "string" || !SCENE_CARD_MAP.has(p.k)) return null;
  const def = SCENE_CARD_MAP.get(p.k)!;
  if (def.cat === "bg") return null; // پس‌زمینه جای خودش را دارد
  if (toolbox && !toolbox.includes(p.k)) return null;
  const num = (v: unknown, lo: number, hi: number, d: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
  };
  return {
    k: p.k,
    x: num(p.x, 2, 98, 50),
    y: num(p.y, 2, 98, 50),
    r: num(p.r, -180, 180, 0),
    f: p.f === true,
    s: p.s === 1.5 || p.s === 2 ? p.s : 1,
  };
}

/** صحنهٔ ارسالی کارگردان را تمیز و قانونی می‌کند؛ نامعتبر → null.
    سقف کارت: کلاسیک/حذفی‌ها مجموع، سه‌کادری به‌ازای هر کادر. */
export function sceneValidateBoard(
  board: unknown,
  mode: SceneMode,
  toolbox: string[] | null,
): SceneBoard | null {
  if (!board || typeof board !== "object") return null;
  const b = board as { bg?: unknown; frames?: unknown };
  const n = frameCountOf(mode);
  if (!Array.isArray(b.frames) || b.frames.length !== n) return null;
  const bgKey = typeof b.bg === "string" && SCENE_CARD_MAP.get(b.bg)?.cat === "bg" ? b.bg : "";
  const frames: ScenePlaced[][] = [];
  for (const frame of b.frames) {
    if (!Array.isArray(frame)) return null;
    if (frame.length > maxCardsOf(mode)) return null;
    const cards: ScenePlaced[] = [];
    for (const p of frame) {
      const c = clampPlaced(p as ScenePlaced, toolbox);
      if (c) cards.push(c);
      if (cards.length > maxCardsOf(mode)) return null;
    }
    frames.push(cards);
  }
  return { bg: bgKey, frames };
}

/** مجموع کارت مجاز برای حالت — پیام خطا و UI */
export function sceneMaxCardsTotal(mode: SceneMode): number {
  return frameCountOf(mode) === 3 ? SCENE_MAX_CARDS_PER_FRAME * 3 : SCENE_MAX_CARDS;
}

/* ---------- ثبت صحنهٔ کارگردان ---------- */

export type SceneSetOutcome = { ok: boolean; reason?: "phase" | "not-director" | "bad-board" };

export function sceneSetBoard(st: SceneRoomState, memberId: string, board: SceneBoard | null): SceneSetOutcome {
  if (st.phase !== "build") return { ok: false, reason: "phase" };
  const round = st.rounds[st.round - 1];
  if (!round || round.directorId !== memberId) return { ok: false, reason: "not-director" };
  if (!board) return { ok: false, reason: "bad-board" };
  round.board = board;
  /* تایم‌لپس: اسنپ‌شات‌های متفاوت — سقف محدود که state باد نکند */
  const last = round.history[round.history.length - 1];
  if (JSON.stringify(last) !== JSON.stringify(board)) {
    round.history.push(board);
    if (round.history.length > SCENE_HISTORY_CAP) {
      round.history.splice(1, round.history.length - SCENE_HISTORY_CAP); // صحنهٔ خالی اول می‌ماند
    }
  }
  st.seq += 1;
  return { ok: true };
}

/* ---------- داوری حدس ---------- */

export type SceneGuessOutcome = {
  ok: boolean;
  correct?: boolean;
  points?: number;
  reason?: "phase" | "unknown" | "director" | "already" | "bad-text";
};

/** حدس هر بازیکن در فاز build — درست‌ها امتیاز می‌گیرند (اول به‌اندازهٔ سختی،
    بعدی‌ها نصف) و کارگردان به‌ازای هر حدس‌زن ۳ امتیاز. حدس نادرست هم به فید می‌رود. */
export function sceneGuess(
  st: SceneRoomState,
  playerId: string,
  name: string,
  text: string,
  now: number,
): SceneGuessOutcome {
  if (st.phase !== "build") return { ok: false, reason: "phase" };
  const player = st.players.find((p) => p.id === playerId);
  if (!player) return { ok: false, reason: "unknown" };
  const round = st.rounds[st.round - 1];
  if (!round) return { ok: false, reason: "phase" };
  if (round.directorId === playerId) return { ok: false, reason: "director" };
  const clean = typeof text === "string" ? text.trim().slice(0, 120) : "";
  if (!clean) return { ok: false, reason: "bad-text" };
  if (round.scorers.some((s) => s.id === playerId)) {
    return { ok: false, reason: "already" };
  }
  round.guesses.push({ id: playerId, name, text: clean, atMs: now });
  if (round.guesses.length > 40) round.guesses.splice(0, round.guesses.length - 40);
  const correct = sherFuzzyMatch(clean, round.word);
  if (correct) {
    const first = round.scorers.length === 0;
    const points = first ? firstPointsOf(st.difficulty) : laterPointsOf(st.difficulty);
    round.scorers.push({ id: playerId, name, points, atMs: now });
    st.scores[playerId] = (st.scores[playerId] ?? 0) + points;
    st.scores[round.directorId] = (st.scores[round.directorId] ?? 0) + SCENE_POINTS_DIRECTOR;
  }
  st.seq += 1;
  return {
    ok: true,
    correct,
    points: correct ? (round.scorers.length === 1 ? firstPointsOf(st.difficulty) : laterPointsOf(st.difficulty)) : 0,
  };
}

/* ---------- ربات‌ها — قطعی با hash32 ---------- */

function hash32(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

const BOT_PLACE_STEP_MS = 6_500; // ربات کارگردان هر ~۶٫۵ ثانیه یک کارت می‌گذارد
const BOT_BG_STEP_MS = 1_800;

/** طرح کارگردانِ ربات — اول کارت‌های کیت (هماهنگ با معنی واژه)، بعد تصادفی */
function botPlanKeys(botId: string, st: SceneRoomState): string[] {
  const round = st.rounds[st.round - 1];
  const pool = round.toolbox ?? SCENE_CARDS.filter((c) => c.cat !== "bg").map((c) => c.k);
  const h = hash32(`sc-plan:${botId}:${st.round}:${st.startedAtMs}`);
  const want = Math.min(maxCardsOf(st.mode), 3 + (h % 5));
  const picks: string[] = [];
  /* کیت را قدم‌به‌قدم می‌گذارد — صحنهٔ ربات واقعاً معنی واژه را نشان می‌دهد */
  const kit = (round.kit ?? []).filter((k) => SCENE_CARD_MAP.get(k)?.cat !== "bg");
  for (const k of kit) {
    if (picks.length >= want) break;
    picks.push(k);
  }
  for (let i = 0; picks.length < want; i++) {
    const key = pool[hash32(`sc-pick:${botId}:${st.round}:${st.startedAtMs}:${i}`) % pool.length];
    if (!picks.includes(key)) picks.push(key);
    if (i > 100) break;
  }
  return picks;
}

function botBgKey(botId: string, st: SceneRoomState): string {
  const bgs = SCENE_CARDS.filter((c) => c.cat === "bg").map((c) => c.k);
  const uses = hash32(`sc-bg:${botId}:${st.round}:${st.startedAtMs}`) % 100 < 60;
  return uses ? bgs[hash32(`sc-bgk:${botId}:${st.round}:${st.startedAtMs}`) % bgs.length] : "";
}

/** جایگاه قطعی و پخش‌شده روی صحنه — بدون روی‌هم‌افتادگی کامل */
function botSlot(i: number, frameIdx: number, h: number): { x: number; y: number; r: number; s?: number } {
  const x = 12 + ((i * 17 + (h % 7)) % 76);
  const y = 26 + ((i * 23 + frameIdx * 9) % 52);
  const rot = [-30, -15, 0, 0, 15, 30, 45, -45][h % 8];
  const s = h % 5 === 0 ? 1.5 : 1;
  return { x, y, r: rot, s };
}

/** یک پلهٔ کارگردانِ ربات — کارت‌های رسیده به نوبت را می‌گذارد */
function botDirectorStep(botId: string, st: SceneRoomState, elapsed: number): void {
  const round = st.rounds[st.round - 1];
  const keys = botPlanKeys(botId, st);
  const placed = cardCountOf(round.board);
  if (placed >= keys.length) return;
  const bgKey = botBgKey(botId, st);
  /* پس‌زمینه اول — بعد کارت‌ها */
  if (round.board.bg !== bgKey && elapsed >= BOT_BG_STEP_MS) {
    round.board.bg = bgKey;
    snapshotHistory(round, st.mode);
    st.seq += 1;
    return;
  }
  const perFrame = maxCardsOf(st.mode);
  const nextIdx = placed;
  const dueAt = (nextIdx + 1) * BOT_PLACE_STEP_MS + BOT_BG_STEP_MS;
  if (elapsed < dueAt) return;
  const h = hash32(`sc-slot:${botId}:${st.round}:${st.startedAtMs}:${nextIdx}`);
  const frameIdx = st.mode === "frames" ? Math.min(2, Math.floor(nextIdx / perFrame)) : 0;
  const slot = botSlot(nextIdx, frameIdx, h);
  const card: ScenePlaced = { k: keys[nextIdx] ?? "a.man", x: slot.x, y: slot.y, r: slot.r, s: slot.s };
  round.board.frames[frameIdx].push(card);
  snapshotHistory(round, st.mode);
  st.seq += 1;
}

function snapshotHistory(round: SceneRoomState["rounds"][number], mode: SceneMode): void {
  const last = round.history[round.history.length - 1];
  if (JSON.stringify(last) !== JSON.stringify(round.board)) {
    round.history.push(JSON.parse(JSON.stringify(round.board)) as SceneBoard);
    if (round.history.length > SCENE_HISTORY_CAP) {
      round.history.splice(1, round.history.length - SCENE_HISTORY_CAP);
    }
  }
}

/** حدس ربات — تأخیر ۶ تا ۱۶ ثانیه؛ احتمال درست‌حدسی با سختی کم می‌شود */
function botGuesserStep(botId: string, st: SceneRoomState, now: number, elapsed: number): void {
  const round = st.rounds[st.round - 1];
  if (round.scorers.some((s) => s.id === botId)) return;
  if (round.guesses.some((g) => g.id === botId)) return;
  const delay = 6_000 + (hash32(`sc-delay:${botId}:${st.round}:${st.startedAtMs}`) % 10_000);
  if (elapsed < delay) return;
  const factor = st.difficulty === "easiest" ? 1.4 : st.difficulty === "easy" ? 1 : st.difficulty === "hard" ? 0.72 : 0.55;
  const knowP = Math.min(85, Math.round((32 + (hash32(`sc-acc:${botId}:${st.round}`) % 24)) * factor));
  const knows = hash32(`sc-knows:${botId}:${st.round}:${st.startedAtMs}`) % 100 < knowP;
  const text = knows ? round.word : botWrongWord(botId, st, round.word);
  sceneGuess(st, botId, st.players.find((p) => p.id === botId)?.name ?? "ربات", text, now);
}

function botWrongWord(botId: string, st: SceneRoomState, correct: string): string {
  const pool = WORDS.filter((w) => w.t !== correct).map((w) => w.t);
  return pool[hash32(`sc-wrong:${botId}:${st.round}:${st.startedAtMs}`) % pool.length] ?? "هیچی";
}

/* ---------- نتیجهٔ نهایی و جوایز طنز ---------- */

function buildSceneResult(st: SceneRoomState): SceneResult {
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

  const awards: SceneResult["awards"] = {};
  /* کارگردان اسکار — بیشترین امتیاز کارگردانی (۳ امتیازِ هر حدس‌زن) */
  const dirStats = new Map<string, number>();
  for (const r of st.rounds) {
    if (r.scorers.length === 0) continue;
    dirStats.set(r.directorId, (dirStats.get(r.directorId) ?? 0) + r.scorers.length);
  }
  const best = [...dirStats.entries()].sort((a, b) => b[1] - a[1])[0];
  if (best && best[1] > 0) {
    const name = st.players.find((p) => p.id === best[0])?.name ?? "";
    awards.oscar = { id: best[0], name, detail: `${best[1]} حدس درست` };
  }
  /* سریع‌ترین چشم — بیشترین حدس اول */
  const firstStats = new Map<string, number>();
  for (const r of st.rounds) {
    const first = r.scorers[0];
    if (first) firstStats.set(first.id, (firstStats.get(first.id) ?? 0) + 1);
  }
  const eagle = [...firstStats.entries()].sort((a, b) => b[1] - a[1])[0];
  if (eagle && eagle[1] > 0) {
    const name = st.players.find((p) => p.id === eagle[0])?.name ?? "";
    awards.eagle = { id: eagle[0], name, detail: `${eagle[1]} بار اولین حدس` };
  }
  /* مینیمالیست — صحنهٔ درست‌گرفته با کمترین کارت */
  let mini: { id: string; name: string; cards: number } | null = null;
  for (const r of st.rounds) {
    if (r.scorers.length === 0) continue;
    const cards = cardCountOf(r.board);
    if (cards > SCENE_MINIMALIST_CARDS) continue;
    if (!mini || cards < mini.cards) {
      mini = { id: r.directorId, name: r.directorName, cards };
    }
  }
  if (mini) {
    awards.mini = { id: mini.id, name: mini.name, detail: `${mini.cards} کارت` };
  }
  return { rows, awards };
}

/* ---------- تیک خودکار — فازها و ربات‌ها ---------- */

export function sceneTick(st: SceneRoomState, opts: { now: number }): { mutated: boolean } {
  if (st.phase === "done") return { mutated: false };
  const { now } = opts;
  if (now < st.startedAtMs) return { mutated: false };
  let mutated = false;
  for (let i = 0; i < 48; i++) {
    if (st.phase === "build") {
      const round = st.rounds[st.round - 1];
      const buildStart = st.phaseEnds - buildMsOf(st.mode);
      const elapsed = now - buildStart;
      if (round) {
        /* کارگردانِ ربات — کارت‌ها را پله‌پله می‌گذارد */
        if (isBotId(round.directorId) && elapsed >= BOT_BG_STEP_MS) {
          const before = st.seq;
          botDirectorStep(round.directorId, st, elapsed);
          if (st.seq !== before) mutated = true;
        }
        /* حدس‌زن‌های ربات */
        for (const p of st.players) {
          if (!isBotId(p.id) || p.id === round.directorId) continue;
          const before = st.seq;
          botGuesserStep(p.id, st, now, elapsed);
          if (st.seq !== before) mutated = true;
        }
      }
      if (now < st.phaseEnds) break;
      st.phase = "reveal";
      st.phaseEnds = st.phaseEnds + SCENE_REVEAL_MS;
      st.seq += 1;
      mutated = true;
      continue;
    }
    /* reveal → دور بعد یا پایان */
    if (now < st.phaseEnds) break;
    if (st.round >= st.totalRounds) {
      st.phase = "done";
      st.result = buildSceneResult(st);
      st.seq += 1;
      mutated = true;
      break;
    }
    st.round += 1;
    st.phase = "build";
    st.phaseEnds = st.phaseEnds + buildMsOf(st.mode);
    st.seq += 1;
    mutated = true;
  }
  return { mutated };
}

/* ---------- نمای هر عضو ---------- */

/** واژهٔ مخفی و کیتش فقط برای کارگردان در فاز build بیرون می‌آیند —
    بقیه فقط صحنه و حدس‌ها را می‌بینند؛ در reveal هر دو برای همه گشوده می‌شوند. */
export function buildSceneView(
  st: SceneRoomState,
  memberId: string,
  members: { id: string; name: string; bot: boolean; online: boolean }[],
  now: number,
): SceneView {
  const round = st.rounds[st.round - 1] ?? null;
  const reveal = st.phase === "reveal" || st.phase === "done";
  const isDirector = Boolean(round && round.directorId === memberId);
  const scoresOf = (id: string) => st.scores[id] ?? 0;
  const kitNow = reveal ? (round?.kit ?? null) : isDirector ? (round?.kit ?? null) : null;
  return {
    startedAtMs: st.startedAtMs,
    now,
    seq: st.seq,
    mode: st.mode,
    difficulty: st.difficulty,
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
    directorId: round?.directorId ?? "",
    directorName: round?.directorName ?? "",
    isMyTurn: isDirector,
    word: reveal ? (round?.word ?? null) : isDirector ? (round?.word ?? null) : null,
    kit: kitNow,
    toolbox: isDirector && st.phase === "build" ? (round?.toolbox ?? null) : null,
    frameCount: frameCountOf(st.mode),
    board: round ? round.board : null,
    history: reveal && round ? round.history : null,
    cardCount: round ? cardCountOf(round.board) : 0,
    maxCards: maxCardsOf(st.mode),
    firstPoints: firstPointsOf(st.difficulty),
    guesses: round ? round.guesses.slice(-24) : [],
    solvedCount: round ? round.scorers.length : 0,
    scores: st.scores,
    finished: st.phase === "done",
    result: st.result,
  };
}
