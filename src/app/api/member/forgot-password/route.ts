import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/db";
import { normalizeUsername, memberRateLimit } from "@/lib/member-auth";
import { ensureSetup } from "@/lib/public-data";
import { encryptCode, getMailConfig, hashResetCode, maskIdentifier, sendEmail, sendSms } from "@/lib/notify";

/* درخواست کد بازیابی رمز — بدنه: { username }
   پاسخ همیشه ok است تا وجود/نبودِ حساب فاش نشود.
   کانال ارسال: پیامک (کاوه‌نگار) یا ایمیل (Resend) — و اگر سرویسی
   تنظیم نشده باشد، کد در پنل مدیریت دیده می‌شود تا مدیر به عضو برساند. */

const CODE_TTL_MS = 10 * 60 * 1000; // ۱۰ دقیقه

export async function POST(req: NextRequest) {
  await ensureSetup();

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  if (!memberRateLimit(`forgot:${ip}`, 5)) {
    return NextResponse.json(
      { error: "تلاش‌های زیادی انجام شده؛ چند دقیقه بعد دوباره امتحان کنید." },
      { status: 429 },
    );
  }

  let body: { username?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "درخواست نامعتبر است." }, { status: 400 });
  }

  const username = typeof body.username === "string" ? normalizeUsername(body.username) : null;
  if (!username) {
    return NextResponse.json(
      { error: "شناسه ورود باید شماره موبایل (۰۹...) یا ایمیل معتبر باشد." },
      { status: 400 },
    );
  }

  /* سیل درخواست برای یک شناسه — از انفجار ردیف دیتابیس جلوگیری می‌کند */
  memberRateLimit(`forgot-id:${username}`, 4, 15 * 60 * 1000);

  const isPhone = !username.includes("@");
  /* کانال ایمیل: کلید پنل (SiteContent) یا env — هرکدام که باشد */
  const mailCfg = await getMailConfig();
  let channel: "sms" | "email" | "admin" = isPhone
    ? process.env.KAVENEGAR_API_KEY
      ? "sms"
      : "admin"
    : mailCfg.apiKey
      ? "email"
      : "admin";

  const member = await db.member.findUnique({ where: { username } });
  if (!member || member.blocked) {
    /* حساب نیست یا مسدود است — همان پاسخ عمومی برگردد */
    return NextResponse.json({ ok: true, channel, masked: maskIdentifier(username) });
  }

  /* کدهای قبلیِ استفاده‌نشدهٔ این شناسه باطل می‌شوند */
  await db.passwordReset.deleteMany({ where: { username, usedAt: null } });

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  let delivered = false;
  if (channel === "sms") {
    delivered = await sendSms(
      member.username,
      `ناصری | Naseri\nکد بازیابی رمز عبور: ${code}\nاعتبار: ۱۰ دقیقه`,
    );
  } else if (channel === "email") {
    delivered = await sendEmail(
      member.username,
      "بازیابی رمز عبور | ناصری",
      `سلام ${member.name}،\n\nکد بازیابی رمز عبور شما: ${code}\nاین کد ۱۰ دقیقه اعتبار دارد.\n\nاگر شما درخواست نداده‌اید این پیام را نادیده بگیرید.`,
    );
  }
  if (!delivered) channel = "admin"; // سرویس تنظیم نیست یا خطا داد → کد از پنل مدیریت

  await db.passwordReset.create({
    data: {
      username,
      memberId: member.id,
      codeHash: await hashResetCode(username, code),
      codeEnc: await encryptCode(code),
      channel,
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
    },
  });

  return NextResponse.json({ ok: true, channel, masked: maskIdentifier(username) });
}
