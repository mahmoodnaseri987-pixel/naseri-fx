import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { LanguageProvider } from "@/components/site/language-provider";
import { FireRoomBanner } from "@/components/site/fire-room-banner";

export const metadata: Metadata = {
  title: "کافه سرگرمی | محمود ناصری — سازنده اپلیکیشن موبایل",
  description:
    "اپلیکیشن‌های موبایلی که مشکلات واقعی روزمره را حل می‌کنند — ساخته محمود ناصری. دانلود از کافه‌بازار و گوگل‌پلی، سفارش اپ اختصاصی و ارتباط مستقیم.",
  keywords: [
    "کافه سرگرمی",
    "محمود ناصری",
    "اپلیکیشن موبایل",
    "دانلود اپ",
    "توسعه‌دهنده اپلیکیشن",
    "فلاتر",
    "سفارش اپلیکیشن",
  ],
  authors: [{ name: "محمود ناصری" }],
  icons: {
    icon: "/icon-192.png",
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "کافه سرگرمی | محمود ناصری",
    description: "اپ‌هایی که کارهای روزمره را ساده‌تر می‌کنند.",
    siteName: "کافه سرگرمی",
    type: "website",
    locale: "fa_IR",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "کافه سرگرمی — بازی‌های گروهی زنده و اپلیکیشن‌های محمود ناصری",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "کافه سرگرمی | محمود ناصری",
    description: "بازی‌های گروهی زنده، اپلیکیشن‌های کاربردی و سرگرمی فارسی.",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning>
      <body className="antialiased bg-background text-foreground">
        {children}
        <LanguageProvider>
          <FireRoomBanner />
        </LanguageProvider>
        <Toaster />
      </body>
    </html>
  );
}
