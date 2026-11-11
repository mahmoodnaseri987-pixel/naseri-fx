import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { guard } from "@/lib/admin";
import { ensureSetup } from "@/lib/public-data";

/* سقف طول آدرس رسانه‌ها */
const MAX_URL = 600;

const settingsSchema = z.object({
  telegram: z.string().max(100).optional(),
  whatsapp: z.string().max(30).optional(),
  email: z.string().max(200).optional(),
  instagram: z.string().max(100).optional(),
  logoUrl: z.string().max(MAX_URL).optional(),
  bannerUrl: z.string().max(MAX_URL).optional(),
  aboutImageUrl: z.string().max(MAX_URL).optional(),
  motionUrl: z.string().max(MAX_URL).optional(),
  motionTitleFa: z.string().max(120).optional(),
  motionTitleEn: z.string().max(120).optional(),
});

const appearanceFields = [
  "logoUrl",
  "bannerUrl",
  "aboutImageUrl",
  "motionUrl",
  "motionTitleFa",
  "motionTitleEn",
] as const;

function publicSettings(s: {
  telegram: string;
  whatsapp: string;
  email: string;
  instagram: string;
  logoUrl: string;
  bannerUrl: string;
  aboutImageUrl: string;
  motionUrl: string;
  motionTitleFa: string;
  motionTitleEn: string;
} | null) {
  return {
    telegram: s?.telegram ?? "",
    whatsapp: s?.whatsapp ?? "",
    email: s?.email ?? "",
    instagram: s?.instagram ?? "",
    logoUrl: s?.logoUrl ?? "",
    bannerUrl: s?.bannerUrl ?? "",
    aboutImageUrl: s?.aboutImageUrl ?? "",
    motionUrl: s?.motionUrl ?? "",
    motionTitleFa: s?.motionTitleFa ?? "",
    motionTitleEn: s?.motionTitleEn ?? "",
  };
}

/** دریافت اطلاعات تماس + ظاهر سایت */
export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  await ensureSetup();
  const s = await db.settings.findUnique({ where: { id: "main" } });
  return NextResponse.json({ settings: publicSettings(s) });
}

/** ذخیره اطلاعات تماس و ظاهر سایت */
export async function PUT(req: NextRequest) {
  const denied = await guard();
  if (denied) return denied;
  await ensureSetup();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "درخواست نامعتبر است." }, { status: 400 });
  }

  const parsed = settingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "مقادیر نامعتبر است." }, { status: 400 });
  }

  const clean = (v?: string) => v?.trim() ?? undefined;
  const s = await db.settings.update({
    where: { id: "main" },
    data: {
      telegram: clean(parsed.data.telegram),
      whatsapp: clean(parsed.data.whatsapp)?.replace(/[^0-9]/g, ""),
      email: clean(parsed.data.email),
      instagram: clean(parsed.data.instagram)?.replace(/^@/, ""),
      logoUrl: clean(parsed.data.logoUrl)?.slice(0, MAX_URL),
      bannerUrl: clean(parsed.data.bannerUrl)?.slice(0, MAX_URL),
      aboutImageUrl: clean(parsed.data.aboutImageUrl)?.slice(0, MAX_URL),
      motionUrl: clean(parsed.data.motionUrl)?.slice(0, MAX_URL),
      motionTitleFa: clean(parsed.data.motionTitleFa)?.slice(0, 120),
      motionTitleEn: clean(parsed.data.motionTitleEn)?.slice(0, 120),
    },
  });

  return NextResponse.json({ settings: publicSettings(s) });
}
