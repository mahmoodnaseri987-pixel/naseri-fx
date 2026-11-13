/* ================================================================
   رساندن کد بازیابی رمز به اعضا — پیامک (کاوه‌نگار) یا ایمیل (Resend)
   ================================================================
   سرویس‌دهنده‌ها با متغیر محیطی تنظیم می‌شوند؛ تا وقتی تنظیم نشده‌اند
   کانال «admin» است: کد در پنل مدیریت دیده می‌شود تا مدیر به عضو اعلام
   کند (کد در دیتابیس رمزنگاری‌شده ذخیره می‌شود، خام نه).
     • KAVENEGAR_API_KEY  → پیامک به شماره موبایل (receptor = 09xxxxxxxxx)
     • RESEND_API_KEY     → ایمیل از طریق Resend
     • MAIL_FROM          → (اختیاری) فرستندهٔ ایمیل مثل Naseri <no-reply@x.com>
   ================================================================ */

import crypto from "crypto";
import { db } from "@/lib/db";
import { getMemberSecret } from "@/lib/member-auth";

/* --- رمزنگاری کد برای ذخیره در دیتابیس (AES-256-GCM) --- */

async function boxKey(scope: string): Promise<Buffer> {
  const secret = await getMemberSecret();
  return crypto.createHash("sha256").update(`${scope}:${secret}`).digest();
}

/** رمزکردن کد — خروجی: iv:tag:cipher (همه base64) */
export async function encryptCode(code: string): Promise<string> {
  const key = await boxKey("reset-box");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(code, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(":");
}

/** بازکردن کد رمزنگاری‌شده — در صورت خرابی null */
export async function decryptCode(box: string): Promise<string | null> {
  try {
    const [ivB64, tagB64, dataB64] = box.split(":");
    if (!ivB64 || !tagB64 || !dataB64) return null;
    const key = await boxKey("reset-box");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    const dec = Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]);
    return dec.toString("utf8");
  } catch {
    return null;
  }
}

/** هش راستی‌آزمایی کد — HMAC-SHA256 با سِکِرت اعضا */
export async function hashResetCode(username: string, code: string): Promise<string> {
  const secret = await getMemberSecret();
  return crypto.createHmac("sha256", secret).update(`${username}:${code}`).digest("hex");
}

/** مقایسهٔ ثابت‌زمان دو هش */
export function safeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

/* --- رازهای پنل مدیریت (مثل کلید Resend) — در SiteContent رمزنگاری‌شده ---
   قلم جدا از کد بازیابی تا لو رفتن یکی به دیگری آسیب نزند */

export async function encryptSecret(value: string): Promise<string> {
  const key = await boxKey("mail-box");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(":");
}

export async function decryptSecret(box: string): Promise<string | null> {
  try {
    const [ivB64, tagB64, dataB64] = box.split(":");
    if (!ivB64 || !tagB64 || !dataB64) return null;
    const key = await boxKey("mail-box");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    const dec = Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]);
    return dec.toString("utf8");
  } catch {
    return null;
  }
}

/* --- تنظیمات ایمیل Resend — اولویت: پنل مدیریت، بعد env --- */

const MAIL_KEY_ROW = "mail_resend_key"; // رمزنگاری‌شده در SiteContent
const MAIL_FROM_ROW = "mail_from"; // متن ساده (فرستنده، مخفی نیست)
const DEFAULT_FROM = "Entertainment Café <onboarding@resend.dev>";

export type MailConfig = {
  apiKey: string;
  from: string;
  source: "panel" | "env" | "none";
};

export async function getMailConfig(): Promise<MailConfig> {
  const rows = await db.siteContent.findMany({
    where: { key: { in: [MAIL_KEY_ROW, MAIL_FROM_ROW] } },
  });
  const enc = rows.find((r) => r.key === MAIL_KEY_ROW)?.value;
  if (enc) {
    const apiKey = await decryptSecret(enc);
    if (apiKey) {
      const from = rows.find((r) => r.key === MAIL_FROM_ROW)?.value?.trim() || DEFAULT_FROM;
      return { apiKey, from, source: "panel" };
    }
  }
  if (process.env.RESEND_API_KEY) {
    return {
      apiKey: process.env.RESEND_API_KEY,
      from: process.env.MAIL_FROM?.trim() || DEFAULT_FROM,
      source: "env",
    };
  }
  return { apiKey: "", from: "", source: "none" };
}

/* --- پیامک با کاوه‌نگار — فقط وقتی KAVENEGAR_API_KEY تنظیم شده --- */

export async function sendSms(phone: string, message: string): Promise<boolean> {
  const apiKey = process.env.KAVENEGAR_API_KEY;
  if (!apiKey) return false;
  try {
    const res = await fetch(
      `https://api.kavenegar.com/v1/${encodeURIComponent(apiKey)}/sms/send.json`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ receptor: phone, message }).toString(),
        signal: AbortSignal.timeout(8000),
      },
    );
    const data = (await res.json().catch(() => null)) as
      | { return?: { status?: number } }
      | null;
    return res.ok && data?.return?.status === 200;
  } catch {
    return false;
  }
}

/* --- ایمیل با Resend — ارسال با خطای واقعی سرویس (برای تست پنل) --- */

export async function sendEmailVia(
  apiKey: string,
  from: string,
  to: string,
  subject: string,
  text: string,
): Promise<{ ok: boolean; status: number; error: string | null }> {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: [to], subject, text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return { ok: true, status: res.status, error: null };
    const data = (await res.json().catch(() => null)) as
      | { message?: string; name?: string }
      | null;
    return {
      ok: false,
      status: res.status,
      error: data?.message || data?.name || `خطای سرویس (${res.status})`,
    };
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error ? e.message : "خطای شبکه" };
  }
}

export async function sendEmail(to: string, subject: string, text: string): Promise<boolean> {
  const cfg = await getMailConfig();
  if (!cfg.apiKey) return false;
  const r = await sendEmailVia(cfg.apiKey, cfg.from, to, subject, text);
  return r.ok;
}

/* --- پوشاندن شناسه در پیام‌های عمومی — 09123456789 → 0912***6789 --- */

export function maskIdentifier(username: string): string {
  if (username.includes("@")) {
    const [local, domain] = username.split("@");
    const head = local.slice(0, Math.min(2, local.length));
    return `${head}${"•".repeat(Math.max(2, local.length - 2))}@${domain}`;
  }
  if (username.length >= 6) {
    return `${username.slice(0, 4)}${"•".repeat(username.length - 8)}${username.slice(-4)}`;
  }
  return username;
}
