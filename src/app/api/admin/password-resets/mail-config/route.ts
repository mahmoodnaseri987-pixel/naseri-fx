import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guard } from "@/lib/admin";
import { ensureSetup } from "@/lib/public-data";
import { encryptSecret, getMailConfig } from "@/lib/notify";

/* تنظیمات ایمیل بازیابی رمز (Resend) از خود پنل — کلید API رمزنگاری‌شده
   (AES-256-GCM) در SiteContent ذخیره می‌شود و هرگز به خروجی عمومی نمی‌رود.
   GET  → وضعیت فعلی (کلید فقط به‌شکل پوشانده‌شده)
   POST → ذخیرهٔ کلید/فرستنده یا پاک‌کردن تنظیمات */

const MAIL_KEY_ROW = "mail_resend_key";
const MAIL_FROM_ROW = "mail_from";
const RESEND_KEY_RE = /^re_[A-Za-z0-9_-]{8,}$/;

function maskKey(key: string): string | null {
  if (key.length <= 10) return "re_…";
  return `${key.slice(0, 6)}…${key.slice(-4)}`;
}

async function currentConfig() {
  const cfg = await getMailConfig();
  return {
    configured: cfg.source !== "none",
    source: cfg.source,
    from: cfg.from,
    keyMasked: cfg.apiKey ? maskKey(cfg.apiKey) : null,
  };
}

export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  await ensureSetup();
  return NextResponse.json(await currentConfig());
}

export async function POST(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;
  await ensureSetup();

  let body: { apiKey?: unknown; from?: unknown; clear?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "درخواست نامعتبر است." }, { status: 400 });
  }

  /* پاک‌کردن کامل تنظیمات پنل — برگشت به env (اگر باشد) */
  if (body.clear === true) {
    await db.siteContent.deleteMany({
      where: { key: { in: [MAIL_KEY_ROW, MAIL_FROM_ROW] } },
    });
    return NextResponse.json({ ok: true, cleared: true, ...(await currentConfig()) });
  }

  const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  const from = typeof body.from === "string" ? body.from.trim() : "";

  if (!apiKey && !from) {
    return NextResponse.json(
      { error: "چیزی برای ذخیره نیست؛ کلید API یا فرستنده را وارد کنید." },
      { status: 400 },
    );
  }

  if (apiKey && !RESEND_KEY_RE.test(apiKey)) {
    return NextResponse.json(
      { error: "قالب کلید درست نیست؛ کلیدهای Resend با «re_» شروع می‌شوند (resend.com/api-keys)." },
      { status: 400 },
    );
  }

  if (from) {
    /* فرستنده باید ایمیل داشته باشد — مثل «Naseri <no-reply@domain.com>» یا فقط ایمیل */
    const emailMatch = from.match(/<([^>]+)>/)?.[1] ?? from;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailMatch)) {
      return NextResponse.json(
        { error: "فرستنده باید یک ایمیل معتبر داشته باشد؛ مثل Entertainment Café <no-reply@domain.com>" },
        { status: 400 },
      );
    }
  }

  if (apiKey) {
    await db.siteContent.upsert({
      where: { key: MAIL_KEY_ROW },
      update: { value: await encryptSecret(apiKey) },
      create: { key: MAIL_KEY_ROW, value: await encryptSecret(apiKey) },
    });
  }
  if (from) {
    await db.siteContent.upsert({
      where: { key: MAIL_FROM_ROW },
      update: { value: from.slice(0, 200) },
      create: { key: MAIL_FROM_ROW, value: from.slice(0, 200) },
    });
  }

  return NextResponse.json({ ok: true, ...(await currentConfig()) });
}
