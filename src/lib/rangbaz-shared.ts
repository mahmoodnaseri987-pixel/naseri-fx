/* ================================================================
   رنگ‌باز — بازی کارتی نئونی (تکی با ربات + آنلاین اتاقی)
   تایپ‌ها و ثابت‌های مشترک بین موتور، کلاینت‌ها و مسیرهای API
   ================================================================
   قوانین: کارت عددی هم‌رنگ یا هم‌عدد؛ ممنوع (سوزاندن نوبت)؛ برگشت
   (تغییر جهت — در دو نفره مثل ممنوع)؛ +۲؛ تغییر رنگ؛ تغییر رنگ +۴؛
   کارت‌های اختصاصی: آینه (کارت قبلی پشته به دستِ اندازنده‌اش برمی‌گردد)،
   تعویض دست (تبادل دست با بازیکن دلخواه)، مه (پنهان‌شدن تعداد کارت
   دیگران تا یک دور کامل). با یک کارتِ باقی‌مانده باید «رنگ‌باز!» زد،
   وگرنه در پنجرهٔ لو رفتن دو کارت جریمه می‌شود.
   ================================================================ */

export const RB_GAME_SLUG = "rangbaz";

export type RbColor = "red" | "blue" | "green" | "yellow";
export type RbKind =
  | "num"
  | "skip"
  | "reverse"
  | "draw2"
  | "wild"
  | "wild4"
  | "mirror"
  | "swap"
  | "fog";

export type RbCard = { id: string; k: RbKind; c: RbColor | null; n?: number };

export type RbSettings = {
  handSize: 5 | 7; // کارت شروع
  stacking: boolean; // جمع‌شدن جریمه (+۲ روی +۲، +۴ روی +۴ و +۲)
  custom: boolean; // کارت‌های اختصاصی (آینه/تعویض/مه)
  turnMs: number; // مهلت هر نوبت (آنلاین؛ ۰ = بدون محدودیت در سولوی عادی)
};

/* بات: ۰ انسان، ۱ تازه‌کار، ۲ حرفه‌ای، ۳ استاد */
export type RbPlayer = {
  id: string;
  name: string;
  hand: RbCard[];
  score: number;
  bot: 0 | 1 | 2 | 3;
  persona?: "shahin" | "negar" | "babak";
};

export type RbResult = {
  rows: { id: string; name: string; score: number; cards: number }[];
};

export type RbState = {
  v: 1;
  seq: number; // قفل بهینه‌گر برای ذخیره‌سازی هم‌زمان
  s: RbSettings;
  ps: RbPlayer[];
  deck: RbCard[];
  pile: RbCard[]; // پشتهٔ دورریز — آخرین عنصر کارت رو است
  color: RbColor; // رنگ فعال میز
  cur: number; // اندیس بازیکن نوبت‌دار
  dir: 1 | -1;
  pend: number; // جریمهٔ در انتظار (+۲/+۴ جمع‌شده)
  pendK: "draw2" | "wild4" | null;
  drew: boolean; // این نوبت کارت کشیده و کارتش قابل بازی است
  drewId: string | null;
  callOpen: { id: string; until: number } | null; // پنجرهٔ «لو رفتن»
  called: Record<string, number>; // turn که هر بازیکن رنگ‌باز گفت
  lastPlay: { id: string; cardId: string } | null; // برای کارت آینه
  fogBy: string | null;
  fogUntilTurn: number | null;
  turn: number;
  tStart: number;
  phase: "play" | "done";
  result: RbResult | null;
  log: string[];
};

export type RbViewPlayer = {
  id: string;
  name: string;
  bot: boolean;
  online?: boolean;
  count: number | null; // با مهِ فعال، تعداد بقیه پنهان می‌شود
  score: number;
};

export type RbView = {
  me: string;
  myHand: RbCard[];
  playableIds: string[];
  players: RbViewPlayer[];
  top: RbCard | null;
  color: RbColor;
  cur: string;
  dir: 1 | -1;
  pend: number;
  pendK: "draw2" | "wild4" | null;
  myTurn: boolean;
  drew: boolean;
  drewPlayable: boolean;
  callOpen: { id: string; name: string; until: number } | null;
  fogActive: boolean;
  settings: RbSettings;
  phase: "play" | "done";
  result: RbResult | null;
  log: string[];
  turnRemainMs: number;
  turn: number;
};

/* ظاهر رنگ‌ها — رنگ‌های کارت روی میز نئونی */
export const RB_COLOR_META: Record<RbColor, { hex: string; glow: string; fa: string; en: string }> = {
  red: { hex: "#f43f5e", glow: "244,63,94", fa: "قرمز", en: "Red" },
  blue: { hex: "#38bdf8", glow: "56,189,248", fa: "آبی", en: "Blue" },
  green: { hex: "#34d399", glow: "52,211,153", fa: "سبز", en: "Green" },
  yellow: { hex: "#fbbf24", glow: "251,191,36", fa: "زرد", en: "Yellow" },
};

export const RB_COLORS: RbColor[] = ["red", "blue", "green", "yellow"];

export const RB_TURN_MS_DEFAULT = 30_000;
export const RB_CALL_WINDOW_MS = 8_000; // پنجرهٔ لو دادن «رنگ‌باز» فراموش‌شده

export function rbIsColor(x: unknown): x is RbColor {
  return x === "red" || x === "blue" || x === "green" || x === "yellow";
}

/* ساخت کارت‌ها — ۱۰۸ یا ۱۱۴ کارت بسته به کارت‌های اختصاصی */
export function rbBuildDeck(custom: boolean): RbCard[] {
  let seq = 0;
  const cards: RbCard[] = [];
  const add = (k: RbKind, c: RbColor | null, n?: number) => {
    cards.push({ id: `rb-${seq++}`, k, c, n });
  };
  for (const c of RB_COLORS) {
    add("num", c, 0);
    for (let n = 1; n <= 9; n++) {
      add("num", c, n);
      add("num", c, n);
    }
    add("skip", c);
    add("skip", c);
    add("reverse", c);
    add("reverse", c);
    add("draw2", c);
    add("draw2", c);
  }
  for (let i = 0; i < 4; i++) add("wild", null);
  for (let i = 0; i < 4; i++) add("wild4", null);
  if (custom) {
    add("mirror", null);
    add("mirror", null);
    add("swap", null);
    add("swap", null);
    add("fog", null);
    add("fog", null);
  }
  return cards;
}

/* فیشر–یتس با بذر — برای چالش روزانهٔ یکسان برای همه */
export function rbSeededShuffle<T>(arr: T[], seed: number): T[] {
  let a = seed >>> 0;
  const rand = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function rbShuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/* ارزش امتیازی کارت‌ها برای محاسبهٔ امتیاز پایانی */
export function rbCardValue(card: RbCard): number {
  if (card.k === "num") return card.n ?? 0;
  if (card.k === "skip" || card.k === "reverse" || card.k === "draw2") return 20;
  if (card.k === "mirror" || card.k === "swap" || card.k === "fog") return 30;
  return 50; // تغییر رنگ و +۴
}

export function rbParseState(raw: string | null | undefined): RbState | null {
  if (!raw) return null;
  try {
    const st = JSON.parse(raw) as RbState;
    if (st && st.v === 1 && typeof st.seq === "number" && Array.isArray(st.ps) && Array.isArray(st.pile) && Array.isArray(st.deck)) {
      return st;
    }
  } catch {
    /* state خراب */
  }
  return null;
}

export const RB_LOBBY_META = { handSize: 7, stacking: true, custom: true } as const;
