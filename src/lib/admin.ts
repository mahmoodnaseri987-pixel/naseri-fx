/* ابزارهای احراز هویت مدیر — فقط سمت سرور */
import { cookies } from "next/headers";
import crypto from "crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const ADMIN_COOKIE = "naseri_admin";
const SESSION_MS = 7 * 24 * 60 * 60 * 1000; // ۷ روز

/* --- رمز عبور --- */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  if (candidate.length !== expected.length) return false;
  return crypto.timingSafeEqual(candidate, expected);
}

/* --- توکن نشست (HMAC) — سِکِرت از هش رمز فعلی مشتق می‌شود؛
       با تغییر رمز، همه نشست‌های قبلی باطل می‌شوند --- */
function sign(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

export function createToken(secret: string): string {
  const exp = Date.now() + SESSION_MS;
  const payload = Buffer.from(JSON.stringify({ exp })).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

export function verifyToken(token: string | undefined, secret: string): boolean {
  if (!token) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(payload, secret));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    return typeof data.exp === "number" && data.exp > Date.now();
  } catch {
    return false;
  }
}

/* --- نشست فعلی --- */
export async function getAuthed(): Promise<boolean> {
  const settings = await db.settings.findUnique({ where: { id: "main" } });
  if (!settings?.passwordHash) return false;
  const store = await cookies();
  const token = store.get(ADMIN_COOKIE)?.value;
  return verifyToken(token, settings.passwordHash);
}

/** برای APIهای مدیریتی: null یعنی مجاز، وگرنه پاسخ 401 */
export async function guard(): Promise<NextResponse | null> {
  if (await getAuthed()) return null;
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

/* --- محدودسازی تلاش ورود (حافظه‌ای، برای این مقیاس کافی است) --- */
const attempts = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, max = 8, windowMs = 10 * 60 * 1000): boolean {
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
