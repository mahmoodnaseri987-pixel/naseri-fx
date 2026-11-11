/* بازسازی سایت از پنل مدیریت — با «Deploy Hook» ورکسل.
   مدیر در ورکسل یک Deploy Hook می‌سازد (Project → Settings → Git → Deploy Hooks)
   و آدرسش را همین‌جا ذخیره می‌کند؛ آدرس رمزنگاری‌شده (AES-256-GCM) در SiteContent
   ذخیره می‌شود و هرگز به خروجی عمومی نمی‌رود.
   GET            → وضعیت پیکربندی (آدرس فقط به‌شکل پوشانده‌شده)
   POST {url}     → ذخیره آدرس قلاب
   POST {clear}   → پاک‌کردن قلاب
   POST {run}     → صدور دستور بازسازی (دِپلوی از آخرین کد تأییدشدهٔ شاخهٔ اصلی) */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSetup } from "@/lib/public-data";
import { guard } from "@/lib/admin";
import { encryptSecret, decryptSecret } from "@/lib/notify";
import { APP_VERSION } from "@/lib/version";

const HOOK_ROW = "deploy_hook_url";

function maskUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}/…${url.slice(-6)}`;
  } catch {
    return "…";
  }
}

async function currentHook(): Promise<{ configured: boolean; masked: string | null }> {
  const row = await db.siteContent.findUnique({ where: { key: HOOK_ROW } });
  if (!row) return { configured: false, masked: null };
  const url = (await decryptSecret(row.value)) ?? "";
  return { configured: Boolean(url), masked: url ? maskUrl(url) : null };
}

export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  await ensureSetup();
  return NextResponse.json({ version: APP_VERSION, ...(await currentHook()) });
}

export async function POST(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;
  await ensureSetup();

  const body = await req.json().catch(() => ({}));

  /* پاک‌کردن قلاب */
  if (body.clear === true) {
    await db.siteContent.deleteMany({ where: { key: HOOK_ROW } });
    return NextResponse.json({ ok: true, cleared: true, ...(await currentHook()) });
  }

  /* صدور دستور بازسازی */
  if (body.run === true) {
    const row = await db.siteContent.findUnique({ where: { key: HOOK_ROW } });
    const url = row ? (await decryptSecret(row.value)) ?? "" : "";
    if (!url) {
      return NextResponse.json(
        { error: "قلاب بازسازی هنوز تنظیم نشده است." },
        { status: 400 },
      );
    }
    try {
      const res = await fetch(url, { method: "POST" });
      if (!res.ok) {
        return NextResponse.json(
          { error: `ورکسل پاسخ ${res.status} داد — قلاب را از تنظیمات ورکسل دوباره بسازید.` },
          { status: 502 },
        );
      }
      return NextResponse.json({ ok: true, triggered: true });
    } catch {
      return NextResponse.json(
        { error: "ارسال دستور بازسازی ناموفق بود — اتصال سرور به ورکسل برقرار نشد." },
        { status: 502 },
      );
    }
  }

  /* ذخیرهٔ قلاب جدید */
  const url = typeof body.url === "string" ? body.url.trim() : "";
  if (!url) {
    return NextResponse.json({ error: "آدرس قلاب را وارد کنید." }, { status: 400 });
  }
  if (!/^https:\/\/api\.vercel\.com\/.+/.test(url)) {
    return NextResponse.json(
      { error: "آدرس قلاب باید با «https://api.vercel.com/…» شروع شود (Deploy Hook ورکسل)." },
      { status: 400 },
    );
  }
  await db.siteContent.upsert({
    where: { key: HOOK_ROW },
    update: { value: await encryptSecret(url.slice(0, 500)) },
    create: { key: HOOK_ROW, value: await encryptSecret(url.slice(0, 500)) },
  });
  return NextResponse.json({ ok: true, ...(await currentHook()) });
}
