"use client";

/* اتاق رکوردی آرنا — همهٔ اعضای اتاق همان بازی آپلودی را اجرا می‌کنند و
   امتیازها زنده مقایسه می‌شود (پروتکل مشترک اتاق‌های آرنا).
   کل صفحه مثل «میدان آتش» جاسازی‌شده، یک لایهٔ تمام‌صفحه روی سربرگ سایت است
   تا روی موبایل کوچک‌ترین فضا هدر نرود؛ بازی داخل iframe هم‌مبدأ در حالت
   آرنا (?arena=1) بی‌درنگ و بدون منو شروع می‌شود.
   پل رکورد (window.NaseriGame.submitScore) از داخل قاب پیام postMessage با
   نوع naseri-score می‌فرستد — همین‌جا گرفته می‌شود، به امتیاز اتاق (action
   «score») و جدول برترین‌ها (/api/scores) ثبت می‌گردد.
   ربات‌های اتاق با امتیاز قطعی سمت سرور رکورد می‌زنند و میزبان هر وقت بخواهد
   دور را تمام می‌کند (سقف زمان هم ۱۵ دقیقه است).
   رده‌بندی زنده: در صفحه‌های بزرگ نوار کناری ثابت؛ در موبایل پنهان است و با
   دکمهٔ شناور رتبه باز می‌شود — تا هرگز جلوی دید بازیکن را نگیرد؛ پنل داخلی
   خودِ بازی هم در حالت آرنا روی موبایل کلاً پنهان می‌شود (قاب بازی تمام‌صفحه).
   نام‌های دایره‌ها = نام‌های واقعی اعضای اتاق: نامِ من روی دایرهٔ خودم و نام
   بقیهٔ اعضا (بازیکنان واقعی + ربات‌های آرنا) روی دایره‌های حریف — تا دنیای
   بازی و فهرست رده‌بندی اتاق هم‌نام باشند و بازی دو اسم نداشته باشد. */

import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, Check, Flag, Loader2, Maximize, Minimize, Trophy, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useLang } from "@/components/site/language-provider";
import { isBotId } from "@/lib/arena-registry";
import type { ArenaStateResponse } from "@/lib/types";

type ScoreRoomClientProps = {
  st: ArenaStateResponse;
  elapsedMs: number; // فاصله آخرین دریافت وضعیت تا الان — برای تایمر نرم
  sendAction: (body: Record<string, unknown>) => Promise<boolean>;
  sending: boolean;
  onLeave: () => void | Promise<void>;
};

export function ScoreRoomClient({ st, elapsedMs, sendAction, sending, onLeave }: ScoreRoomClientProps) {
  const { t, lang } = useLang();
  const a = t.arena;
  const r = a.room;
  const [saved, setSaved] = useState<number | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const lastSavedRef = useRef(0);
  const numFmt = (n: number) => new Intl.NumberFormat(lang === "fa" ? "fa-IR" : "en-US").format(n);

  const title = st.room.gameTitle;
  const iAmHost = st.room.hostId === st.me;
  const endsAt = st.room.endsAtMs;
  const serverNow = st.now + elapsedMs;
  const remainingSec = endsAt ? Math.max(0, Math.ceil((endsAt - serverNow) / 1000)) : null;

  const members = [...st.members].sort((x, y) => y.score - x.score);
  const myScore = st.members.find((m) => m.id === st.me)?.score ?? 0;
  const myRank = members.findIndex((m) => m.id === st.me) + 1;

  /* نام من و نام همهٔ اعضای دیگر اتاق — به قاب بازی می‌رود تا دایره‌ها دقیقاً
     با فهرست اعضا هم‌نام شوند: حریف‌ها = بقیهٔ اعضا به همان ترتیب (بازیکنان
     واقعی + ربات‌های آرنا، هر کدام با نام واقعی‌شان در اتاق).
     تعداد حریف‌ها هم = تعداد اعضای دیگر (نه فقط ربات‌ها) تا همهٔ اعضای اتاق
     روی زمین دایره‌ای داشته باشند. */
  const myName = st.members.find((m) => m.id === st.me)?.name ?? "";
  const others = st.members.filter((m) => m.id !== st.me);
  const frameBots = Math.max(1, Math.min(9, others.length || 3));
  const frameNames = others.slice(0, 9).map((m) => m.name.trim().slice(0, 14)).filter(Boolean);
  const frameSrc =
    `/api/games/${st.room.gameSlug}/file?arena=1&name=${encodeURIComponent(myName.slice(0, 14))}` +
    `&bots=${frameBots}&names=${encodeURIComponent(JSON.stringify(frameNames))}`;

  /* --- پل رکورد از داخل iframe — هم امتیاز اتاق، هم جدول برترین‌ها --- */
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const d = e.data as { type?: string; value?: unknown; detail?: unknown } | null;
      if (!d || d.type !== "naseri-score") return;
      const value = Math.trunc(Number(d.value));
      if (!Number.isFinite(value) || value <= 0) return;
      /* ضدهرز — بیش از یکی در ۱٫۵ ثانیه برای هر پنجره ثبت نمی‌شود */
      const now = Date.now();
      if (now - lastSavedRef.current < 1500) return;
      lastSavedRef.current = now;
      setSaved((prev) => Math.max(prev ?? 0, value));
      void sendAction({ type: "score", value });
      void fetch("/api/scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameSlug: st.room.gameSlug, score: value, detail: d.detail ?? null }),
      }).catch(() => undefined);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [sendAction, st.room.gameSlug]);

  /* --- تمام‌صفحه --- */
  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = document.getElementById("score-game-frame");
    if (!document.fullscreenElement) {
      el?.requestFullscreen?.().catch(() => undefined);
    } else {
      document.exitFullscreen?.().catch(() => undefined);
    }
  }, []);

  /* --- فهرست رده‌بندی — مشترک بین نوار کناری و کشوی موبایل --- */
  const scoresList = (
    <ul className="space-y-1.5">
      {members.map((m, i) => (
        <li
          key={m.id}
          className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 ${
            m.id === st.me ? "bg-emerald-500/10" : ""
          } ${m.online ? "" : "opacity-40"}`}
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="w-4 text-center text-xs font-black text-zinc-500">{numFmt(i + 1)}</span>
            {isBotId(m.id) ? (
              <Bot className="h-3.5 w-3.5 shrink-0 text-lime-400" aria-hidden="true" />
            ) : null}
            <span className="truncate text-sm font-semibold text-zinc-200">{m.name}</span>
          </span>
          <span className="shrink-0 text-sm font-black tabular-nums text-emerald-400">
            {numFmt(m.score)}
          </span>
        </li>
      ))}
    </ul>
  );

  const hint = (
    <p className="border-t border-zinc-800 pt-2.5 text-[10px] leading-5 text-zinc-600">
      {a.scoreRoomHint}
    </p>
  );

  return (
    /* لایهٔ تمام‌صفحه — بالای سربرگ سایت، مثل میدان آتش جاسازی‌شده */
    <div className="fixed inset-0 z-[60] flex flex-col bg-zinc-950" dir="rtl">
      {/* نوار بالا — خروج، عنوان، تایمر، پایان دور */}
      <div className="flex shrink-0 items-center gap-2 border-b border-emerald-500/20 bg-zinc-950 px-2 py-2 sm:px-4">
        <Button
          onClick={() => setConfirmLeave(true)}
          variant="outline"
          size="icon"
          aria-label={r.leaveCta}
          className="h-9 w-9 shrink-0 rounded-full border-zinc-700 bg-transparent text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>

        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="truncate text-sm font-black text-emerald-300">{title}</span>
          <span className="hidden shrink-0 rounded-full border border-emerald-500/30 bg-zinc-950/60 px-2.5 py-0.5 text-[11px] font-bold text-emerald-300 sm:inline">
            {a.scoreRoomTag}
          </span>
          {remainingSec !== null && (
            <span className="shrink-0 rounded-full border border-zinc-800 bg-zinc-950/60 px-2.5 py-0.5 text-[11px] font-bold tabular-nums text-zinc-300">
              ⏱ {numFmt(Math.floor(remainingSec / 60))}:{numFmt(remainingSec % 60).padStart(2, "۰")}
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {/* رتبه و امتیاز من در موبایل — در نوار بالا باز می‌شود تا هرگز روی
              میدان بازی یا نوار قابلیت‌های داخل بازی نیفتد */}
          <button
            onClick={() => setPanelOpen(true)}
            className="flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-zinc-950/70 px-3 py-1.5 text-xs font-bold text-emerald-300 lg:hidden"
            aria-label={r.scores}
          >
            <Trophy className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
            <span className="tabular-nums">#{numFmt(myRank || 1)}</span>
            <span className="tabular-nums text-emerald-400">{numFmt(myScore)}</span>
          </button>
          {saved !== null && (
            <span className="hidden items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-bold text-emerald-300 sm:flex">
              <Check className="h-3 w-3" aria-hidden="true" />
              {a.scoreSaved.replace("{n}", numFmt(Math.max(saved, myScore)))}
            </span>
          )}
          <Button
            onClick={toggleFullscreen}
            variant="outline"
            size="icon"
            aria-label={fullscreen ? "exit fullscreen" : "fullscreen"}
            className="h-9 w-9 shrink-0 rounded-full border-zinc-700 bg-transparent text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
          >
            {fullscreen ? <Minimize className="h-4 w-4" aria-hidden="true" /> : <Maximize className="h-4 w-4" aria-hidden="true" />}
          </Button>
          {iAmHost ? (
            <Button
              onClick={() => void sendAction({ type: "finish_round" })}
              disabled={sending}
              className="h-9 shrink-0 rounded-full bg-amber-500 px-3 text-xs font-bold text-zinc-950 hover:bg-amber-400 disabled:opacity-60 sm:px-4"
            >
              <Flag className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">{a.endRoundCta}</span>
            </Button>
          ) : (
            <span className="hidden text-[11px] text-zinc-500 md:inline">{a.waitEndRound}</span>
          )}
        </div>
      </div>

      {/* بدنه — قاب بازی تمام‌فضا + رده‌بندی */}
      <div className="flex min-h-0 flex-1">
        <div className="relative min-h-0 min-w-0 flex-1">
          <iframe
            id="score-game-frame"
            src={frameSrc}
            title={title}
            className="absolute inset-0 h-full w-full border-0 bg-zinc-950"
            allow="autoplay; fullscreen; gamepad"
          />
        </div>

        {/* نوار کناری رده‌بندی — فقط صفحه‌های بزرگ */}
        <aside className="hidden w-60 shrink-0 overflow-y-auto border-s border-zinc-800 bg-zinc-900/60 p-3 lg:block">
          <h2 className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wide text-zinc-500">
            <Trophy className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
            {r.scores}
          </h2>
          <div className="mt-2.5">{scoresList}</div>
          <div className="mt-3">{hint}</div>
        </aside>
      </div>

      {/* کشوی رده‌بندی موبایل — از پایین باز می‌شود */}
      {panelOpen && (
        <div className="fixed inset-0 z-[70] lg:hidden" onClick={() => setPanelOpen(false)}>
          <div className="absolute inset-0 bg-zinc-950/60 backdrop-blur-[2px]" />
          <div
            className="absolute inset-x-0 bottom-0 max-h-[62dvh] overflow-y-auto rounded-t-2xl border-t border-zinc-700 bg-zinc-900 p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wide text-zinc-400">
                <Trophy className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
                {r.scores}
              </h2>
              <button
                onClick={() => setPanelOpen(false)}
                aria-label="close"
                className="rounded-full p-1.5 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-200"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            {scoresList}
            <div className="mt-3">{hint}</div>
          </div>
        </div>
      )}

      {sending && (
        <div className="pointer-events-none fixed bottom-4 start-4 z-[80]">
          <Loader2 className="h-4 w-4 animate-spin text-zinc-500" aria-hidden="true" />
        </div>
      )}

      {/* تایید خروج از اتاق */}
      <AlertDialog open={confirmLeave} onOpenChange={setConfirmLeave}>
        <AlertDialogContent dir="rtl" className="max-w-sm rounded-2xl border-zinc-800 bg-zinc-900">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base text-zinc-50">{r.leaveCta}؟</AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-6 text-zinc-400">
              {a.scoreLeaveDesc}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogCancel className="rounded-full border-zinc-700 bg-transparent text-sm text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100">
              {a.scoreStayCta}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void onLeave()}
              className="rounded-full bg-red-500 text-sm font-bold text-zinc-950 hover:bg-red-400"
            >
              {r.leaveCta}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
