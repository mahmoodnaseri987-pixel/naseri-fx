"use client";

import { FadeIn } from "@/components/site/fade-in";
import { useLang } from "@/components/site/language-provider";
import { pickText } from "@/lib/site-texts";
import type { SiteContentMap } from "@/lib/types";

type AboutProps = {
  content?: SiteContentMap;
  aboutImageUrl?: string;
};

export function About({ content = {}, aboutImageUrl }: AboutProps) {
  const { t } = useLang();
  const about = t.about;

  const imageUrl =
    aboutImageUrl && aboutImageUrl.trim() !== ""
      ? aboutImageUrl
      : "https://z-cdn.chatglm.cn/image-search-mcp/images-ppt/b2020cf19b08.jpg";

  return (
    <section id="about" className="scroll-mt-20 bg-zinc-900/40 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          {/* Image */}
          <FadeIn className="order-2 lg:order-1">
            <div className="relative aspect-[4/5] max-h-[560px] w-full overflow-hidden rounded-3xl border border-zinc-800">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl}
                alt={
                  t.dir === "rtl"
                    ? "میز کار توسعه‌دهنده با چند مانیتور در فضای تیره"
                    : "Developer desk setup with multiple monitors in a dark room"
                }
                loading="lazy"
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-gradient-to-t from-zinc-950/70 via-transparent to-transparent"
              />
            </div>
          </FadeIn>

          {/* Text */}
          <FadeIn delay={0.15} className="order-1 lg:order-2">
            <span className="text-sm font-semibold text-emerald-400">{about.badge}</span>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-zinc-50 sm:text-4xl">
              {pickText(content, `about_title_${t.dir === "rtl" ? "fa" : "en"}`, about.title)}
            </h2>
            <p className="mt-6 whitespace-pre-line text-base leading-8 text-zinc-400">
              {pickText(content, `about_p1_${t.dir === "rtl" ? "fa" : "en"}`, about.p1)}
            </p>
            <p className="mt-4 whitespace-pre-line text-base leading-8 text-zinc-400">
              {pickText(content, `about_p2_${t.dir === "rtl" ? "fa" : "en"}`, about.p2)}
            </p>

            <div className="mt-8 flex flex-wrap gap-2">
              {about.chips.map((chip) => (
                <span
                  key={chip}
                  className="rounded-full border border-zinc-700/80 bg-zinc-800/50 px-4 py-1.5 font-mono text-xs font-medium text-zinc-300"
                >
                  {chip}
                </span>
              ))}
            </div>
          </FadeIn>
        </div>
      </div>
    </section>
  );
}
