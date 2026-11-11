"use client";

/* اتاق بازی آرنا — لابی، مسابقه زنده و صفحه نتایج.
   وضعیت به‌صورت زنده از استریم SSE می‌رسد (push سرور)؛
   منطق بازی سمت سرور است؛ این کامپوننت فقط وضعیت را نمایش می‌دهد و اکشن می‌فرستد. */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Bot,
  Check,
  Circle,
  Copy,
  Crown,
  Loader2,
  LogOut,
  MessageCircle,
  Play,
  Trophy,
  Volume2,
  VolumeX,
  WifiOff,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLang } from "@/components/site/language-provider";
import { ChatPanel } from "@/components/site/chat-panel";
import { NabardClient } from "@/components/site/nabard-client";
import { JadvalClient } from "@/components/site/jadval-client";
import { PicClient } from "@/components/site/pic-client";
import { subscribeStream } from "@/lib/realtime";
import { ARENA_GAME_SLUG, ANSWER_MS, BOT_GAMES, REVEAL_MS, CATEGORY_LABELS, isBotId, type ArenaCategory } from "@/lib/arena-game";
import { JADVAL_GAME_SLUG } from "@/lib/jadval-shared";
import { PIC_GAME_SLUG } from "@/lib/pic-shared";
import { sfxAmbientStart, sfxAmbientStop, sfxIsMuted, sfxLose, sfxToggleMuted, sfxWin } from "@/lib/arena-sfx";
import type { ArenaStateResponse } from "@/lib/types";

const OPTION_KEYS = ["A", "B", "C", "D"];

export function RoomClient({ code }: { code: string }) {
  const { t, lang } = useLang();
  const a = t.arena;
  const r = a.room;
  const router = useRouter();

  const [st, setSt] = useState<ArenaStateResponse | null>(null);
  const [fatal, setFatal] = useState("");
  const [copied, setCopied] = useState(false);
  const [picked, setPicked] = useState<number | null>(null); // پاسخ بهینه‌شده برای سؤال جاری
  const [sending, setSending] = useState(false);
  const [tick, setTick] = useState(0);
  const [chatOpen, setChatOpen] = useState(false); // چت شناور وسط مسابقه
  const [fetchedAt, setFetchedAt] = useState(0); // زمان کلاینت آخرین وضعیت
  const [muted, setMuted] = useState(false); // افکت‌های صوتی — بعد از mount از localStorage خوانده می‌شود

  const roundRef = useRef(-1);
  const stingerRef = useRef("");
  const aliveRef = useRef(true);

  const numFmt = useCallback(
    (n: number) => new Intl.NumberFormat(lang === "fa" ? "fa-IR" : "en-US").format(n),
    [lang],
  );

  /* --- ورود خودکار (وقتی با لینک مستقیم می‌آید) و سپس دریافت زنده وضعیت از استریم.
     سرور هر تغییر را push می‌کند؛ یک پایش پشتیبان ۶ ثانیه‌ای هم فقط برای اطمینان می‌ماند. --- */
  useEffect(() => {
    aliveRef.current = true;

    async function join() {
      try {
        const res = await fetch("/api/arena/rooms/join", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        });
        if (res.ok) return true;
        const data = await res.json().catch(() => ({}));
        if (data.error === "playing") setFatal(r.joinPlaying);
        else if (data.error === "full") setFatal(r.joinFull);
        else setFatal(r.notFound);
        return false;
      } catch {
        setFatal(r.connectionLost);
        return false;
      }
    }

    function applyState(data: ArenaStateResponse) {
      setFetchedAt(Date.now());
      setSt(data);
      setFatal("");
      /* تغییر سؤال → انتخاب محلی پاک شود */
      const newRound = data.game ? data.game.round : -1;
      if (newRound !== roundRef.current) {
        roundRef.current = newRound;
        setPicked(null);
      }
    }

    async function refreshOnce() {
      try {
        const res = await fetch(`/api/arena/rooms/${encodeURIComponent(code)}/state`, {
          cache: "no-store",
        });
        if (!aliveRef.current) return;
        if (res.status === 404) {
          setFatal(r.notFound);
          return;
        }
        if (res.ok) applyState((await res.json()) as ArenaStateResponse);
      } catch {
        /* قطع لحظه‌ای — دور بعد */
      }
    }

    let unsub: (() => void) | undefined;
    (async () => {
      const ok = await join();
      if (!aliveRef.current || !ok) return;
      await refreshOnce();
      if (!aliveRef.current) return;
      unsub = subscribeStream("room", code, {
        onState: applyState,
        onGone: () => setFatal(r.notFound),
      });
    })();

    const backup = setInterval(() => {
      if (document.visibilityState === "visible") void refreshOnce();
    }, 6000);

    return () => {
      aliveRef.current = false;
      clearInterval(backup);
      unsub?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  /* --- تیک محلی برای نرمی تایمر و نوار زمان بین pollها --- */
  useEffect(() => {
    const id = setInterval(() => setTick((x) => x + 1), 100);
    return () => clearInterval(id);
  }, []);

  /* --- وضعیت اولیهٔ قطع صدا + پاک‌سازی صدا هنگام خروج --- */
  useEffect(() => {
    setMuted(sfxIsMuted());
    return () => sfxAmbientStop();
  }, []);

  /* --- موزیک ملایم «چالش سرعتی» فقط در جریان مسابقه --- */
  const gameSlugLive = st?.room.gameSlug;
  const statusLive = st?.room.status;
  useEffect(() => {
    if (gameSlugLive === ARENA_GAME_SLUG && statusLive === "playing") {
      sfxAmbientStart();
      return () => sfxAmbientStop();
    }
  }, [gameSlugLive, statusLive]);

  /* --- صدای پیروزی/شکست چالش سرعتی — یک‌بار در پایان هر مسابقه --- */
  useEffect(() => {
    if (!st || st.room.gameSlug !== ARENA_GAME_SLUG || st.room.status !== "finished") return;
    const key = `${st.room.code}:${st.room.maxPlayers}:${st.members.map((m) => m.score).join(",")}`;
    if (stingerRef.current === key) return;
    stingerRef.current = key;
    const top = Math.max(...st.members.map((m) => m.score), 0);
    const my = st.members.find((m) => m.id === st.me)?.score ?? -1;
    if (my >= top) sfxWin();
    else sfxLose();
  }, [st]);

  const elapsedSinceFetch = Date.now() - fetchedAt; // tick فقط برای re-render

  async function action(body: Record<string, unknown>) {
    /* ورودی‌های پُرتکرار بازی‌های اکشن (میدان آتش/نبرد) + سیگنالینگ WebRTC
       → بدون setState تا هر POST باعث رندر دوباره کل اتاق نشود */
    const frequent =
      body.type === "input" ||
      body.type === "fire_input" ||
      body.type === "snap" ||
      body.type === "boost" ||
      body.type === "rtc";
    if (!frequent) setSending(true);
    try {
      const res = await fetch(`/api/arena/rooms/${encodeURIComponent(code)}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      if (!frequent) setSending(false);
    }
  }

  async function answer(choice: number) {
    if (!st?.game || picked !== null || sending || st.game.phase !== "answer") return;
    setPicked(choice);
    await action({ type: "answer", round: st.game.round, choice });
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* بی‌خیال */
    }
  }

  async function leaveRoom() {
    await action({ type: "leave" });
    router.push("/arena");
  }

  /* --- حالت خطا --- */
  if (fatal) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-5 px-4 py-24 text-center">
        <WifiOff className="h-10 w-10 text-zinc-600" aria-hidden="true" />
        <p className="text-base font-semibold text-zinc-300">{fatal}</p>
        <Button
          onClick={() => router.push("/arena")}
          className="rounded-full bg-violet-500 font-bold text-zinc-950 hover:bg-violet-400"
        >
          {r.backToArena}
        </Button>
      </div>
    );
  }

  if (!st) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-600" aria-hidden="true" />
      </div>
    );
  }

  const members = [...st.members].sort((x, y) => y.score - x.score);
  const iAmHost = st.room.hostId === st.me;

  /* چت شناور وسط مسابقه — دکمه گوشه صفحه + پنجره بازشو */
  const chatFloat = (
    <>
      {chatOpen && (
        <div className="fixed inset-x-3 bottom-24 z-40 overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-950 shadow-2xl sm:inset-x-auto sm:end-5 sm:w-[360px]">
          <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2.5">
            <span className="flex items-center gap-2 text-sm font-bold text-zinc-100">
              <MessageCircle className="h-4 w-4 text-violet-400" aria-hidden="true" />
              {t.chat.roomTitle}
            </span>
            <button
              onClick={() => setChatOpen(false)}
              aria-label="close chat"
              className="rounded-full p-1 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-200"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <ChatPanel scope={code} className="h-80" hideHeader />
        </div>
      )}
      <button
        onClick={() => setChatOpen((v) => !v)}
        aria-label={t.chat.roomTitle}
        className={`fixed bottom-5 end-5 z-40 flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition-colors ${
          chatOpen ? "bg-zinc-700 text-zinc-100" : "bg-violet-500 text-zinc-950 hover:bg-violet-400"
        }`}
      >
        {chatOpen ? <X className="h-5 w-5" aria-hidden="true" /> : <MessageCircle className="h-5 w-5" aria-hidden="true" />}
      </button>
    </>
  );

  /* ---------- لابی ---------- */
  if (st.room.status === "lobby") {
    const allReady = st.members.length >= 2 && st.members.every((m) => m.isReady);
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        {/* کد اتاق */}
        <div className="rounded-2xl border border-violet-500/30 bg-gradient-to-b from-violet-500/10 to-transparent p-6 text-center sm:p-8">
          <p className="text-sm text-zinc-400">{r.shareTitle}</p>
          <div dir="ltr" className="mt-3 text-5xl font-black tracking-[0.35em] text-violet-300 sm:text-6xl">
            {st.room.code}
          </div>
          <Button
            onClick={copyCode}
            variant="outline"
            size="sm"
            className="mt-4 rounded-full border-zinc-700 bg-zinc-950 text-xs text-zinc-300 hover:border-violet-500/50 hover:text-violet-300"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
            ) : (
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {copied ? r.copied : r.copyCode}
          </Button>
        </div>

        {/* بازیکنان */}
        <h2 className="mt-8 text-sm font-bold text-zinc-400">
          {r.playersTitle} ({numFmt(st.members.length)}/{numFmt(st.room.maxPlayers)})
        </h2>
        <ul className="mt-3 grid gap-2.5 sm:grid-cols-2">
          {st.members.map((m) => (
            <li
              key={m.id}
              className={`flex items-center justify-between gap-2 rounded-xl border px-4 py-3 transition-colors ${
                m.online ? "border-zinc-800 bg-zinc-900/60" : "border-zinc-900 bg-zinc-950 opacity-50"
              }`}
            >
              <span className="flex min-w-0 items-center gap-2">
                <Circle
                  className={`h-2.5 w-2.5 shrink-0 ${m.online ? "fill-emerald-400 text-emerald-400" : "fill-zinc-600 text-zinc-600"}`}
                  aria-hidden="true"
                />
                <span className="truncate text-sm font-semibold text-zinc-200">{m.name}</span>
                {isBotId(m.id) && (
                  <span className="flex shrink-0 items-center gap-1 rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] font-bold text-sky-300">
                    <Bot className="h-3 w-3" aria-hidden="true" />
                    {r.botBadge}
                  </span>
                )}
                {m.isHost && (
                  <span className="flex shrink-0 items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                    <Crown className="h-3 w-3" aria-hidden="true" />
                    {r.hostBadge}
                  </span>
                )}
              </span>
              <span className="flex shrink-0 items-center gap-1.5">
                <span
                  className={`text-xs font-bold ${
                    m.isReady ? "text-emerald-400" : "text-zinc-600"
                  }`}
                >
                  {m.isReady ? "✓" : "…"}
                </span>
                {iAmHost && isBotId(m.id) && (
                  <button
                    onClick={() => action({ type: "remove_bot", botId: m.id })}
                    disabled={sending}
                    aria-label={r.removeBot}
                    title={r.removeBot}
                    className="rounded-full p-1 text-zinc-600 transition hover:bg-rose-500/10 hover:text-rose-300 disabled:opacity-50"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>

        {/* اکشن‌ها */}
        <div className="mt-8 flex flex-col items-center gap-3">
          <Button
            onClick={() => action({ type: "ready", value: !st.members.find((m) => m.id === st.me)?.isReady })}
            disabled={sending}
            className={`h-12 w-full max-w-xs rounded-xl text-base font-bold ${
              st.members.find((m) => m.id === st.me)?.isReady
                ? "bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
                : "bg-emerald-500 text-zinc-950 hover:bg-emerald-400"
            }`}
          >
            {st.members.find((m) => m.id === st.me)?.isReady ? r.notReadyCta : r.readyCta}
          </Button>

          {iAmHost ? (
            <Button
              onClick={() => action({ type: "start" })}
              disabled={sending || !allReady}
              className="h-12 w-full max-w-xs rounded-xl bg-violet-500 text-base font-bold text-zinc-950 hover:bg-violet-400 disabled:opacity-40"
            >
              <Play className="h-5 w-5" aria-hidden="true" />
              {r.startCta}
            </Button>
          ) : (
            <p className="text-xs text-zinc-500">{r.waitingHost}</p>
          )}
          <p className="text-center text-xs text-zinc-600">{r.startHint}</p>

          {/* صندلی‌های خالی با ربات پر شوند تا بازی جریان پیدا کند — فقط بازی‌های سؤالی */}
          {iAmHost && BOT_GAMES.has(st.room.gameSlug) && st.members.length < st.room.maxPlayers && (
            <>
              <Button
                onClick={() => action({ type: "fill_bots" })}
                disabled={sending}
                className="h-11 w-full max-w-xs rounded-xl border border-sky-500/40 bg-sky-500/10 text-sm font-bold text-sky-200 hover:bg-sky-500/20 disabled:opacity-60"
              >
                <Bot className="h-5 w-5" aria-hidden="true" />
                {r.fillBots} ({numFmt(st.room.maxPlayers - st.members.length)})
              </Button>
              <p className="max-w-md text-center text-[11px] leading-5 text-zinc-600">{r.botsHint}</p>
            </>
          )}

          <Button
            onClick={leaveRoom}
            variant="ghost"
            size="sm"
            className="mt-2 rounded-full text-zinc-500 hover:bg-rose-500/10 hover:text-rose-300"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            {r.leaveCta}
          </Button>
        </div>

        {/* چت داخل اتاق — تا قبل شروع مسابقه همه با هم حرف بزنند */}
        {st.room.gameSlug === JADVAL_GAME_SLUG && (
          <p className="mt-8 rounded-2xl border border-violet-500/30 bg-violet-500/[0.06] px-4 py-3.5 text-center text-xs leading-6 text-zinc-300">
            {a.jadval.lobbyHint}
          </p>
        )}
        {st.room.gameSlug === PIC_GAME_SLUG && (
          <p className="mt-8 rounded-2xl border border-violet-500/30 bg-violet-500/[0.06] px-4 py-3.5 text-center text-xs leading-6 text-zinc-300">
            {a.pic.lobbyHint}
          </p>
        )}
        <section className="mt-6 h-[460px] overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60">
          <ChatPanel scope={code} className="h-full" />
        </section>
      </div>
    );
  }

  /* ---------- نتایج ---------- */
  if (st.room.status === "finished") {
    const top = members.filter((m) => m.score === members[0]?.score);
    const isDraw = top.length > 1;
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-b from-amber-500/10 to-transparent p-6 text-center sm:p-8">
          <Trophy className="mx-auto h-12 w-12 text-amber-400" aria-hidden="true" />
          <h1 className="mt-3 text-2xl font-extrabold text-zinc-50">{r.finishedTitle}</h1>
          {members[0] && (
            <p className="mt-2 text-lg font-bold text-amber-300">
              {isDraw ? r.draw : `${members[0].name} ${r.winner}`}
            </p>
          )}
        </div>

        <ul className="mt-6 space-y-2">
          {members.map((m, i) => (
            <li
              key={m.id}
              className={`flex items-center justify-between rounded-xl border px-4 py-3 ${
                i === 0
                  ? "border-amber-500/40 bg-amber-500/5"
                  : "border-zinc-800 bg-zinc-900/60"
              }`}
            >
              <span className="flex items-center gap-3">
                <span className="w-6 text-center text-sm font-black text-zinc-500">{numFmt(i + 1)}</span>
                <span className="text-sm font-semibold text-zinc-200">{m.name}</span>
                {m.isHost && <Crown className="h-3.5 w-3.5 text-amber-300" aria-hidden="true" />}
              </span>
              <span className="text-base font-black text-emerald-400">{numFmt(m.score)}</span>
            </li>
          ))}
        </ul>

        {/* چت اتاق بعد از مسابقه — برای خوش و باش و مسابقه بعدی */}
        <section className="mt-8 h-[420px] overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60">
          <ChatPanel scope={code} className="h-full" />
        </section>

        <div className="mt-8 flex flex-col items-center gap-3">
          {iAmHost ? (
            <Button
              onClick={() => action({ type: "again" })}
              disabled={sending}
              className="h-12 rounded-xl bg-violet-500 px-8 text-base font-bold text-zinc-950 hover:bg-violet-400"
            >
              {r.againCta}
            </Button>
          ) : (
            <p className="text-xs text-zinc-500">{r.waitingAgain}</p>
          )}
          <Button
            onClick={() => router.push("/arena")}
            variant="ghost"
            size="sm"
            className="rounded-full text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {r.backToArena}
          </Button>
        </div>
      </div>
    );
  }

  /* ---------- در حال مسابقه ---------- */
  /* حدس تصویر — همه‌ضدهمهٔ سرعتی (نتایج هم همین‌جا رندر می‌شود) */
  if (st.room.gameSlug === PIC_GAME_SLUG && st.pic) {
    return (
      <>
        {chatFloat}
        <PicClient st={st} offsetMs={st.now - fetchedAt} />
      </>
    );
  }

  /* رقابت جدول — بازی تیمی با چت مخفی هر تیم (نتایج هم همین‌جا رندر می‌شود) */
  if (st.room.gameSlug === JADVAL_GAME_SLUG && st.jadval) {
    return <JadvalClient st={st} offsetMs={st.now - fetchedAt} />;
  }

  /* نبرد دایره‌ها — بازی اکشن لحظه‌ای با شبیه‌سازی قطعی */
  if (st.room.gameSlug === "nabard-live") {
    return (
      <>
        {chatFloat}
        <NabardClient
          st={st}
          offsetMs={st.now - fetchedAt}
          sendAction={action}
        />
      </>
    );
  }

  /* «میدان آتش» آنلاین بازنشسته شد — اتاق‌های قدیمی به نسخه آفلاین هدایت می‌شوند */
  if (st.room.gameSlug === "fire-arena") {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-5 px-4 py-20 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-500/15 text-3xl">
          🔥
        </span>
        <h1 className="text-xl font-extrabold text-zinc-50">
          {lang === "fa" ? "میدان آتش به‌صورت آنلاین بسته شد" : "Fire Arena online has been retired"}
        </h1>
        <p className="text-sm leading-7 text-zinc-400">
          {lang === "fa"
            ? "نسخه تک‌نفره آفلاین همین بازی آماده است — بدون اتاق و بدون تاخیر، همین‌جا در مرورگر اجرا می‌شود."
            : "The offline single-player version is ready — no rooms, no lag, runs right in your browser."}
        </p>
        <Button
          onClick={() => router.push("/fire")}
          className="h-12 rounded-xl bg-orange-500 px-8 text-base font-bold text-zinc-950 hover:bg-orange-400"
        >
          {lang === "fa" ? "اجرای نسخه آفلاین" : "Play the offline version"}
        </Button>
        <Button
          onClick={() => router.push("/arena")}
          variant="outline"
          className="rounded-xl border-zinc-700 bg-transparent text-sm text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
        >
          {r.backToArena}
        </Button>
      </div>
    );
  }

  const game = st.game;
  if (!game) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-600" aria-hidden="true" />
      </div>
    );
  }

  const total = game.phase === "answer" ? ANSWER_MS : REVEAL_MS;
  const remaining = Math.max(0, game.endsInMs - elapsedSinceFetch);
  const pct = Math.min(100, (remaining / total) * 100);
  const isReveal = game.phase === "reveal";
  const correct = game.question.correctIndex;

  return (
    <>
      {chatFloat}
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      {/* نوار بالا: شماره سؤال + کلید صدا + تایمر */}
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-bold text-zinc-400">
          {r.question} {numFmt(game.round + 1)} {r.of} {numFmt(game.rounds)}
        </p>
        <span className="flex items-center gap-3">
          <button
            onClick={() => setMuted(sfxToggleMuted())}
            aria-label={muted ? r.sfxOff : r.sfxOn}
            title={muted ? r.sfxOff : r.sfxOn}
            className="rounded-full p-2 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-200"
          >
            {muted ? <VolumeX className="h-4 w-4" aria-hidden="true" /> : <Volume2 className="h-4 w-4" aria-hidden="true" />}
          </button>
          <p className={`text-sm font-black tabular-nums ${remaining < 3000 && !isReveal ? "text-rose-400" : "text-zinc-300"}`}>
            {numFmt(Math.ceil(remaining / 1000))}
          </p>
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-800">
        <div
          className={`h-full rounded-full transition-[width] duration-100 ease-linear ${
            isReveal ? "bg-violet-400" : remaining < 3000 ? "bg-rose-400" : "bg-emerald-400"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_260px]">
        {/* سؤال و گزینه‌ها */}
        <div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 text-center sm:p-8">
            <span className="mb-3 inline-block rounded-full border border-violet-500/40 bg-violet-500/10 px-3 py-1 text-xs font-bold text-violet-300">
              {(() => {
                const label = CATEGORY_LABELS[(game.question.cat ?? "general") as ArenaCategory];
                return label ? (lang === "fa" ? label.fa : label.en) : null;
              })()}
            </span>
            <p className="text-xl font-bold leading-relaxed text-zinc-50 sm:text-2xl">
              {game.question.q}
            </p>
          </div>

          {isReveal ? (
            <p className="mt-3 text-center text-sm font-bold text-emerald-300">
              {r.correctAnswer}: {correct !== null ? game.question.o[correct] : ""}
            </p>
          ) : picked !== null ? (
            <p className="mt-3 text-center text-sm font-bold text-violet-300">{r.answered}</p>
          ) : (
            <p className="mt-3 text-center text-sm text-zinc-500">{r.countdown}</p>
          )}

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {game.question.o.map((opt, i) => {
              const mine = picked === i || game.myChoice === i;
              const showCorrect = isReveal && correct === i;
              const showWrongMine = isReveal && mine && correct !== i;
              return (
                <button
                  key={i}
                  onClick={() => answer(i)}
                  disabled={isReveal || picked !== null || sending}
                  className={`flex items-center justify-between gap-3 rounded-xl border-2 px-4 py-4 text-start text-base font-semibold transition-all ${
                    showCorrect
                      ? "border-emerald-400 bg-emerald-500/15 text-emerald-200"
                      : showWrongMine
                        ? "border-rose-500/60 bg-rose-500/10 text-rose-200"
                        : mine
                          ? "border-violet-400 bg-violet-500/15 text-violet-200"
                          : "border-zinc-800 bg-zinc-900/60 text-zinc-200 hover:border-violet-500/50 hover:bg-zinc-900 disabled:cursor-default disabled:hover:border-zinc-800 disabled:hover:bg-zinc-900/60"
                  }`}
                >
                  <span>{opt}</span>
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-black ${
                      showCorrect
                        ? "bg-emerald-400 text-zinc-950"
                        : mine
                          ? "bg-violet-400 text-zinc-950"
                          : "bg-zinc-800 text-zinc-400"
                    }`}
                  >
                    {OPTION_KEYS[i]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* امتیازهای زنده */}
        <aside className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
          <h2 className="text-xs font-bold uppercase tracking-wide text-zinc-500">{r.scores}</h2>
          <ul className="mt-3 space-y-1.5">
            {members.map((m, i) => (
              <li
                key={m.id}
                className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 ${
                  m.id === st.me ? "bg-violet-500/10" : ""
                } ${m.online ? "" : "opacity-40"}`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="w-4 text-center text-xs font-black text-zinc-500">{numFmt(i + 1)}</span>
                  <span className="truncate text-sm font-semibold text-zinc-200">{m.name}</span>
                  {m.answered && !isReveal && (
                    <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden="true" />
                  )}
                </span>
                <span className="shrink-0 text-sm font-black tabular-nums text-emerald-400">
                  {numFmt(m.score)}
                </span>
              </li>
            ))}
          </ul>
        </aside>
      </div>
      </div>
    </>
  );
}
