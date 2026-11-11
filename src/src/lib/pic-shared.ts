/* بازی گروهی «حدس تصویر» — اجزای مشترک کلاینت/سرور.
   هر دست ایموجی یک واژه یا عبارت فارسی است؛ اولین پاسخ درست صاحب امتیاز است.
   پاسخ‌ها فقط در pic-engine.ts (سمت سرور) زندگی می‌کنند و در فاز پاسخ‌دهی
   هرگز به کلاینت نمی‌رسند. */

export const PIC_GAME_SLUG = "pic-guess";

export const PIC_ROUNDS = 12; // تعداد دورهای هر مسابقه
export const PIC_ROUND_MS = 20_000; // پنجرهٔ پاسخ‌دهی هر دور
export const PIC_REVEAL_MS = 4_000; // نمایش پاسخ بعد از پایان هر دور
export const PIC_START_DELAY_MS = 4_000; // شمارش معکوس شروع
export const PIC_WRONG_LOCK_MS = 4_000; // قفل بازیکن پس از هر حدس نادرست
export const PIC_BASE_POINTS = 60; // کف امتیاز اولین پاسخ درست
export const PIC_MAX_POINTS = 120; // سقف امتیاز (پاسخ فوری)

export type PicWin = { w: string; at: number } | null; // برندهٔ هر دور

export type PicRoomState = {
  game: "pic-guess";
  startedAtMs: number;
  rounds: number[]; // اندیس پازل‌ها در بانک — بدون تکرار
  wins: PicWin[]; // به تعداد دورها
  wrongUntil: Record<string, number>; // memberId → قفل تا epoch ms
};

export type PicPhase =
  | { status: "countdown"; endsInMs: number }
  | { status: "playing"; round: number; phase: "answer" | "reveal"; endsInMs: number }
  | { status: "finished" };

/** فاز مسابقه از روی زمان — بدون IO؛ کلاینت هم برای پیش‌بینی محلی استفاده می‌کند.
    دورِ برنده‌دار زودتر از پنجرهٔ کامل بسته می‌شود: [شروع، برد] + زمان نمایش. */
export function picPhase(state: PicRoomState, now: number): PicPhase {
  if (now < state.startedAtMs) {
    return { status: "countdown", endsInMs: state.startedAtMs - now };
  }
  let cursor = state.startedAtMs;
  for (let r = 0; r < state.rounds.length; r++) {
    const win = state.wins[r] ?? null;
    const answerEnd = Math.min(cursor + PIC_ROUND_MS, win ? win.at : Number.POSITIVE_INFINITY);
    const revealEnd = answerEnd + PIC_REVEAL_MS;
    if (now < answerEnd) {
      return { status: "playing", round: r, phase: "answer", endsInMs: answerEnd - now };
    }
    if (now < revealEnd) {
      return { status: "playing", round: r, phase: "reveal", endsInMs: revealEnd - now };
    }
    cursor = revealEnd;
  }
  return { status: "finished" };
}

export type PicRoundInfo = {
  emoji: string;
  answer: string | null; // فقط در فاز نمایش یا بعد از پایان
  winnerName: string | null;
  winnerId: string | null;
  mine: boolean; // برندهٔ این دور خودم هستم
  points: number; // امتیازی که برندهٔ این دور گرفت
};

export type PicView = {
  startedAtMs: number;
  rounds: number; // تعداد کل دورها
  status: "countdown" | "playing" | "finished";
  round: number; // دور جاری (۰-مبنا) در جریان
  phase: "answer" | "reveal";
  endsInMs: number;
  emoji: string; // دست ایموجی دور جاری
  len: number; // طول پاسخ دور جاری — راهنمای تایپ
  myLockUntilMs: number;
  history: PicRoundInfo[]; // تا دور جاری
  /* نتیجهٔ نهایی — فقط بعد از پایان: رتبه‌بندی با امتیاز اعضا در خود پاسخ هست */
};
