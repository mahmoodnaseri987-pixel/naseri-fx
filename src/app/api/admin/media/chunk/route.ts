import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guard } from "@/lib/admin";
import { ensureSetup } from "@/lib/public-data";

/* آپلود تکه‌تکه رسانه‌های بزرگ — سقف بدنهٔ درخواست Vercel حدود ۴٫۵ مگابایت است؛
   هر تکه تا ۳ مگابایتِ خام می‌آید و در پایان کنار هم بسته می‌شود.
   اکشن‌ها: begin → chunk ×n → commit (یا abort برای انصراف).
   تکه‌ها به‌صورت ردیف Media با kind="chunk" و نام «uploadId#شماره» ذخیره می‌شوند. */

const MAX_IMAGE_BYTES = 2.5 * 1024 * 1024; // ۲٫۵ مگابایت
const MAX_VIDEO_BYTES = 10 * 1024 * 1024; // ۱۰ مگابایت
const CHUNK_MAX_BYTES = 3 * 1024 * 1024; // هر تکه — خام
const MAX_CHUNKS = 40; // تا ۴۰ تکه = ۱۲۰ مگابایت theoretical؛ سقف واقعی ۱۰ مگابایت
const STALE_MS = 60 * 60 * 1000; // تکه‌های رهاشدهٔ بیش از یک ساعت پاک می‌شوند

const ALLOWED_IMAGE = /^image\/(png|jpe?g|webp|gif|svg\+xml|avif)$/;
const ALLOWED_VIDEO = /^video\/(mp4|webm|quicktime)$/;
const UPLOAD_ID_OK = /^[a-f0-9-]{16,64}$/;

function payloadOf(data: unknown): { buf: Buffer; payload: string } | null {
  if (typeof data !== "string" || !data) return null;
  const bare = data.startsWith("data:") ? (data.match(/^data:[^;,]+;base64,([\s\S]+)$/)?.[1] ?? null) : data;
  if (!bare || !/^[A-Za-z0-9+/=\s]+$/.test(bare)) return null;
  const buf = Buffer.from(bare, "base64");
  if (buf.length === 0) return null;
  return { buf, payload: bare };
}

export async function POST(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;
  await ensureSetup();

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "درخواست نامعتبر است." }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action : "";
  const uploadId = typeof body.uploadId === "string" ? body.uploadId.trim() : "";

  /* شروع — اعتبارسنجی نام/نوع و صدور شناسه آپلود */
  if (action === "begin") {
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
    const mime = typeof body.mime === "string" ? body.mime.trim().toLowerCase() : "";
    if (!name || (!ALLOWED_IMAGE.test(mime) && !ALLOWED_VIDEO.test(mime))) {
      return NextResponse.json(
        { error: "فقط تصویر (PNG، JPG، WebP، GIF، SVG) یا ویدیو (MP4، WebM، MOV) مجاز است." },
        { status: 400 },
      );
    }
    /* تکه‌های رهاشدهٔ جلسات قبل پاک می‌شوند */
    try {
      await db.media.deleteMany({
        where: { kind: "chunk", createdAt: { lt: new Date(Date.now() - STALE_MS) } },
      });
    } catch {
      /* پاک‌سازی حیاتی نیست */
    }
    return NextResponse.json({ uploadId: crypto.randomUUID() });
  }

  if (!UPLOAD_ID_OK.test(uploadId)) {
    return NextResponse.json({ error: "شناسه آپلود نامعتبر است." }, { status: 400 });
  }
  const chunkPrefix = `${uploadId}#`;

  /* افزودن یک تکه */
  if (action === "chunk") {
    const index = Number(body.index);
    if (!Number.isInteger(index) || index < 0 || index >= MAX_CHUNKS) {
      return NextResponse.json({ error: "شمارهٔ تکه نامعتبر است." }, { status: 400 });
    }
    const parsed = payloadOf(body.data);
    if (!parsed) return NextResponse.json({ error: "محتوای تکه معتبر نیست." }, { status: 400 });
    if (parsed.buf.length > CHUNK_MAX_BYTES) {
      return NextResponse.json({ error: "حجم تکه بیش از حد مجاز است." }, { status: 413 });
    }
    const existing = await db.media.findMany({
      where: { kind: "chunk", name: { startsWith: chunkPrefix } },
      select: { size: true },
    });
    const soFar = existing.reduce((a, b) => a + b.size, 0);
    if (soFar + parsed.buf.length > MAX_VIDEO_BYTES + 1024 * 1024) {
      return NextResponse.json({ error: "حجم کل بیش از حد مجاز است (حداکثر ۱۰ مگابایت)." }, { status: 413 });
    }
    await db.media.create({
      data: {
        name: `${chunkPrefix}${String(index).padStart(4, "0")}`,
        mime: "application/octet-stream",
        kind: "chunk",
        size: parsed.buf.length,
        data: parsed.payload,
      },
    });
    return NextResponse.json({ ok: true, received: index });
  }

  /* بستن — تکه‌ها کنار هم، اعتبارسنجی نهایی، ساخت ردیف اصلی و پاک‌سازی تکه‌ها */
  if (action === "commit") {
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
    const mime = typeof body.mime === "string" ? body.mime.trim().toLowerCase() : "";
    if (!name || (!ALLOWED_IMAGE.test(mime) && !ALLOWED_VIDEO.test(mime))) {
      await db.media.deleteMany({ where: { kind: "chunk", name: { startsWith: chunkPrefix } } });
      return NextResponse.json({ error: "نام یا نوع فایل معتبر نیست." }, { status: 400 });
    }
    const chunks = await db.media.findMany({
      where: { kind: "chunk", name: { startsWith: chunkPrefix } },
      orderBy: { name: "asc" },
    });
    if (chunks.length === 0) {
      return NextResponse.json({ error: "هیچ تکه‌ای دریافت نشده بود." }, { status: 400 });
    }
    const total = chunks.reduce((a, c) => a + c.size, 0);
    const max = ALLOWED_IMAGE.test(mime) ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
    if (total > max) {
      await db.media.deleteMany({ where: { kind: "chunk", name: { startsWith: chunkPrefix } } });
      return NextResponse.json(
        {
          error:
            ALLOWED_IMAGE.test(mime)
              ? "حجم تصویر بیش از حد مجاز است (حداکثر ۲٫۵ مگابایت)."
              : "حجم ویدیو بیش از حد مجاز است (حداکثر ۱۰ مگابایت).",
        },
        { status: 413 },
      );
    }
    const buffer = Buffer.concat(chunks.map((c) => Buffer.from(c.data, "base64")));
    const media = await db.$transaction(async (tx) => {
      const row = await tx.media.create({
        data: {
          name,
          mime,
          kind: ALLOWED_IMAGE.test(mime) ? "image" : "video",
          size: buffer.length,
          data: buffer.toString("base64"),
        },
        select: { id: true, name: true, mime: true, kind: true, size: true, createdAt: true },
      });
      await tx.media.deleteMany({ where: { kind: "chunk", name: { startsWith: chunkPrefix } } });
      return row;
    });
    return NextResponse.json({ media }, { status: 201 });
  }

  /* انصراف — تکه‌ها پاک می‌شوند */
  if (action === "abort") {
    await db.media.deleteMany({ where: { kind: "chunk", name: { startsWith: chunkPrefix } } });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "اکشن ناشناخته." }, { status: 400 });
}
