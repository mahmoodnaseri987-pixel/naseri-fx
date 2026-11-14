"use client";

/* ================================================================
   رنگ‌باز — سولوی آفلاین در مرورگر (بدون اتاق، بدون تاخیر)
   ● بازی سریع با ۱ تا ۳ ربات (تازه‌کار/حرفه‌ای/استاد)
   ● ربات‌های شخصیت‌دار: شاهین (هجومی)، نگار (محتاط)، بابک (بلوف‌زن)
   ● ماجراجویی: ۱۵ مرحله با قوانین ویژه — باس در مراحل ۵/۱۰/۱۵
   ● چالش روزانه: دست ثابت و مشترک برای همه، بذر تاریخ امروز
   رکوردها و پیشرفت در localStorage ذخیره می‌شود.
   ================================================================ */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLang } from "@/components/site/language-provider";
import { RangbazTable, RbCardArt } from "@/components/site/rangbaz-table";
import {
  buildRbView,
  rbBotMove,
  rbCatch,
  rbCreateState,
  rbDrawOrPass,
  rbPlay,
  rbTick,
} from "@/lib/rangbaz-engine";
import { type RbState, type RbView } from "@/lib/rangbaz-shared";

type Diff = 1 | 2 | 3;
type Mode = "menu" | "quick" | "story" | "daily";

type Stats = { played: number; wins: number; bestDaily: number; dailyKey: string; dailyScore: number };
type Story = { unlocked: number };

const STATS_KEY = "rangbaz-stats-v1";
const STORY_KEY = "rangbaz-story-v1";
const BOT_DEFS: { id: string; nameFa: string; nameEn: string; persona: "shahin" | "negar" | "babak" }[] = [
  { id: "rb-bot-shahin", nameFa: "شاهین", nameEn: "Shahin", persona: "shahin" },
  { id: "rb-bot-negar", nameFa: "نگار", nameEn: "Negar", persona: "negar" },
  { id: "rb-bot-babak", nameFa: "بابک", nameEn: "Babak", persona: "babak" },
];

type LevelCfg = {
  bots: number;
  diff: Diff;
  handSize?: 5 | 7;
  fastTurn?: boolean;
  opponentExtra?: number;
  fogAlways?: boolean;
  noCustom?: boolean;
  noStack?: boolean;
};

/* ماجراجویی — باس‌ها در مراحل ۵، ۱۰ و ۱۵ */
const LEVELS: LevelCfg[] = [
  { bots: 1, diff: 1 },
  { bots: 1, diff: 1, opponentExtra: 2 },
  { bots: 2, diff: 1 },
  { bots: 2, diff: 2, noCustom: true },
  { bots: 2, diff: 2, fastTurn: true },
  { bots: 2, diff: 2 },
  { bots: 3, diff: 2, noStack: true },
  { bots: 3, diff: 2, opponentExtra: 2 },
  { bots: 2, diff: 3, fogAlways: true },
  { bots: 3, diff: 2, fastTurn: true },
  { bots: 3, diff: 3, handSize: 5 },
  { bots: 3, diff: 3, noCustom: true },
  { bots: 3, diff: 3, noStack: true },
  { bots: 3, diff: 3, opponentExtra: 3 },
  { bots: 3, diff: 3, fastTurn: true, handSize: 5 },
];

function loadStats(): Stats {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (raw) return JSON.parse(raw) as Stats;
  } catch {
    /* بی‌اهمیت */
  }
  return { played: 0, wins: 0, bestDaily: 0, dailyKey: "", dailyScore: 0 };
}

function loadStory(): Story {
  try {
    const raw = localStorage.getItem(STORY_KEY);
    if (raw) return JSON.parse(raw) as Story;
  } catch {
    /* بی‌اهمیت */
  }
  return { unlocked: 1 };
}

function dailySeed(): number {
  const d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

const DIFF_FA = { 1: "تازه‌کار", 2: "حرفه‌ای", 3: "استاد" } as const;
const DIFF_EN = { 1: "Rookie", 2: "Pro", 3: "Master" } as const;
const DIFF_ICON = { 1: "🌱", 2: "🛡", 3: "👑" } as const;

const RB_MENU_CSS = `
@keyframes rbBob { 0%,100% { transform: translateY(0) rotate(var(--r0,0deg)); } 50% { transform: translateY(-12px) rotate(var(--r1,0deg)); } }
@keyframes rbTitleGlow { 0%,100% { filter: drop-shadow(0 0 10px rgba(139,92,246,.45)); } 50% { filter: drop-shadow(0 0 26px rgba(217,70,239,.7)); } }
@keyframes rbAuroraA { 0%,100% { transform: translate(-12%, -8%) scale(1); } 50% { transform: translate(10%, 6%) scale(1.25); } }
@keyframes rbAuroraB { 0%,100% { transform: translate(10%, 10%) scale(1.15); } 50% { transform: translate(-8%, -6%) scale(.9); } }
.rb-menu-glass { background: linear-gradient(160deg, rgba(20,18,34,.78), rgba(10,10,20,.72)); backdrop-filter: blur(12px); border: 1px solid rgba(148,163,184,.14); }
`;

export function RangbazSolo() {
  const { lang } = useLang();
  const fa = lang === "fa";
  const [mode, setMode] = useState<Mode>("menu");
  const [diff, setDiff] = useState<Diff>(2);
  const [botCount, setBotCount] = useState(2);
  const [level, setLevel] = useState(1);
  const [view, setView] = useState<RbView | null>(null);
  const [busy, setBusy] = useState(false);
  const [stats, setStats] = useState<Stats>(() => ({ played: 0, wins: 0, bestDaily: 0, dailyKey: "", dailyScore: 0 }));
  const [story, setStory] = useState<Story>(() => ({ unlocked: 1 }));
  const stRef = useRef<RbState | null>(null);
  const botTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const catchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishedRef = useRef(false);
  const lastCfgRef = useRef<Parameters<typeof startGame>[0] | null>(null);

  useEffect(() => {
    setStats(loadStats());
    setStory(loadStory());
    return () => {
      if (botTimer.current) clearTimeout(botTimer.current);
      if (catchTimer.current) clearTimeout(catchTimer.current);
    };
  }, []);

  /* همگام‌سازی نما + ثبت پایان دست */
  const sync = useCallback(() => {
    const st = stRef.current;
    if (!st) return;
    const t = rbTick(st, { now: Date.now() });
    const v = buildRbView(st, "me-solo", [], Date.now());
    setView(v);
    if (st.phase === "done" && !finishedRef.current && st.result) {
      finishedRef.current = true;
      const won = st.result.rows.find((r) => r.id === "me-solo")?.score ?? 0;
      /* امتیاز برد سولو به تالار رکوردها هم می‌رود (مهمان/عضو طبق قرارداد /api/scores) */
      if (won > 0) {
        void fetch("/api/scores", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            gameSlug: "rangbaz-solo",
            score: won,
            ...(mode === "story" ? { detail: { level } } : {}),
          }),
        }).catch(() => undefined);
      }
      setStats((prev) => {
        const next: Stats = { ...prev, played: prev.played + 1, wins: prev.wins + (won > 0 ? 1 : 0) };
        if (mode === "daily") {
          const key = String(dailySeed());
          if (won > (prev.dailyKey === key ? prev.dailyScore : 0)) {
            next.dailyKey = key;
            next.dailyScore = won;
            next.bestDaily = Math.max(prev.bestDaily, won);
          }
        }
        try {
          localStorage.setItem(STATS_KEY, JSON.stringify(next));
        } catch {
          /* بی‌اهمیت */
        }
        return next;
      });
      if (mode === "story" && won > 0) {
        setStory((prev) => {
          const next = { unlocked: Math.max(prev.unlocked, Math.min(LEVELS.length, level + 1)) };
          try {
            localStorage.setItem(STORY_KEY, JSON.stringify(next));
          } catch {
            /* بی‌اهمیت */
          }
          return next;
        });
      }
    }
    return t;
  }, [level, mode]);

  /* زنجیرهٔ حرکت ربات‌ها + تلاش بات‌ها برای لو دادن */
  const schedule = useCallback(() => {
    if (botTimer.current) clearTimeout(botTimer.current);
    if (catchTimer.current) clearTimeout(catchTimer.current);
    const st = stRef.current;
    if (!st || st.phase !== "play") return;

    if (st.callOpen && st.callOpen.id === "me-solo" && Date.now() < st.callOpen.until) {
      catchTimer.current = setTimeout(() => {
        const cur = stRef.current;
        if (!cur || !cur.callOpen || cur.callOpen.id !== "me-solo") return;
        const anyBot = cur.ps.find((p) => p.bot > 0);
        if (anyBot) rbCatch(cur, anyBot.id, { now: Date.now() });
        sync();
        schedule();
      }, Math.max(600, st.callOpen.until - Date.now() - 400 + Math.random() * 1200));
    }

    const cur = st.ps[st.cur];
    if (!cur || cur.bot === 0) return;
    botTimer.current = setTimeout(() => {
      const s2 = stRef.current;
      if (!s2 || s2.phase !== "play") return;
      rbBotMove(s2, cur.id, { now: Date.now() });
      sync();
      schedule();
    }, 850 + Math.random() * 750);
  }, [sync]);

  const startGame = useCallback(
    (cfg: { bots: number; diff: Diff; handSize?: 5 | 7; fastTurn?: boolean; opponentExtra?: number; fogAlways?: boolean; noCustom?: boolean; noStack?: boolean; seed?: number }) => {
      finishedRef.current = false;
      lastCfgRef.current = cfg;
      const bots = BOT_DEFS.slice(0, cfg.bots);
      const players = [
        { id: "me-solo", name: fa ? "تو" : "You", bot: 0 as const },
        ...bots.map((b) => ({ id: b.id, name: fa ? b.nameFa : b.nameEn, bot: cfg.diff as 1 | 2 | 3, persona: b.persona })),
      ];
      const st = rbCreateState(
        players,
        {
          handSize: cfg.handSize ?? 7,
          stacking: !cfg.noStack,
          custom: !cfg.noCustom,
          turnMs: cfg.fastTurn ? 10_000 : 0,
        },
        Date.now(),
        cfg.seed,
      );
      if (!st) return;
      /* حریف‌ها با کارت اضافه شروع می‌کنند */
      if (cfg.opponentExtra) {
        for (const p of st.ps) {
          if (p.bot > 0) {
            for (let i = 0; i < cfg.opponentExtra; i++) {
              const c = st.deck.pop();
              if (c) p.hand.push(c);
            }
          }
        }
      }
      /* مهِ همیشگی — کاشته‌شده توسط «میز»، از دید من کارت بقیه پنهان است */
      if (cfg.fogAlways) {
        st.fogBy = "rb-fog";
        st.fogUntilTurn = 999999;
      }
      stRef.current = st;
      setBusy(false);
      sync();
      schedule();
    },
    [fa, schedule, sync],
  );

  const act = useCallback(
    (fn: () => void) => {
      if (busy) return;
      setBusy(true);
      fn();
      sync();
      schedule();
      setTimeout(() => setBusy(false), 350);
    },
    [busy, schedule, sync],
  );

  const leaveTable = () => {
    if (botTimer.current) clearTimeout(botTimer.current);
    if (catchTimer.current) clearTimeout(catchTimer.current);
    stRef.current = null;
    setView(null);
    setMode("menu");
  };

  /* ─────────── منو ─────────── */
  if (mode === "menu" || !view) {
    const dailyToday = stats.dailyKey === String(dailySeed());
    return (
      <div
        className="relative mx-auto min-h-[100svh] w-full max-w-xl px-4 py-8 sm:px-6"
        dir="rtl"
        style={{ background: "#05050d" }}
      >
        <style dangerouslySetInnerHTML={{ __html: RB_MENU_CSS }} />

        {/* سالن نئونی — درون stacking context صفحه */}
        <div
          className="pointer-events-none absolute -left-1/4 -top-1/3 z-0 h-[130%] w-[150%]"
          style={{ background: "radial-gradient(closest-side, rgba(139,92,246,.18), transparent 70%)", animation: "rbAuroraA 14s ease-in-out infinite" }}
        />
        <div
          className="pointer-events-none absolute -left-1/4 -top-1/3 z-0 h-[130%] w-[150%]"
          style={{ background: "radial-gradient(closest-side, rgba(56,189,248,.12), transparent 72%), radial-gradient(closest-side, rgba(236,72,153,.08), transparent 72%)", animation: "rbAuroraB 18s ease-in-out infinite" }}
        />

        {/* محتوای منو */}
        <div className="relative z-10">
        {/* هیرو */}
        <div className="relative pt-4 text-center">
          <div className="mx-auto flex h-[110px] w-[230px] items-center justify-center">
            <span style={{ "--r0": "-14deg", "--r1": "-18deg", animation: "rbBob 3.4s ease-in-out infinite", position: "absolute", transform: "translateX(-52px)" } as React.CSSProperties}>
              <RbCardArt card={{ id: "h1", k: "num", c: "red", n: 7 }} size={0.92} />
            </span>
            <span style={{ "--r0": "0deg", "--r1": "2deg", animation: "rbBob 3.4s ease-in-out .4s infinite", position: "absolute", zIndex: 2 } as React.CSSProperties}>
              <RbCardArt card={{ id: "h2", k: "wild4", c: null }} size={1.02} />
            </span>
            <span style={{ "--r0": "14deg", "--r1": "18deg", animation: "rbBob 3.4s ease-in-out .8s infinite", position: "absolute", transform: "translateX(52px)" } as React.CSSProperties}>
              <RbCardArt card={{ id: "h3", k: "num", c: "blue", n: 3 }} size={0.92} />
            </span>
          </div>
          <h1
            className="mt-3 text-4xl font-black tracking-tight"
            style={{
              background: "linear-gradient(100deg,#a78bfa 10%,#e879f9 45%,#38bdf8 90%)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
              animation: "rbTitleGlow 3s ease-in-out infinite",
            }}
          >
            {fa ? "رنگ‌باز" : "Rangbaz"}
          </h1>
          <p className="mx-auto mt-2 max-w-md text-[13px] leading-7 text-zinc-400">
            {fa
              ? "کارت هم‌رنگ یا هم‌عدد بینداز؛ با یک کارتِ مانده دکمهٔ «رنگ‌باز!» را بزن. سالنی نئونی، ربات‌های شخصیت‌دار و کارت‌های مخصوص آینه، تعویض دست و مه."
              : "Match color or number; hit “one left!” with a single card. Neon hall, character bots, special Mirror/Swap/Fog cards."}
          </p>
        </div>

        {/* بازی سریع */}
        <div className="rb-menu-glass mt-7 rounded-3xl p-5" style={{ boxShadow: "0 0 40px rgba(139,92,246,.08)" }}>
          <p className="flex items-center gap-2 text-sm font-black text-zinc-100">
            <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-violet-500/20 text-sm">⚡</span>
            {fa ? "بازی سریع" : "Quick play"}
          </p>
          <p className="mt-3 text-xs font-black text-zinc-400">{fa ? "سطح ربات‌ها" : "bot level"}</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {([1, 2, 3] as Diff[]).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDiff(d)}
                className={`rounded-2xl border px-3 py-2.5 text-xs font-black transition-all ${
                  diff === d
                    ? "border-violet-400 bg-violet-500/15 text-violet-200"
                    : "border-zinc-800 bg-zinc-950/60 text-zinc-400 hover:border-zinc-700"
                }`}
                style={diff === d ? { boxShadow: "0 0 16px rgba(139,92,246,.3)" } : undefined}
              >
                {DIFF_ICON[d]} {fa ? DIFF_FA[d] : DIFF_EN[d]}
              </button>
            ))}
          </div>
          <p className="mt-4 text-xs font-black text-zinc-400">{fa ? "تعداد ربات‌ها" : "bots"}</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {[1, 2, 3].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setBotCount(n)}
                className={`rounded-2xl border px-3 py-2.5 text-xs font-black transition-all ${
                  botCount === n
                    ? "border-violet-400 bg-violet-500/15 text-violet-200"
                    : "border-zinc-800 bg-zinc-950/60 text-zinc-400 hover:border-zinc-700"
                }`}
              >
                {n} {fa ? "ربات" : "bots"}
              </button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap justify-center gap-1.5">
            {BOT_DEFS.map((b) => (
              <span key={b.id} className="rounded-full border border-zinc-800 bg-zinc-950/70 px-2.5 py-1 text-[10px] font-bold text-zinc-400">
                {fa ? b.nameFa : b.nameEn}
                {fa ? (b.persona === "shahin" ? " — هجومی" : b.persona === "negar" ? " — محتاط" : " — بلوف‌زن") : b.persona === "shahin" ? " — aggressive" : b.persona === "negar" ? " — cautious" : " — bluffer"}
              </span>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              setMode("quick");
              startGame({ bots: botCount, diff });
            }}
            className="mt-4 w-full rounded-2xl bg-gradient-to-l from-violet-500 to-fuchsia-500 py-3.5 text-sm font-black text-zinc-950 active:scale-95"
            style={{ boxShadow: "0 0 30px rgba(139,92,246,.4)" }}
          >
            ▶ {fa ? "شروع بازی" : "Start"}
          </button>
        </div>

        {/* ماجراجویی */}
        <div className="rb-menu-glass mt-4 rounded-3xl p-5" style={{ boxShadow: "0 0 40px rgba(251,191,36,.06)" }}>
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-2 text-sm font-black text-zinc-100">
              <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-amber-500/20 text-sm">🗺</span>
              {fa ? "ماجراجویی" : "Adventure"}
            </p>
            <span className="text-[10px] font-black text-amber-300">
              {story.unlocked - 1}/{LEVELS.length} {fa ? "مرحله" : "done"}
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full rounded-full bg-gradient-to-l from-amber-400 to-orange-400"
              style={{ width: `${((story.unlocked - 1) / LEVELS.length) * 100}%`, boxShadow: "0 0 10px rgba(251,191,36,.6)" }}
            />
          </div>
          <div className="mt-3 grid grid-cols-5 gap-1.5">
            {LEVELS.map((_, i) => {
              const n = i + 1;
              const unlocked = n <= story.unlocked;
              const boss = n % 5 === 0;
              return (
                <button
                  key={n}
                  type="button"
                  disabled={!unlocked}
                  onClick={() => {
                    setLevel(n);
                    setMode("story");
                    startGame({ ...LEVELS[i], bots: LEVELS[i].bots, diff: LEVELS[i].diff });
                  }}
                  className={`rounded-xl border py-2 text-xs font-black transition-all ${
                    !unlocked
                      ? "border-zinc-800 bg-zinc-950/40 text-zinc-600"
                      : boss
                        ? "border-amber-500/60 bg-amber-500/15 text-amber-300"
                        : "border-violet-500/50 bg-violet-500/10 text-violet-200"
                  }`}
                  style={unlocked ? { boxShadow: boss ? "0 0 14px rgba(251,191,36,.25)" : "0 0 14px rgba(139,92,246,.18)" } : undefined}
                >
                  {unlocked ? (boss ? `⚡${n}` : n) : "🔒"}
                </button>
              );
            })}
          </div>
          <p className="mt-2.5 text-[11px] leading-5 text-zinc-500">
            {fa
              ? "قوانین ویژه در راه است: نوبت ۱۰ ثانیه‌ای، حریف با کارت اضافه، مهِ همیشگی، بدون جمع جریمه… باس‌ها: ۵، ۱۰ و ۱۵."
              : "Special rules ahead: 10s turns, extra opponent cards, eternal fog, no stacking… bosses at 5, 10, 15."}
          </p>
        </div>

        {/* چالش روزانه */}
        <div
          className="rb-menu-glass mt-4 rounded-3xl p-5 text-center"
          style={{ boxShadow: "0 0 40px rgba(56,189,248,.07)", borderColor: "rgba(56,189,248,.25)" }}
        >
          <p className="flex items-center justify-center gap-2 text-sm font-black text-zinc-100">
            <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-sky-500/20 text-sm">🌅</span>
            {fa ? "چالش روزانه" : "Daily challenge"}
          </p>
          <p className="mt-1.5 text-[11px] leading-5 text-zinc-500">
            {fa
              ? "هر روز یک دست ثابت و مشترک برای همه — سه ربات حرفه‌ای؛ بهترین امتیازت ثبت می‌شود."
              : "One shared fixed deal each day — three pro bots; your best score is saved."}
          </p>
          <p className="mt-2 text-xs font-bold" style={{ color: dailyToday ? "#fbbf24" : "#71717a" }}>
            {fa ? "بهترین امتیاز امروز شما: " : "your best today: "}
            <b className="tabular-nums">{dailyToday ? stats.dailyScore : 0}</b>
            {dailyToday && fa && " ✓ انجام دادی"}
          </p>
          <button
            type="button"
            onClick={() => {
              setMode("daily");
              startGame({ bots: 3, diff: 2, seed: dailySeed() });
            }}
            className="mt-3 w-full rounded-2xl bg-gradient-to-l from-sky-400 to-cyan-400 py-3.5 text-sm font-black text-zinc-950 active:scale-95"
            style={{ boxShadow: "0 0 30px rgba(56,189,248,.35)" }}
          >
            🌅 {fa ? "چالش امروز" : "Play today"}
          </button>
        </div>

        {/* رکوردها */}
        <div className="rb-menu-glass mt-4 flex items-center justify-between rounded-3xl px-5 py-4 text-xs font-bold text-zinc-400">
          <span>🎯 {fa ? "بازی‌ها" : "games"}: <b className="tabular-nums text-zinc-200">{stats.played}</b></span>
          <span>🏆 {fa ? "بردها" : "wins"}: <b className="tabular-nums text-zinc-200">{stats.wins}</b></span>
          <span>⭐ {fa ? "رکورد روزانه" : "best daily"}: <b className="tabular-nums text-zinc-200">{stats.bestDaily}</b></span>
        </div>

        <div className="mt-6 flex items-center justify-center gap-5 pb-2">
          <Link href="/arena" className="text-xs font-bold text-zinc-500 hover:text-zinc-300">
            ← {fa ? "بازگشت به آرنا" : "back to arena"}
          </Link>
          <Link href="/records" className="text-xs font-bold text-zinc-500 hover:text-zinc-300">
            🏆 {fa ? "تالار رکوردها" : "records hall"}
          </Link>
        </div>
        </div>
      </div>
    );
  }

  /* ─────────── میز بازی ─────────── */
  const levelCfg = LEVELS[level - 1];
  const levelTitle = fa ? `مرحلهٔ ${level}${level % 5 === 0 ? " — ⚡ باس" : ""}` : `Level ${level}${level % 5 === 0 ? " — ⚡ boss" : ""}`;

  return (
    <RangbazTable
      view={view}
      fa={fa}
      busy={busy}
      onPlay={(cardId, opts) =>
        act(() => {
          const st = stRef.current;
          if (st) rbPlay(st, "me-solo", cardId, opts ?? {}, { now: Date.now() });
        })
      }
      onDrawPass={() =>
        act(() => {
          const st = stRef.current;
          if (st) rbDrawOrPass(st, "me-solo", { now: Date.now() });
        })
      }
      onCatch={() =>
        act(() => {
          const st = stRef.current;
          if (st) rbCatch(st, "me-solo", { now: Date.now() });
        })
      }
      onAgain={() => {
        if (lastCfgRef.current) startGame(lastCfgRef.current);
      }}
      header={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="flex items-center gap-2 text-lg font-extrabold text-zinc-50">
            🎴 {fa ? "رنگ‌باز" : "Rangbaz"}
            {mode === "story" && (
              <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-black text-amber-300">
                {levelTitle}
              </span>
            )}
            {mode === "daily" && (
              <span className="rounded-full border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-[10px] font-black text-sky-300">
                {fa ? "چالش روزانه" : "daily"}
              </span>
            )}
            {mode === "quick" && (
              <span className="rounded-full border border-violet-500/40 bg-violet-500/10 px-2 py-0.5 text-[10px] font-black text-violet-300">
                {fa ? DIFF_FA[diff] : DIFF_EN[diff]}
              </span>
            )}
          </h1>
          <button
            type="button"
            onClick={leaveTable}
            className="rounded-xl border border-zinc-700 bg-zinc-950/70 px-3 py-1.5 text-[11px] font-black text-zinc-300 hover:bg-zinc-800"
          >
            ✕ {fa ? "خروج" : "leave"}
          </button>
        </div>
      }
      footer={
        <div className="mt-3 flex flex-wrap items-center justify-center gap-3 text-[10px] font-bold text-zinc-600">
          {mode === "story" && levelCfg && (
            <>
              {levelCfg.fastTurn && <span>⏱ {fa ? "نوبت ۱۰ ثانیه‌ای" : "10s turns"}</span>}
              {levelCfg.opponentExtra && <span>😈 {fa ? "حریف با کارت اضافه" : "extra opponent cards"}</span>}
              {levelCfg.fogAlways && <span>🌫 {fa ? "مه همیشگی" : "eternal fog"}</span>}
              {levelCfg.noCustom && <span>🚫 {fa ? "بدون کارت اختصاصی" : "no custom cards"}</span>}
              {levelCfg.noStack && <span>⛓ {fa ? "بدون جمع جریمه" : "no stacking"}</span>}
            </>
          )}
        </div>
      }
    />
  );
}
