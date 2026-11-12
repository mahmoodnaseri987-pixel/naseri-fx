import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import { guard } from "@/lib/admin";
import { githubDeleteFile } from "@/lib/sher-github";

/* حذف فایل صوتی «شعر یادت نره» از مخزن گیت‌هاب — idempotent:
   فایلی که از قبل نیست هم موفقیت حساب می‌شود (missing:true). */

const MAX_NAME = 120; // سقف طول نام فایل
const EXTENSIONS = new Set(["mp3", "wav", "m4a", "ogg", "flac"]);
const SONGS_DIR = "public/sher/songs"; // مسیر ثابت آهنگ‌ها در مخزن

const bad = (message: string) => NextResponse.json({ error: message }, { status: 400 });

/* نام فایل باید فقط نام سادهٔ داخل پوشهٔ songs باشد — بدون مسیر و .. و نقطهٔ آغازین */
function audioFilename(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const name = v.trim();
  if (!name || name.length > MAX_NAME) return null;
  if (name.includes("/") || name.includes("\\") || name.includes("..")) return null;
  if (path.basename(name) !== name || name.startsWith(".")) return null;
  const ext = path.extname(name).slice(1).toLowerCase();
  if (!EXTENSIONS.has(ext)) return null;
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

  const filename = audioFilename(body.filename);
  if (!filename)
    return bad("نام فایل نامعتبر است — فقط نام سادهٔ فایل صوتی مجاز است.");

  const result = await githubDeleteFile(
    `${SONGS_DIR}/${filename}`,
    `حذف آهنگ شعر از پنل: ${filename}`,
  );
  if (!result.ok)
    return NextResponse.json({ ok: false, error: result.error }, { status: 502 });

  return NextResponse.json({ ok: true, missing: result.missing === true });
}
