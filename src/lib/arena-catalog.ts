/* ================================================================
   کاتالوگ بازی‌های آرنا — تعریف ثابت + تنظیمات مدیر (ترتیب/فعالیت)
   ================================================================
   بازی‌های آرنا در کد تعریف می‌شوند اما «ترتیب نمایش» و «فعال/غیرفعال»
   بودنشان در جدول ArenaGameConfig ذخیره می‌شود تا مدیر از پنل، بازی‌ها را
   جابجا یا از فهرست حذف/بازگردانی کند. اگر رکوردی نبود، پیش‌فرض =
   فعال به‌ترتیب همین فایل.
   ================================================================ */

import { db } from "@/lib/db";
import { ARENA_GAME_SLUG } from "@/lib/arena-game";
import { NABARD_GAME_SLUG } from "@/lib/nabard-engine";
import { JADVAL_GAME_SLUG } from "@/lib/jadval-shared";
import { PIC_GAME_SLUG } from "@/lib/pic-shared";
import { LUDO_GAME_SLUG } from "@/lib/ludo-shared";
import { SHER_GAME_SLUG } from "@/lib/sher-shared";
import { PC_GAME_SLUG } from "@/lib/proverb-shared";

export type CatalogGameKind = "room" | "banner"; // banner = کارت ویژهٔ لابی (آتش آفلاین)

export type CatalogGame = {
  slug: string;
  kind: CatalogGameKind;
  titleFa: string;
  titleEn: string;
  descFa: string;
  descEn: string;
  icon: "swords" | "zap" | "grid" | "image" | "flame" | "dice" | "music" | "shapes";
  enabled: boolean;
  sortOrder: number;
};

/* فهرست ثابت — ترتیب این آرایه، پیش‌فرض لابی است */
export const ARENA_CATALOG_DEFS: Omit<CatalogGame, "enabled" | "sortOrder">[] = [
  {
    slug: ARENA_GAME_SLUG,
    kind: "room",
    titleFa: "چالش سرعتی",
    titleEn: "Speed Quiz",
    descFa: "۲۰ سؤال؛ امتیاز هر پاسخ بسته به سرعت",
    descEn: "20 questions; faster answers score more",
    icon: "swords",
  },
  {
    slug: NABARD_GAME_SLUG,
    kind: "room",
    titleFa: "نبرد دایره‌ها",
    titleEn: "Circle Battle",
    descFa: "آرنای زنده بقا — آخرین دایره برنده است",
    descEn: "Live survival arena — last circle wins",
    icon: "zap",
  },
  {
    slug: JADVAL_GAME_SLUG,
    kind: "room",
    titleFa: "رقابت جدول",
    titleEn: "Crossword Race",
    descFa: "جدول کلاسیک تیمی — دو تیم، یک جدول، چت مخفی هر تیم",
    descEn: "Team crossword — two teams, one grid, secret team chat",
    icon: "grid",
  },
  {
    slug: PIC_GAME_SLUG,
    kind: "room",
    titleFa: "حدس تصویر",
    titleEn: "Guess the Picture",
    descFa: "پازل ایموجی، سرعت واکنش — اولین پاسخ درست صاحب امتیاز است",
    descEn: "Emoji puzzle — first correct answer takes the point",
    icon: "image",
  },
  {
    slug: LUDO_GAME_SLUG,
    kind: "room",
    titleFa: "منچ گروهی",
    titleEn: "Ludo Party",
    descFa: "منچ کلاسیک ۲ تا ۴ نفره — ورود با ۶، زدن مهره و ۵ خانهٔ سورپرایز",
    descEn: "Classic Ludo for 2-4 — enter with a 6, captures, 5 surprise cells",
    icon: "dice",
  },
  {
    slug: SHER_GAME_SLUG,
    kind: "room",
    titleFa: "شعر یادت نره",
    titleEn: "Finish the Song",
    descFa: "کلیپ آهنگ قطع می‌شود — بیت بعدی را سریع‌تر از بقیه حدس بزن",
    descEn: "The clip cuts mid-song — guess the next line before the others",
    icon: "music",
  },
  {
    slug: PC_GAME_SLUG,
    kind: "room",
    titleFa: "ضرب‌المثل‌چین",
    titleEn: "Proverb Craft",
    descFa: "ضرب‌المثل به کارت‌های کلمه‌ای متحرک شکسته می‌شود — صحنه را بچین، بقیه ضرب‌المثل را حدس بزنند",
    descEn: "Proverbs broken into animated word cards — arrange the scene, let them guess",
    icon: "grid",
  },
  {
    slug: "fire-offline",
    kind: "banner",
    titleFa: "میدان آتش (تک‌نفره)",
    titleEn: "Fire Arena (solo)",
    descFa: "شوتر اکشن آفلاین — کارت ویژهٔ بالای لابی",
    descEn: "Offline action shooter — lobby banner card",
    icon: "flame",
  },
];

const CATALOG_SLUGS = new Set(ARENA_CATALOG_DEFS.map((g) => g.slug));

/** کاتالوگ نهایی — ادغای تعریف ثابت با تنظیمات مدیر، مرتب بر اساس sortOrder */
export async function getArenaCatalog(): Promise<CatalogGame[]> {
  const configs = await db.arenaGameConfig.findMany();
  const map = new Map(configs.map((c) => [c.slug, c]));

  const merged = ARENA_CATALOG_DEFS.map((def, index) => {
    const cfg = map.get(def.slug);
    return {
      ...def,
      enabled: cfg?.enabled ?? true,
      sortOrder: cfg?.sortOrder ?? index * 10,
    };
  });

  return merged.sort((a, b) => a.sortOrder - b.sortOrder || a.slug.localeCompare(b.slug));
}

/** آیا ساخت اتاق جدید برای این بازی مجاز است؟ */
export async function isRoomGameEnabled(slug: string): Promise<boolean> {
  const cfg = await db.arenaGameConfig.findUnique({ where: { slug } });
  return cfg?.enabled ?? true;
}

/**
 * ذخیرهٔ تنظیمات بازی‌ها از پنل — آرایه به‌ترتیب نمایشی؛ sortOrder = جایگاه.
 * همهٔ اسلاگ‌های کاتالوگ باید دقیقاً یک‌بار آمده باشند.
 */
export async function saveArenaGameConfigs(
  games: { slug: string; enabled: boolean }[],
): Promise<CatalogGame[] | null> {
  if (!Array.isArray(games) || games.length !== ARENA_CATALOG_DEFS.length) return null;
  const seen = new Set<string>();
  for (const g of games) {
    if (typeof g.slug !== "string" || typeof g.enabled !== "boolean" || !CATALOG_SLUGS.has(g.slug)) {
      return null;
    }
    if (seen.has(g.slug)) return null;
    seen.add(g.slug);
  }
  if (seen.size !== CATALOG_SLUGS.size) return null;

  for (let i = 0; i < games.length; i++) {
    const g = games[i];
    await db.arenaGameConfig.upsert({
      where: { slug: g.slug },
      update: { enabled: g.enabled, sortOrder: i * 10 },
      create: { slug: g.slug, enabled: g.enabled, sortOrder: i * 10 },
    });
  }
  return getArenaCatalog();
}
