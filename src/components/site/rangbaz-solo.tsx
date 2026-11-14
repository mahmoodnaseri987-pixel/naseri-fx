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
import { RangbazTable } from "@/components/site/rangbaz-table";
import {
  buildRbView,
  rbBotMove,
  rbCatch,
  rbCreateState,
  rbDrawOrPass,
  rbPlay,
  rbTick,
} from "@/lib/rangbaz-engine";
import { RB_GAME_SLUG, type RbColor, type RbState, type RbView } from "@/lib/rangbaz-shared";

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
    return (
      <div className="relative mx-auto min-h-[100svh] w-full max-w-xl px-4 py-10 sm:px-6" dir="rtl">
        <div
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(800px 400px at 50% -5%, rgba(139,92,246,.16), transparent 60%), radial-gradient(600px 420px at 90% 100%, rgba(56,189,248,.1), transparent 60%), #09090f",
          }}
        />
        <div className="text-center">
          <h1 className="text-3xl font-black text-zinc-50">
            🎴 {fa ? "رنگ‌باز" : "Rangbaz"}
          </h1>
          <p className="mt-2 text-sm leading-7 text-zinc-400">
            {fa
              ? "کارت هم‌رنگ یا هم‌عدد بینداز؛ با یک کارتِ مانده دکمهٔ «رنگ‌باز!» را بزن. سالنی نئونی، ربات‌های شخصیت‌دار و کارت‌های مخصوص آینه، تعویض دست و مه."
              : "Match color or number; hit “one left!” with a single card. Neon hall, character bots, special Mirror/Swap/Fog cards."}
          </p>
        </div>

        <div className="rb-glass mt-8 rounded-3xl p-5">
          <p className="text-xs font-black text-zinc-400">{fa ? "سطح ربات‌ها" : "bot level"}</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {([1, 2, 3] as Diff[]).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDiff(d)}
                className={`rounded-2xl border px-3 py-2.5 text-xs font-black ${
                  diff === d ? "border-violet-400 bg-violet-500/15 text-violet-200" : "border-zinc-800 bg-zinc-900/60 text-zinc-400"
                }`}
              >
                {fa ? DIFF_FA[d] : DIFF_EN[d]}
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
                className={`rounded-2xl border px-3 py-2.5 text-xs font-black ${
                  botCount === n ? "border-violet-400 bg-violet-500/15 text-violet-200" : "border-zinc-800 bg-zinc-900/60 text-zinc-400"
                }`}
              >
                {n} {fa ? "ربات" : "bots"}
              </button>
            ))}
          </div>
          <p className="mt-3 text-center text-[10px] leading-5 text-zinc-500">
            {fa
              ? "شاهین هجومی است، نگار محتاط و بابک بلوف‌زن — رنگ میز را عمداً عوض می‌کند."
              : "Shahin is aggressive, Negar cautious, Babak bluffs with wild colors."}
          </p>
          <button
            type="button"
            onClick={() => {
              setMode("quick");
              startGame({ bots: botCount, diff });
            }}
            className="mt-4 w-full rounded-2xl bg-violet-500 py-3.5 text-sm font-black text-zinc-950 shadow-lg shadow-violet-500/30"
          >
            ▶ {fa ? "بازی سریع" : "Quick play"}
          </button>
        </div>

        <div className="rb-glass mt-4 rounded-3xl p-5">
          <p className="text-sm font-black text-zinc-100">🗺 {fa ? "ماجراجویی" : "Adventure"}</p>
          <p className="mt-1 text-[11px] leading-5 text-zinc-500">
            {fa
              ? "۱۵ مرحله با قوانین ویژه: نوبت ۱۰ ثانیه‌ای، حریف با کارت اضافه، مهِ همیشگی… باس‌ها: ۵، ۱۰ و ۱۵."
              : "15 levels with special rules; bosses at 5, 10, 15."}
          </p>
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
                    startGame({ bots: LEVELS[i].bots, diff: LEVELS[i].diff, ...LEVELS[i] });
                  }}
                  className={`rounded-xl border py-2 text-xs font-black ${
                    !unlocked
                      ? "border-zinc-800 bg-zinc-900/40 text-zinc-600"
                      : boss
                        ? "border-amber-500/60 bg-amber-500/15 text-amber-300"
                        : "border-violet-500/50 bg-violet-500/10 text-violet-200"
                  }`}
                >
                  {unlocked ? n : "🔒"}
                </button>
              );
            })}
          </div>
        </div>

        <div className="rb-glass mt-4 rounded-3xl p-5 text-center">
          <p className="text-sm font-black text-zinc-100">🌅 {fa ? "چالش روزانه" : "Daily challenge"}</p>
          <p className="mt-1 text-[11px] leading-5 text-zinc-500">
            {fa
              ? "هر روز یک دست ثابت و مشترک برای همه — سه ربات حرفه‌ای؛ بهترین امتیازت ثبت می‌شود."
              : "One shared fixed deal each day — three pro bots; your best score is saved."}
          </p>
          <p className="mt-2 text-xs font-bold text-amber-300">
            {fa ? "بهترین امتیاز امروز شما: " : "your best today: "}
            {stats.dailyKey === String(dailySeed()) ? stats.dailyScore : 0}
          </p>
          <button
            type="button"
            onClick={() => {
              setMode("daily");
              startGame({ bots: 3, diff: 2, seed: dailySeed() });
            }}
            className="mt-3 w-full rounded-2xl bg-amber-400 py-3.5 text-sm font-black text-zinc-950 shadow-lg shadow-amber-400/30"
          >
            🌅 {fa ? "چالش امروز" : "Play today"}
          </button>
        </div>

        <div className="rb-glass mt-4 flex items-center justify-between rounded-3xl px-5 py-4 text-xs font-bold text-zinc-400">
          <span>🎯 {fa ? "بازی‌ها" : "games"}: {stats.played}</span>
          <span>🏆 {fa ? "بردها" : "wins"}: {stats.wins}</span>
          <span>⭐ {fa ? "رکورد روزانه" : "best daily"}: {stats.bestDaily}</span>
        </div>

        <div className="mt-6 text-center">
          <Link href="/arena" className="text-xs font-bold text-zinc-500 hover:text-zinc-300">
            ← {fa ? "بازگشت به آرنا" : "back to arena"}
          </Link>
        </div>
      </div>
    );
  }

  /* ─────────── میز بازی ─────────── */
  const levelCfg = LEVELS[level - 1];
  const levelTitle = fa
    ? `مرحلهٔ ${level}${level % 5 === 0 ? " — ⚡ باس" : ""}`
    : `Level ${level}${level % 5 === 0 ? " — ⚡ boss" : ""}`;

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
            className="rounded-xl border border-zinc-700 bg-zinc-900/70 px-3 py-1.5 text-[11px] font-black text-zinc-300 hover:bg-zinc-800"
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

/* جلوگیری از tree-shaking بی‌دلیل اسلاگ */
export const RB_SOLO_SLUG = RB_GAME_SLUG;
