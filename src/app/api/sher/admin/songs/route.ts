import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sherGuard } from "@/lib/sher-auth";
import manifest from "@/data/sher-manifest.json";

/* فهرست مچ‌شدهٔ فایل‌های پوشه (manifest) با رکوردهای دیتابیس — پنل «شعر یادت نره» */

type ManifestFile = { filename: string; size: number };
type SongStatus = "ready" | "draft" | "stale";

/* خواندن امن آرایهٔ مصرع‌های ذخیره‌شده به‌صورت JSON */
function parseLines(raw: string): string[] {
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export async function GET() {
  const denied = await sherGuard();
  if (denied) return denied;

  const [records, files] = await Promise.all([
    db.sherSong.findMany(),
    Promise.resolve(manifest.files as ManifestFile[]),
  ]);
  const byFile = new Map(records.map((r) => [r.filename, r]));

  /* فایل‌های موجود در پوشه — با متادیتای دیتابیس اگر هست */
  const songs = files.map((f) => {
    const rec = byFile.get(f.filename);
    byFile.delete(f.filename);
    return {
      filename: f.filename,
      exists: true,
      size: f.size,
      id: rec?.id,
      title: rec?.title ?? "",
      artist: rec?.artist ?? "",
      clipStart: rec?.clipStart ?? 0,
      answerLine: rec?.answerLine ?? "",
      contextLines: parseLines(rec?.contextLines ?? "[]"),
      extraLines: parseLines(rec?.extraLines ?? "[]"),
      active: rec?.active ?? false,
      category: rec?.category ?? "",
      status: (rec && rec.title && rec.answerLine ? "ready" : "draft") as SongStatus,
    };
  });

  /* رکوردهای متادیتایی که فایلشان از پوشه حذف شده — بدون فایل */
  for (const rec of byFile.values()) {
    songs.push({
      filename: rec.filename,
      exists: false,
      size: 0,
      id: rec.id,
      title: rec.title,
      artist: rec.artist,
      clipStart: rec.clipStart,
      answerLine: rec.answerLine,
      contextLines: parseLines(rec.contextLines),
      extraLines: parseLines(rec.extraLines),
      active: rec.active,
      category: rec.category,
      status: "stale",
    });
  }

  /* آماده‌ها اول، ناقص‌ها بعد، بدون‌فایل‌ها آخر */
  const rank: Record<SongStatus, number> = { ready: 0, draft: 1, stale: 2 };
  songs.sort((a, b) => rank[a.status] - rank[b.status]);

  return NextResponse.json({ songs });
}
