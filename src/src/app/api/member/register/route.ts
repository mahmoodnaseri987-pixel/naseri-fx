import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/admin";
import {
  normalizeUsername,
  memberRateLimit,
  setMemberSession,
} from "@/lib/member-auth";
import { ensureSetup } from "@/lib/public-data";
import { parseAvatar, avatarDataUrl } from "@/lib/avatar";

/* ثبت‌نام عضو جدید — بدنه: { name, username, password, avatar } */
export async function POST(req: NextRequest) {
  await ensureSetup();

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  if (!memberRateLimit(`register:${ip}`, 5)) {
    return NextResponse.json(
      { error: "تلاش‌های زیادی انجام شده؛ چند دقیقه بعد دوباره امتحان کنید." },
      { status: 429 },
    );
  }

  let body: { name?: unknown; username?: unknown; password?: unknown; avatar?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "درخواست نامعتبر است." }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim().slice(0, 60) : "";
  const username = typeof body.username === "string" ? normalizeUsername(body.username) : null;
  const password = typeof body.password === "string" ? body.password : "";

  if (!name) {
    return NextResponse.json({ error: "نام را وارد کنید." }, { status: 400 });
  }
  if (!username) {
    return NextResponse.json(
      { error: "شناسه ورود باید شماره موبایل (۰۹...) یا ایمیل معتبر باشد." },
      { status: 400 },
    );
  }
  if (password.length < 6) {
    return NextResponse.json(
      { error: "رمز عبور باید حداقل ۶ کاراکتر باشد." },
      { status: 400 },
    );
  }

  /* عکس پروفایل اختیاری است — قبل از اولین اجرای بازی با گیت عکس گرفته می‌شود */
  let avatarUrl = "";
  if (body.avatar !== undefined && body.avatar !== null && body.avatar !== "") {
    const parsedAvatar = parseAvatar(body.avatar);
    if (parsedAvatar) {
      avatarUrl = avatarDataUrl(parsedAvatar);
    }
  }

  const exists = await db.member.findUnique({ where: { username } });
  if (exists) {
    return NextResponse.json(
      { error: "این شماره/ایمیل قبلاً ثبت‌نام کرده؛ وارد شوید." },
      { status: 409 },
    );
  }

  const member = await db.member.create({
    data: {
      name,
      username,
      passwordHash: hashPassword(password),
      avatarUrl,
      lastLoginAt: new Date(),
    },
  });

  await setMemberSession(member.id);

  return NextResponse.json(
    {
      member: {
        id: member.id,
        name: member.name,
        username: member.username,
        avatarUrl: member.avatarUrl,
        createdAt: member.createdAt.toISOString(),
      },
    },
    { status: 201 },
  );
}
