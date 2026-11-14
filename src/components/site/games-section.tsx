"use client";

/* بخش بازی‌ها در صفحه اصلی — کارت‌های بازی با گیت عضویت */

import { Gamepad2, Play, Users, Lock, Flame } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FadeIn } from "@/components/site/fade-in";
import { useLang } from "@/components/site/language-provider";
import { APP_COLORS, APP_ICONS } from "@/components/site/apps";
import type { PublicGame } from "@/lib/types";

type GamesSectionProps = {
  games: PublicGame[];
};

export function GamesSection({ games }: GamesSectionProps) {
  const { t, lang } = useLang();
  const g = t.gamesSection;

  if (games.length === 0) return null;

  return (
    <section id="games" className="scroll-mt-20 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <FadeIn className="text-center">
          <span className="text-sm font-semibold text-violet-400">{g.badge}</span>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-zinc-50 sm:text-4xl">
            {g.title}
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-8 text-zinc-400">
            {g.subtitle}
          </p>
        </FadeIn>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {/* میدان آتش — نسخه آفلاین (بدون نیاز به عضویت) */}
          <FadeIn>
            <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-orange-500/40 bg-zinc-900/60 transition-all duration-300 hover:-translate-y-1 hover:border-orange-500/70 hover:shadow-xl hover:shadow-orange-500/10">
              <div className="flex h-36 w-full items-center justify-center border-b border-orange-500/20 bg-gradient-to-br from-orange-600/40 via-orange-500/20 to-rose-600/30">
                <Flame className="h-12 w-12 text-orange-200 opacity-90" aria-hidden="true" />
              </div>
              <div className="flex flex-1 flex-col p-6">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-lg font-bold text-zinc-50">{t.fireOffline.menuTitle}</h3>
                  <span className="shrink-0 rounded-full bg-orange-500/15 px-2.5 py-1 text-[11px] font-semibold text-orange-300">
                    {t.fireOffline.cardTag}
                  </span>
                </div>
                <p className="mt-2 flex-1 text-sm leading-7 text-zinc-400">{t.fireOffline.cardDesc}</p>
                <Button
                  asChild
                  className="mt-4 h-10 rounded-lg bg-orange-500 text-sm font-semibold text-zinc-950 hover:bg-orange-400"
                >
                  <a href="/fire">
                    <Play className="h-4 w-4" aria-hidden="true" />
                    {t.fireOffline.playCta}
                  </a>
                </Button>
              </div>
            </article>
          </FadeIn>

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
                      <span className="flex shrink-0 items-center gap-1 rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-[11px] font-semibold text-violet-300">
                        <Lock className="h-3 w-3" aria-hidden="true" />
                        {g.memberOnly}
                      </span>
                    </div>
                    <p className="mt-2 flex-1 text-sm leading-7 text-zinc-400">{description}</p>

                    <div className="mt-3 flex items-center gap-1.5 text-xs text-zinc-400">
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

          {/* کارت دعوت به عضویت */}
          <FadeIn delay={0.2}>
            <article className="flex h-full flex-col items-center justify-center rounded-2xl border border-dashed border-violet-500/40 bg-violet-500/5 p-6 text-center">
              <div className="flex h-13 w-13 items-center justify-center rounded-xl border border-violet-500/30 bg-violet-500/10 p-3">
                <Users className="h-6 w-6 text-violet-300" aria-hidden="true" />
              </div>
              <h3 className="mt-4 text-lg font-bold text-zinc-100">{g.loginHint}</h3>
              <div className="mt-5 flex w-full flex-col gap-2">
                <Button
                  asChild
                  className="h-10 rounded-lg bg-violet-500 text-sm font-semibold text-zinc-950 hover:bg-violet-400"
                >
                  <a href="/login?mode=register">{g.joinCta}</a>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  className="h-10 rounded-lg border-zinc-700 bg-transparent text-sm font-semibold text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
                >
                  <a href="/login">{g.loginCta}</a>
                </Button>
              </div>
            </article>
          </FadeIn>
        </div>
      </div>
    </section>
  );
}
