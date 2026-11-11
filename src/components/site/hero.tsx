"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useLang } from "@/components/site/language-provider";
import { pickText } from "@/lib/site-texts";
import type { SiteContentMap } from "@/lib/types";
import { Download } from "lucide-react";

const container = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.12 },
  },
};

const item = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" as const } },
};

type HeroProps = {
  content?: SiteContentMap;
  bannerUrl?: string;
};

export function Hero({ content = {}, bannerUrl }: HeroProps) {
  const { t, lang } = useLang();

  const stats = t.hero.stats.map((stat, i) => ({
    value: pickText(content, `hero_stat${i + 1}_value_${lang}`, stat.value),
    label: pickText(content, `hero_stat${i + 1}_label_${lang}`, stat.label),
  }));

  return (
    <section id="top" className="relative overflow-hidden pt-32 pb-20 sm:pt-40 sm:pb-24">
      {/* تصویر بنر (در صورت انتخاب مدیر) */}
      {bannerUrl ? (
        <div aria-hidden="true" className="absolute inset-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={bannerUrl} alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-zinc-950/78" />
        </div>
      ) : null}

      {/* Tech background: grid + glow */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-grid" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[480px] bg-[radial-gradient(55%_60%_at_50%_0%,rgba(16,185,129,0.16),transparent)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent"
      />

      <div className="relative mx-auto max-w-6xl px-4 sm:px-6 text-center">
        <motion.div variants={container} initial="hidden" animate="show">
          <motion.div variants={item}>
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5 text-sm font-medium text-emerald-300">
              <span className="relative flex h-2 w-2" aria-hidden="true">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              {pickText(content, `hero_badge_${lang}`, t.hero.badge)}
            </span>
          </motion.div>

          <motion.h1
            variants={item}
            className="mt-6 text-4xl font-extrabold leading-[1.3] tracking-tight text-zinc-50 sm:text-6xl sm:leading-[1.25]"
          >
            {pickText(content, `hero_title_a_${lang}`, t.hero.titleA)}
            <br />
            <span className="bg-gradient-to-l from-emerald-300 via-emerald-400 to-teal-400 bg-clip-text text-transparent">
              {pickText(content, `hero_title_b_${lang}`, t.hero.titleB)}
            </span>
          </motion.h1>

          <motion.p
            variants={item}
            className="mx-auto mt-6 max-w-2xl text-base leading-8 text-zinc-400 sm:text-lg sm:leading-9"
          >
            {pickText(content, `hero_subtitle_${lang}`, t.hero.subtitle)}
          </motion.p>

          <motion.div
            variants={item}
            className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <Button
              asChild
              size="lg"
              className="h-12 w-full sm:w-auto rounded-full px-8 text-base bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold shadow-lg shadow-emerald-500/25"
            >
              <a href="#apps">
                <Download className="h-5 w-5" aria-hidden="true" />
                {t.hero.primaryCta}
              </a>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="h-12 w-full sm:w-auto rounded-full px-8 text-base border-zinc-700 bg-transparent text-zinc-200 hover:bg-zinc-800 hover:text-zinc-50 hover:border-zinc-600"
            >
              <a href="#contact">{t.hero.secondaryCta}</a>
            </Button>
          </motion.div>

          <motion.dl
            variants={item}
            className="mx-auto mt-16 grid max-w-3xl grid-cols-2 gap-y-8 sm:grid-cols-4"
            aria-label="Stats"
          >
            {stats.map((stat, index) => (
              <div
                key={stat.label}
                className={`flex flex-col items-center gap-1 ${
                  index > 0 ? "sm:border-s sm:border-zinc-800" : ""
                }`}
              >
                <dd className="text-3xl font-extrabold text-zinc-50">{stat.value}</dd>
                <dt className="text-sm text-zinc-500">{stat.label}</dt>
              </div>
            ))}
          </motion.dl>
        </motion.div>
      </div>
    </section>
  );
}
