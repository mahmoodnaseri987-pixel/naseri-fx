import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import { db } from "@/lib/db";
import { guard } from "@/lib/admin";

/* فعال/غیرفعال کردن یک آهنگ «شعر یادت نره» — فقط فیلد active آپدیت می‌شود */

/* نام فایل باید فقط نام سادهٔ داخل پوشهٔ songs باشد — بدون مسیر و .. */
function simpleFilename(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const name = v.trim();
  if (!name || name.includes("/") || name.includes("\\") || name.includes("..")) return null;
  if (path.basename(name) !== name || name.startsWith(".")) return null;
  return name;
}

export async function POST(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "درخواست نامعتبر است." }, { status: 400 });
  }

  const filename = simpleFilename(body.filename);
  if (!filename)
    return NextResponse.json({ error: "نام فایل نامعتبر است." }, { status: 400 });
  if (typeof body.active !== "boolean")
    return NextResponse.json({ error: "مقدار active باید true یا false باشد." }, { status: 400 });

  try {
    const song = await db.sherSong.update({
      where: { filename },
      data: { active: body.active },
    });
    return NextResponse.json({ song });
  } catch {
    return NextResponse.json(
      { error: "رکوردی برای این فایل در دیتابیس نیست — اول متادیتا را ذخیره کنید." },
      { status: 404 },
    );
  }
}
