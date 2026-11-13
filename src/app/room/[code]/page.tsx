import { redirect } from "next/navigation";
import { LanguageProvider } from "@/components/site/language-provider";
import { SiteHeader } from "@/components/site/header";
import { RoomClient } from "@/components/site/room-client";
import { getCurrentMember } from "@/lib/member-auth";
import { getFullSettings, ensureSetup } from "@/lib/public-data";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "اتاق بازی | کافه سرگرمی",
};

export default async function RoomPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  await ensureSetup();
  const { code: rawCode } = await params;
  const code = decodeURIComponent(rawCode).toUpperCase();

  const member = await getCurrentMember();
  if (!member) {
    redirect(`/login?next=/room/${code}`);
  }
  const settings = await getFullSettings();

  return (
    <LanguageProvider>
      <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
        <SiteHeader logoUrl={settings.logoUrl} />
        <main className="flex-1 pt-16">
          <RoomClient code={code} />
        </main>
      </div>
    </LanguageProvider>
  );
}
