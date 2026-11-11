"use client";

import { Clapperboard } from "lucide-react";
import { FadeIn } from "@/components/site/fade-in";
import { MediaEmbed } from "@/components/site/media-embed";
import { useLang } from "@/components/site/language-provider";

type MotionSectionProps = {
  motionUrl: string;
  titleFa: string;
  titleEn: string;
};

export function MotionSection({ motionUrl, titleFa, titleEn }: MotionSectionProps) {
  const { lang } = useLang();
  if (!motionUrl.trim()) return null;

  const title = (lang === "fa" ? titleFa : titleEn) || (lang === "fa" ? "موشن گرافیک" : "Motion graphic");

  return (
    <section id="motion" className="scroll-mt-20 bg-zinc-900/40 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <FadeIn className="text-center">
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-400">
            <Clapperboard className="h-4 w-4" aria-hidden="true" />
            {title}
          </span>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-zinc-50 sm:text-4xl">
            {lang === "fa" ? "تماشا کنید" : "Watch it in motion"}
          </h2>
        </FadeIn>

        <FadeIn delay={0.15} className="mt-12">
          <div className="mx-auto max-w-4xl overflow-hidden rounded-3xl border border-zinc-800 bg-black shadow-2xl shadow-emerald-500/5">
            <div className="aspect-video w-full">
              <MediaEmbed url={motionUrl} title={title} />
            </div>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
