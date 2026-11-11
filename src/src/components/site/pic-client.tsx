"use client";

/* بازی «حدس تصویر» — نمای مسابقهٔ همه‌ضدهمه و صفحهٔ نتیجه.
   همهٔ منطق سمت سرور است؛ این کامپوننت وضعیت استریم را نمایش می‌دهد
   و فقط «ثبت حدس» را ارسال می‌کند. پاسخ دور جاری در فاز پاسخ‌دهی
   هرگز به کلاینت نمی‌رسد. */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  Crown,
  Image as ImageIcon,
  Loader2,
  Lock,
  Timer,
  Trophy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLang } from "@/components/site/language-provider";
import { MemberAvatar } from "@/components/site/member-avatar";
import { ChatPanel } from "@/components/site/chat-panel";
import { cleanAnswerInput } from "@/lib/jadval-shared";
import type { ArenaStateResponse } from "@/lib/types";

export function PicClient({
  st,
  offsetMs,
}: {
  st: ArenaStateResponse;
  offsetMs: number;
}) {
  const { t, lang } = useLang();
  const p = t.arena.pic;
  const r = t.arena.room;
  const router = useRouter();
  const pic = st.pic;
  const code = st.room.code;

  const [answer, setAnswer] = useState("");
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "bad" | "info"; text: string } | null>(null);
  const [tick, setTick] = useState(0);
  const [sendingAgain, setSendingAgain] = useState(false);
  const aliveRef = useRef(true);

  const numFmt = useCallback(
    (n: number) => new Intl.NumberFormat(lang === "fa" ? "fa-IR" : "en-US").format(n),
    [lang],
  );

  /* تیک محلی برای تایمر و قفل */
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

  /* پیام‌های گذرا خودشان محو می‌شوند */
  useEffect(() => {
    if (!feedback) return;
    const id = setTimeout(() => setFeedback(null), feedback.kind === "bad" ? 4000 : 3000);
    return () => clearTimeout(id);
  }, [feedback]);

  if (!pic) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-600" aria-hidden="true" />
      </div>
    );
  }

  const now = Date.now();
  const elapsedSinceFetch = now - st.now + offsetMs;
  const remainingMs = Math.max(0, pic.endsInMs - elapsedSinceFetch);
  const totalMs = pic.phase === "reveal" ? 4000 : 20000;
  const pct = Math.min(100, (remainingMs / totalMs) * 100);

  async function submitGuess() {
    if (!answer.trim() || sending) return;
    setSending(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/arena/rooms/${encodeURIComponent(code)}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "pic_answer", text: answer.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        correct?: boolean;
        points?: number;
        lockMs?: number;
        error?: string;
      };
      if (!aliveRef.current) return;
      if (res.ok && data.ok && data.correct) {
        setFeedback({
          kind: "ok",
          text: p.yourWin.replace("{p}", numFmt(data.points ?? 0)),
        });
        setAnswer("");
      } else if (res.ok && data.ok && data.correct === false) {
        const secs = Math.max(1, Math.round((data.lockMs ?? 4000) / 1000));
        setFeedback({ kind: "bad", text: p.wrongFlash.replace("{s}", numFmt(secs)) });
        setAnswer("");
      } else if (res.status === 429) {
        const secs = Math.max(1, Math.round((data.lockMs ?? 4000) / 1000));
        setFeedback({ kind: "info", text: p.locked.replace("{s}", numFmt(secs)) });
      } else {
        /* closed و بقیه — بی‌صدا؛ دور عوض می‌شود */
        setAnswer("");
      }
    } catch {
      if (aliveRef.current) setFeedback({ kind: "bad", text: r.connectionLost });
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

  /* ---------- صفحهٔ نتیجه ---------- */
  if (pic.status === "finished") {
    const ranked = [...st.members].sort((a, b) => b.score - a.score);
    const top = ranked[0];
    const isDraw = ranked.length > 1 && ranked[1].score === top?.score;
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-b from-amber-500/10 to-transparent p-6 text-center sm:p-8">
          <Trophy className="mx-auto h-12 w-12 text-amber-400" aria-hidden="true" />
          <h1 className="mt-3 text-2xl font-extrabold text-zinc-50">{p.finishedTitle}</h1>
          {top && (
            <p className="mt-2 flex items-center justify-center gap-2 text-lg font-bold text-amber-300">
              <MemberAvatar memberId={top.id} name={top.name} size={26} />
              {isDraw ? r.draw : `${top.name} ${r.winner}`}
            </p>
          )}
        </div>

        {/* پاسخ همهٔ دورها */}
        <h2 className="mt-8 text-sm font-bold text-zinc-400">{p.roundsStrip}</h2>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {pic.history.map((h, i) => (
            <li
              key={i}
              className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 ${
                h.mine ? "border-emerald-500/40 bg-emerald-500/[0.06]" : "border-zinc-800 bg-zinc-900/60"
              }`}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="shrink-0 text-xl">{h.emoji}</span>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-bold text-zinc-200">{h.answer}</span>
                  <span className="block truncate text-[10px] text-zinc-500">
                    {h.winnerName ? `${h.winnerName} +${numFmt(h.points)}` : "—"}
                  </span>
                </span>
              </span>
              {h.mine && <Check className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />}
            </li>
          ))}
        </ul>

        {/* امتیاز نهایی */}
        <h2 className="mt-8 text-sm font-bold text-zinc-400">{p.scoreTitle}</h2>
        <ul className="mt-3 space-y-2">
          {ranked.map((m, i) => (
            <li
              key={m.id}
              className={`flex items-center justify-between rounded-xl border px-4 py-3 ${
                i === 0 ? "border-amber-500/40 bg-amber-500/5" : "border-zinc-800 bg-zinc-900/60"
              }`}
            >
              <span className="flex items-center gap-3">
                <span className="w-6 text-center text-sm font-black text-zinc-500">{numFmt(i + 1)}</span>
                <MemberAvatar memberId={m.id} name={m.name} size={28} />
                <span className="text-sm font-semibold text-zinc-200">
                  {m.name}
                  {m.id === st.me && <span className="ms-1.5 text-[10px] text-zinc-500">({p.you})</span>}
                </span>
                {m.isHost && <Crown className="h-3.5 w-3.5 text-amber-300" aria-hidden="true" />}
              </span>
              <span className="text-base font-black text-emerald-400">{numFmt(m.score)}</span>
            </li>
          ))}
        </ul>

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
              {p.againCta}
            </Button>
          ) : (
            <p className="text-xs text-zinc-500">{p.waitingAgain}</p>
          )}
          <Button
            onClick={() => router.push("/arena")}
            variant="ghost"
            size="sm"
            className="rounded-full text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {p.backToArena}
          </Button>
        </div>
      </div>
    );
  }

  /* ---------- مسابقه در جریان ---------- */
  const lockRemainMs = pic.myLockUntilMs > 0 ? pic.myLockUntilMs - now : 0;
  const isLocked = lockRemainMs > 0;
  const lockSeconds = Math.max(0, Math.ceil(lockRemainMs / 1000));
  const isReveal = pic.phase === "reveal";
  const isCountdown = pic.status === "countdown";
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const pad = lang === "fa" ? "۰" : "0";
  const timeLabel = `${numFmt(Math.floor(totalSeconds / 60))}:${numFmt(totalSeconds % 60).padStart(2, pad)}`;
  const ranked = [...st.members].sort((a, b) => b.score - a.score);
  const current = pic.history[pic.history.length - 1];
  const iWonCurrent = current?.mine ?? false;

  return (
    <div className="mx-auto max-w-5xl px-3 py-6 sm:px-6 sm:py-8">
      {/* نوار بالا: دور + زمان */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-lg font-extrabold text-zinc-50 sm:text-xl">{t.arena.gamePic}</h1>
          <p className="mt-0.5 text-xs text-zinc-500">{p.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          {isCountdown ? (
            <span className="rounded-full bg-violet-500/10 px-3 py-1.5 text-xs font-bold text-violet-300">
              {p.startingIn}
            </span>
          ) : (
            <span
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-black tabular-nums ${
                !isReveal && totalSeconds <= 5 ? "bg-rose-500/10 text-rose-300" : "bg-zinc-800 text-zinc-200"
              }`}
            >
              <Timer className="h-4 w-4" aria-hidden="true" />
              {timeLabel}
            </span>
          )}
        </div>
      </div>

      {/* نوار پیشرفت دورها */}
      <div className="mt-4 flex items-center gap-1.5" aria-label={p.roundsStrip}>
        {Array.from({ length: pic.rounds }, (_, i) => {
          const h = pic.history[i];
          const active = i === pic.round && !isCountdown;
          return (
            <span
              key={i}
              className={`h-1.5 flex-1 rounded-full ${
                h
                  ? h.winnerId
                    ? h.mine
                      ? "bg-emerald-400"
                      : "bg-zinc-500"
                    : "bg-zinc-700"
                  : active
                    ? "bg-violet-400"
                    : "bg-zinc-800"
              }`}
            />
          );
        })}
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
        {/* ستون اصلی: پازل + پاسخ */}
        <div className="min-w-0">
          <div
            className={`rounded-2xl border p-6 text-center sm:p-10 ${
              isReveal
                ? "border-violet-500/40 bg-violet-500/[0.06]"
                : "border-zinc-800 bg-zinc-900/60"
            }`}
          >
            <p className="text-xs font-bold text-zinc-500">
              {p.round} {numFmt(pic.round + 1)} {p.of} {numFmt(pic.rounds)}
            </p>
            {isCountdown ? (
              <p className="mt-8 flex items-center justify-center gap-2 py-10 text-lg font-bold text-violet-300">
                <ImageIcon className="h-5 w-5" aria-hidden="true" />
                {p.startingIn}
              </p>
            ) : (
              <>
                <p
                  className={`mt-4 select-none text-5xl leading-tight tracking-wide sm:text-7xl ${isReveal ? "opacity-80" : ""}`}
                  dir="ltr"
                >
                  {pic.emoji}
                </p>
                {!isReveal && (
                  <p className="mt-3 text-[11px] font-bold text-zinc-500">
                    {p.lenHint.replace("{l}", numFmt(pic.len))}
                  </p>
                )}
              </>
            )}

            {isReveal && current && (
              <div className="mt-5 rounded-xl bg-zinc-900/70 px-4 py-3">
                <p className="text-sm font-bold text-zinc-300">
                  {p.revealAnswer} <b className="text-lg text-violet-200">{current.answer}</b>
                </p>
                <p className="mt-1 text-xs font-semibold text-zinc-500">
                  {current.winnerName
                    ? (current.mine
                        ? p.yourWin.replace("{p}", numFmt(current.points))
                        : p.wonBy.replace("{n}", current.winnerName).replace("{p}", numFmt(current.points))
                      )
                    : p.noWin.replace("{a}", current.answer ?? "")}
                </p>
              </div>
            )}
          </div>

          {/* نوار ثبت حدس — فقط فاز پاسخ‌دهی */}
          {!isCountdown && !isReveal && (
            <div
              className={`mt-4 rounded-2xl border p-3.5 ${
                isLocked ? "border-rose-500/40 bg-rose-500/[0.06]" : "border-zinc-800 bg-zinc-900/60"
              }`}
            >
              {isLocked ? (
                <p className="flex items-center justify-center gap-2 rounded-xl bg-rose-500/10 py-3 text-sm font-bold text-rose-300">
                  <Lock className="h-4 w-4" aria-hidden="true" />
                  {p.locked.replace("{s}", numFmt(lockSeconds))}
                </p>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void submitGuess();
                  }}
                  className="flex gap-2"
                >
                  <input
                    value={answer}
                    onChange={(e) => setAnswer(cleanAnswerInput(e.target.value))}
                    disabled={sending}
                    placeholder={p.answerPh}
                    maxLength={40}
                    autoComplete="off"
                    className="h-11 min-w-0 flex-1 rounded-xl border border-zinc-700 bg-zinc-950 px-3.5 text-base font-bold text-zinc-100 outline-none transition-colors placeholder:font-normal placeholder:text-zinc-600 focus:border-violet-500/60 disabled:opacity-50"
                  />
                  <Button
                    type="submit"
                    disabled={!answer.trim() || sending}
                    className="h-11 shrink-0 rounded-xl bg-violet-500 px-5 text-sm font-bold text-zinc-950 hover:bg-violet-400 disabled:opacity-40"
                  >
                    {sending ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Check className="h-4 w-4" aria-hidden="true" />
                    )}
                    {sending ? p.submitting : p.submit}
                  </Button>
                </form>
              )}
              {feedback && (
                <p
                  className={`mt-2.5 rounded-lg px-3 py-1.5 text-center text-xs font-bold ${
                    feedback.kind === "ok"
                      ? "bg-emerald-500/10 text-emerald-300"
                      : feedback.kind === "bad"
                        ? "bg-rose-500/10 text-rose-300"
                        : "bg-zinc-800 text-zinc-300"
                  }`}
                >
                  {feedback.text}
                </p>
              )}
            </div>
          )}

          {isReveal && iWonCurrent && (
            <p className="mt-3 rounded-xl bg-emerald-500/10 py-2.5 text-center text-sm font-bold text-emerald-300">
              {p.correctFlash}
            </p>
          )}
        </div>

        {/* ستون کنار: امتیازهای زنده */}
        <aside className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3.5">
          <h3 className="px-1 text-xs font-black text-zinc-400">{p.scoreTitle}</h3>
          <ul className="mt-2 space-y-1.5">
            {ranked.map((m, i) => (
              <li
                key={m.id}
                className={`flex items-center justify-between gap-2 rounded-xl px-2.5 py-2 ${
                  m.id === st.me ? "bg-violet-500/10 ring-1 ring-violet-500/30" : ""
                }`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="w-4 shrink-0 text-center text-[11px] font-black text-zinc-500">
                    {numFmt(i + 1)}
                  </span>
                  <MemberAvatar memberId={m.id} name={m.name} size={24} />
                  <span className="truncate text-[12px] font-semibold text-zinc-200">
                    {m.name}
                    {m.id === st.me && <span className="ms-1 text-[9px] text-zinc-500">({p.you})</span>}
                  </span>
                  {m.isHost && <Crown className="h-3 w-3 shrink-0 text-amber-300" aria-hidden="true" />}
                </span>
                <span className="shrink-0 text-sm font-black text-emerald-400">{numFmt(m.score)}</span>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}
