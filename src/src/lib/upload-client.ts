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
