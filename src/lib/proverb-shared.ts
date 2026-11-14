/* ================================================================
   «ضرب‌المثل‌چین» — اجزای مشترک کلاینت/سرور
   هر ضرب‌المثل به کارت‌های کلمه‌ای شکسته شده؛ چینش‌گر با همان
   کارت‌ها (+ ۴ کارت فریبنده + جوکر) صحنه می‌چیند و بقیه ضرب‌المثل
   کامل را حدس می‌زنند. واژهٔ مخفی فقط برای چینش‌گر دور جاری می‌آید.
   ================================================================ */

export const PC_GAME_SLUG = "proverb-craft";

/* ---------- ثابت‌های زمان ---------- */

export const PC_START_DELAY_MS = 5_000;
export const PC_BUILD_MS = 90_000; // چینش — هر راند حدود ۲ دقیقه با افشا
export const PC_REVEAL_MS = 20_000; // افشا + واکنش‌ها + رأی خلاقیت
export const PC_REVEAL_MS_PHONE = 12_000; // تلفن‌چی — افشای کوتاه
export const PC_MAX_ROUNDS = 16; // ۸ نفر × ۲ بار چینش‌گری
export const PC_HISTORY_CAP = 24;
export const PC_DECOYS = 4; // کارت‌های فریبنده هر راند
export const PC_HINT1_MS = 30_000; // تعداد کلمات
export const PC_HINT2_MS = 60_000; // یک کلمه از ضرب‌المثل
export const PC_MAX_CARDS = 16; // سقف کارت روی صحنه

/* ---------- امتیازدهی — طبق طرح ---------- */

export const PC_POINTS_FULL_FIRST = 10; // حدس کامل درست اول
export const PC_POINTS_FULL_LATER = 5; // حدس کامل بعدی‌ها
export const PC_POINTS_NEAR = 5; // حدس نزدیک (نیمی از کلمات کلیدی) — یک‌بار
export const PC_POINTS_DIRECTOR = 3; // چینش‌گر به‌ازای هر حدس کامل
export const PC_MINIMALIST_CARDS = 5; // جایزهٔ مینیمالیست: کمتر از ۶ کارت
export const PC_POINTS_MINIMALIST = 4;
export const PC_POINTS_HINT_PENALTY = 2; // به‌ازای هر کمک
export const PC_POINTS_SWAP_PENALTY = 2; // عوض کردن ضرب‌المثل
export const PC_POINTS_MISSING_BONUS = 3; // «ناقص»: پیدا کردن کارت گم‌شده
export const PC_VOTE_MIN = 1; // رأی خلاقیت ۱ تا ۳
export const PC_VOTE_MAX = 3;

/* ---------- حالت‌ها ---------- */

export const PC_MODES = ["classic", "phone", "banned", "incomplete"] as const;
export type PcMode = (typeof PC_MODES)[number];

export const PC_MODE_LABELS: Record<PcMode, { fa: string; en: string }> = {
  classic: { fa: "کلاسیک", en: "Classic" },
  phone: { fa: "تلفن‌چی تصویری", en: "Picture Phone" },
  banned: { fa: "کارت‌های ممنوعه", en: "Banned Cards" },
  incomplete: { fa: "ضرب‌المثل ناقص", en: "Missing Card" },
};

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
  board: PcBoard;
  history: PcBoard[]; // تایم‌لپس
  tray: string[]; // کلیدهای مجاز این راند — ضرب‌المثل + فریبنده + جوکر
  locked: string[]; // «ممنوعه»: کارت‌های قفل‌شده — فقط چینش‌گر می‌بیند
  missing: string | null; // «ناقص»: کلید کارت حذف‌شده — فقط چینش‌گر می‌بیند
  hints: { h1: boolean; h2: boolean; word: string | null }; // کمک‌های ۳۰ و ۶۰ ثانیه
  swapped: boolean; // ضرب‌المثل عوض شده (−۲)
  guesses: PcGuess[];
  scorers: PcScorer[];
  reactions: PcReaction[];
  votes: Record<string, number>; // رأی خلاقیت هر حدس‌زن به چینش‌گر
};

export type PcPlayer = { id: string; name: string };

export type PcResult = {
  rows: { id: string; name: string; score: number; rank: number }[];
  awards: {
    picasso?: { id: string; name: string; detail: string }; // پیکاسوی جمع — بیشترین رأی خلاقیت
    oscar?: { id: string; name: string; detail: string }; // کارگردان اسکار — بیشترین حدس کامل هدایت‌شده
    surreal?: { id: string; name: string; detail: string }; // سورئالیست دوره — بیشترین کارت عجیب (صفت/جوکر/فریبنده)
    laconic?: { id: string; name: string; detail: string }; // لاکونیک‌ترین — کمترین کارت روی صحنهٔ حدس‌شده
  };
};

export type PcRoomState = {
  game: typeof PC_GAME_SLUG;
  startedAtMs: number;
  seq: number;
  mode: PcMode;
  players: PcPlayer[];
  round: number;
  totalRounds: number;
  phase: "build" | "reveal" | "done";
  phaseEnds: number;
  rounds: PcRound[];
  scores: Record<string, number>;
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
  targetBoard: PcBoard | null; // تلفن‌چی: صحنهٔ نفر قبل — فروزن
  board: PcBoard | null;
  history: PcBoard[] | null;
  cardCount: number;
  maxCards: number;
  guesses: PcGuess[];
  scorers: PcScorer[];
  reactions: PcReaction[];
  votes: Record<string, number>;
  myVote: number; // ۰ = رأی نداده
  votesTotal: number;
  swapped: boolean;
  scores: Record<string, number>;
  finished: boolean;
  result: PcResult | null;
};

/* خواندن امن حالت انتخابی میزبان از JSON خام state لابی — الگوی sceneLobbyMode */
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

/** چرخهٔ شکل جوکر — نسل بعد از کلید فعلی */
export function pcJokerNext(k: string): string {
  const i = PC_JOKER_CYCLE.indexOf(k);
  return PC_JOKER_CYCLE[(i + 1) % PC_JOKER_CYCLE.length] ?? PC_JOKER_CYCLE[0];
}
