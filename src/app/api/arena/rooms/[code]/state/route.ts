/* آرنا — وضعیت لحظه‌ای اتاق؛ صفحه اتاق هر ~۱ ثانیه این را می‌خواند */

import { NextRequest, NextResponse } from "next/server";
import { ensureSetup } from "@/lib/public-data";
import { memberGuard } from "@/lib/member-auth";
import { buildStateResponse } from "@/lib/arena-server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  await ensureSetup();
  const guard = await memberGuard();
  if ("denied" in guard) return guard.denied;

  const { code } = await params;
  const roomCode = decodeURIComponent(code).toUpperCase();
  const state = await buildStateResponse(roomCode, guard.member.id);
  if (!state) {
    return NextResponse.json({ error: "gone" }, { status: 404 });
  }
  return NextResponse.json(state, { headers: { "Cache-Control": "no-store" } });
}
