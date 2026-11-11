import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { guard } from "@/lib/admin";
import { ensureSetup } from "@/lib/public-data";
import type { AdminGame } from "@/lib/types";

/* سقف حجم فایل بازی — متناسب با محدودیت بدنه درخواست Vercel */
export const MAX_GAME_BYTES = 3 * 1024 * 1024; // ۳ مگابایت

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;

function toAdminGame(row: {
  id: string;
  slug: string;
  titleFa: string;
  titleEn: string;
  descFa: string;
  descEn: string;
  icon: string;
  color: string;
  coverUrl: string;
  plays: number;
  published: boolean;
  sortOrder: number;
  sizeBytes: number;
  html: string;
  createdAt: Date;
}): AdminGame {
  return {
    id: row.id,
    slug: row.slug,
    titleFa: row.titleFa,
    titleEn: row.titleEn,
    descFa: row.descFa,
    descEn: row.descEn,
    icon: row.icon,
    color: row.color,
    coverUrl: row.coverUrl,
    plays: row.plays,
    published: row.published,
    sortOrder: row.sortOrder,
    sizeBytes: row.sizeBytes,
    hasFile: row.html.length > 0,
    createdAt: row.createdAt.toISOString(),
  };
}

/* فهرست همه بازی‌ها (شامل پیش‌نویس) */
export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  await ensureSetup();

  const rows = await db.game.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }] });
  return NextResponse.json({ games: rows.map(toAdminGame) });
}

/* افزودن بازی جدید — بدنه: { titleFa, titleEn?, slug?, descFa?, descEn?, icon?, color?, coverUrl?, html? } */
export async function POST(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;
  await ensureSetup();

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "درخواست نامعتبر است." }, { status: 400 });
  }

  const str = (key: string, max: number, fallback = "") => {
    const v = body[key];
    return typeof v === "string" ? v.trim().slice(0, max) : fallback;
  };

  const titleFa = str("titleFa", 80);
  if (!titleFa) {
    return NextResponse.json({ error: "عنوان فارسی بازی الزامی است." }, { status: 400 });
  }
  const titleEn = str("titleEn", 80) || titleFa;

  /* اسلاگ: دستی یا خودکار */
  let slug = str("slug", 40).toLowerCase();
  if (slug && !SLUG_RE.test(slug)) {
    return NextResponse.json(
      { error: "آدرس بازی فقط حروف کوچک انگلیسی، عدد و خط تیره (۲ تا ۴۰ کاراکتر) است." },
      { status: 400 },
    );
  }
  if (!slug) {
    slug = `game-${Math.random().toString(36).slice(2, 8)}`;
  }
  const slugTaken = await db.game.findUnique({ where: { slug } });
  if (slugTaken) {
    return NextResponse.json({ error: "این آدرس قبلاً استفاده شده است." }, { status: 409 });
  }

  const html = typeof body.html === "string" ? body.html : "";
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
  }

  const game = await db.game.create({
    data: {
      slug,
      titleFa,
      titleEn,
      descFa: str("descFa", 300),
      descEn: str("descEn", 300),
      icon: str("icon", 40, "Gamepad2") || "Gamepad2",
      color: str("color", 20, "emerald") || "emerald",
      coverUrl: str("coverUrl", 500),
      html,
      sizeBytes: html ? Buffer.byteLength(html, "utf8") : 0,
      published: body.published === true,
      sortOrder: typeof body.sortOrder === "number" ? Math.trunc(body.sortOrder) : 0,
    },
  });

  return NextResponse.json({ game: toAdminGame(game) }, { status: 201 });
}
