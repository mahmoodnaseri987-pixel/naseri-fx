/* بازی گروهی «رقابت جدول» — اجزای مشترک کلاینت/سرور.
   این فایل هیچ داده‌ای از بانک جدول‌ها ندارد؛ پاسخ‌ها فقط در
   jadval-engine.ts (سمت سرور) زندگی می‌کنند و هرگز به کلاینت نمی‌رسند. */

export { JADVAL_GAME_SLUG } from "./game-slugs";

export const JADVAL_MATCH_MS = 20 * 60 * 1000; // طول مسابقه: ۲۰ دقیقه
export const JADVAL_WRONG_LOCK_MS = 30_000; // قفل تیم پس از هر پاسخ نادرست
export const JADVAL_START_DELAY_MS = 5_000; // شمارش معکوس شروع
export const JADVAL_WORD_POINTS = 10; // امتیاز هر واژه درست برای زننده
export const JADVAL_WIN_BONUS = 30; // پاداش اعضای تیم برنده
export const JADVAL_LOSE_BONUS = 10; // پاداش اعضای تیم بازنده
export const JADVAL_DRAW_BONUS = 15; // پاداش مساوی

export const JADVAL_TEAM_A = "A" as const;
export const JADVAL_TEAM_B = "B" as const;
export type JadvalTeam = "A" | "B";

export const JADVAL_TEAM_LABELS: Record<JadvalTeam, { fa: string; en: string }> = {
  A: { fa: "تیم سبز", en: "Green Team" },
  B: { fa: "تیم قرمز", en: "Red Team" },
};

/* ---------- انواع دادهٔ وضعیت سرور (Room.state) ---------- */

/* ---------- سطح جدول — سه بخش آسان/سخت/حرفه‌ای ---------- */

export type JadvalDiff = "easy" | "hard" | "pro";

export const JADVAL_DIFF_LABELS: Record<JadvalDiff, { fa: string; en: string; tone: string }> = {
  easy: { fa: "آسان", en: "Easy", tone: "bg-emerald-500/10 text-emerald-300 border-emerald-500/40" },
  hard: { fa: "سخت", en: "Hard", tone: "bg-amber-500/10 text-amber-300 border-amber-500/40" },
  pro: { fa: "حرفه‌ای", en: "Pro", tone: "bg-rose-500/10 text-rose-300 border-rose-500/40" },
};

export const JADVAL_MODE_LABELS: Record<"classic" | "sher", { fa: string; en: string }> = {
  classic: { fa: "کلاسیک", en: "Classic" },
  sher: { fa: "شرح‌در‌متن", en: "Story Clues" },
};

export type JadvalWordRef = { i: number; r: number; c: number; d: "h" | "v"; len: number; num: number };

export type JadvalRoomState = {
  game: "jadval-race";
  startedAtMs: number;
  matchMs: number;
  puzzleId: string;
  sher: boolean; // حالت «شرح‌در‌متن» — تا «مسابقه دوباره» حفظ می‌شود
  teams: Record<string, JadvalTeam>; // memberId → تیم
  solved: { A: number[]; B: number[] }; // اندیس واژه‌های حل‌شدهٔ هر تیم
  wrongs: { A: number; B: number };
  lockUntil: { A: number; B: number }; // قفل پس از پاسخ نادرست (epoch ms)
  botNext?: { A: number; B: number }; // زمان بعدین واژه‌زدن ربات هر تیم — فقط اگر ربات در اتاق باشد
  result: JadvalResult | null;
  resultWritten?: boolean;
};

export type JadvalResult = {
  winner: JadvalTeam | null; // null = مساوی
  teams: { id: JadvalTeam; solved: number; total: number }[];
  members: { id: string; name: string; team: JadvalTeam; bonus: number }[];
};

/* ---------- نمای کلاینت ---------- */

export type JadvalPuzzleView = {
  id: string;
  title: string;
  size: number;
  rows: string[]; // "#" سیاه / "." سفید — حروف پاسخ هرگز به کلاینت نمی‌رسد
  diff: JadvalDiff;
  sherIntro?: string; // مقدمهٔ صفحهٔ متن در حالت شرح‌در‌متن
  words: {
    i: number;
    r: number;
    c: number;
    d: "h" | "v";
    len: number;
    num: number;
    clue: string;
    sher?: string; // شرح بلند ادبی — فقط در حالت شرح‌در‌متن
  }[];
};

export type JadvalTeamProgress = { id: JadvalTeam; solved: number; total: number };

export type JadvalView = {
  startedAtMs: number;
  matchMs: number;
  endsInMs: number; // میلی‌ثانیه تا پایان (وقتی در جریان است)
  mode: "classic" | "sher"; // حالت رقابت — از انتخاب میزبان در ساخت اتاق
  puzzle: JadvalPuzzleView;
  myTeam: JadvalTeam;
  teams: JadvalTeamProgress[];
  cells: string[]; // حروف تیم من + واژه‌های خط‌خوردهٔ رقیب — row-major، "" = خالی
  solved: number[]; // اندیس واژه‌های حل‌شدهٔ تیم من
  lost: number[]; // واژه‌هایی که تیم رقیب زده — برای ما خط خورده ولی حروفش راهنمای ماست
  wrongs: number; // پاسخ‌های نادرست تیم من
  lockUntilMs: number; // قفل تیم من
  result: JadvalResult | null;
  solution: string[] | null; // حروف کامل — فقط بعد از پایان مسابقه
};

/* ---------- نرمال‌سازی متن فارسی برای مقایسهٔ پاسخ ---------- */

export function normalizeFa(text: string): string {
  return text
    .trim()
    .replace(/[\u064A\u0649]/g, "\u06CC") // ي ی عربی → ی فارسی
    .replace(/\u0643/g, "\u06A9") // ك عربی → ک
    .replace(/[\u0623\u0625\u0671]/g, "\u0627") // أ إ ٱ → ا
    .replace(/\u0622/g, "\u0627") // آ → ا (مقایسه فقط)
    .replace(/\u0629/g, "\u0647") // ة → ه
    .replace(/\u0640/g, "") // کشیده
    .replace(/[\u200c\u200f\u200e]/g, "") // نیم‌فاصله و نشانه‌های جهت
    .replace(/[\u064B-\u0652\u0670]/g, "") // اعراب
    .replace(/\s+/g, "")
    .toLowerCase();
}

/** متن ورودی پاسخ — فقط حروف فارسی مجاز است */
export function cleanAnswerInput(text: string): string {
  return text.replace(/[^\u0621-\u064A\u0671-\u06D3\s\u200c]/g, "").slice(0, 40);
}
