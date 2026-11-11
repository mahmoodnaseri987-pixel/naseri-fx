import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/admin";
import {
  normalizeUsername,
  memberRateLimit,
  setMemberSession,
} from "@/lib/member-auth";
import { ensureSetup } from "@/lib/public-data";

/* ورود عضو — بدنه: { username, password } */
export async function POST(req: NextRequest) {
  await ensureSetup();

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  if (!memberRateLimit(`login:${ip}`)) {
    return NextResponse.json(
      { error: "تلاش‌های زیادی انجام شده؛ چند دقیقه بعد دوباره امتحان کنید." },
      { status: 429 },
    );
  }

  let body: { username?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "درخواست نامعتبر است." }, { status: 400 });
  }

  const username = typeof body.username === "string" ? normalizeUsername(body.username) : null;
  const password = typeof body.password === "string" ? body.password : "";

  if (!username || !password) {
    return NextResponse.json(
      { error: "شماره موبایل/ایمیل و رمز عبور را وارد کنید." },
      { status: 400 },
    );
  }

  const member = await db.member.findUnique({ where: { username } });
  if (!member || !verifyPassword(password, member.passwordHash)) {
    return NextResponse.json({ error: "شناسه ورود یا رمز عبور اشتباه است." }, { status: 401 });
  }
  if (member.blocked) {
    return NextResponse.json(
      { error: "دسترسی این حساب توسط مدیر سایت مسدود شده است." },
      { status: 403 },
    );
  }

  await db.member.update({
    where: { id: member.id },
    data: { lastLoginAt: new Date() },
  });
  await setMemberSession(member.id);

  return NextResponse.json({
    member: {
      id: member.id,
      name: member.name,
      username: member.username,
      createdAt: member.createdAt.toISOString(),
    },
  });
}
