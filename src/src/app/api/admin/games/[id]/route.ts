import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guard } from "@/lib/admin";
import { MAX_GAME_BYTES } from "../route";
import { ensureSetup } from "@/lib/public-data";

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;

function pickStr(body: Record<string, unknown>, key: string, max: number): string | undefined {
  const v = body[key];
  if (typeof v !== "string") return undefined;
  return v.trim().slice(0, max);
}

/* دریافت یک بازی — شامل محتوای HTML برای ویرایش */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await params;

  const game = await db.game.findUnique({ where: { id } });
  if (!game) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ game });
}

/* ویرایش بازی — همه فیلدها اختیاری */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await params;
  await ensureSetup();

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "درخواست نامعتبر است." }, { status: 400 });
  }

  const existing = await db.game.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const data: Record<string, unknown> = {};

  const titleFa = pickStr(body, "titleFa", 80);
  if (titleFa !== undefined) {
    if (!titleFa) return NextResponse.json({ error: "عنوان فارسی نمی‌تواند خالی باشد." }, { status: 400 });
    data.titleFa = titleFa;
  }
  const titleEn = pickStr(body, "titleEn", 80);
  if (titleEn !== undefined) data.titleEn = titleEn || existing.titleFa;
  for (const key of ["descFa", "descEn", "coverUrl"] as const) {
    const v = pickStr(body, key, key === "coverUrl" ? 500 : 300);
    if (v !== undefined) data[key] = v;
  }
  const icon = pickStr(body, "icon", 40);
  if (icon) data.icon = icon;
  const color = pickStr(body, "color", 20);
  if (color) data.color = color;

  if (typeof body.slug === "string") {
    const slug = body.slug.trim().toLowerCase();
    if (!SLUG_RE.test(slug)) {
      return NextResponse.json(
        { error: "آدرس بازی فقط حروف کوچک انگلیسی، عدد و خط تیره است." },
        { status: 400 },
      );
    }
    if (slug !== existing.slug) {
      const taken = await db.game.findUnique({ where: { slug } });
      if (taken) {
        return NextResponse.json({ error: "این آدرس قبلاً استفاده شده است." }, { status: 409 });
      }
      data.slug = slug;
    }
  }

  if (typeof body.published === "boolean") data.published = body.published;
  if (typeof body.sortOrder === "number") data.sortOrder = Math.trunc(body.sortOrder);

  if (typeof body.html === "string") {
    const html = body.html;
    if (html) {
      const bytes = Buffer.byteLength(html, "utf8");
      if (bytes > MAX_GAME_BYTES) {
        return NextResponse.json(
          { error: "حجم فایل بازی بیش از حد مجاز است (حداکثر ۳ مگابایت)." },
          { status: 413 },
        );
      }
      if (!/<html|<body|<canvas|<script/i.test(html)) {
        return NextResponse.json(
          { error: "فایل انتخاب‌شده شبیه یک صفحه HTML بازی نیست." },
          { status: 400 },
        );
      }
      data.html = html;
      data.sizeBytes = bytes;
    }
  }

  const game = await db.game.update({ where: { id }, data });
  return NextResponse.json({ game });
}

/* حذف بازی به‌همراه آمار اجراهایش */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await guard();
  if (denied) return denied;
  const { id } = await params;

  const existing = await db.game.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  await db.gamePlay.deleteMany({ where: { gameId: id } });
  await db.game.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
