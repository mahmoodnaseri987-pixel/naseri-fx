import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guard } from "@/lib/admin";
import { ensureSetup } from "@/lib/public-data";

/* سقف حجم فایل‌ها (بایت) — متناسب با محدودیت بدنه درخواست Vercel */
export const MAX_IMAGE_BYTES = 2.5 * 1024 * 1024; // ۲٫۵ مگابایت
export const MAX_VIDEO_BYTES = 10 * 1024 * 1024; // ۱۰ مگابایت — فایل‌های بزرگ تکه‌تکه در /api/admin/media/chunk

const ALLOWED_IMAGE = /^image\/(png|jpe?g|webp|gif|svg\+xml|avif)$/;
const ALLOWED_VIDEO = /^video\/(mp4|webm|quicktime)$/;

/** فهرست رسانه‌ها (بدون محتوا) */
export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  await ensureSetup();
  const rows = await db.media.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, mime: true, kind: true, size: true, createdAt: true },
  });
  return NextResponse.json({ media: rows });
}

/** آپلود رسانه جدید — بدنه: { name, mime, dataUrl } */
export async function POST(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;
  await ensureSetup();

  let body: { name?: unknown; mime?: unknown; dataUrl?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "درخواست نامعتبر است." }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
  const mime = typeof body.mime === "string" ? body.mime.trim().toLowerCase() : "";
  const dataUrl = typeof body.dataUrl === "string" ? body.dataUrl : "";

  if (!name || !dataUrl) {
    return NextResponse.json({ error: "نام فایل و محتوا الزامی است." }, { status: 400 });
  }

  /* استخراج payload از dataURL:  data:<mime>;base64,<payload> */
  const match = dataUrl.match(/^data:([^;,]+);base64,([\s\S]+)$/);
  if (!match) {
    return NextResponse.json({ error: "قالب فایل ارسالی معتبر نیست." }, { status: 400 });
  }
  const payload = match[2];
  const buffer = Buffer.from(payload, "base64");

  const isImage = ALLOWED_IMAGE.test(mime);
  const isVideo = ALLOWED_VIDEO.test(mime);
  if (!isImage && !isVideo) {
    return NextResponse.json(
      { error: "فقط تصویر (PNG، JPG، WebP، GIF، SVG) یا ویدیو (MP4، WebM، MOV) مجاز است." },
      { status: 400 },
    );
  }

  const max = isImage ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
  if (buffer.length === 0) {
    return NextResponse.json({ error: "فایل خالی است." }, { status: 400 });
  }
  if (buffer.length > max) {
    return NextResponse.json(
      {
        error: isImage
          ? "حجم تصویر بیش از حد مجاز است (حداکثر ۲٫۵ مگابایت)."
          : "حجم ویدیو بیش از حد مجاز است (حداکثر ۱۰ مگابایت).",
      },
      { status: 413 },
    );
  }

  const media = await db.media.create({
    data: {
      name,
      mime,
      kind: isImage ? "image" : "video",
      size: buffer.length,
      data: payload,
    },
    select: { id: true, name: true, mime: true, kind: true, size: true, createdAt: true },
  });

  return NextResponse.json({ media }, { status: 201 });
}
