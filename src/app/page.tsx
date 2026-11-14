import { LanguageProvider } from "@/components/site/language-provider";
import { SiteHeader } from "@/components/site/header";
import { Hero } from "@/components/site/hero";
import { Apps } from "@/components/site/apps";
import { GamesSection } from "@/components/site/games-section";
import { AppInstall } from "@/components/site/app-install";
import { BoxesSection } from "@/components/site/boxes-section";
import { MotionSection } from "@/components/site/motion-section";
import { RoadmapSection } from "@/components/site/roadmap-section";
import { About } from "@/components/site/about";
import { Contact } from "@/components/site/contact";
import { SiteFooter } from "@/components/site/footer";
import {
  getPublishedApps,
  getPublishedGames,
  getFullSettings,
  getSiteContent,
  getPublishedBoxes,
} from "@/lib/public-data";

// هر بار بازدید، محتوای جدید از دیتابیس خوانده شود
export const dynamic = "force-dynamic";

export default async function Home() {
  const [apps, games, settings, content, boxes] = await Promise.all([
    getPublishedApps(),
    getPublishedGames(),
    getFullSettings(),
    getSiteContent(),
    getPublishedBoxes(),
  ]);

  return (
    <LanguageProvider>
      <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
        <SiteHeader logoUrl={settings.logoUrl} />
        <main className="flex-1">
          <Hero content={content} bannerUrl={settings.bannerUrl} />
          <Apps apps={apps} contacts={settings} content={content} />
          <GamesSection games={games} />
          <AppInstall />
          <BoxesSection boxes={boxes} content={content} />
          <MotionSection
            motionUrl={settings.motionUrl}
            titleFa={settings.motionTitleFa}
            titleEn={settings.motionTitleEn}
          />
          <RoadmapSection />
          <About content={content} aboutImageUrl={settings.aboutImageUrl} />
          <Contact contacts={settings} />
        </main>
        <SiteFooter logoUrl={settings.logoUrl} />
      </div>
    </LanguageProvider>
  );
}
