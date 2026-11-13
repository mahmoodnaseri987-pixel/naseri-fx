import { LanguageProvider } from "@/components/site/language-provider";
import { SiteHeader } from "@/components/site/header";
import { SiteFooter } from "@/components/site/footer";
import { GamesList } from "@/components/site/games-list";
import { getPublishedGames, getFullSettings } from "@/lib/public-data";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "بازی‌ها | کافه سرگرمی",
  description: "بازی‌های مرورگری — فقط برای اعضای سایت",
};

export default async function GamesPage() {
  const [games, settings] = await Promise.all([getPublishedGames(), getFullSettings()]);

  return (
    <LanguageProvider>
      <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
        <SiteHeader logoUrl={settings.logoUrl} />
        <main className="flex-1 pt-16">
          <GamesList games={games} />
        </main>
        <SiteFooter logoUrl={settings.logoUrl} />
      </div>
    </LanguageProvider>
  );
}
