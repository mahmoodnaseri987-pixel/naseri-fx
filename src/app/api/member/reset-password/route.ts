import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/admin";
import { normalizeUsername, memberRateLimit } from "@/lib/member-auth";
import { ensureSetup } from "@/lib/public-data";
import { hashResetCode, safeEqualHex } from "@/lib/notify";

/* ثبت رمز جدید با کد بازیابی — بدنه: { username, code, password }
   حداکثر ۵ تلاش برای هر کد؛ کد ۱۰ دقیقه اعتبار دارد و با موفقیت مصرف می‌شود. */

const MAX_ATTEMPTS = 5;

export async function POST(req: NextRequest) {
  await ensureSetup();

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  if (!memberRateLimit(`reset:${ip}`, 10)) {
    return NextResponse.json(
      { error: "تلاش‌های زیادی انجام شده؛ چند دقیقه بعد دوباره امتحان کنید." },
      { status: 429 },
    );
  }

  let body: { username?: unknown; code?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "درخواست نامعتبر است." }, { status: 400 });
  }

  const username = typeof body.username === "string" ? normalizeUsername(body.username) : null;
  const code = typeof body.code === "string" ? body.code.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!username || !/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: "کد بازیابی ۶ رقمی را درست وارد کنید." }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "رمز عبور باید حداقل ۶ کاراکتر باشد." }, { status: 400 });
  }

  const member = await db.member.findUnique({ where: { username } });
  if (!member || member.blocked) {
    return NextResponse.json({ error: "کد نامعتبر یا منقضی شده است." }, { status: 400 });
  }

  const row = await db.passwordReset.findFirst({
    where: { username, usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!row) {
    return NextResponse.json({ error: "کد نامعتبر یا منقضی شده است." }, { status: 400 });
  }
  if (row.attempts >= MAX_ATTEMPTS) {
    return NextResponse.json(
      { error: "تلاش‌های زیادی برای این کد انجام شده؛ دوباره کد بگیرید." },
      { status: 429 },
    );
  }

  const candidate = await hashResetCode(username, code);
  if (!safeEqualHex(candidate, row.codeHash)) {
    await db.passwordReset.update({
      where: { id: row.id },
      data: { attempts: { increment: 1 } },
    });
    return NextResponse.json({ error: "کد نامعتبر یا منقضی شده است." }, { status: 400 });
  }

  /* رمز جدید ثبت و کد مصرف می‌شود؛ بقیهٔ کدهای این شناسه پاک می‌شوند */
  await db.$transaction([
    db.member.update({ where: { id: member.id }, data: { passwordHash: hashPassword(password) } }),
    db.passwordReset.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
    db.passwordReset.deleteMany({ where: { username, usedAt: null } }),
  ]);

  return NextResponse.json({ ok: true });
}
