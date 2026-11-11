import { readFileSync } from "fs";
import { PrismaClient } from '@prisma/client'

/* مقدار DATABASE_URL داخل فایل .env بر متغیر محیطی قدیمی سندباکس اولویت دارد.
   در محیط‌های ابری مثل Vercel فایل .env وجود ندارد و همین تابع بی‌اثر است؛
   آن‌جا مقدار از Environment Variables پنل Vercel خوانده می‌شود. */
function applyEnvFileOverride() {
  if (process.env.VERCEL) return; // روی Vercel همیشه متغیرهای پنل مرجع است
  try {
    for (const line of readFileSync(".env", "utf-8").split("\n")) {
      const m = line.match(/^\s*DATABASE_URL\s*=\s*(\S+)\s*$/);
      if (m && /^postgresql?:\/\//.test(m[1])) {
        process.env.DATABASE_URL = m[1];
      }
    }
  } catch {
    /* بدون فایل .env — نادیده بگیر */
  }
}

applyEnvFileOverride();

/* در Vercel متغیر DATABASE_URL مستقیم تعریف نشده است؛ در این حالت از
   متغیرهای خودکار اتصال Neon (تعریف‌شده در Environment Variables پروژه) استفاده می‌شود. */
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL =
    process.env.DATABASE_URL_POSTGRES_PRISMA_URL ||
    process.env.DATABASE_URL_POSTGRES_URL ||
    process.env.DATABASE_URL_POSTGRES_URL_NON_POOLING ||
    process.env.DATABASE_URL_DATABASE_URL ||
    "";
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
