"use client";

/* تالار رکوردها — جدول رده‌بندی جدا برای هر بازی:
   بازی‌های گروهی آرنا = مجموع امتیاز همهٔ مسابقه‌ها؛
   بازی‌های تک‌نفره = بهترین رکورد ثبت‌شده. */

import { useLang } from "@/components/site/language-provider";
import { MemberAvatar } from "@/components/site/member-avatar";
import {
  Crown,
  Dice5,
  Flame,
  Gamepad2,
  Grid3X3,
  Image as ImageIcon,
  Swords,
  Trophy,
  Zap,
} from "lucide-react";

export type RecordsRow = {
  rank: number;
  memberId: string; // خالی = مهمان
  name: string;
  score: number;
  hasAvatar?: boolean;
};

export type RecordsGame = {
  slug: string;
  kind: "room" | "html";
  icon: string; // کلید آیکون lucide
  titleFa: string;
  titleEn: string;
  metricFa: string;
  metricEn: string;
  rows: RecordsRow[];
};

const ICONS: Record<string, typeof Swords> = {
  swords: Swords,
  zap: Zap,
  grid: Grid3X3,
  image: ImageIcon,
  flame: Flame,
  dice: Dice5,
};

export function RecordsView({
  me,
  arena,
  html,
}: {
  me: string;
  arena: RecordsGame[];
  html: RecordsGame[];
}) {
  const { lang } = useLang();
  const fa = lang === "fa";
  const games = [...arena, ...html];

  return (
    <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
      <div className="text-center">
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-amber-400">
          <Trophy className="h-4 w-4" aria-hidden="true" />
          {fa ? "تالار افتخار کافه" : "Hall of fame"}
        </span>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-zinc-50 sm:text-4xl">
          {fa ? "رکوردها" : "Records"}
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-zinc-400">
          {fa
            ? "برترین بازیکنان هر بازی — در بازی‌های گروهی، مجموع امتیاز همهٔ مسابقه‌ها؛ در بازی‌های تک‌نفره، بهترین رکورد. با هر مسابقه این جدول‌ها زنده به‌روز می‌شوند."
            : "Top players per game — career totals for multiplayer games, best runs for solo games. These boards update with every match."}
        </p>
      </div>

      <div className="mt-12 grid gap-5 sm:grid-cols-2">
        {games.map((g) => {
          const Icon = ICONS[g.icon] ?? Gamepad2;
          return (
            <section
              key={g.slug}
              className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/40"
            >
              <header className="flex items-center gap-3 border-b border-zinc-800 px-5 py-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/15 text-violet-300">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-base font-black text-zinc-100">
                    {fa ? g.titleFa : g.titleEn}
                  </h2>
                  <p className="text-[11px] font-bold text-zinc-500">
                    {fa ? g.metricFa : g.metricEn}
                  </p>
                </div>
                {g.rows[0] && (
                  <Crown className="size-4 shrink-0 text-amber-400" aria-hidden="true" />
                )}
              </header>
              {g.rows.length === 0 ? (
                <p className="px-5 py-8 text-center text-xs font-bold text-zinc-500">
                  {fa ? "هنوز رکوردی ثبت نشده — اولین نفر باش!" : "No records yet — be the first!"}
                </p>
              ) : (
                <ol>
                  {g.rows.map((r) => (
                    <li
                      key={`${r.memberId || r.name}:${r.rank}`}
                      className={`flex items-center gap-3 border-b border-zinc-800/70 px-5 py-2.5 last:border-0 ${r.memberId === me ? "bg-emerald-500/10" : ""}`}
                    >
                      <span className="w-6 shrink-0 text-center text-sm font-black">
                        {r.rank === 1 ? "🥇" : r.rank === 2 ? "🥈" : r.rank === 3 ? "🥉" : (
                          <span className="text-zinc-500">{r.rank}</span>
                        )}
                      </span>
                      {r.memberId ? (
                        <MemberAvatar
                          memberId={r.memberId}
                          name={r.name}
                          size={30}
                          hasAvatar={r.hasAvatar !== false}
                        />
                      ) : (
                        <span className="flex size-[30px] shrink-0 items-center justify-center rounded-full bg-zinc-800 text-[10px] font-black text-zinc-400">
                          {fa ? "مهمان" : "G"}
                        </span>
                      )}
                      <span className="min-w-0 flex-1 truncate text-sm font-bold text-zinc-200">
                        {r.name}
                        {r.memberId === me && (
                          <span className="ms-1 text-[10px] font-bold text-emerald-400">
                            {fa ? "(شما)" : "(you)"}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-sm font-black tabular-nums text-amber-300">
                        {r.score.toLocaleString(fa ? "fa-IR" : "en-US")}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
