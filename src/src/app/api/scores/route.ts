/* جدول برترین‌ها — پروتکل واحد بازی‌های تک‌نفره و رکوردی.
   GET  ?gameSlug=…        → برترین‌ها (بهترین رکورد هر بازیکن) + رکورد خودم
   POST {gameSlug,score,…} → ثبت رکورد تازه (عضو یا مهمان با نام)
   برای بازی‌های آپلودی، پل score از داخل iframe بازی پیام postMessage
   با نوع naseri-score می‌فرستد و PlayClient همین‌جا ثبت می‌کند؛
   میدان آتش (تک‌نفره) مستقیم از صفحه /fire ثبت می‌کند. */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSetup } from "@/lib/public-data";
import { getCurrentMember } from "@/lib/member-auth";
import type { ScoreGetResponse, ScoreRow } from "@/lib/types";

const TOP_LIMIT = 20;
const SCAN_LIMIT = 600; // برای ساخت «بهترینِ هر بازیکن» کافی است
const GUEST_SUBMIT_MS = 8_000; // ضداسپم مهمان — حداقل فاصله ثبت دو رکورد

/* محدودسازی حافظه‌ای ثبت رکورد مهمان — کلید: gameSlug:name */
const guestLast = new Map<string, number>();

function cleanName(raw: unknown): string {
  const s = String(raw ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();
  return [...s].slice(0, 24).join("");
}

function identityOf(row: { memberId: string; name: string }): string {
  return row.memberId || `guest:${row.name}`;
}

export async function GET(req: NextRequest) {
  await ensureSetup();
  const gameSlug = (new URL(req.url).searchParams.get("gameSlug") ?? "")
    .trim()
    .slice(0, 60);
  if (!gameSlug) {
    return NextResponse.json({ error: "bad game" }, { status: 400 });
  }

  /* بهترین رکورد هر بازیکن — از دل آخرین رکوردها */
  const rows = await db.gameScore.findMany({
    where: { gameSlug },
    orderBy: { score: "desc" },
    take: SCAN_LIMIT,
  });
  const bestByIdentity = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const key = identityOf(row);
    if (!bestByIdentity.has(key)) bestByIdentity.set(key, row);
  }
  const sorted = [...bestByIdentity.values()].sort(
    (a, b) => b.score - a.score || a.createdAt.getTime() - b.createdAt.getTime(),
  );

  const member = await getCurrentMember();
  const myId = member?.id ?? "";
  const top: ScoreRow[] = sorted.slice(0, TOP_LIMIT).map((row, i) => ({
    rank: i + 1,
    name: row.name,
    score: row.score,
    detail: (row.detail as ScoreRow["detail"]) ?? null,
    isMe: Boolean(myId) && row.memberId === myId,
    createdAt: row.createdAt.toISOString(),
  }));

  let me: ScoreGetResponse["me"] = null;
  const mineRows: { id: string; score: number; createdAt: string }[] = [];
  if (myId) {
    const mine = rows.filter((r) => r.memberId === myId);
    for (const r of mine) {
      mineRows.push({ id: r.id, score: r.score, createdAt: r.createdAt.toISOString() });
    }
    if (mine.length > 0) {
      const best = mine.reduce((a, b) => (b.score > a.score ? b : a));
      const above = sorted.filter((r) => r.score > best.score).length;
      me = { best: best.score, rank: above + 1, plays: mine.length };
    }
  }

  return NextResponse.json({ gameSlug, top, me, mine: mineRows });
}

export async function POST(req: NextRequest) {
  await ensureSetup();
  const body = await req.json().catch(() => ({}));

  const gameSlug = typeof body.gameSlug === "string" ? body.gameSlug.trim().slice(0, 60) : "";
  const score = Math.trunc(Number(body.score));
  if (!gameSlug || !Number.isFinite(score) || score <= 0 || score > 10_000_000) {
    return NextResponse.json({ error: "bad score" }, { status: 400 });
  }

  /* جزئیات اختیاری — فقط کلیدهای مجاز با مقدار عددی (موج، حذف و ...) */
  let detail: Record<string, number> | null = null;
  if (typeof body.detail === "object" && body.detail !== null && !Array.isArray(body.detail)) {
    const raw = body.detail as Record<string, unknown>;
    const allowed = ["wave", "kills", "level", "time", "lines", "stage", "round"];
    const clean: Record<string, number> = {};
    for (const key of allowed) {
      const v = Number(raw[key]);
      if (Number.isFinite(v)) clean[key] = Math.round(v * 10) / 10;
    }
    if (Object.keys(clean).length > 0) detail = clean;
  }

  const member = await getCurrentMember();
  if (member) {
    await db.gameScore.create({
      data: {
        gameSlug,
        memberId: member.id,
        name: member.name.slice(0, 40),
        score,
        ...(detail ? { detail } : {}),
      },
    });
    return NextResponse.json({ ok: true, guest: false });
  }

  /* مهمان — فقط با نام نمایشی و با ضداسپم */
  const name = cleanName(body.name);
  if (name.length < 2) {
    return NextResponse.json({ error: "need name" }, { status: 400 });
  }
  const key = `${gameSlug}:${name.toLowerCase()}`;
  const now = Date.now();
  if (now - (guestLast.get(key) ?? 0) < GUEST_SUBMIT_MS) {
    return NextResponse.json({ error: "too fast" }, { status: 429 });
  }
  if (guestLast.size > 800) {
    for (const [k, t] of guestLast) if (now - t > 10 * 60_000) guestLast.delete(k);
  }
  guestLast.set(key, now);

  await db.gameScore.create({
    data: {
      gameSlug,
      memberId: "",
      name,
      score,
      ...(detail ? { detail } : {}),
    },
  });
  return NextResponse.json({ ok: true, guest: true });
}

/* حذف رکورد خودِ عضو — هر عضو فقط رکوردهای خودش را می‌تواند پاک کند
   (مثلاً رکورد اشتباهی). رکوردهای مهمان و بقیه فقط از پنل مدیریت. */
export async function DELETE(req: NextRequest) {
  await ensureSetup();
  const member = await getCurrentMember();
  if (!member) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) {
    return NextResponse.json({ error: "bad id" }, { status: 400 });
  }
  const row = await db.gameScore.findUnique({ where: { id } });
  if (!row || row.memberId !== member.id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  await db.gameScore.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
