/* ================================================================
   رجیستری بازی‌های آرنا — قلب «پروتکل یکسان» بازی‌ها
   ================================================================
   آرنا تنها مسیر همهٔ بازی‌های سایت است؛ هر بازی با یک «نوع» (kind) در
   همین فایل ثبت می‌شود و از زیرساخت مشترک اتاق عبور می‌کند:
     • quiz  — چالش پرسش‌وپاسخ سرور-محور (موتور arena-game)
     • fire  — نبرد تیمی میدان آتش؛ لابی با پروتکل آرنا، خود بازی با
               موتور WebRTC داخل FireOnline (embedded) اجرا می‌شود
     • nabard — (بازنشسته) نبرد زندهٔ دایره‌ها؛ اتاق‌های قدیمی فقط نمایش
     • score — اتاق رکوردی: همهٔ اعضای اتاق همان بازی آپلودی را اجرا
               می‌کنند و امتیازها زنده مقایسه می‌شود. بازی‌های آپلودی
               مدیر نیازی به ردیف ثابت ندارند — به‌صورت پویا از جدول
               Game به کاتالوگ اضافه می‌شوند (ببین arenaCatalog در
               arena-server.ts).
   ساخت اتاق، فهرست اتاق‌ها، لابی، آماده/شروع، ربات‌ها، قاعده ۲ دقیقه،
   چت و استریم زنده — همه پروتکل مشترک آرنا هستند.
   ================================================================ */

import { ARENA_GAME_SLUG } from "@/lib/arena-game";
import { LUDO_GAME_SLUG } from "@/lib/ludo-shared";

export const BOT_ID_PREFIX = "bot-";

/** شناسه‌های ربات داخل اتاق به شکل bot-1 تا bot-8 هستند (کوئی اعضای واقعی نیست) */
export function isBotId(id: string): boolean {
  return id.startsWith(BOT_ID_PREFIX);
}

/** شماره ربات از شناسه — برای انتخاب نام یکتا در اتاق */
export function botSlot(id: string): number {
  const n = Number(id.slice(BOT_ID_PREFIX.length));
  return Number.isInteger(n) && n >= 1 && n <= 99 ? n : 0;
}

/** نام‌های نمایشی ربات‌ها — ثابت و قطعی؛ ترتیب = شماره جایگاه */
export const BOT_NAMES = [
  "رکس",
  "نیلا",
  "کاوه",
  "آرا",
  "سیاوش",
  "درنا",
  "ژوبین",
  "مهرک",
] as const;

export function botNameFor(slot: number): string {
  return BOT_NAMES[(slot - 1) % BOT_NAMES.length] ?? `ربات ${slot}`;
}

export const ROOM_CAPACITY_MAX = 8;
export const ROOM_CAPACITY_MIN = 2;

/** قاعده ۲ دقیقه آرنا: اگر اتاق پر نشود، از میزبان پرس می‌شود */
export const BOT_PROMPT_MS = 2 * 60_000;

/** نبرد تیمی «میدان آتش» — لابی با پروتکل آرنا، بازی با موتور WebRTC */
export const FIRE_TEAM_SLUG = "fire";

/** سقف زمان هر دور اتاق رکوردی — اگر میزبان پایان ندهد، خودکار تمام می‌شود */
export const SCORE_ROOM_MAX_MS = 15 * 60_000;

export type ArenaGameKind = "quiz" | "fire" | "score" | "nabard" | "ludo" | "fire-retired";

export type ArenaGameDef = {
  slug: string;
  kind: ArenaGameKind;
  titleFa: string;
  titleEn: string;
  descFa: string;
  descEn: string;
  /** کلید آیکون lucide — در UI با نقشه APP_ICONS رندر می‌شود */
  icon: string;
  /** کلید رنگ برای چیپ‌ها */
  color: "violet" | "lime" | "orange" | "emerald";
  minPlayers: number;
  maxPlayers: number;
  supportsBots: boolean;
  /** false = بازی بازنشسته شده؛ ساخت اتاق جدید برای آن ممکن نیست */
  active: boolean;
};

export const ARENA_GAMES: ArenaGameDef[] = [
  {
    slug: ARENA_GAME_SLUG,
    kind: "quiz",
    titleFa: "چالش سرعتی",
    titleEn: "Speed Quiz",
    descFa: "۱۰ سؤال؛ امتیاز هر پاسخ بسته به سرعت",
    descEn: "10 questions; faster answers score more",
    icon: "Swords",
    color: "violet",
    minPlayers: 2,
    maxPlayers: ROOM_CAPACITY_MAX,
    supportsBots: true,
    active: true,
  },
  {
    slug: FIRE_TEAM_SLUG,
    kind: "fire",
    titleFa: "میدان آتش",
    titleEn: "Fire Arena",
    descFa: "نبرد تیمی قرمز و آبی — شوتر زنده با ربات و پیوند مستقیم WebRTC",
    descEn: "Red vs blue team shooter — live action with bots over WebRTC",
    icon: "Flame",
    color: "orange",
    minPlayers: 2,
    maxPlayers: ROOM_CAPACITY_MAX,
    supportsBots: true,
    active: true,
  },
  {
    slug: LUDO_GAME_SLUG,
    kind: "ludo",
    titleFa: "منچ گروهی",
    titleEn: "Ludo Party",
    descFa: "منچ کلاسیک ۲ تا ۴ نفره با تاس، زدن مهره و خانه‌های سورپرایز",
    descEn: "Classic 2-4 player Ludo — dice, captures and surprise cells",
    icon: "Dices",
    color: "emerald",
    minPlayers: 2,
    maxPlayers: 4, // چهار رنگ — بیش از این معنا ندارد
    supportsBots: true,
    active: true,
  },
  {
    slug: "nabard-live",
    kind: "nabard",
    titleFa: "نبرد دایره‌ها (نسخه زنده)",
    titleEn: "Circle Battle (live)",
    descFa: "بازنشسته شده — اتاق‌های قدیمی تا پایان مسابقه باز می‌مانند",
    descEn: "Retired — existing rooms stay until the match ends",
    icon: "Zap",
    color: "lime",
    minPlayers: 2,
    maxPlayers: ROOM_CAPACITY_MAX,
    supportsBots: true,
    active: false,
  },
];

export function getArenaGameDef(slug: string): ArenaGameDef | null {
  return ARENA_GAMES.find((g) => g.slug === slug) ?? null;
}

/** فقط بازی‌های فعال برای ساخت اتاق جدید مجازند */
export const ACTIVE_ARENA_SLUGS = new Set(
  ARENA_GAMES.filter((g) => g.active).map((g) => g.slug),
);

/**
 * نوع بازی هر اتاق — مبنای شاخه‌بندی موتور و رندر.
 * ترتیب مهم است: اسلاگ‌های ثابت (کوئی/نبرد بازنشسته/میدان آتش بازنشسته)
 * اول بررسی می‌شوند؛ هر چیز دیگر یک بازی آپلودی است → اتاق رکوردی.
 */
export function arenaKindOf(slug: string): ArenaGameKind {
  if (slug === FIRE_TEAM_SLUG) return "fire";
  const def = getArenaGameDef(slug);
  if (def) return def.kind;
  if (slug === "fire-arena") return "fire-retired";
  return "score";
}

/** محدودکردن ظرفیت انتخابی میزبان به بازه مجاز بازی */
export function clampCapacity(raw: unknown, def: ArenaGameDef | null): number {
  const n = Math.trunc(Number(raw));
  const max = def?.maxPlayers ?? ROOM_CAPACITY_MAX;
  const min = def ? Math.max(def.minPlayers, ROOM_CAPACITY_MIN) : ROOM_CAPACITY_MIN;
  if (!Number.isFinite(n)) return max;
  return Math.min(max, Math.max(min, n));
}

/** هش قطعی ۳۲ بیتی — برای رفتارهای خودکار ربات‌ها بدون RNG مشترک */
export function hash32(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** امتیاز هدف ربات در اتاق رکوردی — قطعی از هش اتاق و ربات، داخل بازه بازی */
export function botScoreTarget(roomId: string, botId: string, min: number, max: number): number {
  const h = hash32(`${roomId}:${botId}:target`);
  if (max <= min) return min;
  return min + (h % (max - min + 1));
}

/** طول رمپ امتیاز ربات (میلی‌ثانیه) — قطعی؛ ربات‌ها با سرعت‌های متفاوت رکورد می‌زنند */
export function botScoreRampMs(roomId: string, botId: string): number {
  const h = hash32(`${roomId}:${botId}:ramp`);
  return 45_000 + (h % 90_000); // ۴۵ تا ۱۳۵ ثانیه
}

/** امتیاز لحظه‌ای ربات در اتاق رکوردی — صعودی با پله‌های قطعی */
export function botScoreAt(roomId: string, botId: string, startedAtMs: number, now: number, min: number, max: number): number {
  const target = botScoreTarget(roomId, botId, min, max);
  const ramp = botScoreRampMs(roomId, botId);
  const p = Math.max(0, Math.min(1, (now - startedAtMs) / ramp));
  /* پله‌ای: هر ربات امتیازش را در ۵ گام جمع می‌کند — مثل ثبت‌های تکراری بازی واقعی */
  const done = Math.min(5, Math.floor(p * 5));
  return Math.floor((target * done) / 5);
}
