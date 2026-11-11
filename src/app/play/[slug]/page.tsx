import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentMember } from "@/lib/member-auth";
import { getAuthed } from "@/lib/admin";
import { ensureSetup } from "@/lib/public-data";
import { LanguageProvider } from "@/components/site/language-provider";
import { PlayClient } from "@/components/site/play-client";
import { PhotoGate } from "@/components/site/photo-gate";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "اجرا | ناصری",
};

export default async function PlayPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await ensureSetup();
  const { slug } = await params;

  /* گیت عضویت — اعضای مهمان به صفحه ورود هدایت می‌شوند؛ مدیر برای پیش‌نمایش مجاز است */
  const [member, adminAuthed] = await Promise.all([getCurrentMember(), getAuthed()]);
  if (!member && !adminAuthed) {
    redirect(`/login?next=/play/${slug}`);
  }

  const game = await db.game.findUnique({
    where: { slug },
    select: { id: true, slug: true, titleFa: true, titleEn: true, published: true },
  });
  if (!game || (!game.published && !adminAuthed)) {
    notFound();
  }

  /* آمار اجرا — فقط برای اعضا (پیش‌نمایش مدیر شمرده نمی‌شود) */
  if (member) {
    await db.game.update({ where: { id: game.id }, data: { plays: { increment: 1 } } });
    await db.gamePlay
      .create({ data: { gameId: game.id, memberId: member.id } })
      .catch(() => undefined);
  }

  /* گیت عکس پروفایل — عضو بدون عکس قبل از اجرای بازی به گذاشتن عکس می‌رسد */
  if (member && !member.avatarUrl) {
    return (
      <LanguageProvider>
        <PhotoGate />
      </LanguageProvider>
    );
  }

  return (
    <LanguageProvider>
      <PlayClient
        slug={game.slug}
        titleFa={game.titleFa}
        titleEn={game.titleEn}
        memberName={member?.name ?? ""}
      />
    </LanguageProvider>
  );
}
