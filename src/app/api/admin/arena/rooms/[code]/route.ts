import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guard } from "@/lib/admin";

/* حذف اتاق آرنا توسط مدیر — اعضا و پاسخ‌ها آبشاری حذف می‌شوند؛
   کش اسنپ‌شات زیر ثانیه‌ای منقضی می‌شود و بازیکنان به «اتاق پیدا نشد» می‌رسند. */

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const denied = await guard();
  if (denied) return denied;

  const { code } = await params;
  const clean = code.trim().toUpperCase();
  if (!/^[A-Z0-9]{4,8}$/.test(clean)) {
    return NextResponse.json({ error: "کد اتاق نامعتبر است." }, { status: 400 });
  }

  const room = await db.room.findUnique({ where: { code: clean } });
  if (!room) return NextResponse.json({ error: "اتاق پیدا نشد." }, { status: 404 });

  await db.room.delete({ where: { code: clean } });
  return NextResponse.json({ ok: true, code: clean });
}
