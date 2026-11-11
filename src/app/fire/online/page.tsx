import type { Metadata, Viewport } from "next";
import { LanguageProvider } from "@/components/site/language-provider";
import { FireOnline } from "@/components/site/fire-online";

export const metadata: Metadata = {
  title: "میدان آتش — گروهی آنلاین | ناصری",
  description:
    "نبرد گروهی تیمی در اتاق‌های کد-محور — دو تیم، تا ۸ نفر، با ربات‌های کمکی. کد اتاق را با دوستانت به اشتراک بگذار و بجنگ.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#09090b",
  viewportFit: "cover",
};

export default function FireOnlinePage() {
  return (
    <LanguageProvider>
      <FireOnline />
    </LanguageProvider>
  );
}
