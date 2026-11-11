import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ADMIN_COOKIE, createToken, guard, hashPassword, verifyPassword } from "@/lib/admin";

/** تغییر رمز پنل مدیریت */
export async function PATCH(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;

  let body: { currentPassword?: unknown; newPassword?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "درخواست نامعتبر است." }, { status: 400 });
  }

  const { currentPassword, newPassword } = body;
  if (typeof currentPassword !== "string" || typeof newPassword !== "string") {
    return NextResponse.json({ error: "اطلاعات ناقص است." }, { status: 400 });
  }
  if (newPassword.length < 6) {
    return NextResponse.json(
      { error: "رمز جدید باید حداقل ۶ کاراکتر باشد." },
      { status: 400 }
    );
  }

  const settings = await db.settings.findUnique({ where: { id: "main" } });
  if (
    !settings?.passwordHash ||
    !verifyPassword(currentPassword, settings.passwordHash)
  ) {
    return NextResponse.json({ error: "رمز فعلی اشتباه است." }, { status: 401 });
  }

  const passwordHash = hashPassword(newPassword);
  await db.settings.update({ where: { id: "main" }, data: { passwordHash } });

  // صدور دوباره نشست تا کاربر لاگ‌out نشود (سکرت تغییر کرده است)
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, createToken(passwordHash), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });
  return res;
}
