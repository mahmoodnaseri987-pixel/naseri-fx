/* داده‌های عمومی سایت + مقداردهی اولیه خودکار دیتابیس */
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/admin";
import { DEMO_GAME_SLUG, DEMO_GAME_HTML } from "@/lib/demo-game";
import type {
  ContactInfo,
  ContactInfoWithAppearance,
  PublicApp,
  PublicBox,
  PublicGame,
  SiteContentMap,
} from "@/lib/types";

let setupPromise: Promise<void> | null = null;

/* اولین اپ‌های سایت — با همان داده‌های قبلی منتشر می‌شوند */
const DEFAULT_APPS = [
  {
    nameFa: "قسط‌یار",
    nameEn: "GhestYar",
    categoryFa: "مدیریت مالی",
    categoryEn: "Personal finance",
    descFa: "یادآوری و مدیریت اقساط، چک‌ها و بدهی‌ها با گزارش ساده و هوشمند",
    descEn: "Track installments, checks and debts with smart reminders",
    icon: "Wallet",
    color: "emerald",
    installsFa: "۸۵ هزار",
    installsEn: "85K",
    rating: "4.7",
    bazaarUrl: "https://cafebazaar.ir/app/com.naseri.hesyaryar",
    playUrl: "https://play.google.com/store/apps/details?id=dev.naseri.app",
    published: true,
    sortOrder: 10,
  },
  {
    nameFa: "حساب‌چی",
    nameEn: "HesabChi",
    categoryFa: "تقسیم حساب گروهی",
    categoryEn: "Group expenses",
    descFa: "حساب و حساب‌پاک‌کردن هزینه‌های سفر و مهمانی بدون دعوا و کاغذبازی",
    descEn: "Split travel and party costs with friends — without the drama",
    icon: "Users",
    color: "cyan",
    installsFa: "۶۲ هزار",
    installsEn: "62K",
    rating: "4.8",
    bazaarUrl: "https://cafebazaar.ir/app/com.naseri.hesyaryar",
    playUrl: "https://play.google.com/store/apps/details?id=dev.naseri.app",
    published: true,
    sortOrder: 20,
  },
  {
    nameFa: "واژه‌یار",
    nameEn: "VazheYar",
    categoryFa: "یادگیری زبان",
    categoryEn: "Language learning",
    descFa: "باکس لایتنر هوشمند برای حفظ واژگان؛ روزی ده دقیقه، هر روز",
    descEn: "Smart Leitner box for vocabulary; ten minutes a day",
    icon: "Languages",
    color: "violet",
    installsFa: "۴۸ هزار",
    installsEn: "48K",
    rating: "4.9",
    bazaarUrl: "https://cafebazaar.ir/app/com.naseri.hesyaryar",
    playUrl: "https://play.google.com/store/apps/details?id=dev.naseri.app",
    published: true,
    sortOrder: 30,
  },
  {
    nameFa: "تمرین‌یار",
    nameEn: "TamrinYar",
    categoryFa: "ورزش و سلامت",
    categoryEn: "Fitness",
    descFa: "برنامه و ثبت تمرین‌های باشگاه با نمودار پیشرفت هفتگی",
    descEn: "Plan and log gym workouts with weekly progress charts",
    icon: "Dumbbell",
    color: "amber",
    installsFa: "۳۱ هزار",
    installsEn: "31K",
    rating: "4.6",
    bazaarUrl: "https://cafebazaar.ir/app/com.naseri.hesyaryar",
    playUrl: "https://play.google.com/store/apps/details?id=dev.naseri.app",
    published: true,
    sortOrder: 40,
  },
  {
    nameFa: "قلم‌دون",
    nameEn: "Ghalamdoun",
    categoryFa: "یادداشت",
    categoryEn: "Notes",
    descFa: "یادداشت سریع با قفل اثرانگشت و جستجوی آنی در همه یادداشت‌ها",
    descEn: "Quick notes with fingerprint lock and instant search",
    icon: "NotebookPen",
    color: "rose",
    installsFa: "۱۹ هزار",
    installsEn: "19K",
    rating: "4.7",
    bazaarUrl: "https://cafebazaar.ir/app/com.naseri.hesyaryar",
    playUrl: "https://play.google.com/store/apps/details?id=dev.naseri.app",
    published: true,
    sortOrder: 50,
  },
];

const DEFAULT_PASSWORD = "naseri1404"; // رمز اولیه پنل — از پنل قابل تغییر است

async function setup() {
  const settings = await db.settings.findUnique({ where: { id: "main" } });
  if (!settings) {
    await db.settings.create({
      data: {
        id: "main",
        telegram: "naseri_dev",
        whatsapp: "989120000000",
        email: "hello@naseri.dev",
        instagram: "naseri.dev",
        passwordHash: hashPassword(DEFAULT_PASSWORD),
      },
    });
  }
  const count = await db.app.count();
  if (count === 0) {
    await db.app.createMany({ data: DEFAULT_APPS });
  }

  /* بازی نمونه — فقط اولین بار ساخته می‌شود؛ از پنل قابل ویرایش/حذف است */
  const gameCount = await db.game.count();
  if (gameCount === 0) {
    await db.game.create({
      data: {
        slug: DEMO_GAME_SLUG,
        titleFa: "حدس واژه",
        titleEn: "Word Guess",
        descFa: "با راهنما واژه را حدس بزن و امتیاز جمع کن",
        descEn: "Guess the word from its hint and build your score",
        icon: "Gamepad2",
        color: "violet",
        html: DEMO_GAME_HTML,
        sizeBytes: Buffer.byteLength(DEMO_GAME_HTML, "utf8"),
        published: true,
        sortOrder: 10,
      },
    });
  }
}

/** یک‌بار در هر پروسه اجرا می‌شود؛ جدول‌های خالی را پر می‌کند */
export function ensureSetup(): Promise<void> {
  if (!setupPromise) {
    setupPromise = setup().catch((err) => {
      setupPromise = null;
      throw err;
    });
  }
  return setupPromise;
}

export async function getPublishedApps(): Promise<PublicApp[]> {
  await ensureSetup();
  const rows = await db.app.findMany({
    where: { published: true },
    orderBy: { sortOrder: "asc" },
  });
  return rows.map(({ published: _p, createdAt: _c, updatedAt: _u, ...rest }) => rest);
}

export async function getSettings(): Promise<ContactInfo> {
  await ensureSetup();
  const s = await db.settings.findUnique({ where: { id: "main" } });
  return {
    telegram: s?.telegram ?? "",
    whatsapp: s?.whatsapp ?? "",
    email: s?.email ?? "",
    instagram: s?.instagram ?? "",
  };
}

/** اطلاعات تماس + ظاهر سایت (لوگو، بنر، موشن گرافیک) */
export async function getFullSettings(): Promise<ContactInfoWithAppearance> {
  await ensureSetup();
  const s = await db.settings.findUnique({ where: { id: "main" } });
  return {
    telegram: s?.telegram ?? "",
    whatsapp: s?.whatsapp ?? "",
    email: s?.email ?? "",
    instagram: s?.instagram ?? "",
    logoUrl: s?.logoUrl ?? "",
    bannerUrl: s?.bannerUrl ?? "",
    aboutImageUrl: s?.aboutImageUrl ?? "",
    motionUrl: s?.motionUrl ?? "",
    motionTitleFa: s?.motionTitleFa ?? "",
    motionTitleEn: s?.motionTitleEn ?? "",
  };
}

/** متن‌های ویرایش‌شده سایت — فقط کلیدهای دارای مقدار برگردانده می‌شود
    کلیدهای mail_* (رازهای پنل مثل کلید Resend) هرگز به خروجی عمومی نمی‌روند */
export async function getSiteContent(): Promise<SiteContentMap> {
  await ensureSetup();
  const rows = await db.siteContent.findMany();
  const map: SiteContentMap = {};
  for (const row of rows) {
    if (row.key.startsWith("mail_")) continue;
    if (row.value.trim() !== "") map[row.key] = row.value;
  }
  return map;
}

/** بازی‌های منتشرشده به ترتیب نمایش */
export async function getPublishedGames(): Promise<PublicGame[]> {
  await ensureSetup();
  const rows = await db.game.findMany({
    where: { published: true },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      slug: true,
      titleFa: true,
      titleEn: true,
      descFa: true,
      descEn: true,
      icon: true,
      color: true,
      coverUrl: true,
      plays: true,
      sortOrder: true,
    },
  });
  return rows;
}

/** باکس‌های محتوایی منتشرشده به ترتیب نمایش */
export async function getPublishedBoxes(): Promise<PublicBox[]> {
  await ensureSetup();
  const rows = await db.contentBox.findMany({
    where: { published: true },
    orderBy: { sortOrder: "asc" },
  });
  return rows.map(({ published: _p, createdAt: _c, updatedAt: _u, ...rest }) => rest);
}

export { DEFAULT_PASSWORD };
