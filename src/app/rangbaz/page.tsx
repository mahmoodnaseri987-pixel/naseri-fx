import type { Metadata, Viewport } from "next";
import { LanguageProvider } from "@/components/site/language-provider";
import { RangbazSolo } from "@/components/site/rangbaz-solo";
import { PhotoGate } from "@/components/site/photo-gate";
import { getCurrentMember } from "@/lib/member-auth";
import { ensureSetup } from "@/lib/public-data";

export const metadata: Metadata = {
  title: "رنگ‌باز — سولو | کافه سرگرمی",
  description:
    "بازی کارتی نئونی رنگ‌باز — تک‌نفره با ربات‌های شخصیت‌دار (شاهین، نگار، بابک)، ماجراجویی ۱۵ مرحله‌ای و چالش روزانه؛ کاملاً آفلاین در مرورگر.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#09090f",
  viewportFit: "cover",
};

export const dynamic = "force-dynamic";

export default async function RangbazPage() {
  await ensureSetup();

  /* صفحهٔ عمومی است — عضو برای گیت عکس بررسی می‌شود؛ مهمان مستقیم بازی می‌کند */
  const member = await getCurrentMember();

  return (
    <LanguageProvider>
      {member && !member.avatarUrl ? <PhotoGate /> : <RangbazSolo />}
    </LanguageProvider>
  );
}
