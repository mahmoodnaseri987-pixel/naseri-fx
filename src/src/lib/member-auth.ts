/* ابزارهای احراز هویت اعضای سایت — فقط سمت سرور */
import { cookies } from "next/headers";
import crypto from "crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureSetup } from "@/lib/public-data";
import type { MemberInfo } from "@/lib/types";

export const MEMBER_COOKIE = "naseri_member";
const SESSION_MS = 30 * 24 * 60 * 60 * 1000; // ۳۰ روز

/* --- سِکِرت امضای توکن — یک‌بار ساخته و در تنظیمات ذخیره می‌شود --- */
export async function getMemberSecret(): Promise<string> {
  await ensureSetup();
  const settings = await db.settings.findUnique({
    where: { id: "main" },
    select: { memberSecret: true },
  });
  if (settings?.memberSecret) return settings.memberSecret;

  const secret = crypto.randomBytes(32).toString("hex");
  await db.settings.update({ where: { id: "main" }, data: { memberSecret: secret } });
  return secret;
}

/* --- توکن نشست (HMAC) --- */
function sign(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

async function createMemberToken(memberId: string): Promise<string> {
  const secret = await getMemberSecret();
  const exp = Date.now() + SESSION_MS;
  const payload = Buffer.from(JSON.stringify({ sub: memberId, exp })).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

async function verifyMemberToken(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const secret = await getMemberSecret();
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(payload, secret));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (typeof data.sub !== "string" || typeof data.exp !== "number" || data.exp < Date.now()) {
      return null;
    }
    return data.sub;
  } catch {
    return null;
  }
}

/* --- نشست فعلی --- */
export async function getCurrentMember(): Promise<MemberInfo | null> {
  const store = await cookies();
  const memberId = await verifyMemberToken(store.get(MEMBER_COOKIE)?.value);
  if (!memberId) return null;
  const member = await db.member.findUnique({
    where: { id: memberId },
    select: { id: true, name: true, username: true, avatarUrl: true, blocked: true, createdAt: true },
  });
  if (!member || member.blocked) return null;
  return {
    id: member.id,
    name: member.name,
    username: member.username,
    avatarUrl: member.avatarUrl,
    createdAt: member.createdAt.toISOString(),
  };
}

/** پاسخ‌دهی ورود: ست‌کردن کوکی نشست */
export async function setMemberSession(memberId: string): Promise<void> {
  const token = await createMemberToken(memberId);
  const store = await cookies();
  store.set(MEMBER_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_MS / 1000,
    path: "/",
  });
}

/** خروج: پاک‌کردن کوکی */
export async function clearMemberSession(): Promise<void> {
  const store = await cookies();
  store.set(MEMBER_COOKIE, "", { httpOnly: true, maxAge: 0, path: "/" });
}

/** برای APIهای اعضا: اطلاعات عضو یا پاسخ 401 */
export async function memberGuard(): Promise<{ member: MemberInfo } | { denied: NextResponse }> {
  const member = await getCurrentMember();
  if (!member) {
    return { denied: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }
  return { member };
}

/* --- اعتبارسنجی شناسه ورود: ایمیل یا شماره موبایل --- */
export function normalizeUsername(raw: string): string | null {
  const value = raw.trim().toLowerCase();
  if (!value) return null;

  // شماره موبایل ایران: 09xxxxxxxxx یا +989xxxxxxxxx یا 989xxxxxxxxx
  const digits = value.replace(/[^\d+]/g, "");
  if (/^(\+98|98|0)?9\d{9}$/.test(digits)) {
    return "0" + digits.replace(/^(\+98|98|0)/, "");
  }

  // ایمیل ساده
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 120) {
    return value;
  }

  return null;
}

/* --- محدودسازی تلاش (حافظه‌ای، هم‌سبک با پنل مدیریت) --- */
const attempts = new Map<string, { count: number; resetAt: number }>();

export function memberRateLimit(key: string, max = 10, windowMs = 15 * 60 * 1000): boolean {
  const now = Date.now();
  const rec = attempts.get(key);
  if (!rec || rec.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (rec.count >= max) return false;
  rec.count += 1;
  return true;
}
