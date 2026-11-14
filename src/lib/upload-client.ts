/* ابزارهای آپلود در مرورگر: فشرده‌سازی عکس و تبدیل به dataURL */

const MAX_IMAGE_DIM = 1920; // بزرگ‌ترین ضلع مجاز بعد از فشرده‌سازی
const JPEG_QUALITY = 0.85;

export type PreparedFile = {
  name: string;
  mime: string;
  dataUrl: string;
  size: number;
};

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("خواندن فایل ناموفق بود."));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("فایل تصویر معتبر نیست."));
    img.src = src;
  });
}

/**
 * آماده‌سازی فایل برای آپلود:
 * - تصویرهای JPG/WebP/AVIF → تغییر اندازه تا ۱۹۲۰px و تبدیل به JPEG
 * - PNG/GIF/SVG → دست‌نخورده (برای حفظ شفافیت و انیمیشن)
 * - ویدیو → دست‌نخورده
 */
export async function prepareFile(file: File): Promise<PreparedFile> {
  const raw = await readAsDataUrl(file);
  const isResizable =
    /^image\/(jpe?g|webp|avif)$/i.test(file.type);

  if (!isResizable) {
    return { name: file.name, mime: file.type, dataUrl: raw, size: file.size };
  }

  try {
    const img = await loadImage(raw);
    const scale = Math.min(1, MAX_IMAGE_DIM / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas unavailable");
    ctx.drawImage(img, 0, 0, w, h);

    const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
    const size = Math.round((dataUrl.length - dataUrl.indexOf(",") - 1) * 0.75);

    /* اگر فشرده‌سازی بزرگ‌تر شد (عکس کوچک)، همان فایل اصلی بماند */
    if (size >= file.size) {
      return { name: file.name, mime: file.type, dataUrl: raw, size: file.size };
    }
    const base = file.name.replace(/\.[^.]+$/, "");
    return { name: `${base}.jpg`, mime: "image/jpeg", dataUrl, size };
  } catch {
    return { name: file.name, mime: file.type, dataUrl: raw, size: file.size };
  }
}

/* نمایش حجم به شکل خوانا */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} بایت`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} کیلوبایت`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} مگابایت`;
}

/* ================================================================
   آپلود رسانه — فایل‌های بزرگ تکه‌تکه می‌روند
   (سقف بدنهٔ درخواست Vercel ≈ ۴٫۵ مگابایت؛ هر تکه ۲٫۸ مگابایت خام)
   ================================================================ */

export const MEDIA_IMAGE_MAX = 2.5 * 1024 * 1024; // ۲٫۵ مگابایت
export const MEDIA_VIDEO_MAX = 10 * 1024 * 1024; // ۱۰ مگابایت
const MEDIA_SINGLE_MAX = 3 * 1024 * 1024; // تا این حجم یک‌جا
const MEDIA_CHUNK_BYTES = Math.floor(2.8 * 1024 * 1024); // هر تکهٔ خام

export type UploadedMedia = {
  id: string;
  name: string;
  mime: string;
  kind: string;
  size: number;
  createdAt?: string;
};

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    bin += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(bin);
}

async function postJson(url: string, body: unknown): Promise<{ ok: boolean; data: Record<string, unknown> | null }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  return { ok: res.ok, data };
}

/** آپلود عکس/ویدیو با پیشرفت — بزرگ‌تر از ۳ مگابایت خودکار تکه‌تکه می‌رود */
export async function uploadMedia(file: File, onProgress?: (pct: number) => void): Promise<UploadedMedia> {
  const isImage = /^image\//.test(file.type);
  const isVideo = /^video\//.test(file.type);
  if (!isImage && !isVideo) throw new Error("فقط تصویر (PNG، JPG، WebP، GIF، SVG) یا ویدیو (MP4، WebM، MOV) مجاز است.");
  const max = isImage ? MEDIA_IMAGE_MAX : MEDIA_VIDEO_MAX;
  if (file.size > max) {
    throw new Error(
      isImage
        ? "حجم تصویر بیش از حد مجاز است (حداکثر ۲٫۵ مگابایت)."
        : "حجم ویدیو بیش از حد مجاز است (حداکثر ۱۰ مگابایت).",
    );
  }

  /* تصویرها فشرده می‌شوند؛ ویدیو دست‌نخورده */
  let name = file.name;
  let mime = file.type;
  let bytes = new Uint8Array(await file.arrayBuffer());
  if (isImage) {
    const prepared = await prepareFile(file);
    name = prepared.name;
    mime = prepared.mime;
    const raw = atob(prepared.dataUrl.slice(prepared.dataUrl.indexOf(",") + 1));
    bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    if (bytes.length > MEDIA_IMAGE_MAX) {
      throw new Error("حجم تصویر بیش از حد مجاز است (حداکثر ۲٫۵ مگابایت).");
    }
  }

  onProgress?.(2);

  /* کوچک — یک‌جا مثل قبل */
  if (bytes.length <= MEDIA_SINGLE_MAX) {
    const r = await postJson("/api/admin/media", {
      name,
      mime,
      dataUrl: `data:${mime};base64,${bytesToBase64(bytes)}`,
    });
    if (!r.ok) throw new Error((r.data?.error as string) ?? "آپلود ناموفق بود.");
    onProgress?.(100);
    return r.data!.media as UploadedMedia;
  }

  /* بزرگ — begin → chunk ×n → commit */
  const begin = await postJson("/api/admin/media/chunk", { action: "begin", name, mime });
  if (!begin.ok) throw new Error((begin.data?.error as string) ?? "شروع آپلود ناموفق بود.");
  const uploadId = begin.data!.uploadId as string;
  const total = Math.ceil(bytes.length / MEDIA_CHUNK_BYTES);
  try {
    for (let i = 0; i < total; i++) {
      const slice = bytes.subarray(i * MEDIA_CHUNK_BYTES, Math.min(bytes.length, (i + 1) * MEDIA_CHUNK_BYTES));
      const r = await postJson("/api/admin/media/chunk", {
        action: "chunk",
        uploadId,
        index: i,
        data: bytesToBase64(slice),
      });
      if (!r.ok) throw new Error((r.data?.error as string) ?? "آپلود تکه ناموفق بود.");
      onProgress?.(2 + Math.round(((i + 1) / (total + 1)) * 96));
    }
    const done = await postJson("/api/admin/media/chunk", { action: "commit", uploadId, name, mime });
    if (!done.ok) throw new Error((done.data?.error as string) ?? "تکمیل آپلود ناموفق بود.");
    onProgress?.(100);
    return done.data!.media as UploadedMedia;
  } catch (err) {
    void postJson("/api/admin/media/chunk", { action: "abort", uploadId }).catch(() => undefined);
    throw err;
  }
}
