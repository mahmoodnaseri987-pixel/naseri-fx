import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guard } from "@/lib/admin";

/* مسدود/آزادسازی عضو */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await params;

  let body: { blocked?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "درخواست نامعتبر است." }, { status: 400 });
  }
  if (typeof body.blocked !== "boolean") {
    return NextResponse.json({ error: "مقدار blocked الزامی است." }, { status: 400 });
  }

  const existing = await db.member.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const member = await db.member.update({
    where: { id },
    data: { blocked: body.blocked },
  });
  return NextResponse.json({ member: { id: member.id, blocked: member.blocked } });
}

/* حذف عضو به‌همراه تاریخچه اجراهایش */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await params;

  const existing = await db.member.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  await db.gamePlay.deleteMany({ where: { memberId: id } });
  await db.member.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
