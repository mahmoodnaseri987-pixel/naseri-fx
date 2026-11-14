"use client";

/* نقشه راه سایت در صفحهٔ نخست — برای تازه‌واردها: این‌جا چیست، الان کجای مسیریم،
   قرار است به کجا برسیم (آرنای ۵۰+ بازی، بازی تک‌نفره، اپ‌های قابل دانلود). */

import { FadeIn } from "@/components/site/fade-in";
import { useLang } from "@/components/site/language-provider";
import { Gamepad2, PartyPopper, Smartphone, Swords, type LucideIcon } from "lucide-react";

type Phase = {
  icon: LucideIcon;
  chip: string; // استایل بج وضعیت
  iconBox: string; // استایل خانهٔ آیکون
};

const PHASE_STYLES: Phase[] = [
  {
    icon: PartyPopper,
    chip: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
    iconBox: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  },
  {
    icon: Swords,
    chip: "border-amber-500/40 bg-amber-500/10 text-amber-300",
    iconBox: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  },
  {
    icon: Gamepad2,
    chip: "border-sky-500/40 bg-sky-500/10 text-sky-300",
    iconBox: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  },
  {
    icon: Smartphone,
    chip: "border-violet-500/40 bg-violet-500/10 text-violet-300",
    iconBox: "border-violet-500/30 bg-violet-500/10 text-violet-300",
  },
];

export function RoadmapSection() {
  const { t } = useLang();
  const r = t.roadmap;
  const phases = [
    { title: r.ph1Title, status: r.ph1Status, desc: r.ph1Desc, now: true },
    { title: r.ph2Title, status: r.ph2Status, desc: r.ph2Desc, now: false },
    { title: r.ph3Title, status: r.ph3Status, desc: r.ph3Desc, now: false },
    { title: r.ph4Title, status: r.ph4Status, desc: r.ph4Desc, now: false },
  ];

  return (
    <section id="roadmap" className="scroll-mt-20 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* سربرگ + پیشرفت */}
        <FadeIn className="mx-auto max-w-3xl text-center">
          <span className="text-sm font-semibold text-emerald-400">{r.badge}</span>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-zinc-50 sm:text-4xl">
            {r.title}
          </h2>
          <p className="mt-5 whitespace-pre-line text-base leading-8 text-zinc-400">{r.p1}</p>
        </FadeIn>

        <FadeIn delay={0.1} className="mx-auto mt-10 max-w-3xl">
          <p className="flex items-center justify-between gap-3 text-sm font-bold text-zinc-200">
            <span>{r.progressLabel}</span>
          </p>
          <div className="mt-2.5 h-3 overflow-hidden rounded-full bg-zinc-800" dir="ltr">
            <div className="relative h-full w-[15%] rounded-full bg-gradient-to-r from-emerald-500 to-emerald-300">
              <span className="absolute -right-1 top-1/2 h-3 w-3 -translate-y-1/2 animate-pulse rounded-full bg-emerald-300 shadow-[0_0_12px] shadow-emerald-400/80" />
            </div>
          </div>
          <p className="mt-2.5 text-xs leading-6 text-zinc-400">{r.progressNote}</p>
        </FadeIn>

        {/* چهار فاز مسیر */}
        <div className="mt-12 grid gap-5 md:grid-cols-2">
          {phases.map((p, i) => {
            const s = PHASE_STYLES[i]!;
            const Icon = s.icon;
            return (
              <FadeIn key={p.title} delay={0.1 + i * 0.08}>
                <div className="h-full rounded-3xl border border-zinc-800 bg-zinc-900/60 p-6 transition-colors hover:border-zinc-700">
                  <div className="flex items-center justify-between gap-3">
                    <span
                      className={`flex h-11 w-11 items-center justify-center rounded-2xl border ${s.iconBox}`}
                    >
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${s.chip}`}
                    >
                      {p.now && (
                        <span
                          className="h-1.5 w-1.5 animate-pulse rounded-full bg-current"
                          aria-hidden="true"
                        />
                      )}
                      {p.status}
                    </span>
                  </div>
                  <h3 className="mt-4 text-lg font-extrabold text-zinc-50">{p.title}</h3>
                  <p className="mt-2 text-sm leading-7 text-zinc-400">{p.desc}</p>
                </div>
              </FadeIn>
            );
          })}
        </div>

        {/* مأموریت + دعوت */}
        <FadeIn delay={0.15} className="mt-10">
          <div className="rounded-3xl border border-emerald-500/20 bg-gradient-to-b from-emerald-500/10 to-transparent p-6 text-center sm:p-8">
            <p className="text-base font-extrabold leading-8 text-zinc-100 sm:text-lg">
              <PartyPopper className="me-2 inline h-5 w-5 text-emerald-300" aria-hidden="true" />
              {r.mission}
            </p>
            <a
              href="#contact"
              className="mt-4 inline-block rounded-full border border-emerald-500/40 bg-emerald-500/10 px-5 py-2 text-sm font-bold text-emerald-300 transition-colors hover:bg-emerald-500/20"
            >
              {r.cta}
            </a>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
