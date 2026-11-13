import { redirect } from "next/navigation";
import { LanguageProvider } from "@/components/site/language-provider";
import { SiteHeader } from "@/components/site/header";
import { SiteFooter } from "@/components/site/footer";
import { ArenaLobby } from "@/components/site/arena-lobby";
import { getCurrentMember } from "@/lib/member-auth";
import { getFullSettings, ensureSetup } from "@/lib/public-data";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "آرنا | کافه سرگرمی",
  description: "اتاق‌های رقابتی — بازی گروهی و تک‌به‌تک با دیگر اعضا",
};

export default async function ArenaPage() {
  await ensureSetup();
  const member = await getCurrentMember();
  if (!member) {
    redirect("/login?next=/arena");
  }
  const settings = await getFullSettings();

  return (
    <LanguageProvider>
      <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
        <SiteHeader logoUrl={settings.logoUrl} />
        <main className="flex-1 pt-16">
          <ArenaLobby member={member} />
        </main>
        <SiteFooter logoUrl={settings.logoUrl} />
      </div>
    </LanguageProvider>
  );
}
