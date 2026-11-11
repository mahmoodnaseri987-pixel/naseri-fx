import { NextResponse } from "next/server";
import Ably from "ably";

export const runtime = "nodejs";

/* فهرست اتاق‌های باز «میدان آتش» — از presence کانال عمومی fire:lobby خوانده می‌شود.
   میزبان‌ها هنگام باز کردن اتاق روی fire:lobby حضور ثبت می‌کنند؛ این روت آن فهرست را برای
   بنر شناور سراسری سایت و منوی بازی گروهی برمی‌گرداند (بدون اتصال realtime — بدون مصرف MAU).
   توجه: REST پکیج قدیمی ably برای فراخوانی شبکه‌ای توسط حساب‌های MAU رد می‌شود (خطای 40168)،
   پس TokenRequest را محلی می‌سازیم و با fetch خام توکن می‌گیریم و presence را می‌خوانیم. */

type RoomEntry = { c: string; n: string; p: number; m: number; s: number };

type Tok = { token: string; expires: number };
let cachedTok: Tok | null = null;

async function getServerToken(): Promise<string | null> {
  const key = process.env.ABLY_API_KEY;
  if (!key) return null;
  if (cachedTok && cachedTok.expires - 60000 > Date.now()) return cachedTok.token;
  try {
    const rest = new Ably.Rest(key);
    const req = await rest.auth.createTokenRequest({
      clientId: "rooms-api",
      capability: {
        "fire:room:*": ["publish", "subscribe", "presence", "history"],
        "fire:lobby": ["publish", "subscribe", "presence", "history"],
      },
      ttl: 600000,
    });
    const res = await fetch(`https://rest.ably.io/keys/${req.keyName}/requestToken`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { token?: string; expires?: number };
    if (!j.token || !j.expires) return null;
    cachedTok = { token: j.token, expires: j.expires };
    return j.token;
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const tok = await getServerToken();
    if (!tok) {
      return NextResponse.json({ setup: true }, { status: 503 });
    }
    const res = await fetch(
      "https://rest.ably.io/channels/" + encodeURIComponent("fire:lobby") + "/presence?waitForSync=true",
      { headers: { authorization: `Bearer ${tok}` }, cache: "no-store" },
    );
    if (!res.ok) {
      return NextResponse.json({ rooms: [] }, { headers: { "cache-control": "no-store" } });
    }
    const members = (await res.json()) as { clientId?: string; data?: unknown }[];
    const rooms: RoomEntry[] = [];
    type RoomData = { c?: unknown; n?: unknown; p?: unknown; m?: unknown; s?: unknown };
    for (const m of Array.isArray(members) ? members : []) {
      let d: RoomData | null = null;
      if (typeof m.data === "string") {
        try {
          d = JSON.parse(m.data) as RoomData;
        } catch {
          d = null;
        }
      } else if (m.data && typeof m.data === "object") {
        d = m.data as RoomData;
      }
      const c = typeof d?.c === "string" ? d.c.toUpperCase() : "";
      if (!/^[A-HJ-NP-Z2-9]{5}$/.test(c)) continue;
      rooms.push({
        c,
        n: typeof d?.n === "string" ? d.n.slice(0, 16) : "؟",
        p: Math.max(1, Math.min(8, Math.round(Number(d?.p) || 1))),
        m: Math.max(1, Math.min(8, Math.round(Number(d?.m) || 8))),
        s: d?.s === 1 ? 1 : 0,
      });
    }
    return NextResponse.json({ rooms }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ rooms: [] }, { headers: { "cache-control": "no-store" } });
  }
}
