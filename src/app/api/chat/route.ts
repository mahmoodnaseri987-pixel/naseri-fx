/* چت آرنا — لابی عمومی (scope = lobby) و داخل اتاق‌ها (scope = کد اتاق).
   حمل‌ونقل با polling سبک (~۱.۵ ثانیه) هم‌سبک با بقیه آرنا و سازگار با سرورلس. */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSetup } from "@/lib/public-data";
import { memberGuard, memberRateLimit } from "@/lib/member-auth";
import { jadvalTeamOfRaw } from "@/lib/jadval-engine";
import type { ChatGetResponse, ChatMsgView } from "@/lib/types";

const LOBBY = "lobby";
const MAX_LEN = 500;

/** اسکوپ تیمی جدول: کد ۵ حرفی + حرف تیم = ۶ کاراکتر (مثل ABC12A) */
function parseTeamScope(scope: string): { code: string; team: "A" | "B" } | null {
  if (scope.length !== 6) return null;
  const team = scope[5];
  if (team !== "A" && team !== "B") return null;
  return { code: scope.slice(0, 5), team };
}

/** بررسی دسترسی به اسکوپ تیمی — فقط هم‌تیمی‌ها؛ فرستنده/خواننده باید عضو همان تیم باشد */
async function teamScopeAccess(scope: string, memberId: string): Promise<"ok" | "gone" | "forbidden"> {
  const parsed = parseTeamScope(scope);
  if (!parsed) return "gone";
  const room = await db.room.findUnique({
    where: { code: parsed.code },
    select: { id: true, status: true, state: true },
  });
  if (!room) return "gone";
  const member = await db.roomMember.findFirst({
    where: { roomId: room.id, memberId },
    select: { id: true },
  });
  if (!member) return "gone";
  const myTeam = jadvalTeamOfRaw(room.state, memberId);
  if (myTeam !== parsed.team) return "forbidden";
  return "ok";
}

/** کدهای اتاق‌های باز — کلاینت فقط این‌ها را در متن پیام کلیک‌پذیر می‌کند */
async function openRoomCodes(): Promise<string[]> {
  const rooms = await db.room.findMany({
    where: { status: { in: ["lobby", "playing"] } },
    select: { code: true },
  });
  return rooms.map((r) => r.code);
}

export async function GET(req: NextRequest) {
  await ensureSetup();
  const guard = await memberGuard();
  if ("denied" in guard) return guard.denied;

  const url = new URL(req.url);
  const raw = (url.searchParams.get("scope") || LOBBY).trim().slice(0, 12);
  const scope = raw === LOBBY ? LOBBY : raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const after = Math.max(0, Math.min(9_999_999_999, Number(url.searchParams.get("after") ?? "0") || 0));

  if (scope !== LOBBY) {
    if (scope.length === 6) {
      /* چت مخفی تیمی جدول — فقط هم‌تیمی */
      const access = await teamScopeAccess(scope, guard.member.id);
      if (access === "gone") {
        return NextResponse.json({ error: "gone" }, { status: 404 });
      }
      if (access === "forbidden") {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      }
    } else if (scope.length !== 5) {
      return NextResponse.json({ error: "bad scope" }, { status: 400 });
    } else {
      /* چت اتاق تا وقتی خود اتاق وجود دارد خوانده می‌شود — حتی بعد از پایان مسابقه */
      const room = await db.room.findUnique({
        where: { code: scope },
        select: { status: true },
      });
      if (!room) {
        return NextResponse.json({ error: "gone" }, { status: 404 });
      }
    }
  }

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

  const messages: ChatMsgView[] = rows.map((m) => ({
    id: m.id,
    memberId: m.memberId,
    name: m.name,
    content: m.content,
    kind: m.kind === "system" ? "system" : "user",
    roomCode: m.roomCode,
    roomNumber: m.roomNumber,
    gameSlug: m.gameSlug,
    createdAt: m.createdAt.toISOString(),
  }));

  const data: ChatGetResponse = {
    me: guard.member.id,
    messages,
    codes: scope === LOBBY ? await openRoomCodes() : [],
    serverNow: Date.now(),
  };
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  await ensureSetup();
  const guard = await memberGuard();
  if ("denied" in guard) return guard.denied;

  /* ضد اسپم سطح ۱: حافظه‌ای — حداکثر ۸ پیام در هر ۱۰ ثانیه در هر نمونه */
  if (!memberRateLimit(`chat:${guard.member.id}`, 8, 10_000)) {
    return NextResponse.json({ error: "slow" }, { status: 429 });
  }

  /* ضد اسپم سطح ۲ (قطعی روی دیتابیس): حداقل ۹۰۰ میلی‌ثانیه بین دو پیام کاربر
     — اعلان‌های سیستمی (مثل ساخت اتاق) در شمارش نمی‌آیند */
  const lastMsg = await db.chatMessage.findFirst({
    where: { memberId: guard.member.id, kind: "user" },
    orderBy: { id: "desc" },
    select: { createdAt: true },
  });
  if (lastMsg && Date.now() - lastMsg.createdAt.getTime() < 900) {
    return NextResponse.json({ error: "slow" }, { status: 429 });
  }

  /* عکس پروفایل اجباری — بدون عکس اجازه چت نیست */
  const me = await db.member.findUnique({
    where: { id: guard.member.id },
    select: { avatarUrl: true },
  });
  if (!me?.avatarUrl) {
    return NextResponse.json({ error: "avatar" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const rawScope = typeof body.scope === "string" ? body.scope.trim().slice(0, 12) : LOBBY;
  const scope = rawScope === LOBBY ? LOBBY : rawScope.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const content = typeof body.content === "string" ? body.content.trim().slice(0, MAX_LEN) : "";

  if (!content) {
    return NextResponse.json({ error: "empty" }, { status: 400 });
  }

  if (scope !== LOBBY) {
    if (scope.length === 6) {
      /* ارسال به چت مخفی تیمی — فقط هم‌تیمی */
      const access = await teamScopeAccess(scope, guard.member.id);
      if (access === "gone") {
        return NextResponse.json({ error: "gone" }, { status: 404 });
      }
      if (access === "forbidden") {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      }
      const parsed = parseTeamScope(scope);
      if (parsed) {
        await db.room.updateMany({
          where: { code: parsed.code },
          data: { lastActivity: new Date() },
        });
      }
    } else if (scope.length !== 5) {
      return NextResponse.json({ error: "bad scope" }, { status: 400 });
    } else {
      /* فرستنده باید عضو همان اتاق باشد — چت بعد از پایان مسابقه هم برای خوش‌وبش باز می‌ماند */
      const room = await db.room.findUnique({
        where: { code: scope },
        select: {
          id: true,
          status: true,
          members: { where: { memberId: guard.member.id }, select: { id: true } },
        },
      });
      if (!room || room.members.length === 0) {
        return NextResponse.json({ error: "gone" }, { status: 404 });
      }
      /* چت داخل اتاق هم اتاق را زنده نگه می‌دارد */
      await db.room.update({ where: { id: room.id }, data: { lastActivity: new Date() } });
    }
  }

  const msg = await db.chatMessage.create({
    data: { scope, memberId: guard.member.id, name: guard.member.name, content },
  });

  /* گاه‌به‌گاه پیام‌های کهنه همین اسکوپ پاک می‌شوند تا جدول بزرگ نشود */
  if (Math.random() < 0.1) {
    await db.chatMessage.deleteMany({
      where: { scope, createdAt: { lt: new Date(Date.now() - 6 * 60 * 60 * 1000) } },
    });
  }

  return NextResponse.json({ id: msg.id }, { status: 201 });
}
