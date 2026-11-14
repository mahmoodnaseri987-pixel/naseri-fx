/* ================================================================
   «ضرب‌المثل‌چین» — اجزای مشترک کلاینت/سرور
   هر ضرب‌المثل به کارت‌های کلمه‌ای شکسته شده؛ چینش‌گر با همان
   کارت‌ها صحنه می‌چیند و بقیه ضرب‌المثل کامل را حدس می‌زنند.
   حدس‌ها خصوصی‌اند — فقط خود حدس‌زن می‌بیند.
   امتیاز سرعتی: زودتر بزنی بیشتر، دیرتر کمتر، اشتباه منفی.
   حالت رقابتی تیمی: نوبتی — هر نوبت ۶ دقیقه برای یک تیم؛
   چینش‌گر می‌چیند و هم‌تیمی‌ها حدس می‌زنند؛ نقش‌ها به‌فاصله تعویض
   می‌شوند (۲ نفره هر ۳ دقیقه، ۳ نفره هر ۲ دقیقه، ۴ نفره هر ۱.۵ دقیقه).
   ================================================================ */

export const PC_GAME_SLUG = "proverb-craft";

/* ---------- ثابت‌های زمان ---------- */

export const PC_START_DELAY_MS = 5_000;
export const PC_BUILD_MS = 90_000; // چینش — هر راند حدود ۲ دقیقه با افشا
export const PC_REVEAL_MS = 20_000; // افشا + واکنش‌ها + رأی خلاقیت
export const PC_MAX_ROUNDS = 16; // ۸ نفر × ۲ بار چینش‌گری
export const PC_HISTORY_CAP = 24;
export const PC_DECOYS = 4; // کارت‌های فریبنده هر راند
export const PC_DECOYS_PRO = 2; // حرفه‌ای: کارت کمتر
export const PC_HINT1_MS = 30_000; // تعداد کلمات
export const PC_HINT2_MS = 60_000; // یک کلمه از ضرب‌المثل
export const PC_MAX_CARDS = 16; // سقف کارت روی صحنه

/* ---------- امتیازدهی ---------- */

/* امتیاز سرعتی — از ۶ تا ۱۲ بر حسب زمان باقی‌مانده راند */
export const PC_POINTS_FULL_MIN = 6;
export const PC_POINTS_FULL_MAX = 12;
export const PC_POINTS_NEAR_SHARE = 2; // حدس نزدیک: نصف امتیاز کامل
export const PC_POINTS_DIRECTOR = 3; // چینش‌گر به‌ازای هر حدس کامل
export const PC_POINTS_WRONG = 2; // حدس اشتباه: −۲
export const PC_WRONG_CAP = 3; // سقف جریمهٔ اشتباه هر نفر در هر راند
export const PC_POINTS_MISSING_BONUS = 3; // «ناقص»: پیدا کردن کارت گم‌شده
export const PC_MINIMALIST_CARDS = 5; // جایزهٔ مینیمالیست: کمتر از ۶ کارت
export const PC_POINTS_MINIMALIST = 4;
export const PC_POINTS_HINT_PENALTY = 2; // به‌ازای هر کمک
export const PC_POINTS_SWAP_PENALTY = 2; // عوض کردن ضرب‌المثل
export const PC_VOTE_MIN = 1; // رأی خلاقیت ۱ تا ۳
export const PC_VOTE_MAX = 3;

/* ---------- حالت رقابتی تیمی ---------- */

export const PC_RACE_TURN_MS = 360_000; // هر نوبت تیم: ۶ دقیقه
export const PC_RACE_BREAK_MS = 12_000; // وقفهٔ بین نوبت‌ها
export const PC_RACE_FAST_MS = 15_000; // حل سریع: امتیاز بیشتر
export const PC_RACE_MID_MS = 45_000;
export const PC_RACE_AWARD_FAST = 12;
export const PC_RACE_AWARD_MID = 10;
export const PC_RACE_AWARD_SLOW = 8;
export const PC_RACE_WRONG_CAP = 2; // سقف جریمهٔ اشتباه در هر ضرب‌المثل

/* تعویض نقش به حسب اندازهٔ تیم — زمان از شروع نوبت */
export function pcSwapSchedule(size: number): number[] {
  if (size <= 2) return [180_000]; // ۲ نفره: هر ۳ دقیقه
  if (size === 3) return [120_000, 240_000]; // ۳ نفره: هر ۲ دقیقه
  return [90_000, 180_000, 270_000]; // ۴ نفره: هر ۱.۵ دقیقه
}

export type PcTeam = {
  id: string;
  name: string; // تیم سرخ / سبز / آبی / زرد
  color: string; // رنگ UI
  memberIds: string[];
};

export const PC_TEAM_DEFS = [
  { name: "تیم سرخ", color: "#f43f5e" },
  { name: "تیم سبز", color: "#22c55e" },
  { name: "تیم آبی", color: "#3b82f6" },
  { name: "تیم زرد", color: "#eab308" },
];

/* ---------- حالت‌ها — تلفن‌چی حذف شد؛ جایش «رقابتی» تیمی ---------- */

export const PC_MODES = ["classic", "race", "banned", "incomplete", "pro"] as const;
export type PcMode = (typeof PC_MODES)[number];

export const PC_MODE_LABELS: Record<PcMode, { fa: string; en: string }> = {
  classic: { fa: "کلاسیک", en: "Classic" },
  race: { fa: "رقابتی", en: "Team Race" },
  banned: { fa: "ممنوعه", en: "Banned Cards" },
  incomplete: { fa: "ناقص", en: "Missing Card" },
  pro: { fa: "حرفه‌ای", en: "Pro" },
};

export function pcIsRace(mode: PcMode): boolean {
  return mode === "race";
}

/* ---------- کارت‌ها روی صحنه ---------- */

import { PC_JOKER_CYCLE } from "@/lib/proverb-cards";

export type PcPlaced = {
  k: string; // کلید کارت
  x: number; // ۰ تا ۱۰۰
  y: number; // ۰ تا ۱۰۰
  r?: number; // چرخش
  p?: string; // کارت مادر — فقط صفت‌ها؛ صفت سوارِ کارت اسم می‌شود
};

export type PcBoard = { items: PcPlaced[] };

export type PcGuess = { id: string; name: string; text: string; atMs: number; tier: "full" | "near" | "miss" | "miss-word" | "wrong" };

export type PcScorer = { id: string; name: string; points: number; atMs: number; tier: "full" | "near" | "miss-word" };

export type PcReaction = { id: string; name: string; k: string; atMs: number };

export type PcRound = {
  puzzleId: number;
  arrangerId: string;
  arrangerName: string;
  teamId?: string; // رقابتی: تیم مالک این تلاش
  startedMs: number; // شروع تلاش — برای امتیاز سرعتی
  board: PcBoard;
  history: PcBoard[]; // تایم‌لپس
  tray: string[]; // کلیدهای مجاز این راند — ضرب‌المثل + فریبنده + جوکر
  locked: string[]; // «ممنوعه»: کارت‌های قفل‌شده — فقط چینش‌گر می‌بیند
  missing: string | null; // «ناقص»: کلید کارت حذف‌شده — فقط چینش‌گر می‌بیند
  hints: { h1: boolean; h2: boolean; word: string | null }; // کمک‌های ۳۰ و ۶۰ ثانیه
  swapped: boolean; // ضرب‌المثل عوض شده (−۲)
  wrongPen: Record<string, number>; // شمار جریمهٔ حدس اشتباه هر نفر
  guesses: PcGuess[];
  scorers: PcScorer[];
  reactions: PcReaction[];
  votes: Record<string, number>; // رأی خلاقیت هر حدس‌زن به چینش‌گر
};

export type PcPlayer = { id: string; name: string };

export type PcResult = {
  rows: { id: string; name: string; score: number; rank: number }[];
  teams?: { id: string; name: string; color: string; score: number; rank: number }[];
  awards: {
    picasso?: { id: string; name: string; detail: string }; // پیکاسوی جمع — بیشترین رأی خلاقیت
    oscar?: { id: string; name: string; detail: string }; // کارگردان اسکار — بیشترین حدس کامل هدایت‌شده
    surreal?: { id: string; name: string; detail: string }; // سورئالیست دوره — بیشترین کارت عجیب
    laconic?: { id: string; name: string; detail: string }; // لاکونیک‌ترین — کمترین کارت روی صحنهٔ حدس‌شده
  };
};

export type PcRoomState = {
  game: typeof PC_GAME_SLUG;
  startedAtMs: number;
  seq: number;
  mode: PcMode;
  players: PcPlayer[];
  round: number; // کلاسیک: شماره دور — رقابتی: شماره تلاش جاری
  totalRounds: number; // کلاسیک: تعداد دورها — رقابتی: تعداد نوبت‌های تیمی
  phase: "build" | "reveal" | "done";
  phaseEnds: number;
  rounds: PcRound[];
  scores: Record<string, number>;
  /* رقابتی تیمی — برای حالت‌های کلاسیک absent */
  teams?: PcTeam[];
  turn?: number; // نوبت تیم جاری (۱ تا تعداد تیم‌ها)
  roleIdx?: number; // اندیس چینش‌گر در تیم
  swapIdx?: number; // چندمین تعویض نقش در این نوبت
  teamScores?: Record<string, number>;
  poolIds?: number[]; // صف ضرب‌المثل‌های بی‌تکرار
  poolIdx?: number;
  result: PcResult | null;
};

/* ---------- نمای کلاینت ---------- */

export type PcView = {
  startedAtMs: number;
  now: number;
  seq: number;
  mode: PcMode;
  round: number;
  totalRounds: number;
  phase: "build" | "reveal" | "done";
  phaseEnds: number;
  players: { id: string; name: string; bot: boolean; online: boolean; score: number }[];
  arrangerId: string;
  arrangerName: string;
  isMyTurn: boolean;
  puzzle: string | null; // ضرب‌المثل مخفی — فقط چینش‌گر در build یا همه در reveal
  puzzleWordCount: number | null; // کمک ۱ — تعداد کلمات؛ برای همه پس از ۳۰ ثانیه
  puzzleHintWord: string | null; // کمک ۲ — یک کلمه؛ برای همه پس از ۶۰ ثانیه
  tray: string[] | null; // فقط چینش‌گر
  lockedCount: number; // تعداد کارت‌های قفل‌شده — عمومی (بدون نام کارت)
  hasMissing: boolean; // «ناقص» است — عمومی
  board: PcBoard | null;
  history: PcBoard[] | null;
  cardCount: number;
  maxCards: number;
  guesses: PcGuess[]; // فقط حدس‌های خودم — حدس دیگران هرگز نمی‌آید
  scorers: PcScorer[]; // فقط در افشا بیرون می‌آید
  reactions: PcReaction[];
  votes: Record<string, number>;
  myVote: number;
  votesTotal: number;
  swapped: boolean;
  scores: Record<string, number>;
  /* رقابتی تیمی */
  isRace: boolean;
  teams: (PcTeam & { score: number })[];
  turn: number;
  activeTeamId: string | null;
  myTeamId: string | null;
  myRole: "arranger" | "guesser" | "spectator";
  nextSwapInMs: number | null; // تا تعویض نقش بعدی — null یعنی تعویض ندارد
  turnSolved: number; // ضرب‌المثل‌های حل‌شده در این نوبت
  turnPuzzles: string[]; // متن ضرب‌المثل‌های حل‌شدهٔ نوبت (در وقفه گشوده می‌شود)
  finished: boolean;
  result: PcResult | null;
};

/* خواندن امن حالت انتخابی میزبان از JSON خام state لابی */
export function pcLobbyMode(raw: string): PcMode | null {
  try {
    const d = JSON.parse(raw) as { pcMode?: unknown };
    if (typeof d.pcMode === "string" && (PC_MODES as readonly string[]).includes(d.pcMode)) {
      return d.pcMode as PcMode;
    }
  } catch {
    /* خراب — پیش‌فرض */
  }
  return null;
}

/** تعداد تیم‌های انتخابی میزبان برای حالت رقابتی — ۲ یا ۴ */
export function pcLobbyTeams(raw: string): number | null {
  try {
    const d = JSON.parse(raw) as { pcTeams?: unknown };
    if (d.pcTeams === 4 || d.pcTeams === "4") return 4;
    if (d.pcTeams === 2 || d.pcTeams === "2") return 2;
  } catch {
    /* خراب — پیش‌فرض */
  }
  return null;
}

/** چرخهٔ شکل جوکر — نسل بعد از کلید فعلی */
export function pcJokerNext(k: string): string {
  const i = PC_JOKER_CYCLE.indexOf(k);
  return PC_JOKER_CYCLE[(i + 1) % PC_JOKER_CYCLE.length] ?? PC_JOKER_CYCLE[0];
}
