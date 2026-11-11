"use client";

/* فهرست بازی‌ها — صفحه اختصاصی /games با وضعیت عضویت */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Gamepad2, Play, Lock, LogOut, Loader2, Swords, Flame } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FadeIn } from "@/components/site/fade-in";
import { useLang } from "@/components/site/language-provider";
import { APP_COLORS, APP_ICONS } from "@/components/site/apps";
import type { MemberInfo, PublicGame } from "@/lib/types";

type GamesListProps = {
  games: PublicGame[];
};

export function GamesList({ games }: GamesListProps) {
  const { t, lang } = useLang();
  const g = t.gamesSection;
  const router = useRouter();
  const [member, setMember] = useState<MemberInfo | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/member/me")
      .then((r) => r.json())
      .then((d) => {
        if (alive) setMember(d.member ?? null);
      })
      .catch(() => undefined)
      .finally(() => {
        if (alive) setChecked(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  async function logout() {
    try {
      await fetch("/api/member/logout", { method: "POST" });
    } finally {
      setMember(null);
      router.refresh();
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
      <FadeIn className="text-center">
        <span className="text-sm font-semibold text-violet-400">{g.badge}</span>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-zinc-50 sm:text-4xl">
          {g.title}
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base leading-8 text-zinc-400">{g.subtitle}</p>
      </FadeIn>

      {/* وضعیت عضویت */}
      <FadeIn delay={0.05} className="mt-8 flex justify-center">
        {!checked ? (
          <Loader2 className="h-4 w-4 animate-spin text-zinc-600" aria-hidden="true" />
        ) : member ? (
          <div className="flex items-center gap-3 rounded-full border border-emerald-500/30 bg-emerald-500/10 py-2 pe-2 ps-4">
            <span className="text-sm text-emerald-300">
              {t.auth.welcome}، <b>{member.name}</b> 👋
            </span>
            <Button
              onClick={logout}
              size="sm"
              variant="outline"
              className="h-8 rounded-full border-zinc-700 bg-zinc-950 text-xs text-zinc-300 hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-300"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              {lang === "fa" ? "خروج" : "Sign out"}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 sm:flex-row">
            <Button
              asChild
              className="h-10 rounded-full bg-violet-500 px-6 text-sm font-semibold text-zinc-950 hover:bg-violet-400"
            >
              <a href="/login?mode=register">{g.joinCta}</a>
            </Button>
            <Button
              asChild
              variant="outline"
              className="h-10 rounded-full border-zinc-700 bg-transparent px-6 text-sm font-semibold text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
            >
              <a href="/login">{g.loginCta}</a>
            </Button>
          </div>
        )}
      </FadeIn>

      {/* شبکه بازی‌ها */}
      {/* میدان آتش — نسخه آفلاین (بدون نیاز به عضویت) */}
      <FadeIn delay={0.08} className="mt-10">
        <a
          href="/fire"
          className="group flex flex-col items-start gap-3 rounded-2xl border border-orange-500/40 bg-gradient-to-l from-orange-500/10 via-transparent to-transparent p-6 transition-colors hover:border-orange-500/70 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-3.5">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-orange-500/15">
              <Flame className="h-6 w-6 text-orange-300" aria-hidden="true" />
            </span>
            <div>
              <p className="flex flex-wrap items-center gap-2 text-base font-bold text-orange-200">
                {t.fireOffline.menuTitle}
                <span className="rounded-full bg-orange-500/15 px-2 py-0.5 text-[10px] font-bold text-orange-300">
                  {t.fireOffline.cardTag}
                </span>
              </p>
              <p className="mt-1 max-w-xl text-sm leading-7 text-zinc-400">{t.fireOffline.cardDesc}</p>
            </div>
          </div>
          <span className="flex shrink-0 items-center gap-2 rounded-full bg-orange-500 px-5 py-2.5 text-sm font-bold text-zinc-950 transition-colors group-hover:bg-orange-400">
            <Play className="h-4 w-4" aria-hidden="true" />
            {t.fireOffline.playCta}
          </span>
        </a>
      </FadeIn>

      {/* آرنا — رقابت گروهی */}
      <FadeIn delay={0.1} className="mt-5">
        <a
          href="/arena"
          className="group flex flex-col items-start gap-3 rounded-2xl border border-violet-500/30 bg-gradient-to-l from-violet-500/10 via-transparent to-transparent p-6 transition-colors hover:border-violet-500/50 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <p className="flex items-center gap-2 text-base font-bold text-violet-300">
              <Swords className="h-4.5 w-4.5" aria-hidden="true" />
              {t.arena.title}
            </p>
            <p className="mt-1 text-sm text-zinc-400">{t.arena.createHint}</p>
          </div>
          <span className="rounded-full bg-violet-500 px-5 py-2.5 text-sm font-bold text-zinc-950 transition-colors group-hover:bg-violet-400">
            {t.nav.arena}
          </span>
        </a>
      </FadeIn>

      <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {games.map((game, index) => {
          const Icon = APP_ICONS[game.icon] ?? Gamepad2;
          const gradient = APP_COLORS[game.color] ?? APP_COLORS.violet;
          const name = lang === "fa" ? game.titleFa : game.titleEn;
          const description = lang === "fa" ? game.descFa : game.descEn;

          return (
            <FadeIn key={game.id} delay={(index % 3) * 0.1}>
              <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60 transition-all duration-300 hover:-translate-y-1 hover:border-zinc-700 hover:bg-zinc-900 hover:shadow-xl hover:shadow-violet-500/5">
                {game.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={game.coverUrl}
                    alt={name}
                    className="h-36 w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div
                    className={`flex h-36 w-full items-center justify-center border-b bg-gradient-to-br ${gradient}`}
                  >
                    <Icon className="h-12 w-12 opacity-80" aria-hidden="true" />
                  </div>
                )}

                <div className="flex flex-1 flex-col p-6">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-lg font-bold text-zinc-50">{name}</h3>
                    {!member && (
                      <span className="flex shrink-0 items-center gap-1 rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-[11px] font-semibold text-violet-300">
                        <Lock className="h-3 w-3" aria-hidden="true" />
                        {g.memberOnly}
                      </span>
                    )}
                  </div>
                  <p className="mt-2 flex-1 text-sm leading-7 text-zinc-400">{description}</p>

                  <div className="mt-3 flex items-center gap-1.5 text-xs text-zinc-500">
                    <Gamepad2 className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>
                      {new Intl.NumberFormat(lang === "fa" ? "fa-IR" : "en-US").format(game.plays)}{" "}
                      {g.plays}
                    </span>
                  </div>

                  <Button
                    asChild
                    className="mt-4 h-10 rounded-lg bg-violet-500 text-sm font-semibold text-zinc-950 hover:bg-violet-400"
                  >
                    <a href={`/play/${game.slug}`}>
                      <Play className="h-4 w-4" aria-hidden="true" />
                      {g.playCta}
                    </a>
                  </Button>
                </div>
              </article>
            </FadeIn>
          );
        })}
      </div>

      {games.length === 0 && (
        <p className="mt-16 text-center text-sm text-zinc-500">
          {lang === "fa" ? "هنوز بازی‌ای منتشر نشده — به‌زودی!" : "No games published yet — coming soon!"}
        </p>
      )}
    </div>
  );
}
