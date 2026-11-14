import type { MetadataRoute } from "next";

/* نقشهٔ سایت — فقط صفحه‌های عمومی که گوگل اجازهٔ دیدنشان را دارد.
   بقیهٔ صفحه‌ها پشت دیوار عضویت‌اند و در نقشه معنا ندارند. */
const BASE = "https://mahmoudnaseri.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  const today = new Date();
  return [
    { url: BASE, lastModified: today, changeFrequency: "weekly", priority: 1 },
    { url: `${BASE}/fire`, lastModified: today, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE}/login`, lastModified: today, changeFrequency: "yearly", priority: 0.3 },
  ];
}
