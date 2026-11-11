/* سلامت سایت — بدون احراز هویت، بدون دسترسی به دیتابیس.
   اسکریپت محافظ خودایمنی با مقایسهٔ version، تشخیص می‌دهد نسخهٔ درحال‌سرویس
   همان نسخهٔ پین‌شدهٔ سالم است یا یک دِپلوی ناخواسته جای آن را گرفته. */

import { NextResponse } from "next/server";
import { APP_VERSION } from "@/lib/version";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    version: APP_VERSION,
    at: new Date().toISOString(),
  });
}
