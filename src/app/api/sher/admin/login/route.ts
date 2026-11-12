import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSetup } from "@/lib/public-data";
import { createToken, rateLimit, verifyPassword } from "@/lib/admin";
import { SHER_COOKIE } from "@/lib/sher-auth";

/* ورود به بخش مدیریت شعر با رمز اختصاصی — جدا از رمز مدیر کل سایت.
   کوکی naseri_sher با HMAC مشتق‌شده از هش رمز فعلی ست می‌شود؛
   با تغییر رمز، همهٔ نشست‌های قبلی باطل می‌شوند. */

export async function POST(req: NextRequest) {
  await ensureSetup();
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!rateLimit(ip)) {
    return NextResponse.json(
      { error: "تلاش‌های زیاد؛ لطفاً ۱۰ دقیقه بعد دوباره امتحان کنید." },
      { status: 429 }
    );
  }

  let password: unknown;
  try {
    ({ password } = await req.json());
  } catch {
    return NextResponse.json({ error: "درخواست نامعتبر است." }, { status: 400 });
  }

  const settings = await db.settings.findUnique({ where: { id: "main" } });
  if (!settings?.sherPasswordHash) {
    return NextResponse.json(
      { error: "رمز بخش شعر هنوز تنظیم نشده است." },
      { status: 503 }
    );
  }

  if (typeof password !== "string" || !verifyPassword(password, settings.sherPasswordHash)) {
    await new Promise((r) => setTimeout(r, 400)); // کند کردن حملات جست‌وجوی رمز
    return NextResponse.json({ error: "رمز نادرست است." }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SHER_COOKIE, createToken(settings.sherPasswordHash), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });
  return res;
}
