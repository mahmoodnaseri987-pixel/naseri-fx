import { redirect } from "next/navigation";
import { LanguageProvider } from "@/components/site/language-provider";
import { SiteHeader } from "@/components/site/header";
import { RecordsView, type RecordsGame } from "@/components/site/records-view";
import { getCurrentMember } from "@/lib/member-auth";
import { getFullSettings, ensureSetup } from "@/lib/public-data";
import { db } from "@/lib/db";
import { ARENA_CATALOG_DEFS } from "@/lib/arena-catalog";
import { isBotId } from "@/lib/arena-game";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "رکوردها | کافه سرگرمی",
};

/* تالار رکوردها — برای هر بازی یک جدول رده‌بندی جدا:
   بازی‌های گروهی آرنا = مجموع امتیاز RoomMemberها روی اتاق‌های همان بازی؛
   بازی‌های تک‌نفره (میدان آفلاین + بازی‌های آپلودی منتشرشده) = بهترین GameScore. */
export default async function RecordsPage() {
  await ensureSetup();
  const member = await getCurrentMember();
  if (!member) {
    redirect("/login?next=/records");
  }
  const settings = await getFullSettings();

  const memberIds = new Set<string>();

  /* ---------- بازی‌های گروهی آرنا ---------- */
  const roomDefs = ARENA_CATALOG_DEFS.filter((g) => g.kind === "room");
  const arenaGames: RecordsGame[] = [];
  for (const def of roomDefs) {
    const rows = await db.roomMember.groupBy({
      by: ["memberId"],
      where: { room: { gameSlug: def.slug, status: { in: ["playing", "finished"] } } },
      _sum: { score: true },
      orderBy: { _sum: { score: "desc" } },
      take: 30,
    });
    const top = rows
      .filter((r) => !isBotId(r.memberId) && (r._sum.score ?? 0) > 0)
      .slice(0, 10);
    top.forEach((r) => memberIds.add(r.memberId));
    arenaGames.push({
      slug: def.slug,
      kind: "room",
      icon: def.icon,
      titleFa: def.titleFa,
      titleEn: def.titleEn,
      metricFa: "مجموع امتیاز همهٔ مسابقه‌ها",
      metricEn: "Career total",
      rows: top.map((r, i) => ({
        rank: i + 1,
        memberId: r.memberId,
        name: "",
        score: r._sum.score ?? 0,
      })),
    });
  }

  /* ---------- بازی‌های تک‌نفره ---------- */
  const uploaded = await db.game.findMany({
    where: { published: true },
    select: { slug: true, titleFa: true, titleEn: true, icon: true },
  });
  const htmlDefs = [
    {
      slug: "fire-offline",
      titleFa: "میدان آتش (تک‌نفره)",
      titleEn: "Fire Arena (solo)",
      icon: "flame",
    },
    ...uploaded.map((g) => ({
      slug: g.slug,
      titleFa: g.titleFa,
      titleEn: g.titleEn,
      icon: g.icon,
    })),
  ];
  const htmlGames: RecordsGame[] = [];
  for (const def of htmlDefs) {
    const memberRows = await db.gameScore.groupBy({
      by: ["memberId"],
      where: { gameSlug: def.slug, memberId: { not: "" } },
      _max: { score: true },
      orderBy: { _max: { score: "desc" } },
      take: 12,
    });
    const guestRows = await db.gameScore.groupBy({
      by: ["name"],
      where: { gameSlug: def.slug, memberId: "" },
      _max: { score: true },
      orderBy: { _max: { score: "desc" } },
      take: 5,
    });
    const all = [
      ...memberRows
        .filter((r) => (r._max.score ?? 0) > 0)
        .map((r) => ({ memberId: r.memberId, name: "", score: r._max.score ?? 0 })),
      ...guestRows
        .filter((r) => (r._max.score ?? 0) > 0)
        .map((r) => ({ memberId: "", name: r.name, score: r._max.score ?? 0 })),
    ]
      .sort((x, y) => y.score - x.score)
      .slice(0, 10);
    all.forEach((r) => {
      if (r.memberId) memberIds.add(r.memberId);
    });
    htmlGames.push({
      slug: def.slug,
      kind: "html",
      icon: def.icon,
      titleFa: def.titleFa,
      titleEn: def.titleEn,
      metricFa: "بهترین رکورد",
      metricEn: "Best score",
      rows: all.map((r, i) => ({
        rank: i + 1,
        memberId: r.memberId,
        name: r.name,
        score: r.score,
      })),
    });
  }

  /* ---------- نام و آواتار رکورددارها ---------- */
  const members = memberIds.size
    ? await db.member.findMany({
        where: { id: { in: [...memberIds] } },
        select: { id: true, name: true, avatarUrl: true },
      })
    : [];
  const nameOf = new Map(members.map((m) => [m.id, m.name]));
  const avatarOf = new Set(members.filter((m) => m.avatarUrl).map((m) => m.id));
  const fill = (games: RecordsGame[]) =>
    games
      .map((g) => ({
        ...g,
        rows: g.rows.map((r) => ({
          ...r,
          name: r.name || nameOf.get(r.memberId) || "—",
          hasAvatar: avatarOf.has(r.memberId),
        })),
      }))
      .filter((g) => g.rows.length > 0);

  return (
    <LanguageProvider>
      <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
        <SiteHeader logoUrl={settings.logoUrl} />
        <main className="flex-1 pt-16">
          <RecordsView me={member.id} arena={fill(arenaGames)} html={fill(htmlGames)} />
        </main>
      </div>
    </LanguageProvider>
  );
}
