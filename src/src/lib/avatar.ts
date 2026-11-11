/* اعتبارسنجی عکس پروفایل اعضا — data URL کوچک که مستقیم در دیتابیس ذخیره می‌شود */

/** سقف حجم عکس پروفایل بعد از فشرده‌سازی سمت مرورگر */
export const AVATAR_MAX_BYTES = 150 * 1024;

export type ParsedAvatar = { mime: string; base64: string; bytes: number };

/**
 * data URL عکس را بررسی و نرمال می‌کند.
 * خروجی null یعنی نامعتبر (فرمت اشتباه یا حجم بیشتر از سقف).
 */
export function parseAvatar(raw: unknown): ParsedAvatar | null {
  if (typeof raw !== "string") return null;
  const m = /^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=\s]+)$/.exec(raw.trim());
  if (!m) return null;
  const kind = m[1].toLowerCase();
  const mime = kind === "jpg" ? "jpeg" : kind;
  const base64 = m[2].replace(/\s/g, "");
  const bytes = Math.floor((base64.length * 3) / 4);
  if (bytes < 64 || bytes > AVATAR_MAX_BYTES) return null;
  return { mime, base64, bytes };
}

/** data URL نرمال‌شده برای ذخیره در دیتابیس */
export function avatarDataUrl(a: ParsedAvatar): string {
  return `data:image/${a.mime};base64,${a.base64}`;
}
