/* احراز هویت اختصاصی بخش مدیریت شعر — رمز مستقل از مدیر کل سایت.
   page هم import می‌کند، پس "server-only" ندارد؛ خودش سروری است. */
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAuthed, verifyToken } from "@/lib/admin";

export const SHER_COOKIE = "naseri_sher";

/** کوکی رمز بخش شعر معتبر است؟ — هش خالی یعنی این بخش قفل است و false برمی‌گردد */
export async function sherCookieValid(): Promise<boolean> {
  const settings = await db.settings.findUnique({ where: { id: "main" } });
  if (!settings?.sherPasswordHash) return false;
  const store = await cookies();
  const token = store.get(SHER_COOKIE)?.value;
  return verifyToken(token, settings.sherPasswordHash);
}

/** برای APIهای مدیریت شعر: null یعنی مجاز (مدیر کل یا رمز شعر)، وگرنه پاسخ 401 */
export async function sherGuard(): Promise<NextResponse | null> {
  if (await getAuthed()) return null;
  if (await sherCookieValid()) return null;
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}
