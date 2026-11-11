import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSetup } from "@/lib/public-data";
import { ADMIN_COOKIE, createToken, rateLimit, verifyPassword } from "@/lib/admin";

export async function POST(req: NextRequest) {
  await ensureSetup();
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
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
  if (
    !settings?.passwordHash ||
    typeof password !== "string" ||
    !verifyPassword(password, settings.passwordHash)
  ) {
    return NextResponse.json({ error: "رمز عبور اشتباه است." }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, createToken(settings.passwordHash), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });
  return res;
}
