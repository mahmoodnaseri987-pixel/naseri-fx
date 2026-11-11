import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentMember } from "@/lib/member-auth";
import { getAuthed } from "@/lib/admin";
import { ensureSetup } from "@/lib/public-data";

/**
 * سرو فایل HTML بازی — فقط برای اعضای واردشده (یا مدیر برای پیش‌نمایش).
 * صفحه /play/{slug} این فایل را داخل iframe هم‌مبدأ اجرا می‌کند.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  await ensureSetup();
  const { slug } = await params;

  const [member, adminAuthed] = await Promise.all([getCurrentMember(), getAuthed()]);
  if (!member && !adminAuthed) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const game = await db.game.findUnique({ where: { slug } });
  if (!game || (!game.published && !adminAuthed)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (!game.html) {
    return NextResponse.json({ error: "empty game file" }, { status: 501 });
  }

  /* قفل «فقط اجرا از داخل سایت»: اگر مستقیم باز شود به صفحه بازی هدایت می‌شود */
  const guard = `<script>(function(){try{if(window.top===window.self){location.replace("/play/${game.slug}");}}catch(e){}})();</script>`;
  let html = game.html;
  if (/<head[^>]*>/i.test(html)) {
    html = html.replace(/<head[^>]*>/i, (m) => m + guard);
  } else {
    html = guard + html;
  }

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      /* فقط همین سایت می‌تواند این فایل را داخل صفحه قرار دهد */
      "Content-Security-Policy": "frame-ancestors 'self'",
      "X-Frame-Options": "SAMEORIGIN",
      "Cache-Control": "private, no-store",
    },
  });
}
