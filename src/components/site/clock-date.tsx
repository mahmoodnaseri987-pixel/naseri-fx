"use client";

/* ساعت زنده و تاریخ در صفحهٔ شروع — فارسی: تقویم شمسی، انگلیسی: میلادی.
   تا پیش از اولین رندر سمت مرورگر خنثی است تا با سرور ناسازگار نشود (hydration). */

import { useEffect, useState } from "react";
import { useLang } from "@/components/site/language-provider";

type ClockParts = {
  time: string;
  date: string;
  weekday: string;
};

function readClock(lang: "fa" | "en"): ClockParts {
  const now = new Date();
  if (lang === "fa") {
    /* تقویم شمسی با ارقام فارسی */
    const date = new Intl.DateTimeFormat("fa-IR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(now);
    const weekday = new Intl.DateTimeFormat("fa-IR", { weekday: "long" }).format(now);
    const time = new Intl.DateTimeFormat("fa-IR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(now);
    return { time, date, weekday };
  }
  const date = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(now);
  const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "long" }).format(now);
  const time = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(now);
  return { time, date, weekday };
}

export function ClockDate() {
  const { lang } = useLang();
  /* null = هنوز در مرورگر اندازه‌گیری نشده — جای‌دار خنثی برای جلوگیری از ناسازگاری hydration */
  const [clock, setClock] = useState<ClockParts | null>(null);

  useEffect(() => {
    const tick = () => setClock(readClock(lang));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [lang]);

  if (!clock) {
    /* ارتفاع تقریبی تا چیدمان نپرد */
    return <div className="h-[52px]" aria-hidden="true" />;
  }

  return (
    <div
      dir={lang === "fa" ? "rtl" : "ltr"}
      className="mx-auto flex flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-2xl border border-zinc-800/80 bg-zinc-900/60 px-5 py-3 backdrop-blur-sm"
      aria-label="clock and calendar"
    >
      <span className="inline-flex items-center gap-2" aria-hidden="true">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-pulse rounded-full bg-emerald-400 opacity-70" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
        </span>
        <b className="font-mono text-xl tabular-nums tracking-wide text-emerald-300">{clock.time}</b>
      </span>
      <span className="h-4 w-px bg-zinc-700" aria-hidden="true" />
      <span className="text-sm font-semibold text-zinc-300">
        {clock.weekday} {lang === "fa" ? "، " : ", "}
        {clock.date}
      </span>
    </div>
  );
}
