/* ================================================================
   بازی گروهی «منچ» — اجزای مشترک کلاینت/سرور
   ================================================================
   صفحهٔ کلاسیک ۱۵×۱۵ با مسیر ۵۲ خانه‌ای و ستون خانه‌های خودی.
   قوانین (مطابق انتخاب مالک سایت — نسخهٔ یک‌تاس):
     • هر بازیکن ۴ مهرهٔ هم‌رنگ دارد؛ همه اول در پایگاه‌اند.
     • در هر نوبت یک تاس پرتاب می‌شود و مهره به همان تعداد حرکت می‌کند.
     • ورود مهره به مسیر فقط با آوردن ۶ — ورود یعنی نشستن روی
       خانهٔ شروعِ رنگ خود بازیکن؛ آوردن ۶ پرتاب دوباره هم می‌دهد.
     • فرود روی مهرهٔ حریف (در خانهٔ غیرامن) = زدن؛ مهره به پایگاه برمی‌گردد.
     • خانهٔ شروعِ هر رنگ «خانهٔ امن» است: هیچ مهرهٔ دیگر آن‌جا زده نمی‌شود
       و اگر آن خانه با مهرهٔ صاحبش پر باشد، حرکت حریف به آن انجام نمی‌شود.
     • اگر خانهٔ مقصد با مهرهٔ خود بازیکن پر باشد، آن حرکت مجاز نیست.
     • رسیدن به خانهٔ پایانی باید با گام دقیق باشد؛ اضافه برمی‌گردد (فنری).
     • ۵ خانهٔ سورپرایز با جای تصادفی در هر مسابقه:
         ۴ خانه به جلو، ۳ خانه به جلو، ۴ خانه به عقب، ۳ خانه به عقب،
         و خانهٔ «پرتاب دوبارهٔ تاس».
     • مهلت هر نوبت ۱۵ ثانیه؛ تاس و حرکت خودکار انجام می‌شود.
   این فایل در بستهٔ کلاینت هم ایمپورت می‌شود — هیچ وابستگی سروری ندارد.
   ================================================================ */

export const LUDO_GAME_SLUG = "ludo";

/** منچ فقط چهار رنگ دارد — ظرفیت اتاق حداکثر ۴ نفر است */
export const LUDO_MAX_PLAYERS = 4;

export const LUDO_TURN_MS = 15_000; // مهلت پرتاب تاس در نوبت انسان
export const LUDO_MOVE_MS = 12_000; // مهلت انتخاب حرکت بعد از دیدن تاس
export const LUDO_START_DELAY_MS = 3_500; // شمارش معکوس شروع مسابقه
export const LUDO_BOT_ROLL_MIN = 900; // تاخیر فکر ربات قبل از پرتاب
export const LUDO_BOT_ROLL_VAR = 1300;
export const LUDO_BOT_MOVE_MIN = 600; // تاخیر فکر ربات بین تاس و حرکت
export const LUDO_BOT_MOVE_VAR = 900;
export const LUDO_BOT_DEADLINE = 2_600; // سقف زمان ربات برای هر اکشن

export const LUDO_PIECES = 4; // تعداد مهرهٔ هر بازیکن
export const LUDO_TRACK_CELLS = 52; // خانه‌های مسیر اصلی
export const LUDO_COLUMN_START = 51; // اولین گام ستون خانه‌های خودی
export const LUDO_HOME_STEP = 56; // گام خانهٔ پایانی (رسیدن به خانه)

export type LudoColor = 0 | 1 | 2 | 3; // قرمز، سبز، زرد، آبی

export const LUDO_COLOR_INFO: Record<
  LudoColor,
  { key: string; fa: string; en: string; base: string; dark: string; light: string }
> = {
  0: { key: "red", fa: "قرمز", en: "Red", base: "#e2453c", dark: "#8e1f1a", light: "#ff8a80" },
  1: { key: "green", fa: "سبز", en: "Green", base: "#2fae5f", dark: "#176b38", light: "#7fe3a4" },
  2: { key: "yellow", fa: "زرد", en: "Yellow", base: "#e8a021", dark: "#9a6208", light: "#ffd071" },
  3: { key: "blue", fa: "آبی", en: "Blue", base: "#3a7ce0", dark: "#1d4a9a", light: "#8ab6ff" },
};

/** رنگ‌ها به تعداد بازیکن — دو نفر روی قطر مقابل هم می‌نشینند */
export function ludoColorsFor(count: number): LudoColor[] {
  if (count <= 2) return [0, 2];
  if (count === 3) return [0, 1, 2];
  return [0, 1, 2, 3];
}

/* مختصات ۵۲ خانهٔ مسیر اصلی روی شبکهٔ ۱۵×۱۵ — (ستون، ردیف)، از ۰ */
export const LUDO_TRACK: readonly (readonly [number, number])[] = [
  [1, 6], [2, 6], [3, 6], [4, 6], [5, 6],
  [6, 5], [6, 4], [6, 3], [6, 2], [6, 1], [6, 0],
  [7, 0],
  [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5],
  [9, 6], [10, 6], [11, 6], [12, 6], [13, 6], [14, 6],
  [14, 7],
  [14, 8], [13, 8], [12, 8], [11, 8], [10, 8], [9, 8],
  [8, 9], [8, 10], [8, 11], [8, 12], [8, 13], [8, 14],
  [7, 14],
  [6, 14], [6, 13], [6, 12], [6, 11], [6, 10], [6, 9],
  [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
  [0, 7],
  [0, 6],
];

/** خانهٔ شروع هر رنگ در مسیر مطلق — همان خانهٔ امن و نقطهٔ ورود */
export const LUDO_START_ABS: readonly number[] = [0, 13, 26, 39];

/** خانهٔ مطلق یک گام روی مسیر اصلی — گام‌های ستون/خانه null می‌دهند */
export function ludoAbsCellOf(color: LudoColor, step: number): number | null {
  if (step < 0 || step >= LUDO_COLUMN_START) return null;
  return (LUDO_START_ABS[color] + step) % LUDO_TRACK_CELLS;
}

export function ludoIsStartCell(abs: number): boolean {
  return LUDO_START_ABS.includes(abs);
}

/** صاحب یک خانهٔ شروع — اگر خانهٔ شروع نباشد null */
export function ludoStartOwner(abs: number): LudoColor | null {
  const idx = LUDO_START_ABS.indexOf(abs);
  return idx >= 0 ? (idx as LudoColor) : null;
}

/* ستون ۵ خانهٔ خودی هر رنگ — گام‌های ۵۱ تا ۵۵ */
export const LUDO_COLUMN: Record<LudoColor, readonly (readonly [number, number])[]> = {
  0: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],
  1: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],
  2: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]],
  3: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]],
};

/* لنگرگاه ۴ مهره داخل پایگاه هر رنگ (مختصات اعشاری خانه) */
export const LUDO_BASE_ANCHORS: Record<LudoColor, readonly (readonly [number, number])[]> = {
  0: [[1.5, 1.5], [3.6, 1.5], [1.5, 3.6], [3.6, 3.6]],
  1: [[10.4, 1.5], [12.5, 1.5], [10.4, 3.6], [12.5, 3.6]],
  2: [[10.4, 10.4], [12.5, 10.4], [10.4, 12.5], [12.5, 12.5]],
  3: [[1.5, 10.4], [3.6, 10.4], [1.5, 12.5], [3.6, 12.5]],
};

/* جای مهره‌های رسیده به خانه، درون مثلث مرکزی هر رنگ */
export const LUDO_HOME_ANCHORS: Record<LudoColor, readonly (readonly [number, number])[]> = {
  0: [[6.75, 6.75], [6.3, 7.5], [6.75, 8.25], [6.15, 7.5]],
  1: [[6.75, 6.75], [7.5, 6.3], [8.25, 6.75], [7.5, 6.15]],
  2: [[8.25, 6.75], [8.7, 7.5], [8.25, 8.25], [8.85, 7.5]],
  3: [[6.75, 8.25], [7.5, 8.7], [8.25, 8.25], [7.5, 8.85]],
};

/* ---------- سورپرایزها ---------- */

export type LudoSurpriseKind = "fwd4" | "fwd3" | "back4" | "back3" | "again";

export const LUDO_SURPRISE_COUNT = 5;

/** نامزد خانه‌های سورپرایز — دور از خانه‌های شروع (۰،۱۳،۲۶،۳۹) */
export const LUDO_SURPRISE_POOL: readonly number[] = [
  4, 8, 11, 17, 21, 24, 29, 33, 36, 42, 45, 49,
];

export const LUDO_SURPRISE_ALL: readonly LudoSurpriseKind[] = [
  "fwd4", "fwd3", "back4", "back3", "again",
];

/** برچسب فارسی اثر هر سورپرایز — برای پیام سیستمی چت اتاق */
export const LUDO_SURPRISE_LABEL: Record<LudoSurpriseKind, string> = {
  fwd4: "سورپرایز: ۴ خانه به جلو",
  fwd3: "سورپرایز: ۳ خانه به جلو",
  back4: "تنبیه: ۴ خانه به عقب",
  back3: "تنبیه: ۳ خانه به عقب",
  again: "سورپرایز: حق پرتاب دوبارهٔ تاس",
};

/* ---------- وضعیت مسابقه ---------- */

export type LudoDice = { v: number }; // یک تاس — عدد ۱ تا ۶

export type LudoPlayerInfo = {
  id: string;
  name: string;
  color: LudoColor;
};

export type LudoResultRow = {
  id: string;
  rank: number;
  home: number; // تعداد مهرهٔ رسیده
  steps: number; // جمع پیشرفت
};

export type LudoRoomState = {
  game: "ludo";
  startedAtMs: number;
  seq: number; // شمارندهٔ تغییرها — گارد «فقط رو به جلو» در ذخیره
  order: string[]; // بازیکنانِ در جریان مسابقه (به ترتیب نوبت)
  players: Record<string, LudoPlayerInfo>;
  pieces: Record<string, number[]>; // memberId → ۴ گام (-1 پایگاه، …، ۵۶ خانه)
  finishedAt: Record<string, number>; // memberId → زمان رسیدن هر ۴ مهره
  turnId: string; // بازیکنِ نوبت جاری
  dice: LudoDice | null; // تاس بازِ نوبت جاری — تا اجرای حرکت روی زمین است
  rolls: number; // پرتاب‌های ادامه‌دار این نوبت (۶ → پرتاب دوباره)
  skipNext: Record<string, true>; // خانهٔ سورپرایز: حق یک دور پرتاب از آن‌ها گرفته شد
  surprise: number[]; // ۵ خانهٔ مطلق این مسابقه
  surpriseKind: Record<number, LudoSurpriseKind>; // خانهٔ مطلق → اثر
  deadline: number; // مهلت اکشن جاری (پرتاب یا حرکت) — epoch ms
  result: LudoResultRow[] | null;
};

/* ---------- اکشن‌های مجاز — یک منبع واحد برای سرور و کلاینت ---------- */

export type LudoAction = {
  piece: number; // اندیس مهره (۰ تا ۳)
  kind: "enter" | "move";
  newStep: number; // گام پس از اجرا (ورود = ۰)
  abs: number | null; // خانهٔ مطلق هدف روی مسیر (اگر در مسیر اصلی بماند)
  captureOf: string | null; // صاحب مهره‌ای که با این حرکت زده می‌شود
};

export function ludoBounce(step: number): number {
  if (step <= LUDO_HOME_STEP) return step;
  return 2 * LUDO_HOME_STEP - step; // اضافهٔ خانهٔ پایانی برمی‌گردد
}

/** فهرست اکشن‌های مجاز بازیکن برای تاسِ باز — سرور و کلاینت هر دو همین را
    صدا می‌زنند تا قوانین فقط یک‌جا نوشته شده باشد. */
export function ludoActionsFor(args: {
  me: string;
  colorOf: Record<string, LudoColor>;
  pieces: Record<string, number[]>;
  dice: LudoDice | null;
  surprise: number[];
}): LudoAction[] {
  const { me, colorOf, pieces, dice, surprise } = args;
  const myColor = colorOf[me];
  if (myColor === undefined || !dice) return [];
  const sum = dice.v;
  const mine = pieces[me] ?? [];
  const out: LudoAction[] = [];
  const others = Object.keys(pieces).filter((id) => id !== me);

  const occupancyAt = (abs: number): { own: boolean; ownerBlock: boolean } => {
    let own = false;
    let ownerBlock = false;
    const owner = ludoStartOwner(abs);
    for (const id of others) {
      const steps = pieces[id] ?? [];
      const oc = colorOf[id];
      for (const s of steps) {
        if (s < 0 || s >= LUDO_COLUMN_START) continue;
        if (ludoAbsCellOf(oc, s) !== abs) continue;
        if (oc === myColor) own = true;
        if (owner !== null && oc === owner) ownerBlock = true;
      }
    }
    for (const s of mine) {
      if (s < 0 || s >= LUDO_COLUMN_START) continue;
      if (ludoAbsCellOf(myColor, s) === abs) own = true;
    }
    return { own, ownerBlock };
  };

  const captureAt = (abs: number): string | null => {
    if (ludoIsStartCell(abs)) return null; // خانهٔ امن — زدن ممنوع
    let best: { id: string; step: number } | null = null;
    for (const id of others) {
      const oc = colorOf[id];
      for (const s of pieces[id] ?? []) {
        if (s < 0 || s >= LUDO_COLUMN_START) continue;
        if (ludoAbsCellOf(oc, s) !== abs) continue;
        if (!best || s > best.step) best = { id, step: s };
      }
    }
    return best?.id ?? null;
  };

  /* ورود با ۶ — فقط وقتی خانهٔ شروع خودمان با مهرهٔ خودمان پر نشده */
  if (dice.v === 6) {
    const hasInBase = mine.some((s) => s < 0);
    if (hasInBase) {
      const abs = LUDO_START_ABS[myColor];
      const occ = occupancyAt(abs);
      if (!occ.own && !occ.ownerBlock) {
        out.push({ piece: mine.findIndex((s) => s < 0), kind: "enter", newStep: 0, abs, captureOf: null });
      }
    }
  }

  /* حرکت عادی با جمع تاس‌ها */
  for (let i = 0; i < mine.length; i++) {
    const s = mine[i];
    if (s < 0 || s >= LUDO_HOME_STEP) continue; // در پایگاه یا رسیده
    const next = ludoBounce(s + sum);
    if (next < 0) continue;
    if (next <= LUDO_COLUMN_START - 1) {
      const abs = ludoAbsCellOf(myColor, next)!;
      const occ = occupancyAt(abs);
      if (occ.own) continue; // خانهٔ مقصد با مهرهٔ خودمان پر است — حرکت مجاز نیست
      if (occ.ownerBlock) continue; // خانهٔ شروعِ رنگی با مهرهٔ صاحبش پر است
      out.push({ piece: i, kind: "move", newStep: next, abs, captureOf: captureAt(abs) });
    } else {
      /* ستون خانه‌های خودی یا خانهٔ پایانی — همیشه مجاز */
      out.push({ piece: i, kind: "move", newStep: next, abs: null, captureOf: null });
    }
  }

  return out;
}

/* ---------- پیشرفت و رتبه ---------- */

export function ludoPiecesHome(steps: number[]): number {
  return steps.filter((s) => s === LUDO_HOME_STEP).length;
}

export function ludoTotalSteps(steps: number[]): number {
  return steps.reduce((acc, s) => acc + Math.max(0, s), 0);
}

/* ---------- نمای اختصاصی هر عضو ---------- */

export type LudoViewPlayer = {
  id: string;
  name: string;
  color: LudoColor;
  bot: boolean;
  online: boolean;
  inRoom: boolean;
  finished: boolean;
  home: number;
};

export type LudoView = {
  startedAtMs: number;
  now: number;
  seq: number;
  turnId: string;
  myTurn: boolean;
  dice: LudoDice | null;
  deadline: number;
  players: LudoViewPlayer[];
  pieces: Record<string, number[]>;
  surprise: { cell: number; kind: LudoSurpriseKind }[];
  finished: boolean;
  result: LudoResultRow[] | null;
};
