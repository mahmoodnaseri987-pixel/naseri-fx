"use client";

/* ================================================================
   بازی گروهی «شعر یادت نره» — نمای مسابقه و صفحهٔ نتیجه
   ================================================================
   همهٔ منطق سمت سرور است؛ این کامپوننت وضعیت استریم را نمایش می‌دهد
   و فقط «انتخاب سطح» و «ثبت حدس» را ارسال می‌کند.
   فاز listen: پخش کلیپ از clipStart با زیرنویس مصرع‌های زمینه؛ اگر
   پالیسی مرورگر پخش خودکار را رد کرد، دکمهٔ بزرگ پخش تا لمس کاربر.
   فاز guess: چهار سطح کمک — سطح انتخابی تا پایان دور ثابت است.
   فاز reveal: پاسخ درست + جدول پاسخ‌های همه. فاز done: مدال‌ها،
   جدول تیمی و «مسابقه دوباره». پاسخ درست تا reveal هرگز به کلاینت
   نمی‌رسد — کلاینت هیچ محاسبهٔ قانونی ندارد.
   ================================================================ */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Bot,
  Check,
  Crown,
  Loader2,
  Music,
  Play,
  Timer,
  Trophy,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLang } from "@/components/site/language-provider";
import { MemberAvatar } from "@/components/site/member-avatar";
import { ChatPanel } from "@/components/site/chat-panel";
import {
  SHER_GUESS_MS,
  SHER_LEVEL_POINTS,
  SHER_LISTEN_MS,
  SHER_REVEAL_MS,
  type SherLevel,
  type SherMode,
} from "@/lib/sher-shared";
import type { ArenaStateResponse } from "@/lib/types";

/* رنگ متمایز هر تیم — با اندیس تیم (تا ۴ تیم) */
const TEAM_STYLES = [
  "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  "border-sky-500/40 bg-sky-500/10 text-sky-300",
  "border-amber-500/40 bg-amber-500/10 text-amber-300",
  "border-rose-500/40 bg-rose-500/10 text-rose-300",
];

const MEDALS = ["🥇", "🥈", "🥉"];

export function SherClient({
  st,
  offsetMs,
}: {
  st: ArenaStateResponse;
  offsetMs: number;
}) {
  const { t, lang } = useLang();
  const s = t.arena.sher;
  const r = t.arena.room;
  const router = useRouter();
  const sher = st.sher;
  const code = st.room.code;

  const [level, setLevel] = useState<SherLevel | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendingAgain, setSendingAgain] = useState(false);
  const [needPlay, setNeedPlay] = useState(false);
  const [tick, setTick] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const aliveRef = useRef(true);

  const numFmt = useCallback(
    (n: number) => new Intl.NumberFormat(lang === "fa" ? "fa-IR" : "en-US").format(n),
    [lang],
  );

  /* تیک محلی برای تایمر و نوار زمان */
  useEffect(() => {
    const id = setInterval(() => setTick((x) => x + 1), 250);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  /* سطح انتخابی و متن تایپی با هر دور جدید صفر می‌شود */
  useEffect(() => {
    setLevel(null);
    setText("");
  }, [sher?.round]);

  const song = sher?.song ?? null;
  /* هم‌گامی با زمان سرور — offsetMs = زمان سرور هنگام دریافت منهای زمان کلاینت */
  const serverNow = Date.now() + offsetMs;
  const listenActive = sher?.phase === "listen" && serverNow >= (sher?.startedAtMs ?? 0);

  /* پخش کلیپ: ورود به فاز listen → seek به clipStart و play؛
     خروج از فاز → توقف صوت */
  useEffect(() => {
    const el = audioRef.current;
    if (!el || !song) return;
    const seekPlay = () => {
      try {
        el.currentTime = song.clipStart;
      } catch {
        /* هنوز متادیتا نیامده — بی‌خطر */
      }
      const p = el.play();
      if (p) p.catch(() => setNeedPlay(true)); // پالیسی مرورگر — دکمهٔ پخش نشان بده
    };
    if (listenActive) {
      if (el.readyState >= 1) seekPlay();
      else {
        el.addEventListener("loadedmetadata", seekPlay, { once: true });
        el.load();
      }
    } else {
      el.pause();
      setNeedPlay(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listenActive, sher?.round, song?.filename]);

  /* اتمام کار کامپوننت — صوت خاموش شود */
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  if (!sher) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-600" aria-hidden="true" />
      </div>
    );
  }

  const modeLabel: Record<SherMode, string> = {
    ffa: s.modeFfa,
    m1v1: s.modeM1v1,
    m2v2: s.modeM2v2,
    m3v3: s.modeM3v3,
    m4v4: s.modeM4v4,
    t3x2: s.modeT3x2,
    t4x2: s.modeT4x2,
  };
  const levelLabel: Record<SherLevel, string> = {
    1: s.level1,
    2: s.level2,
    3: s.level3,
    4: s.level4,
  };

  const remainingMs = Math.max(0, sher.phaseEnds - serverNow);
  const totalMs =
    sher.phase === "guess" ? SHER_GUESS_MS : sher.phase === "reveal" ? SHER_REVEAL_MS : SHER_LISTEN_MS;
  const pct = Math.min(100, (remainingMs / totalMs) * 100);
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const pad = lang === "fa" ? "۰" : "0";
  const timeLabel = `${numFmt(Math.floor(totalSeconds / 60))}:${numFmt(totalSeconds % 60).padStart(2, pad)}`;
  const isCountdown = serverNow < sher.startedAtMs;
  const isReveal = sher.phase === "reveal";
  const isDone = sher.phase === "done";
  const rankedPlayers = [...sher.players].sort((a, b) => (sher.scores[b.id] ?? 0) - (sher.scores[a.id] ?? 0));
  const myAnswered = sher.myAnswer !== null;
  const teamStyles = (team: number) => TEAM_STYLES[team % TEAM_STYLES.length];

  async function submit(payload: string, lvl: SherLevel) {
    if (sending || myAnswered) return;
    setSending(true);
    try {
      await fetch(`/api/arena/rooms/${encodeURIComponent(code)}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "sher_answer", level: lvl, payload }),
      });
    } catch {
      /* قطع لحظه‌ای — کاربر دوباره تلاش می‌کند */
    } finally {
      if (aliveRef.current) setSending(false);
    }
  }

  async function again() {
    setSendingAgain(true);
    try {
      await fetch(`/api/arena/rooms/${encodeURIComponent(code)}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "again" }),
      });
    } catch {
      /* بی‌خیال */
    } finally {
      setSendingAgain(false);
    }
  }

  /* ---------- صفحهٔ نتیجه (فاز done) ---------- */
  if (isDone && sher.result) {
    const rows = sher.result.rows;
    const topRow = rows.find((row) => row.rank === 1);
    const champions = rows.filter((row) => row.rank === 1);
    const nameOf = (id: string) => sher.players.find((p) => p.id === id)?.name ?? id;
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-b from-amber-500/10 to-transparent p-6 text-center sm:p-8">
          <Trophy className="mx-auto h-12 w-12 text-amber-400" aria-hidden="true" />
          <h1 className="mt-3 text-2xl font-extrabold text-zinc-50">{s.finishedTitle}</h1>
          {topRow && (
            <p className="mt-2 flex items-center justify-center gap-2 text-lg font-bold text-amber-300">
              <MemberAvatar memberId={topRow.id} name={nameOf(topRow.id)} size={26} />
              {champions.length > 1
                ? s.draw
                : `${nameOf(topRow.id)} ${r.winner}`}
            </p>
          )}
          <p className="mt-1 text-xs font-semibold text-zinc-500">{s.champion}</p>
        </div>

        {/* رتبه‌بندی نهایی — مدال برای سه نفر اول */}
        <h2 className="mt-8 text-sm font-bold text-zinc-400">{s.finalRank}</h2>
        <ul className="mt-3 space-y-2">
          {rows.map((row) => {
            const player = sher.players.find((p) => p.id === row.id);
            return (
              <li
                key={row.id}
                className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 ${
                  row.rank === 1 ? "border-amber-500/40 bg-amber-500/5" : "border-zinc-800 bg-zinc-900/60"
                }`}
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="w-7 shrink-0 text-center text-lg">
                    {row.rank <= 3 ? MEDALS[row.rank - 1] : <span className="text-sm font-black text-zinc-500">{numFmt(row.rank)}</span>}
                  </span>
                  <MemberAvatar memberId={row.id} name={nameOf(row.id)} size={28} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-zinc-200">
                      {nameOf(row.id)}
                      {row.id === st.me && <span className="ms-1.5 text-[10px] text-zinc-500">({s.you})</span>}
                    </span>
                    {player && player.team >= 0 && (
                      <span className={`mt-0.5 inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold ${teamStyles(player.team)}`}>
                        {s.teamN.replace("{n}", numFmt(player.team + 1))}
                      </span>
                    )}
                  </span>
                </span>
                <span className="shrink-0 text-base font-black text-emerald-400">{numFmt(row.score)}</span>
              </li>
            );
          })}
        </ul>

        {/* جدول تیمی — فقط وقتی مسابقه تیمی بوده */}
        {sher.mode !== "ffa" && sher.result.teams.length > 0 && (
          <>
            <h2 className="mt-8 text-sm font-bold text-zinc-400">{s.teamResult}</h2>
            <ul className="mt-3 space-y-2">
              {sher.result.teams.map((team) => (
                <li
                  key={team.team}
                  className={`flex items-center justify-between rounded-xl border px-4 py-3 ${teamStyles(team.team)}`}
                >
                  <span className="text-sm font-bold">{s.teamN.replace("{n}", numFmt(team.team + 1))}</span>
                  <span className="text-base font-black">{numFmt(team.score)}</span>
                </li>
              ))}
            </ul>
          </>
        )}

        {/* چت اتاق بعد از مسابقه */}
        <section className="mt-8 h-[420px] overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60">
          <ChatPanel scope={code} className="h-full" />
        </section>

        <div className="mt-8 flex flex-col items-center gap-3">
          {st.room.hostId === st.me ? (
            <Button
              onClick={again}
              disabled={sendingAgain}
              className="h-12 rounded-xl bg-violet-500 px-8 text-base font-bold text-zinc-950 hover:bg-violet-400 disabled:opacity-60"
            >
              {sendingAgain ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : null}
              {s.againCta}
            </Button>
          ) : (
            <p className="text-xs text-zinc-500">{s.waitingAgain}</p>
          )}
          <Button
            onClick={() => router.push("/arena")}
            variant="ghost"
            size="sm"
            className="rounded-full text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {s.backToArena}
          </Button>
        </div>
      </div>
    );
  }

  /* ---------- مسابقه در جریان ---------- */
  return (
    <div className="mx-auto max-w-5xl px-3 py-6 sm:px-6 sm:py-8">
      {/* نوار بالا: دور + مود + تایمر */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-lg font-extrabold text-zinc-50 sm:text-xl">
            <Music className="h-5 w-5 text-violet-400" aria-hidden="true" />
            {t.arena.gameSher}
          </h1>
          <p className="mt-0.5 text-xs text-zinc-500">
            {s.round} {numFmt(sher.round)} {s.of} {numFmt(sher.totalRounds)} — {modeLabel[sher.mode]}
          </p>
        </div>
        {isCountdown ? (
          <span className="rounded-full bg-violet-500/10 px-3 py-1.5 text-xs font-bold text-violet-300">
            {s.startingIn}
          </span>
        ) : (
          <span
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-black tabular-nums ${
              sher.phase === "guess" && totalSeconds <= 5 ? "bg-rose-500/10 text-rose-300" : "bg-zinc-800 text-zinc-200"
            }`}
          >
            <Timer className="h-4 w-4" aria-hidden="true" />
            {timeLabel}
          </span>
        )}
      </div>

      {/* نوار زمان فاز */}
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-zinc-800">
        <div
          className={`h-full rounded-full transition-[width] duration-250 ease-linear ${
            isReveal ? "bg-violet-400" : sher.phase === "guess" && totalSeconds <= 5 ? "bg-rose-400" : "bg-emerald-400"
          }`}
          style={{ width: `${isCountdown ? 100 : pct}%` }}
        />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
        {/* ستون اصلی */}
        <div className="min-w-0">
          <div
            className={`rounded-2xl border p-5 text-center sm:p-8 ${
              isReveal ? "border-violet-500/40 bg-violet-500/[0.06]" : "border-zinc-800 bg-zinc-900/60"
            }`}
          >
            {/* سربرگ آهنگ */}
            {song && (
              <p className="text-xs font-bold text-zinc-500">
                {song.title}
                {song.artist ? ` — ${song.artist}` : ""}
              </p>
            )}

            {/* فاز listen — زیرنویس مصرع‌های زمینه */}
            {sher.phase === "listen" && !isCountdown && song && (
              <>
                <p className="mt-4 flex items-center justify-center gap-2 text-lg font-bold text-violet-300">
                  <Play className="h-5 w-5" aria-hidden="true" />
                  {s.listenTitle}
                </p>
                <div className="mt-5 space-y-2.5">
                  {song.contextLines.map((line, i) => (
                    <p key={i} className="text-xl font-bold leading-relaxed text-zinc-100 sm:text-2xl">
                      {line}
                    </p>
                  ))}
                  <p className="text-xl leading-relaxed text-zinc-600 sm:text-2xl" aria-hidden="true">
                    ‌…
                  </p>
                </div>
                <p className="mt-4 text-xs font-semibold text-zinc-500">{s.listenSub}</p>
              </>
            )}

            {/* شمارش معکوس شروع مسابقه */}
            {isCountdown && (
              <p className="flex items-center justify-center gap-2 py-12 text-lg font-bold text-violet-300">
                <Music className="h-5 w-5" aria-hidden="true" />
                {s.startingIn}
              </p>
            )}

            {/* فاز guess — انتخاب سطح و ثبت حدس */}
            {sher.phase === "guess" && (
              <>
                <p className="mt-4 text-xl font-extrabold text-zinc-50 sm:text-2xl">{s.guessTitle}</p>
                {myAnswered ? (
                  <p className="mt-5 flex items-center justify-center gap-2 rounded-xl bg-emerald-500/10 py-3.5 text-sm font-bold text-emerald-300">
                    <Check className="h-4 w-4" aria-hidden="true" />
                    {s.answered}
                  </p>
                ) : level === null ? (
                  <div className="mt-5">
                    <p className="text-xs font-semibold text-zinc-500">{s.levelTitle}</p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {([1, 2, 3, 4] as SherLevel[]).map((l) => (
                        <button
                          key={l}
                          type="button"
                          onClick={() => setLevel(l)}
                          className="flex items-center justify-between gap-3 rounded-xl border-2 border-zinc-800 bg-zinc-950/60 px-4 py-3.5 text-start transition-colors hover:border-violet-500/60 hover:bg-violet-500/5"
                        >
                          <span className="text-sm font-bold text-zinc-200">{levelLabel[l]}</span>
                          <span className="shrink-0 rounded-full bg-violet-500/15 px-2.5 py-1 text-[11px] font-black text-violet-300">
                            {s.pointsOf.replace("{p}", numFmt(SHER_LEVEL_POINTS[l]))}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="mt-5 text-start">
                    <p className="flex flex-wrap items-center gap-2 text-xs font-bold text-zinc-400">
                      {s.chosenLevel}: <span className="text-violet-300">{levelLabel[level]}</span>
                      <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-black text-violet-300">
                        {s.pointsOf.replace("{p}", numFmt(SHER_LEVEL_POINTS[level]))}
                      </span>
                    </p>

                    {/* راهنمای کلمهٔ اول/آخر — فقط سطوح ۲ و ۳ */}
                    {(level === 2 || level === 3) && sher.hintFirst && (
                      <p className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                        <span className="text-[11px] font-bold text-zinc-500">{s.hintLabel}:</span>
                        <span className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 font-black text-amber-200">
                          {sher.hintFirst}
                        </span>
                        {level === 3 && sher.hintLast && sher.hintLast !== sher.hintFirst && (
                          <span className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 font-black text-amber-200">
                            … {sher.hintLast}
                          </span>
                        )}
                      </p>
                    )}

                    {/* سطح ۴ — چهار دکمهٔ گزینه */}
                    {level === 4 ? (
                      <div className="mt-4 grid gap-2">
                        <p className="text-xs font-semibold text-zinc-500">{s.optionHint}</p>
                        {song?.options.map((opt, i) => (
                          <button
                            key={i}
                            type="button"
                            disabled={sending}
                            onClick={() => submit(String(i), 4)}
                            className="rounded-xl border-2 border-zinc-800 bg-zinc-950/60 px-4 py-3 text-start text-sm font-bold text-zinc-100 transition-colors hover:border-violet-500/60 hover:bg-violet-500/5 disabled:opacity-50"
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (text.trim()) void submit(text.trim(), level);
                        }}
                        className="mt-4"
                      >
                        <textarea
                          value={text}
                          onChange={(e) => setText(e.target.value)}
                          disabled={sending}
                          placeholder={s.typePh}
                          maxLength={200}
                          rows={2}
                          className="w-full resize-none rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-base font-bold text-zinc-100 outline-none transition-colors placeholder:font-normal placeholder:text-zinc-600 focus:border-violet-500/60 disabled:opacity-50"
                        />
                        <Button
                          type="submit"
                          disabled={!text.trim() || sending}
                          className="mt-2.5 h-11 w-full rounded-xl bg-violet-500 text-sm font-bold text-zinc-950 hover:bg-violet-400 disabled:opacity-40"
                        >
                          {sending ? (
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                          ) : (
                            <Check className="h-4 w-4" aria-hidden="true" />
                          )}
                          {sending ? s.submitting : s.submit}
                        </Button>
                      </form>
                    )}
                  </div>
                )}

                <p className="mt-4 text-[11px] font-bold text-zinc-500">
                  {s.playersAnswered.replace("{n}", numFmt(sher.answeredCount)).replace("{t}", numFmt(sher.players.length))}
                </p>
              </>
            )}

            {/* فاز reveal — پاسخ درست + پاسخ‌های همه */}
            {isReveal && song?.answerLine && (
              <>
                <p className="mt-4 text-xs font-bold text-violet-300">{s.revealTitle}</p>
                <p className="mt-2 text-2xl font-black leading-relaxed text-zinc-50 sm:text-3xl">
                  {song.answerLine}
                </p>
                <ul className="mt-6 space-y-1.5 text-start">
                  {sher.players.map((p) => {
                    const rec = sher.revealed?.[p.id] ?? null;
                    const roundPoints = rec ? (rec.correct ? SHER_LEVEL_POINTS[rec.level] : 0) : null;
                    return (
                      <li
                        key={p.id}
                        className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 ${
                          rec?.correct
                            ? "border-emerald-500/40 bg-emerald-500/[0.06]"
                            : "border-zinc-800 bg-zinc-900/60"
                        }`}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <MemberAvatar memberId={p.id} name={p.name} size={24} />
                          <span className="truncate text-[13px] font-semibold text-zinc-200">
                            {p.name}
                            {p.id === st.me && <span className="ms-1 text-[9px] text-zinc-500">({s.you})</span>}
                          </span>
                          {p.bot && (
                            <span className="flex shrink-0 items-center gap-1 rounded-full bg-sky-500/10 px-1.5 py-0.5 text-[9px] font-bold text-sky-300">
                              <Bot className="h-2.5 w-2.5" aria-hidden="true" />
                              {s.bot}
                            </span>
                          )}
                        </span>
                        <span className="flex shrink-0 items-center gap-2 text-[11px] font-bold">
                          {rec ? (
                            <>
                              <span className="text-zinc-500">
                                {s.levelLabel} {numFmt(rec.level)}
                              </span>
                              <span className={rec.correct ? "text-emerald-400" : "text-rose-400"}>
                                {rec.correct ? s.correct : s.wrong}
                              </span>
                              <span className="text-emerald-400">+{numFmt(roundPoints ?? 0)}</span>
                            </>
                          ) : (
                            <span className="text-zinc-600">{s.noAnswer}</span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>
        </div>

        {/* ستون کنار: امتیازهای زنده */}
        <aside className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3.5">
          <h3 className="px-1 text-xs font-black text-zinc-400">{s.scoresTitle}</h3>
          <ul className="mt-2 space-y-1.5">
            {rankedPlayers.map((p) => (
              <li
                key={p.id}
                className={`flex items-center justify-between gap-2 rounded-xl px-2.5 py-2 ${
                  p.id === st.me ? "bg-violet-500/10 ring-1 ring-violet-500/30" : ""
                } ${p.online ? "" : "opacity-40"}`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <MemberAvatar memberId={p.id} name={p.name} size={24} />
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-[12px] font-semibold text-zinc-200">
                        {p.name}
                        {p.id === st.me && <span className="ms-1 text-[9px] text-zinc-500">({s.you})</span>}
                      </span>
                      {p.bot && <Bot className="h-3 w-3 shrink-0 text-sky-400" aria-hidden="true" />}
                      {p.id === st.room.hostId && <Crown className="h-3 w-3 shrink-0 text-amber-300" aria-hidden="true" />}
                    </span>
                    {p.team >= 0 && (
                      <span className={`mt-0.5 inline-block rounded-full border px-1.5 py-0.5 text-[9px] font-bold ${teamStyles(p.team)}`}>
                        {s.teamN.replace("{n}", numFmt(p.team + 1))}
                      </span>
                    )}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-black tabular-nums text-emerald-400">
                  {numFmt(sher.scores[p.id] ?? 0)}
                </span>
              </li>
            ))}
          </ul>
        </aside>
      </div>

      {/* پخش‌کنندهٔ صوت — پالیسی مرورگر: تا لمس کاربر مخفی */}
      {song && (
        <>
          <audio
            ref={audioRef}
            src={`/sher/songs/${encodeURIComponent(song.filename)}`}
            preload="auto"
            className="hidden"
            onTimeUpdate={(e) => {
              /* امانت‌دستی به قطع ناگهانی — کمی بعد از پایان ۱۰ثانیه‌ای، خفه کن */
              const el = e.currentTarget;
              if (listenActive && el.currentTime > song.clipStart + SHER_LISTEN_MS / 1000 + 1.5) el.pause();
            }}
          />
          {needPlay && sher.phase === "listen" && (
            <button
              type="button"
              onClick={() => {
                const el = audioRef.current;
                if (!el) return;
                try {
                  el.currentTime = song.clipStart;
                } catch {
                  /* بی‌خطر */
                }
                el.play()
                  .then(() => setNeedPlay(false))
                  .catch(() => undefined);
              }}
              className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-zinc-950/85 backdrop-blur-sm"
              aria-label={s.playBtn}
            >
              <span className="flex h-20 w-20 items-center justify-center rounded-full bg-violet-500 text-zinc-950 shadow-2xl">
                <Play className="h-9 w-9" aria-hidden="true" />
              </span>
              <span className="text-base font-bold text-zinc-100">{s.playBtn}</span>
              <X className="absolute end-5 top-5 h-6 w-6 text-zinc-600" aria-hidden="true" />
            </button>
          )}
        </>
      )}
    </div>
  );
}
