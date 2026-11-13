/* ================================================================
   بازی گروهی «شعر یادت نره» — اجزای مشترک کلاینت/سرور
   ================================================================
   هر دور یک کلیپ ۲۰ثانیه‌ای از آهنگ پخش می‌شود و ناگهان قطع می‌شود؛
   بازیکن باید «بیت بعدی» را حدس بزند. چهار سطح کمک:
     • سطح ۱ حدس کامل تایپی = ۲۵ امتیاز
     • سطح ۲ نمایان‌شدن کلمهٔ اول = ۱۵ امتیاز
     • سطح ۳ کلمهٔ اول + آخر = ۱۰ امتیاز
     • سطح ۴ چهارگزینه‌ای = ۵ امتیاز
   پاسخ نادرست صفر است؛ تایپ با تطبیق فازی پذیرفته می‌شود (ی/ي، ک/ك،
   اعراب، فاصله و نشانه‌ها یکسان حساب می‌شوند + Levenshtein نسبت ≥ 0.82).
   این فایل در بستهٔ کلاینت هم ایمپورت می‌شود — هیچ وابستگی سروری ندارد.
   ================================================================ */

export const SHER_GAME_SLUG = "sher";

/* زمان‌بندی فازها و قواعد امتیاز */
export const SHER_LISTEN_MS = 20_000; // پخش کلیپ
export const SHER_GUESS_MS = 30_000; // پنجرهٔ پاسخ‌دهی
export const SHER_REVEAL_MS = 8_000; // نمایش پاسخ درست
export const SHER_MAX_ROUNDS = 10; // سقف دورها — اگر آهنگ کمتر باشد، همان تعداد
export const SHER_START_DELAY_MS = 4_000; // شمارش معکوس شروع مسابقه

export type SherLevel = 1 | 2 | 3 | 4;

export const SHER_LEVEL_POINTS: Record<SherLevel, number> = { 1: 25, 2: 15, 3: 10, 4: 5 };

/** مودهای مسابقه — انفرادی، دو تیمی (۱/۲/۳/۴ در هر تیم) و تیم‌های نابرابر */
export type SherMode = "ffa" | "m1v1" | "m2v2" | "m3v3" | "m4v4" | "t3x2" | "t4x2";

export const SHER_MODES: readonly SherMode[] = ["ffa", "m1v1", "m2v2", "m3v3", "m4v4", "t3x2", "t4x2"];

/* ---------- بخش‌های آهنگ — چهار دستهٔ ثابت با سقف ۲۰ آهنگ در هر بخش ---------- */

export const SHER_CATEGORIES = ["nostalgia", "rap", "traditional", "modern"] as const;
export type SherCategory = (typeof SHER_CATEGORIES)[number];
export const SHER_CATEGORY_SONGS_MAX = 20;

/** گارد بخش معتبر — ورودی نامعتبر (اتاق‌های قدیمی و بدهی‌های خام) را رد می‌کند */
export function isSherCategory(v: unknown): v is SherCategory {
  return typeof v === "string" && (SHER_CATEGORIES as readonly string[]).includes(v);
}

/** ماتریس مجاز مود بر حسب تعداد اعضا — دقیقاً طبق سند طراحی:
    1→ffa | 2→ffa,1v1 | 3→ffa | 4→ffa,2v2 | 5→ffa | 6→ffa,3v3,t3x2 | 7→ffa | 8→ffa,4v4,t4x2 */
export function sherModesFor(count: number): SherMode[] {
  if (count === 2) return ["ffa", "m1v1"];
  if (count === 4) return ["ffa", "m2v2"];
  if (count === 6) return ["ffa", "m3v3", "t3x2"];
  if (count === 8) return ["ffa", "m4v4", "t4x2"];
  return ["ffa"];
}

/** تعداد تیم هر مود — ffa بدون تیم */
export function sherTeamCount(mode: SherMode): number {
  if (mode === "ffa") return 0;
  if (mode === "t3x2") return 3;
  if (mode === "t4x2") return 4;
  return 2; // m1v1 / m2v2 / m3v3 / m4v4
}

/** تیم‌بندی به ترتیب ورود — team = idx % تعدادتیم؛ ffa → همه -۱ */
export function sherTeamsOf(mode: SherMode, ids: string[]): number[] {
  const teamCount = sherTeamCount(mode);
  if (teamCount === 0) return ids.map(() => -1);
  return ids.map((_, idx) => idx % teamCount);
}

/* ---------- نرمال‌سازی و تطبیق فازی متن شعر ---------- */

/** یکسان‌سازی متن: حذف اعراب/علامت‌ها/فاصله‌ها + ي→ی، ك→ک، ة→ه، أإآٱ→ا */
export function sherNormalize(s: string): string {
  return s
    .replace(/[\u064B-\u0652\u0670\u0640\u06D6-\u06ED]/g, "") // اعراب، تشدید، کشیده و علامت‌های تلاوت
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/ة/g, "ه")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ی")
    .replace(/[^\p{L}\p{N}]/gu, ""); // فاصله‌ها و نشانه‌ها حذف
}

/** فاصلهٔ Levenshtein — دو ردیف حافظه */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = new Array<number>(b.length + 1);
  let cur = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[b.length];
}

/** تطبیق فازی — بعد از نرمال‌سازی، نسبت شباهت ≥ 0.82 (نسبت = ۱ - فاصله/طول‌بیشتر) */
export function sherFuzzyMatch(a: string, b: string): boolean {
  const x = sherNormalize(a);
  const y = sherNormalize(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const longer = Math.max(x.length, y.length);
  if (longer === 0) return false;
  return 1 - levenshtein(x, y) / longer >= 0.82;
}

/* ---------- گزینه‌های سطح ۴ ---------- */

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = a[i];
    a[i] = a[j];
    a[j] = tmp;
  }
  return a;
}

/** ساخت ۳ انحرافی نزدیک به طول جواب — اول از مصرع‌های اضافهٔ خود آهنگ،
    بعد از خط‌های جواب بقیهٔ آهنگ‌های فعال؛ بدون تکرار و بدون خودِ جواب.
    کمتر از ۳ شد هرچه هست (حداقل ۲ گزینه). خروجی: گزینه‌های شافل‌شده + اندیس جواب. */
export function buildSherOptions(
  answer: string,
  ownExtra: string[],
  pool: string[],
): { options: string[]; answerIndex: number } {
  const answerText = answer.trim();
  const target = answerText.length;
  const seen = new Set<string>([sherNormalize(answerText)]);
  const picked: string[] = [];
  const consider = (raw: string) => {
    if (picked.length >= 3) return;
    const text = raw.trim();
    if (!text) return;
    const key = sherNormalize(text);
    if (!key || seen.has(key)) return;
    seen.add(key);
    picked.push(text);
  };
  /* مرتب‌سازی نامزدها بر اساس نزدیکی طول به جواب — انحراف‌های «باورپذیر» */
  const byLen = (x: string, y: string) => Math.abs(x.length - target) - Math.abs(y.length - target);
  [...ownExtra].sort(byLen).forEach(consider);
  [...pool].sort(byLen).forEach(consider);
  const options = shuffle([answerText, ...picked.slice(0, 3)]);
  return { options, answerIndex: Math.max(0, options.indexOf(answerText)) };
}

/* ---------- دادهٔ آهنگ (از دیتابیس، پارس‌شده) ---------- */

export type SherSongData = {
  filename: string;
  title: string;
  artist: string;
  clipStart: number; // ثانیهٔ شروع کلیپ ۲۰ثانیه‌ای
  answerLine: string; // مصرع/بیت بعدی که باید حدس زده شود
  contextLines: string[]; // ۱ تا ۳ مصرعِ قبل — زیرنویس حین پخش
  extraLines: string[]; // مصرع‌های دیگر همین آهنگ — خوراک گزینهٔ انحرافی
};

/** آهنگ دور جاری در state سرور — answerIndex/answerLine هرگز به کلاینتِ فازهای
    listen/guess نمی‌رسد (فقط در reveal/done از طریق view)؛ اما options از فاز guess
    لازم است چون انتخاب سطح ۴ بدون دیدن گزینه‌ها ممکن نیست — محرمانه فقط جای جواب است */
export type SherRoundSong = SherSongData & { options: string[]; answerIndex: number };

/* ---------- وضعیت مسابقه (state سرور) ---------- */

export type SherPlayerInfo = {
  id: string;
  name: string;
  team: number; // اندیس تیم از ۰ — ffa → -1
};

export type SherAnswerRecord = {
  level: SherLevel;
  correct: boolean;
  payload: string; // متن تایپی یا اندیس گزینه به‌صورت رشته
};

export type SherResult = {
  rows: { id: string; rank: number; score: number }[]; // تساوی → رتبهٔ مشترک
  teams: { team: number; score: number }[]; // جمع اعضا وقتی mode ≠ ffa
};

export type SherPhase = "listen" | "guess" | "reveal" | "done";

export type SherRoomState = {
  game: "sher";
  startedAtMs: number; // پایان شمارش معکوس — قبل از آن هیچ فازی جلو نمی‌رود
  seq: number; // شمارندهٔ تغییرها — گارد «فقط رو به جلو» در ذخیره
  mode: SherMode;
  category?: SherCategory | ""; // بخش انتخابی میزبان در لابی — فقط برای حفظ در «مسابقه دوباره»؛ موتور فیلتر را در action route انجام می‌دهد
  players: SherPlayerInfo[];
  round: number; // از ۱
  totalRounds: number;
  phase: SherPhase;
  phaseEnds: number; // پایان فاز جاری — epoch ms
  songs: SherSongData[]; // دنبالهٔ شافل‌شدهٔ آهنگ‌های فعال — بدون تکرار در مسابقه؛ استخر انحرافی هم از همین است
  song: SherRoundSong | null; // آهنگ دور جاری
  answers: Record<string, SherAnswerRecord | null>; // هر دور صفر می‌شود
  scores: Record<string, number>; // امتیاز کل — حذف‌شده هم امتیازش می‌ماند
  result: SherResult | null;
};

/* ---------- نمای اختصاصی هر عضو (خروجی سرور به کلاینت) ---------- */

export type SherViewSong = {
  filename: string;
  title: string;
  artist: string;
  clipStart: number;
  contextLines: string[];
  options: string[];
  answerLine: string | null; // فقط در reveal/done
  answerIndex: number | null; // فقط در reveal/done
};

export type SherViewPlayer = {
  id: string;
  name: string;
  team: number; // ffa → -1
  bot: boolean;
  online: boolean;
};

export type SherView = {
  startedAtMs: number;
  now: number;
  seq: number;
  mode: SherMode;
  category: SherCategory | ""; // بخش مسابقه — خالی یعنی اتاق قدیمی/بدون بخش
  round: number; // از ۱
  totalRounds: number;
  phase: SherPhase;
  phaseEnds: number;
  song: SherViewSong | null;
  players: SherViewPlayer[];
  /** پاسخ خودم در دور جاری — «درستی» تا reveal پنهان می‌ماند */
  myAnswer: { level: SherLevel; payload: string } | null;
  /** پاسخ کامل همه — فقط در reveal/done */
  revealed: Record<string, SherAnswerRecord | null> | null;
  answeredCount: number;
  /** راهنمای سطح ۲/۳ — فقط در فاز guess */
  hintFirst: string | null;
  hintLast: string | null;
  scores: Record<string, number>;
  finished: boolean;
  result: SherResult | null;
};

/** خواندن امن مود انتخابی میزبان از JSON خام state لابی — قبل از شروع مسابقه */
export function sherLobbyMode(raw: string): SherMode | null {
  try {
    const d = JSON.parse(raw) as { sherMode?: unknown };
    if (typeof d.sherMode === "string" && (SHER_MODES as readonly string[]).includes(d.sherMode)) {
      return d.sherMode as SherMode;
    }
  } catch {
    /* خراب — پیش‌فرض */
  }
  return null;
}

/** خواندن امن بخش آهنگ انتخابی میزبان از JSON خام state لابی —
    همان الگوی sherLobbyMode؛ اتاق‌های قدیمی بدون بخش → null */
export function sherLobbyCategory(raw: string): SherCategory | null {
  try {
    const d = JSON.parse(raw) as { sherCategory?: unknown };
    if (isSherCategory(d.sherCategory)) return d.sherCategory;
  } catch {
    /* خراب — پیش‌فرض */
  }
  return null;
}

/** پارس امن JSON آرایهٔ رشته‌ای — فیلدهای متن آهنگ در دیتابیس JSON-رشته‌اند */
export function sherParseLines(raw: string): string[] {
  try {
    const d = JSON.parse(raw);
    if (Array.isArray(d)) return d.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean);
  } catch {
    /* خراب — خالی */
  }
  return [];
}

/* ---------- خواندن وضعیت از JSON خام — گارد کامل ---------- */

/** state خراب → null؛ فیلدهای عددی کلیدی هم clamp می‌شوند تا tick ناپایدار نشود */
export function parseSherState(raw: string): SherRoomState | null {
  try {
    const d = JSON.parse(raw) as Partial<SherRoomState> & { song?: Partial<SherRoundSong> | null };
    if (
      d &&
      d.game === SHER_GAME_SLUG &&
      typeof d.startedAtMs === "number" &&
      typeof d.seq === "number" &&
      typeof d.mode === "string" &&
      (SHER_MODES as readonly string[]).includes(d.mode) &&
      Array.isArray(d.players) &&
      d.players.length > 0 &&
      d.players.every(
        (p) => p && typeof p.id === "string" && typeof p.name === "string" && typeof p.team === "number",
      ) &&
      typeof d.round === "number" &&
      typeof d.totalRounds === "number" &&
      d.totalRounds >= 1 &&
      typeof d.phase === "string" &&
      ["listen", "guess", "reveal", "done"].includes(d.phase) &&
      typeof d.phaseEnds === "number" &&
      Array.isArray(d.songs) &&
      d.songs.every(
        (s) =>
          s &&
          typeof s.filename === "string" &&
          typeof s.answerLine === "string" &&
          Array.isArray(s.contextLines) &&
          Array.isArray(s.extraLines),
      ) &&
      (d.song === null ||
        (d.song &&
          typeof d.song.filename === "string" &&
          typeof d.song.answerLine === "string" &&
          typeof d.song.answerIndex === "number" &&
          Array.isArray(d.song.options))) &&
      d.answers &&
      typeof d.answers === "object" &&
      d.scores &&
      typeof d.scores === "object" &&
      (d.result === null || (d.result && Array.isArray(d.result.rows) && Array.isArray(d.result.teams)))
    ) {
      /* clamp — فازها و دورها هرگز ازRange بیرون نمی‌زنند */
      d.seq = Math.max(0, Math.floor(d.seq));
      d.round = Math.min(Math.max(1, Math.floor(d.round)), d.totalRounds);
      d.phaseEnds = Number.isFinite(d.phaseEnds) ? d.phaseEnds : Date.now();
      d.startedAtMs = Number.isFinite(d.startedAtMs) ? d.startedAtMs : Date.now();
      return d as SherRoomState;
    }
  } catch {
    /* خراب — حالت خالی */
  }
  return null;
}
