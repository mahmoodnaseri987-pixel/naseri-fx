import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import { db } from "@/lib/db";
import { sherGuard } from "@/lib/sher-auth";
import { SHER_CATEGORY_SONGS_MAX, isSherCategory } from "@/lib/sher-shared";
import manifest from "@/data/sher-manifest.json";

/* ذخیرهٔ متادیتای یک آهنگ «شعر یادت نره» — upsert بر اساس نام فایل.
   بخش آهنگ (nostalgia|rap|traditional|modern) هم این‌جا ذخیره می‌شود؛
   پیش از تغییر بخش، سقف ۲۰ آهنگِ فایل‌دار در هر بخش گارد می‌شود. */

const MAX_LINE = 300; // سقف کاراکتر هر مصرع

type ManifestFile = { filename: string; size: number };

/* نام فایل باید فقط نام سادهٔ داخل پوشهٔ songs باشد — بدون مسیر و .. */
function simpleFilename(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const name = v.trim();
  if (!name || name.includes("/") || name.includes("\\") || name.includes("..")) return null;
  if (path.basename(name) !== name || name.startsWith(".")) return null;
  return name;
}

/* آرایهٔ مصرع‌ها: رشتهٔ بودن، trim، حذف خالی‌ها و سقف کاراکتر — null یعنی نامعتبر */
function cleanLines(v: unknown, max: number): string[] | null {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) return null;
  const lines = v.map((x) => (typeof x === "string" ? x.trim() : "")).filter(Boolean);
  if (lines.some((l) => l.length > MAX_LINE)) return null;
  return lines.slice(0, max);
}

/* شمارش ردیف‌های «فایل‌دار» یک بخش — فایل‌دار یعنی فایل آن در پوشهٔ
   public/sher/songs هست (مانیفست همان منبع فهرست پنل است) */
function fileBackedCount(rows: { filename: string }[]): number {
  const files = new Set((manifest.files as ManifestFile[]).map((f) => f.filename));
  return rows.filter((r) => files.has(r.filename)).length;
}

const bad = (message: string) => NextResponse.json({ error: message }, { status: 400 });

export async function POST(req: NextRequest) {
  const denied = await sherGuard();
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return bad("درخواست نامعتبر است.");
  }

  const filename = simpleFilename(body.filename);
  if (!filename) return bad("نام فایل نامعتبر است — فقط نام سادهٔ فایل صوتی مجاز است.");

  const clipStart =
    typeof body.clipStart === "number" && Number.isFinite(body.clipStart)
      ? Math.max(0, body.clipStart)
      : null;
  if (clipStart === null) return bad("زمان شروع کلیپ باید عددی بزرگ‌تر یا مساوی صفر باشد.");

  const answerLine = typeof body.answerLine === "string" ? body.answerLine.trim() : "";
  if (answerLine.length > MAX_LINE) return bad("مصرع جواب حداکثر ۳۰۰ کاراکتر است.");

  const contextLines = cleanLines(body.contextLines, 3);
  if (!contextLines) return bad("مصرع‌های زمینه: حداکثر ۳ مصرعِ ۳۰۰ کاراکتری.");

  const extraLines = cleanLines(body.extraLines, 10);
  if (!extraLines) return bad("مصرع‌های اضافه: حداکثر ۱۰ مصرعِ ۳۰۰ کاراکتری.");

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const artist = typeof body.artist === "string" ? body.artist.trim() : "";
  const active = body.active === true;

  /* بخش آهنگ — نامعتبر/نیامده → بدون تغییر برای ردیف موجود، خالی برای ردیف جدید */
  const existing = await db.sherSong.findUnique({ where: { filename } });
  const category = isSherCategory(body.category) ? body.category : (existing?.category ?? "");

  /* سقف ۲۰ آهنگ فایل‌دار در هر بخش — فقط وقتی بخشِ ردیف عوض می‌شود گیت بخورد */
  if (category && category !== (existing?.category ?? "")) {
    const inCategory = await db.sherSong.findMany({
      where: { category },
      select: { filename: true },
    });
    if (fileBackedCount(inCategory) >= SHER_CATEGORY_SONGS_MAX) {
      return NextResponse.json(
        { error: "این بخش پر است — حداکثر ۲۰ آهنگ در هر بخش." },
        { status: 409 },
      );
    }
  }

  const data = {
    title,
    artist,
    clipStart,
    answerLine,
    contextLines: JSON.stringify(contextLines),
    extraLines: JSON.stringify(extraLines),
    active,
    category,
  };

  const song = await db.sherSong.upsert({
    where: { filename },
    update: data,
    create: { filename, ...data },
  });

  return NextResponse.json({ song });
}
