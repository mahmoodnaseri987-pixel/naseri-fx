"use client";

/* جدول برترین‌ها — پنل مشترک همه بازی‌های تک‌نفره و رکوردی.
   با تغییر refreshKey (بعد از ثبت رکورد تازه) دوباره بارگذاری می‌شود.
   میدان آتش در صفحه /fire و بازی‌های آپلودی در /play/{slug} از همین پنل استفاده می‌کنند. */

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLang } from "@/components/site/language-provider";
import type { ScoreGetResponse } from "@/lib/types";

type ScoreBoardProps = {
  gameSlug: string;
  /** تغییر این عدد → بارگذاری دوباره (بعد از ثبت رکورد) */
  refreshKey?: number;
  limit?: number;
  className?: string;
};

const MEDALS = ["🥇", "🥈", "🥉"];

export function ScoreBoard({ gameSlug, refreshKey = 0, limit = 10, className }: ScoreBoardProps) {
  const { t, lang } = useLang();
  const s = t.scores;
  const [data, setData] = useState<ScoreGetResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const numFmt = useCallback(
    (n: number) => new Intl.NumberFormat(lang === "fa" ? "fa-IR" : "en-US").format(n),
    [lang],
  );

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/scores?gameSlug=${encodeURIComponent(gameSlug)}`, {
        cache: "no-store",
      });
      if (res.ok) setData((await res.json()) as ScoreGetResponse);
    } catch {
      /* دور بعد */
    } finally {
      setLoading(false);
    }
  }, [gameSlug]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  return (
    <section
      className={`rounded-2xl border border-amber-500/25 bg-zinc-900/60 p-5 ${className ?? ""}`}
      dir={lang === "fa" ? "rtl" : "ltr"}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-bold text-amber-200">
          <Trophy className="h-4 w-4 text-amber-400" aria-hidden="true" />
          {s.title}
        </h2>
        <Button
          onClick={() => void load()}
          variant="ghost"
          size="icon"
          aria-label={s.refresh}
          className="h-8 w-8 rounded-full text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      </div>
      <p className="mt-1 text-[11px] text-zinc-500">{s.subtitle}</p>

      {data?.me && (
        <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-center text-xs font-bold text-amber-200">
          {s.yourBest.replace("{s}", numFmt(data.me.best)).replace("{r}", numFmt(data.me.rank))}
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-600" aria-hidden="true" />
        </div>
      ) : !data || data.top.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-zinc-700 px-4 py-8 text-center text-xs leading-6 text-zinc-500">
          {s.empty}
        </p>
      ) : (
        <ul className="mt-4 space-y-1.5">
          {data.top.slice(0, limit).map((row) => (
            <li
              key={`${row.rank}-${row.name}-${row.createdAt}`}
              className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 ${
                row.isMe
                  ? "border border-amber-500/40 bg-amber-500/10"
                  : "bg-zinc-950/50"
              }`}
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <span className="w-6 shrink-0 text-center text-sm font-black text-zinc-400">
                  {MEDALS[row.rank - 1] ?? numFmt(row.rank)}
                </span>
                <span className="truncate text-sm font-semibold text-zinc-200">{row.name}</span>
                {row.isMe && (
                  <span className="shrink-0 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-200">
                    {s.me}
                  </span>
                )}
              </span>
              <span className="shrink-0 text-start">
                <span className="block text-sm font-black tabular-nums text-emerald-400">
                  {numFmt(row.score)}
                </span>
                {row.detail && typeof row.detail.wave === "number" && (
                  <span className="block text-[10px] text-zinc-500">
                    {s.waveKills
                      .replace("{w}", numFmt(row.detail.wave))
                      .replace("{k}", numFmt(row.detail.kills ?? 0))}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
