import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import { db } from "@/lib/db";
import { sherGuard } from "@/lib/sher-auth";
import { githubPutFile } from "@/lib/sher-github";

/* آپلود تکه‌تکهٔ فایل صوتی «شعر یادت نره» از پنل ادمین.
   ورکل سقف بدنهٔ درخواست ~۴.۵ مگابایت دارد، پس هر تکه (~۹۰۰ کیلوبایت
   محتوای خام) جداگانه می‌آید و در جدول SherUploadChunk جمع می‌شود؛
   وقتی همهٔ تکه‌ها رسیدند، فایل کامل با GitHub Contents API در
   public/sher/songs/<filename> روی main کامیت می‌شود تا ورکل deploy
   بزند و فایل استاتیک سرو شود. تکه‌ها پس از نتیجهٔ نهایی پاک می‌شوند. */

const MAX_CHUNK_BYTES = Math.floor(1.2 * 1024 * 1024); // سقف محتوای هر تکه پس از decode — ~۱.۲ مگابایت
const MAX_TOTAL_BYTES = 15 * 1024 * 1024; // سقف کل فایل صوتی — ۱۵ مگابایت
const MAX_NAME = 120; // سقف طول نام فایل
const EXTENSIONS = new Set(["mp3", "wav", "m4a", "ogg", "flac"]);
const SONGS_DIR = "public/sher/songs"; // مسیر ثابت آهنگ‌ها در مخزن
const UPLOAD_ID_RE = /^[A-Za-z0-9-]{8,64}$/; // uploadId از crypto.randomUUID
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

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
  const denied = await sherGuard();
  if (denied) return denied;

  /* جاروب تکه‌های یتیم آپلودهای نیمه‌کارهٔ بیش از یک شبانه‌روز — ارزان و هر بار اجرا می‌شود */
  await db.sherUploadChunk
    .deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } } })
    .catch(() => undefined);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return bad("درخواست نامعتبر است.");
  }

  /* --- اعتبارسنجی ورودی‌ها --- */
  const uploadId = typeof body.uploadId === "string" ? body.uploadId.trim() : "";
  if (!UPLOAD_ID_RE.test(uploadId))
    return bad("شناسهٔ آپلود نامعتبر است — آپلود را از اول شروع کنید.");

  const filename = audioFilename(body.filename);
  if (!filename)
    return bad(
      "نام فایل نامعتبر است — فقط نام سادهٔ فایل صوتی با پسوند mp3/wav/m4a/ogg/flac مجاز است.",
    );

  const total = body.total;
  if (typeof total !== "number" || !Number.isInteger(total) || total < 1 || total > 20)
    return bad("تعداد تکه‌ها نامعتبر است — آپلود را از اول شروع کنید.");

  const index = body.index;
  if (typeof index !== "number" || !Number.isInteger(index) || index < 0 || index >= total)
    return bad("شمارهٔ تکه نامعتبر است.");

  const data = typeof body.data === "string" ? body.data.replace(/\s/g, "") : "";
  if (!data || !BASE64_RE.test(data))
    return bad("محتوای تکه base64 معتبر نیست.");
  const chunkBytes = Buffer.from(data, "base64").length;
  if (chunkBytes === 0 || chunkBytes > MAX_CHUNK_BYTES)
    return bad("حجم تکه خارج از محدودهٔ مجاز است.");

  /* --- ذخیرهٔ تکه (upsert با کلید یکتای uploadId+idx) --- */
  await db.sherUploadChunk.upsert({
    where: { uploadId_idx: { uploadId, idx: index } },
    update: { data },
    create: { uploadId, idx: index, data },
  });

  const count = await db.sherUploadChunk.count({ where: { uploadId } });
  if (count < total) return NextResponse.json({ ok: true, done: false });

  /* --- همهٔ تکه‌ها رسیده‌اند: جمع، بررسی حجم، کامیت در گیت‌هاب --- */
  try {
    const chunks = await db.sherUploadChunk.findMany({
      where: { uploadId },
      orderBy: { idx: "asc" },
    });
    const parts = chunks.map((c) => Buffer.from(c.data, "base64"));
    const totalBytes = parts.reduce((s, b) => s + b.length, 0);

    if (chunks.length !== total || totalBytes > MAX_TOTAL_BYTES) {
      await db.sherUploadChunk.deleteMany({ where: { uploadId } });
      return bad("حجم کل فایل بیش از ۱۵ مگابایت است یا تکه‌ها ناسازگارند — آپلود باطل شد.");
    }

    const content = Buffer.concat(parts).toString("base64");
    const result = await githubPutFile(
      `${SONGS_DIR}/${filename}`,
      content,
      `آپلود آهنگ شعر از پنل: ${filename}`,
    );

    await db.sherUploadChunk.deleteMany({ where: { uploadId } });

    if (!result.ok)
      return NextResponse.json({ ok: false, done: false, error: result.error }, { status: 502 });
    return NextResponse.json({ ok: true, done: true });
  } catch {
    await db.sherUploadChunk.deleteMany({ where: { uploadId } }).catch(() => undefined);
    return NextResponse.json(
      { ok: false, done: false, error: "خطای غیرمنتظره در سرور هنگام تکمیل آپلود — دوباره تلاش کنید." },
      { status: 500 },
    );
  }
}
