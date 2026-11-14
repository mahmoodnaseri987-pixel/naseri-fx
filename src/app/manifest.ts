import type { MetadataRoute } from "next";

/* مانیفست PWA — سایت به‌عنوان اپ روی گوشی نصب می‌شود (افزودن به صفحهٔ اصلی) */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "کافه سرگرمی | محمود ناصری",
    short_name: "کافه سرگرمی",
    description:
      "بازی‌های گروهی زنده، اپلیکیشن‌های کاربردی و سرگرمی فارسی — ساخته محمود ناصری",
    start_url: "/",
    display: "standalone",
    dir: "rtl",
    lang: "fa",
    background_color: "#09090b",
    theme_color: "#09090b",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
