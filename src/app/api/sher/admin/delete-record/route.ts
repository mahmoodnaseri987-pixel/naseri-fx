import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import { db } from "@/lib/db";
import { guard } from "@/lib/admin";

/* حذف رکورد متادیتای یک آهنگ «شعر یادت نره» از دیتابیس —
   برای ردیف‌های «بدون فایل» که فایل صوتی‌شان دیگر در مخزن نیست. */

const MAX_NAME = 120; // سقف طول نام فایل

const bad = (message: string) => NextResponse.json({ error: message }, { status: 400 });

/* نام فایل باید فقط نام سادهٔ داخل پوشهٔ songs باشد — بدون مسیر و .. و نقطهٔ آغازین */
function simpleFilename(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const name = v.trim();
  if (!name || name.length > MAX_NAME) return null;
  if (name.includes("/") || name.includes("\\") || name.includes("..")) return null;
  if (path.basename(name) !== name || name.startsWith(".")) return null;
  return name;
}

export async function POST(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return bad("درخواست نامعتبر است.");
  }

  const filename = simpleFilename(body.filename);
  if (!filename)
    return bad("نام فایل نامعتبر است — فقط نام سادهٔ فایل صوتی مجاز است.");

  try {
    await db.sherSong.delete({ where: { filename } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "رکوردی با این نام فایل در دیتابیس نیست." },
      { status: 404 },
    );
  }
}
