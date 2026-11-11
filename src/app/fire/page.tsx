import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { LanguageProvider } from "@/components/site/language-provider";
import { FireOffline } from "@/components/site/fire-offline";
import { PhotoGate } from "@/components/site/photo-gate";
import { getCurrentMember } from "@/lib/member-auth";
import { getAuthed } from "@/lib/admin";
import { ensureSetup } from "@/lib/public-data";

export const metadata: Metadata = {
  title: "میدان آتش — آفلاین | ناصری",
  description:
    "شوتر موجی تک‌نفره — کاملاً آفلاین در مرورگر اجرا می‌شود؛ با کیبورد و موس روی کامپیوتر، با دو اهرم لمسی روی موبایل. بدون عضویت، بدون تاخیر.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#09090b",
  viewportFit: "cover",
};

export const dynamic = "force-dynamic";

export default async function FirePage() {
  await ensureSetup();

  /* گیت عضویت — اعضای مهمان به صفحه ورود هدایت می‌شوند؛ مدیر برای پیش‌نمایش مجاز است */
  const [member, adminAuthed] = await Promise.all([getCurrentMember(), getAuthed()]);
  if (!member && !adminAuthed) {
    redirect("/login?next=/fire");
  }

  return (
    <LanguageProvider>
      {/* گیت عکس پروفایل — عضو بدون عکس قبل از اجرای بازی به گذاشتن عکس می‌رسد */}
      {member && !member.avatarUrl ? <PhotoGate /> : <FireOffline />}
    </LanguageProvider>
  );
}
