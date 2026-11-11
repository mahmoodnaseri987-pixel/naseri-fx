/* سرو عکس پروفایل یک عضو — با کش کوتاه تا polling چت سنگین نشود */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!/^[a-z0-9]{10,40}$/i.test(id)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const member = await db.member.findUnique({
    where: { id },
    select: { avatarUrl: true },
  });
  if (!member || !member.avatarUrl) {
    return new NextResponse("Not found", { status: 404 });
  }

  const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(member.avatarUrl);
  if (!m) {
    return new NextResponse("Not found", { status: 404 });
  }

  const bytes = Uint8Array.from(Buffer.from(m[2], "base64"));
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": m[1],
      "Content-Length": String(bytes.byteLength),
      /* عکس به‌ندرت عوض می‌شود؛ کش کوتاه + استیل وایل ری‌ولیدیت */
      "Cache-Control": "public, max-age=60, stale-while-revalidate=600",
    },
  });
}
