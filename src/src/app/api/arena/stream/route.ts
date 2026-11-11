/* استریم لحظه‌ای آرنا (SSE) — جانشین polling سریع.
   یک اتصال باز به‌ازای هر صفحه؛ سرور تغییرهای اسنپ‌شات اتاق و پیام‌های
   تازه چت را به‌صورت رویداد push می‌کند:
     mode=room&code=XXXXX → رویدادهای state | chat | gone
     mode=lobby           → رویدادهای chat | rooms
   ضرب‌آهنگ تطبیقی: بازی اکشن در جریان ~۴۰۰ms، کوییز ~۷۰۰ms و در سکوت
   طولانی تا ۲–۳ ثانیه backoff می‌کند تا مصرف CU دیتابیس پایین بماند؛
   با اولین رویداد تازه، بلافاصله تند می‌شود.
   اتصال هر ۵۰ ثانیه از سمت سرور بسته می‌شود تا زیر سقف serverless بماند؛
   کلاینت بلافاصله دوباره وصل می‌شود (reconnect نرم). */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSetup } from "@/lib/public-data";
import { memberGuard } from "@/lib/member-auth";
import { getRoomSnapshot, touchPresence, viewFromSnapshot } from "@/lib/arena-live";
import { NABARD_GAME_SLUG } from "@/lib/nabard-engine";
import { FIRE_GAME_SLUG } from "@/lib/fire-engine";
import { JADVAL_GAME_SLUG } from "@/lib/jadval-shared";
import { jadvalTeamOfRaw } from "@/lib/jadval-engine";
import type { ArenaRoomSummary, ChatMsgView } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 55;

const LOBBY = "lobby";
const MAX_ACTIVE_ROOMS = 30;
const STREAM_MS = 50_000; // عمر هر اتصال — قبل از سقف serverless بسته می‌شود

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function toChatView(m: {
  id: number;
  memberId: string;
  name: string;
  content: string;
  kind: string;
  roomCode: string | null;
  roomNumber: number;
  gameSlug: string | null;
  createdAt: Date;
}): ChatMsgView {
  return {
    id: m.id,
    memberId: m.memberId,
    name: m.name,
    content: m.content,
    kind: m.kind === "system" ? "system" : "user",
    roomCode: m.roomCode,
    roomNumber: m.roomNumber,
    gameSlug: m.gameSlug,
    createdAt: m.createdAt.toISOString(),
  };
}

/* ----------------------------------------------------------------
   پخش‌کننده مشترک چت در هر نمونه — یک کوئری برای همه اتصال‌های یک اسکوپ
   ---------------------------------------------------------------- */

type ChatWatch = { at: number; latestId: number; buf: ChatMsgView[] };
const CHAT_TTL = 300;
const chatWatches = new Map<string, ChatWatch>();

async function chatSince(scope: string, after: number): Promise<ChatMsgView[]> {
  const now = Date.now();
  let w = chatWatches.get(scope);
  if (!w) {
    const last = await db.chatMessage.findFirst({
      where: { scope },
      orderBy: { id: "desc" },
      select: { id: true },
    });
    w = { at: now, latestId: last?.id ?? 0, buf: [] };
    chatWatches.set(scope, w);
  } else if (now - w.at >= CHAT_TTL) {
    const rows = await db.chatMessage.findMany({
      where: { scope, id: { gt: w.latestId } },
      orderBy: { id: "asc" },
      take: 120,
    });
    if (rows.length) {
      const fresh = rows.map(toChatView);
      w.latestId = fresh[fresh.length - 1].id;
      w.buf = [...w.buf, ...fresh].slice(-300);
    }
    w.at = now;
  }
  if (chatWatches.size > 80) {
    for (const [k, v] of chatWatches) {
      if (now - v.at > 5 * 60_000) chatWatches.delete(k);
    }
  }

  if (after >= w.latestId) return [];
  const first = w.buf.length ? w.buf[0].id : w.latestId + 1;
  if (after >= first - 1) return w.buf.filter((m) => m.id > after);
  /* شکاف بین کرسر اتصال و بافر — پرس‌وجوی مستقیم برای همین اتصال */
  const rows =
    after > 0
      ? await db.chatMessage.findMany({
          where: { scope, id: { gt: after } },
          orderBy: { id: "asc" },
          take: 100,
        })
      : (
          await db.chatMessage.findMany({
            where: { scope },
            orderBy: { id: "desc" },
            take: 60,
          })
        ).reverse();
  return rows.map(toChatView);
}

/* ----------------------------------------------------------------
   فهرست اتاق‌های لابی — کش مشترک یک ثانیه‌ای در هر نمونه
   ---------------------------------------------------------------- */

let roomsWatch: {
  at: number;
  fp: string;
  payload: { rooms: ArenaRoomSummary[]; maxRooms: number };
} | null = null;

async function lobbyRooms(): Promise<NonNullable<typeof roomsWatch>> {
  const now = Date.now();
  if (roomsWatch && now - roomsWatch.at < 1_500) return roomsWatch;

  const rooms = await db.room.findMany({
    where: {
      status: { in: ["lobby", "playing"] },
      lastActivity: { gte: new Date(now - 3 * 60_000) },
    },
    include: { members: true },
    orderBy: { createdAt: "desc" },
    take: MAX_ACTIVE_ROOMS,
  });
  const list: ArenaRoomSummary[] = rooms.map((r) => ({
    code: r.code,
    gameSlug: r.gameSlug,
    roomNumber: r.roomNumber,
    status: r.status,
    memberCount: r.members.length,
    maxPlayers: r.maxPlayers,
    hostName: r.members.find((m) => m.isHost)?.name ?? "",
    createdAt: r.createdAt.toISOString(),
  }));
  roomsWatch = {
    at: now,
    fp: JSON.stringify(list),
    payload: { rooms: list, maxRooms: MAX_ACTIVE_ROOMS },
  };
  return roomsWatch;
}

/* ----------------------------------------------------------------
   خود استریم
   ---------------------------------------------------------------- */

export async function GET(req: NextRequest) {
  await ensureSetup();
  const guard = await memberGuard();
  if ("denied" in guard) return guard.denied;

  const url = new URL(req.url);
  const mode = url.searchParams.get("mode") === "room" ? "room" : "lobby";
  const after = Math.max(
    0,
    Math.min(9_999_999_999, Number(url.searchParams.get("after") ?? "0") || 0),
  );

  let code = "";
  if (mode === "room") {
    code = (url.searchParams.get("code") || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (code.length !== 5) {
      return NextResponse.json({ error: "bad scope" }, { status: 400 });
    }
  }

  const memberId = guard.member.id;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const shutdown = () => {
        closed = true;
      };
      req.signal.addEventListener("abort", shutdown);

      const write = (chunk: string): boolean => {
        if (closed) return false;
        try {
          controller.enqueue(encoder.encode(chunk));
          return true;
        } catch {
          closed = true;
          return false;
        }
      };
      const send = (event: string, data: unknown): boolean =>
        write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

      write("retry: 800\n\n");
      send("hello", { now: Date.now(), mode });

      const deadline = Date.now() + STREAM_MS;
      let chatCursor = after;
      let lastFingerprint = "";
      let lastRoomsFp = "";
      let lastHeartbeat = Date.now();
      let lastEventAt = Date.now(); // برای backoff تطبیقی — هر رویداد تازه صفرش می‌کند
      let fastGame = false; // بازی اکشن در جریان — بدون backoff

      /* ضرب‌آهنگ تطبیقی: تازه → تند؛ سکوت طولانی → ملایم (کاهش CU) */
      const nextInterval = (): number => {
        if (fastGame) return 400; // نبرد/آتش در جریان — ثابت و تند
        const idle = Date.now() - lastEventAt;
        if (mode === "lobby") {
          if (idle > 30_000) return 3_000;
          if (idle > 8_000) return 1_800;
          return 800;
        }
        if (idle > 30_000) return 2_000;
        if (idle > 8_000) return 1_200;
        return 700;
      };

      while (!closed && Date.now() < deadline) {
        try {
          if (mode === "room") {
            const snap = await getRoomSnapshot(code);
            if (!snap || !snap.members.some((m) => m.id === memberId)) {
              send("gone", { reason: "gone" });
              break;
            }
            void touchPresence(snap.room.id, memberId);

            if (snap.fingerprint !== lastFingerprint) {
              const view = viewFromSnapshot(snap, memberId, Date.now());
              if (!view) {
                send("gone", { reason: "gone" });
                break;
              }
              lastFingerprint = snap.fingerprint;
              if (send("state", view)) lastEventAt = Date.now();
              else break;
            }

            /* «رقابت جدول» در جریان مسابقه: هر عضو فقط چت تیم خودش را می‌گیرد
               (اسکوپ = کد اتاق + حرف تیم). لابی و پایان مسابقه: چت مشترک اتاق. */
            let chatScope = code;
            if (snap.room.gameSlug === JADVAL_GAME_SLUG && snap.room.status === "playing") {
              const team = jadvalTeamOfRaw(snap.rawState, memberId);
              if (team) chatScope = `${code}${team}`;
            }
            const msgs = await chatSince(chatScope, chatCursor);
            if (msgs.length) {
              chatCursor = msgs[msgs.length - 1].id;
              if (send("chat", msgs)) lastEventAt = Date.now();
              else break;
            }

            /* بازی‌های اکشن در جریان → ضرب‌آهنگ تندتر برای اسنپ‌شات‌ها */
            fastGame =
              (snap.room.gameSlug === NABARD_GAME_SLUG || snap.room.gameSlug === FIRE_GAME_SLUG) &&
              snap.room.status === "playing";
          } else {
            const msgs = await chatSince(LOBBY, chatCursor);
            if (msgs.length) {
              chatCursor = msgs[msgs.length - 1].id;
              if (send("chat", msgs)) lastEventAt = Date.now();
              else break;
            }
            const wr = await lobbyRooms();
            if (wr.fp !== lastRoomsFp) {
              lastRoomsFp = wr.fp;
              if (send("rooms", wr.payload)) lastEventAt = Date.now();
              else break;
            }
          }
        } catch {
          /* خطای گذرا — دور بعد تلاش می‌شود */
        }

        if (Date.now() - lastHeartbeat > 15_000) {
          lastHeartbeat = Date.now();
          if (!write(": hb\n\n")) break;
        }
        await sleep(nextInterval());
      }

      req.signal.removeEventListener("abort", shutdown);
      closed = true;
      try {
        controller.close();
      } catch {
        /* قبلاً بسته شده */
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
