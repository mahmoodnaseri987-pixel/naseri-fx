"use client";

/* تشخیص نوع لینک ویدیو و رندر مناسب:
   - لینک مستقیم mp4/webm (یا /api/media/...) → پخش‌کننده ویدیو
   - آپارات → iframe امبد
   - یوتیوب → iframe امبد
   - بقیه → iframe عمومی */

export function resolveVideoEmbed(url: string): { type: "video"; src: string } | { type: "iframe"; src: string } | null {
  const clean = url.trim();
  if (!clean) return null;

  /* لینک مستقیم فایل ویدیو یا رسانه داخلی */
  if (/^\/api\/media\//.test(clean) || /\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(clean)) {
    return { type: "video", src: clean };
  }

  /* آپارات: aparat.com/v/HASH */
  const aparat = clean.match(/aparat\.com\/v\/([A-Za-z0-9]+)/);
  if (aparat) {
    return {
      type: "iframe",
      src: `https://www.aparat.com/video/video/embed/videohash/${aparat[1]}/vt/frame`,
    };
  }

  /* یوتیوب: watch?v=ID یا youtu.be/ID */
  const yt =
    clean.match(/youtube\.com\/watch\?v=([A-Za-z0-9_-]{6,})/) ??
    clean.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/);
  if (yt) {
    return { type: "iframe", src: `https://www.youtube-nocookie.com/embed/${yt[1]}` };
  }

  /* لینک امبد از قبل آماده (شامل /embed/) */
  if (/\/embed\//.test(clean)) {
    return { type: "iframe", src: clean };
  }

  /* سایر آدرس‌ها → iframe عمومی */
  if (/^https?:\/\//.test(clean)) {
    return { type: "iframe", src: clean };
  }

  return null;
}

type MediaEmbedProps = {
  url: string;
  title?: string;
  className?: string;
};

export function MediaEmbed({ url, title, className = "" }: MediaEmbedProps) {
  const resolved = resolveVideoEmbed(url);
  if (!resolved) return null;

  if (resolved.type === "video") {
    return (
      <video
        src={resolved.src}
        controls
        preload="metadata"
        playsInline
        className={`h-full w-full bg-black object-contain ${className}`}
        aria-label={title}
      />
    );
  }

  return (
    <iframe
      src={resolved.src}
      title={title ?? "video"}
      allowFullScreen
      loading="lazy"
      className={`h-full w-full border-0 ${className}`}
    />
  );
}
