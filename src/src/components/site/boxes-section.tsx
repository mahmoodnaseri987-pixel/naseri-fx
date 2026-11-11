"use client";

import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FadeIn } from "@/components/site/fade-in";
import { MediaEmbed } from "@/components/site/media-embed";
import { useLang } from "@/components/site/language-provider";
import { APP_COLORS, APP_ICONS } from "@/components/site/apps";
import { pickText } from "@/lib/site-texts";
import type { PublicBox, SiteContentMap } from "@/lib/types";

type BoxesSectionProps = {
  boxes: PublicBox[];
  content: SiteContentMap;
};

export function BoxesSection({ boxes, content }: BoxesSectionProps) {
  const { t, lang } = useLang();
  if (boxes.length === 0) return null;

  const title = pickText(
    content,
    `boxes_title_${lang}`,
    lang === "fa" ? "باکس‌های ویژه" : "Featured highlights",
  );
  const subtitle = pickText(content, `boxes_subtitle_${lang}`, "");

  return (
    <section id="boxes" className="scroll-mt-20 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <FadeIn className="text-center">
          <span className="text-sm font-semibold text-emerald-400">
            {pickText(content, `boxes_title_${lang}`, "") || title}
          </span>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-zinc-50 sm:text-4xl">
            {title}
          </h2>
          {subtitle && (
            <p className="mx-auto mt-4 max-w-2xl text-base leading-8 text-zinc-400">{subtitle}</p>
          )}
        </FadeIn>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {boxes.map((box, index) => {
            const Icon = APP_ICONS[box.icon] ?? Sparkles;
            const gradient = APP_COLORS[box.color] ?? APP_COLORS.emerald;
            const title_ = lang === "fa" ? box.titleFa : box.titleEn;
            const body = lang === "fa" ? box.bodyFa : box.bodyEn;
            const linkLabel = lang === "fa" ? box.linkLabelFa : box.linkLabelEn;

            return (
              <FadeIn key={box.id} delay={(index % 3) * 0.1}>
                <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60 transition-all duration-300 hover:-translate-y-1 hover:border-zinc-700 hover:bg-zinc-900 hover:shadow-xl hover:shadow-emerald-500/5">
                  {box.imageUrl ? (
                    <div className="relative aspect-video w-full overflow-hidden border-b border-zinc-800 bg-zinc-950">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={box.imageUrl}
                        alt={title_}
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    </div>
                  ) : null}

                  {box.videoUrl ? (
                    <div className="aspect-video w-full overflow-hidden border-b border-zinc-800 bg-black">
                      <MediaEmbed url={box.videoUrl} title={title_} />
                    </div>
                  ) : null}

                  <div className="flex flex-1 flex-col p-6">
                    {!box.imageUrl && !box.videoUrl && (
                      <div
                        className={`flex h-12 w-12 items-center justify-center rounded-xl border bg-gradient-to-br ${gradient}`}
                      >
                        <Icon className="h-5 w-5" aria-hidden="true" />
                      </div>
                    )}
                    <div className={box.imageUrl || box.videoUrl ? "mt-1" : "mt-5"}>
                      <h3 className="text-lg font-bold text-zinc-50">{title_}</h3>
                      {body && (
                        <p className="mt-3 whitespace-pre-line text-sm leading-7 text-zinc-400">
                          {body}
                        </p>
                      )}
                      {box.linkUrl && (
                        <Button
                          asChild
                          size="sm"
                          variant="outline"
                          className="mt-5 rounded-full border-zinc-700 bg-zinc-950 text-xs font-semibold text-zinc-200 hover:border-zinc-600 hover:bg-zinc-800 hover:text-zinc-50"
                        >
                          <a href={box.linkUrl} target="_blank" rel="noopener noreferrer">
                            {linkLabel || (lang === "fa" ? "مشاهده" : "Open")}
                          </a>
                        </Button>
                      )}
                    </div>
                  </div>
                </article>
              </FadeIn>
            );
          })}
        </div>
      </div>
    </section>
  );
}
