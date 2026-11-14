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
  Users,
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
import { LudoClient } from "@/components/site/ludo-client";
import { SherClient } from "@/components/site/sher-client";
import { ProverbClient } from "@/components/site/proverb-client";
import { subscribeStream } from "@/lib/realtime";
import { ARENA_GAME_SLUG, ANSWER_MS, BOT_GAMES, REVEAL_MS, CATEGORY_LABELS, isBotId, type ArenaCategory } from "@/lib/arena-game";
import { JADVAL_GAME_SLUG } from "@/lib/jadval-shared";
import { PIC_GAME_SLUG } from "@/lib/pic-shared";
import { LUDO_GAME_SLUG } from "@/lib/ludo-shared";
import { SHER_GAME_SLUG, SHER_MODES, sherModesFor, type SherMode } from "@/lib/sher-shared";
import { PC_GAME_SLUG } from "@/lib/proverb-shared";
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
  const [ludoTeams, setLudoTeams] = useState(false); // منچ — انتخاب بازی تیمی ۲به۲ توسط میزبان
  const seenTeamsRef = useRef(false); // آخرین مقدار دریافتی از سرور — فقط با تغییر واقعی همگام می‌شود
  const [sherMode, setSherMode] = useState<SherMode>("ffa"); // مود انتخابی میزبان برای «شعر یادت نره»
  const [sherError, setSherError] = useState(""); // خطای شروع شعر (مثلاً آهنگ فعال نبودن)

  /* انتخاب تیمی میزبان از سرور (مثلاً بعد از «مسابقه دوباره») — بدون به‌هم‌زدن کلید محلی */
  useEffect(() => {
    const srv = st?.room.ludoTeams === true;
    if (st && srv !== seenTeamsRef.current) {
      seenTeamsRef.current = srv;
      setLudoTeams(srv);
    }
  }, [st]);

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

  /* شروع مسابقهٔ «شعر یادت نره» — با مود انتخابی میزبان؛ خطا (مثلاً نبود آهنگ فعال) نمایش داده می‌شود */
  async function startSher() {
    if (sending) return;
    setSending(true);
    setSherError("");
    try {
      const res = await fetch(`/api/arena/rooms/${encodeURIComponent(code)}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "sher_start", mode: sherMode }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (data.error === "sher-no-songs") setSherError(t.arena.sher.noSongs);
      }
    } catch {
      setSherError(r.connectionLost);
    } finally {
      setSending(false);
    }
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
        <h2 className="mt-8 flex flex-wrap items-center gap-2 text-sm font-bold text-zinc-400">
          <span>
            {r.playersTitle} ({numFmt(st.members.length)}/{numFmt(st.room.maxPlayers)})
          </span>
          {/* گروه سنی اتاق — سؤال‌های چالش سرعتی و جدول متناسب با آن انتخاب می‌شوند */}
          {st.room.ageGroup === "kid" && (
            <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
              {a.roomAgeKid}
            </span>
          )}
          {st.room.ageGroup === "pro" && (
            <span className="rounded-full border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold text-rose-300">
              {a.roomAgePro}
            </span>
          )}
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
            <>
              {/* بازی تیمی منچ — انتخاب میزبان، فقط با ۴ بازیکن معنا دارد */}
              {st.room.gameSlug === LUDO_GAME_SLUG && st.room.status === "lobby" && (
                <>
                  <button
                    type="button"
                    onClick={() => setLudoTeams((v) => !v)}
                    disabled={sending || st.members.length !== 4}
                    className={`flex h-11 w-full max-w-xs items-center justify-center gap-2 rounded-xl border text-sm font-bold transition disabled:opacity-50 ${
                      ludoTeams
                        ? "border-amber-400/50 bg-amber-500/15 text-amber-200"
                        : "border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
                    }`}
                  >
                    <Users className="h-4 w-4" aria-hidden="true" />
                    {r.teamsCta} — {ludoTeams ? r.teamsOn : r.teamsOff}
                  </button>
                  {st.members.length !== 4 && (
                    <p className="text-center text-[11px] text-zinc-600">{r.teamsNeed4}</p>
                  )}
                </>
              )}
              {/* حالت‌های مسابقهٔ «شعر یادت نره» — میزبان قبل از شروع انتخاب می‌کند */}
              {st.room.gameSlug === SHER_GAME_SLUG && (
                <div className="w-full max-w-xs rounded-2xl border border-violet-500/30 bg-violet-500/[0.06] p-3.5">
                  <p className="text-xs font-bold text-zinc-300">{a.sher.modeTitle}</p>
                  <div className="mt-2 grid grid-cols-2 gap-1.5">
                    {SHER_MODES.map((m) => {
                      const allowed = sherModesFor(st.members.length).includes(m);
                      return (
                        <button
                          key={m}
                          type="button"
                          disabled={!allowed || sending}
                          onClick={() => setSherMode(m)}
                          aria-pressed={m === sherMode}
                          className={`rounded-lg border px-2 py-2 text-[11px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
                            m === sherMode
                              ? "border-violet-500/60 bg-violet-500/15 text-violet-200"
                              : "border-zinc-800 bg-zinc-950/40 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                          }`}
                        >
                          {a.sher[`mode${m.charAt(0).toUpperCase()}${m.slice(1)}` as keyof typeof a.sher] as string}
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-1.5 text-[10px] leading-4 text-zinc-500">{a.sher.modeHint}</p>
                  {sherError && (
                    <p className="mt-2 rounded-lg bg-rose-500/10 px-3 py-1.5 text-center text-[11px] font-bold text-rose-300">
                      {sherError}
                    </p>
                  )}
                </div>
              )}
              <Button
                onClick={() =>
                  st.room.gameSlug === SHER_GAME_SLUG
                    ? startSher()
                    : action({ type: "start", teams: ludoTeams })
                }
                disabled={sending || !allReady}
                className="h-12 w-full max-w-xs rounded-xl bg-violet-500 text-base font-bold text-zinc-950 hover:bg-violet-400 disabled:opacity-40"
              >
                <Play className="h-5 w-5" aria-hidden="true" />
                {r.startCta}
              </Button>
            </>
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
        {st.room.gameSlug === LUDO_GAME_SLUG && (
          <div className="mt-8 rounded-2xl border border-sky-500/30 bg-sky-500/[0.06] px-4 py-3.5">
            <p className="flex items-center justify-center gap-2 text-center text-sm font-bold text-sky-200">
              <span aria-hidden="true">🎲</span>
              {a.ludo.rulesTitle}
              <span aria-hidden="true">🎲</span>
            </p>
            <p className="mt-1.5 text-center text-[11px] font-semibold text-sky-300/80">{a.ludo.rulesShort}</p>
            <ul className="mt-3 grid gap-1.5 text-xs leading-6 text-zinc-300 sm:grid-cols-2">
              {[
                a.ludo.rule1,
                a.ludo.rule2,
                a.ludo.rule3,
                a.ludo.rule4,
                a.ludo.rule5,
                a.ludo.rule6,
                a.ludo.rule7,
                a.ludo.rule8,
                a.ludo.rule9,
                a.ludo.rule10,
                a.ludo.rule11,
              ].map((rule, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-400" aria-hidden="true" />
                  <span>{rule}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {st.room.gameSlug === SHER_GAME_SLUG && (
          <p className="mt-8 rounded-2xl border border-violet-500/30 bg-violet-500/[0.06] px-4 py-3.5 text-center text-xs leading-6 text-zinc-300">
            {a.sher.lobbyHint}
          </p>
        )}
        <section className="mt-6 h-[460px] overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60">
          <ChatPanel scope={code} className="h-full" />
        </section>
      </div>
    );
  }

  /* «شعر یادت نره» — مسابقه و نتایج داخل خود بازی رندر می‌شود */
  if (st.room.gameSlug === SHER_GAME_SLUG && st.sher) {
    return (
      <>
        {chatFloat}
        <SherClient st={st} offsetMs={st.now - fetchedAt} />
      </>
    );
  }

  /* «ضرب‌المثل‌چین» — کارت‌ها، حدس‌ها و نتایج داخل خود بازی رندر می‌شود */
  if (st.room.gameSlug === PC_GAME_SLUG && st.proverb) {
    return (
      <>
        {chatFloat}
        <ProverbClient st={st} offsetMs={st.now - fetchedAt} />
      </>
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

  /* منچ — تختهٔ گروهی با تاس؛ نتایج هم داخل همان تخته رندر می‌شود.
     چت داخل خود بازی است (داشبورد کوچک) تا در تمام‌صفحه هم بماند */
  if (st.room.gameSlug === LUDO_GAME_SLUG && st.ludo) {
    return <LudoClient st={st} sendAction={action} />;
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
