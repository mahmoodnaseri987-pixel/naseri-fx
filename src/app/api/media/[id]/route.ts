import { NextRequest } from "next/server";
import { db } from "@/lib/db";

/* سرو عمومی رسانه‌ها: /api/media/<id>
   با پشتیبانی از هدر Range برای جلوندازی ویدیو (Seek) */

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const media = await db.media.findUnique({ where: { id } });
  if (!media) {
    return new Response("Not found", { status: 404 });
  }

  const buffer = Buffer.from(media.data, "base64");
  const total = buffer.length;
  const rangeHeader = req.headers.get("range");

  const baseHeaders: Record<string, string> = {
    "Content-Type": media.mime,
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=31536000, immutable",
    "Content-Disposition": `inline; filename="media"`,
  };

  if (rangeHeader) {
    const match = rangeHeader.match(/bytes=(\d*)-(\d*)/);
    if (match) {
      const start = match[1] ? parseInt(match[1], 10) : 0;
      const end = match[2] ? Math.min(parseInt(match[2], 10), total - 1) : total - 1;
      if (Number.isFinite(start) && start <= end && start < total) {
        const chunk = buffer.subarray(start, end + 1);
        return new Response(new Uint8Array(chunk), {
          status: 206,
          headers: {
            ...baseHeaders,
            "Content-Range": `bytes ${start}-${end}/${total}`,
            "Content-Length": String(chunk.length),
          },
        });
      }
    }
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${total}` },
    });
  }

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: { ...baseHeaders, "Content-Length": String(total) },
  });
}
