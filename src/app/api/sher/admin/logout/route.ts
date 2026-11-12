import { NextResponse } from "next/server";
import { SHER_COOKIE } from "@/lib/sher-auth";

/* خروج از بخش مدیریت شعر — فقط کوکی شعر پاک می‌شود؛ نشست مدیر کل دست‌نخورده می‌ماند */

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SHER_COOKIE, "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
