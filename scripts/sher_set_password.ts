/* ابزار عملیاتی: ست/تغییر رمز اختصاصی بخش مدیریت شعر روی دیتابیس (Neon).
   طرح هش دقیقاً همان hashPassword در src/lib/admin.ts است (scrypt، salt 16 بایت).
   اجرا از ریشهٔ مخزن:
     npx esbuild --bundle --packages=external scripts/sher_set_password.ts \
       --outfile=.sher-pass.tmp.mjs --platform=node --format=esm --log-level=error \
       && DATABASE_URL=... SHER_PASSWORD=... node .sher-pass.tmp.mjs && rm .sher-pass.tmp.mjs
   ================================================================ */

import { randomBytes, scryptSync } from "node:crypto";
import { PrismaClient } from "@prisma/client";

/* همان hashPassword در src/lib/admin.ts — اینجا تکرار می‌شود چون admin.ts
   next/headers را import می‌کند و بیرون رانتایم Next بارگذاری نمی‌شود */
function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

async function main(): Promise<void> {
  const password = process.env.SHER_PASSWORD ?? "";
  if (!password) throw new Error("SHER_PASSWORD تنظیم نشده است.");
  if (password.length < 6) throw new Error("رمز کوتاه‌تر از حد مجاز است.");
  const db = new PrismaClient();
  try {
    await db.settings.upsert({
      where: { id: "main" },
      update: { sherPasswordHash: hashPassword(password) },
      create: { id: "main", sherPasswordHash: hashPassword(password) },
    });
    const row = await db.settings.findUnique({ where: { id: "main" } });
    console.log(
      "رمز بخش شعر ست شد —",
      "passwordHash:",
      row?.passwordHash ? "هست" : "خالی!",
      "| sherPasswordHash:",
      row?.sherPasswordHash ? `هست (${row.sherPasswordHash.split(":")[0].slice(0, 8)}…)` : "خالی!",
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error("خطا:", e instanceof Error ? e.message : e);
  process.exit(1);
});
