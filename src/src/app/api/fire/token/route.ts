import { NextResponse } from "next/server";
import Ably from "ably";

/* توکن امن Ably برای بازی گروهی «میدان آتش».
   کلید فقط سمت سرور می‌ماند؛ کلاینت توکن محدود به کانال‌های fire:room:* می‌گیرد. */

export const runtime = "nodejs";

export async function GET() {
  const key = process.env.ABLY_API_KEY;
  if (!key) {
    return NextResponse.json({ setup: true }, { status: 503 });
  }
  try {
    const rest = new Ably.Rest(key);
    const tokenRequest = await rest.auth.createTokenRequest({
      clientId: "*",
      ttl: 7200000,
      capability: {
        "fire:room:*": ["publish", "subscribe", "presence", "history"],
        /* کانال عمومی اعلام اتاق‌های باز — برای بنر سراسری سایت */
        "fire:lobby": ["publish", "subscribe", "presence", "history"],
      },
    });
    return NextResponse.json(tokenRequest, {
      headers: { "cache-control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "token" }, { status: 500 });
  }
}
