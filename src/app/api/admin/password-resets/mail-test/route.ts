import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guard } from "@/lib/admin";
import { ensureSetup } from "@/lib/public-data";
import { getMailConfig, sendEmailVia } from "@/lib/notify";

/* ارسال آزمایشی ایمیل با تنظیمات ذخیره‌شدهٔ پنل — خطای واقعی سرویس
   (مثل محدودیت حساب آزمایشی Resend) عیناً به پنل برگردانده می‌شود. */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;
  await ensureSetup();

  let body: { to?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    /* بدنهٔ خالی هم مجاز است */
  }

  const cfg = await getMailConfig();
  if (!cfg.apiKey) {
    return NextResponse.json(
      { ok: false, error: "اول کلید API را ذخیره کنید؛ کلیدی تنظیم نشده است." },
      { status: 400 },
    );
  }

  /* گیرنده: ورودی پنل، وگرنه ایمیل تماس سایت، وگرنه همان ایمیل داخل فرستنده */
  const fromEmail = cfg.from.match(/<([^>]+)>/)?.[1] ?? cfg.from;
  const to =
    (typeof body.to === "string" && body.to.trim()) ||
    (await db.settings.findUnique({ where: { id: "main" }, select: { email: true } }))?.email ||
    fromEmail;

  if (!EMAIL_RE.test(to)) {
    return NextResponse.json(
      { ok: false, error: "ایمیل گیرندهٔ آزمایشی معتبر نیست." },
      { status: 400 },
    );
  }

  const result = await sendEmailVia(
    cfg.apiKey,
    cfg.from,
    to,
    "ایمیل آزمایشی | کافه سرگرمی",
    "این یک ایمیل آزمایشی از پنل مدیریت کافه سرگرمی است.\nاگر این پیام را می‌بینید، تنظیمات ایمیل بازیابی رمز درست است.",
  );

  if (!result.ok) {
    return NextResponse.json({ ok: false, to, status: result.status, error: result.error });
  }
  return NextResponse.json({ ok: true, to });
}
