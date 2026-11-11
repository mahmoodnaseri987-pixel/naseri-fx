"use client";

/* بازی «رقابت جدول» — نمای تیمی مسابقه و صفحهٔ نتیجه.
   همهٔ منطق سمت سرور است؛ این کامپوننت وضعیت استریم را نمایش می‌دهد
   و فقط «ثبت واژه» و «پیام چت تیمی» را ارسال می‌کند.
   پاسخ‌های جدول هرگز به کلاینت نمی‌رسند — حروف فقط پس از حل شدن واژه. */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Ban,
  Check,
  Crown,
  Loader2,
  Lock,
  MessageCircle,
  Send,
  ShieldCheck,
  Timer,
  Trophy,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLang } from "@/components/site/language-provider";
import { MemberAvatar } from "@/components/site/member-avatar";
import { ChatPanel } from "@/components/site/chat-panel";
import { subscribeStream, type StreamStatus } from "@/lib/realtime";
import { sfxAmbientStart, sfxAmbientStop, sfxIsMuted, sfxLose, sfxToggleMuted, sfxWin } from "@/lib/arena-sfx";
import {
  JADVAL_TEAM_LABELS,
  cleanAnswerInput,
  type JadvalTeam,
  type JadvalView,
} from "@/lib/jadval-shared";
import type { ArenaStateResponse, ChatMsgView } from "@/lib/types";

const TEAM_COLOR: Record<JadvalTeam, { text: string; bg: string; ring: string; bar: string; soft: string }> = {
  A: {
    text: "text-emerald-300",
    bg: "bg-emerald-500",
    ring: "border-emerald-500/40",
    bar: "bg-emerald-400",
    soft: "bg-emerald-500/10",
  },
  B: {
    text: "text-rose-300",
    bg: "bg-rose-500",
    ring: "border-rose-500/40",
    bar: "bg-rose-400",
    soft: "bg-rose-500/10",
  },
};

/* ================================================================
   چت مخفی تیمی — پیام‌ها فقط بین هم‌تیمی‌ها رد و بدل می‌شود
   ================================================================ */

function JadvalTeamChat({
  code,
  team,
  playing,
}: {
  code: string;
  team: JadvalTeam;
  playing: boolean;
}) {
  const { t, lang } = useLang();
  const j = t.arena.jadval;
  const scope = `${code}${team}`;
  const color = TEAM_COLOR[team];

  const [msgs, setMsgs] = useState<ChatMsgView[] | null>(null);
  const [me, setMe] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<StreamStatus>("connecting");

  const scrollRef = useRef<HTMLDivElement>(null);
  const lastIdRef = useRef(0);
  const aliveRef = useRef(true);

  const numFmt = useCallback(
    (n: number) => new Intl.NumberFormat(lang === "fa" ? "fa-IR" : "en-US").format(n),
    [lang],
  );
  const timeFmt = useCallback(
    (iso: string) =>
      new Intl.DateTimeFormat(lang === "fa" ? "fa-IR" : "en-US", {
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(iso)),
    [lang],
  );

  const mergeIncoming = useCallback((incoming: ChatMsgView[]) => {
    if (!incoming.length) return;
    const initial = lastIdRef.current === 0;
    const last = incoming[incoming.length - 1].id;
    if (last > lastIdRef.current) lastIdRef.current = last;
    setMsgs((prev) => {
      if (initial) return incoming.slice(-120);
      const base = prev ?? [];
      const seen = new Set(base.map((m) => m.id));
      return [...base, ...incoming.filter((m) => !seen.has(m.id))].slice(-120);
    });
  }, []);

  const pollOnce = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/chat?scope=${encodeURIComponent(scope)}&after=${lastIdRef.current}`,
        { cache: "no-store" },
      );
      if (!aliveRef.current) return;
      if (!res.ok) return;
      const data = (await res.json()) as { me: string; messages: ChatMsgView[] };
      setMe(data.me);
      mergeIncoming(data.messages);
    } catch {
      /* قطع لحظه‌ای — دور بعد */
    }
  }, [scope, mergeIncoming]);

  /* اسکوپ برای طول عمر کامپوننت ثابت است — فقط یک اتصال و یک تاریخچه */
  useEffect(() => {
    aliveRef.current = true;
    lastIdRef.current = 0;
    let unsub: (() => void) | undefined;
    (async () => {
      await pollOnce();
      if (!aliveRef.current) return;
      /* همین اتصال SSE اتاق — بدون اتصال اضافه */
      unsub = subscribeStream("room", code, {
        onChat: mergeIncoming,
        onStatus: (s) => setStatus(s),
      });
    })();
    const backup = setInterval(() => {
      if (document.visibilityState === "visible") void pollOnce();
    }, 6000);
    return () => {
      aliveRef.current = false;
      clearInterval(backup);
      unsub?.();
    };
  }, [code, pollOnce, mergeIncoming]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 90) {
      el.scrollTop = el.scrollHeight;
    }
  }, [msgs]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const content = text.trim();
    if (!content || sending) return;
    setSending(true);
    setError("");
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope, content }),
      });
      if (res.ok) {
        setText("");
        await pollOnce();
      } else if (res.status === 403) {
        setError(lang === "fa" ? "برای چت باید عکس پروفایل داشته باشی." : "A profile photo is required to chat.");
      } else {
        setError(j.sendError);
      }
    } catch {
      setError(j.sendError);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-zinc-800 px-3.5 py-2.5">
        <h3 className={`flex min-w-0 items-center gap-1.5 text-xs font-bold ${color.text}`}>
          <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{j.chatTitle}</span>
        </h3>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
            status === "live"
              ? "bg-emerald-500/10 text-emerald-300"
              : status === "connecting"
                ? "bg-amber-500/10 text-amber-300"
                : "bg-rose-500/10 text-rose-300"
          }`}
        >
          {status === "live" ? j.liveOk : status === "connecting" ? j.liveConnecting : j.liveOffline}
        </span>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-3.5 py-3">
        {msgs === null ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-4 w-4 animate-spin text-zinc-600" aria-hidden="true" />
          </div>
        ) : msgs.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-800 px-3 py-6 text-center text-[11px] leading-6 text-zinc-500">
            {j.chatEmpty}
          </p>
        ) : (
          msgs.map((m) =>
            m.kind === "system" ? (
              <div key={m.id} className="mx-auto max-w-[95%]">
                <p className="rounded-lg bg-violet-500/[0.07] px-2.5 py-1.5 text-center text-[11px] leading-5 text-violet-200/90 ring-1 ring-violet-500/20">
                  {m.content}
                </p>
              </div>
            ) : (
              <div key={m.id} className={`flex gap-2 ${m.memberId === me ? "flex-row-reverse" : ""}`}>
                <MemberAvatar memberId={m.memberId} name={m.name} size={26} />
                <div className={`min-w-0 max-w-[85%] ${m.memberId === me ? "text-end" : ""}`}>
                  <div className={`flex items-baseline gap-1.5 ${m.memberId === me ? "flex-row-reverse" : ""}`}>
                    <span className={`truncate text-[10px] font-bold ${m.memberId === me ? color.text : "text-zinc-400"}`}>
                      {m.memberId === me ? j.you : m.name}
                    </span>
                    <span className="shrink-0 text-[9px] text-zinc-600" suppressHydrationWarning>
                      {timeFmt(m.createdAt)}
                    </span>
                  </div>
                  <p
                    className={`mt-0.5 inline-block whitespace-pre-wrap break-words rounded-xl px-2.5 py-1.5 text-start text-[12px] leading-5 ${
                      m.memberId === me
                        ? `${color.soft} text-zinc-100 ring-1 ${color.ring}`
                        : "bg-zinc-800/80 text-zinc-200"
                    }`}
                  >
                    {m.content}
                  </p>
                </div>
              </div>
            ),
          )
        )}
      </div>

      {error && (
        <p className="mx-3 mb-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-[10px] font-semibold text-rose-300">
          {error}
        </p>
      )}

      {playing ? (
        <form onSubmit={send} className="flex items-center gap-1.5 border-t border-zinc-800 bg-zinc-950/60 p-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={j.chatPh}
            maxLength={300}
            className="h-9 min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 text-[13px] text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-violet-500/60"
          />
          <Button
            type="submit"
            disabled={sending || !text.trim()}
            size="icon"
            aria-label={j.send}
            className="h-9 w-9 shrink-0 rounded-lg bg-violet-500 text-zinc-950 hover:bg-violet-400 disabled:opacity-40"
          >
            {sending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="h-3.5 w-3.5 rtl:-scale-x-100" aria-hidden="true" />
            )}
          </Button>
        </form>
      ) : (
        <p className="border-t border-zinc-800 bg-zinc-950/60 px-3 py-2.5 text-center text-[11px] font-semibold text-zinc-500">
          {j.chatClosed}
        </p>
      )}
    </div>
  );
}

/* ================================================================
   بدنهٔ بازی
   ================================================================ */

export function JadvalClient({
  st,
  offsetMs,
}: {
  st: ArenaStateResponse;
  offsetMs: number;
}) {
  const { t, lang } = useLang();
  const j = t.arena.jadval;
  const r = t.arena.room;
  const router = useRouter();
  const jadval = st.jadval;
  const code = st.room.code;

  const [selected, setSelected] = useState<number | null>(null);
  const [answer, setAnswer] = useState("");
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "bad" | "info"; text: string } | null>(null);
  const [tick, setTick] = useState(0);
  const [sendingAgain, setSendingAgain] = useState(false);
  const [chatOpen, setChatOpen] = useState(false); // چت شناور موبایل
  const [muted, setMuted] = useState(false); // افکت‌های صوتی
  const stingerRef = useRef("");
  const aliveRef = useRef(true);

  const numFmt = useCallback(
    (n: number) => new Intl.NumberFormat(lang === "fa" ? "fa-IR" : "en-US").format(n),
    [lang],
  );

  /* تیک محلی برای تایمر و شمارش قفل */
  useEffect(() => {
    const id = setInterval(() => setTick((x) => x + 1), 250);
    return () => clearInterval(id);
  }, []);

  /* وضعیت اولیهٔ قطع صدا + پاک‌سازی هنگام خروج */
  useEffect(() => {
    setMuted(sfxIsMuted());
    return () => sfxAmbientStop();
  }, []);

  /* موزیک ملایم در جریان مسابقه — و صدای پیروزی/شکست هنگام اعلام نتیجه (یک‌بار) */
  const resultRef = jadval?.result ?? null;
  const roomStatus = st.room.status;
  const myTeam = jadval?.myTeam;
  useEffect(() => {
    if (roomStatus === "playing" && !resultRef) {
      sfxAmbientStart();
      return () => sfxAmbientStop();
    }
    if (resultRef && roomStatus === "finished") {
      sfxAmbientStop();
      const key = `${st.room.code}:${resultRef.winner ?? "draw"}`;
      if (stingerRef.current !== key) {
        stingerRef.current = key;
        if (resultRef.winner === null || resultRef.winner === myTeam) sfxWin();
        else sfxLose();
      }
    }
  }, [resultRef, roomStatus, myTeam, st.room.code]);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  /* پیام‌های گذرا خودشان محو می‌شوند */
  useEffect(() => {
    if (!feedback) return;
    const id = setTimeout(() => setFeedback(null), feedback.kind === "bad" ? 5000 : 3000);
    return () => clearTimeout(id);
  }, [feedback]);

  const words = useMemo(() => jadval?.puzzle.words ?? [], [jadval]);
  const solvedSet = useMemo(() => new Set(jadval?.solved ?? []), [jadval]);
  const lostSet = useMemo(() => new Set(jadval?.lost ?? []), [jadval]);

  /* واژهٔ فعال: انتخاب دستی یا اولین واژهٔ رقابت‌پذیر — بدون effect و بدون رندر آبشاری */
  const activeWordIdx = useMemo(() => {
    if (selected !== null) return selected;
    return words.find((w) => !solvedSet.has(w.i) && !lostSet.has(w.i))?.i ?? null;
  }, [selected, words, solvedSet, lostSet]);

  const selectedWord = useMemo(
    () => words.find((w) => w.i === activeWordIdx) ?? null,
    [words, activeWordIdx],
  );

  if (!jadval) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-600" aria-hidden="true" />
      </div>
    );
  }

  const now = Date.now();
  const beforeStart = now < jadval.startedAtMs;
  const lockRemainMs = jadval.lockUntilMs > 0 ? jadval.lockUntilMs - now : 0;
  const lockSeconds = Math.max(0, Math.ceil(lockRemainMs / 1000));
  const isLocked = lockRemainMs > 0;
  const selectedSolved = activeWordIdx !== null && solvedSet.has(activeWordIdx);
  const selectedLost = activeWordIdx !== null && lostSet.has(activeWordIdx);
  const canSubmit =
    !beforeStart &&
    !isLocked &&
    activeWordIdx !== null &&
    !selectedSolved &&
    !selectedLost &&
    answer.trim().length > 0 &&
    !sending;

  /* زمان سپری‌شده از آخرین اسنپ‌شات — جبران اختلاف ساعت کلاینت/سرور */
  const elapsedSinceFetch = now - st.now + offsetMs;
  const remainingMs = Math.max(0, jadval.endsInMs - elapsedSinceFetch);

  async function submitWord() {
    if (!canSubmit || activeWordIdx === null || !jadval) return;
    setSending(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/arena/rooms/${encodeURIComponent(code)}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "jadval_answer", wordIdx: activeWordIdx, text: answer.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        correct?: boolean;
        done?: boolean;
        duplicate?: boolean;
        lockMs?: number;
        error?: string;
      };
      if (!aliveRef.current) return;
      if (res.ok && data.ok) {
        if (data.duplicate) {
          setFeedback({ kind: "info", text: j.alreadySolved });
        } else if (data.correct) {
          setFeedback({ kind: "ok", text: j.correctFlash });
          setAnswer("");
        } else {
          const secs = Math.max(1, Math.round((data.lockMs ?? 30000) / 1000));
          setFeedback({ kind: "bad", text: j.wrongFlash.replace("{s}", numFmt(secs)) });
          setAnswer("");
        }
      } else if (res.status === 409 && data.error === "stolen") {
        setFeedback({ kind: "info", text: j.stolenFlash });
        setAnswer("");
      } else if (res.status === 429) {
        const secs = Math.max(1, Math.round((data.lockMs ?? 30000) / 1000));
        setFeedback({ kind: "info", text: j.locked.replace("{s}", numFmt(secs)) });
      } else {
        setFeedback({ kind: "bad", text: t.chat.sendError });
      }
    } catch {
      if (aliveRef.current) setFeedback({ kind: "bad", text: r.connectionLost });
    } finally {
      if (aliveRef.current) setSending(false);
    }
  }

  /** واژه‌های گذرنده از یک خانه */
  function wordsAt(rIdx: number, cIdx: number) {
    const across = words.find(
      (w) => w.d === "h" && w.r === rIdx && cIdx >= w.c && cIdx < w.c + w.len,
    );
    const down = words.find(
      (w) => w.d === "v" && w.c === cIdx && rIdx >= w.r && rIdx < w.r + w.len,
    );
    return { across, down };
  }

  function selectCell(rIdx: number, cIdx: number) {
    const { across, down } = wordsAt(rIdx, cIdx);
    const cur = selectedWord;
    let next = across ?? down ?? null;
    if (across && down && cur) {
      const curHas =
        (cur.d === "h" && cur.i === across.i) || (cur.d === "v" && cur.i === down.i);
      if (curHas) next = cur.d === "h" ? down : across; // تعویض جهت با کلیک دوباره
    }
    if (next) setSelected(next.i);
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
  if (jadval.result) {
    const result = jadval.result;
    const myResult = result.teams.find((x) => x.id === jadval.myTeam) ?? result.teams[0];
    const iWon = result.winner === jadval.myTeam;
    const isDraw = result.winner === null;
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <div
          className={`rounded-2xl border p-6 text-center sm:p-8 ${
            isDraw ? "border-amber-500/30 bg-gradient-to-b from-amber-500/10 to-transparent" : iWon ? "border-emerald-500/40 bg-gradient-to-b from-emerald-500/10 to-transparent" : "border-zinc-700 bg-gradient-to-b from-zinc-800/40 to-transparent"
          }`}
        >
          <Trophy className={`mx-auto h-12 w-12 ${isDraw ? "text-amber-400" : iWon ? "text-emerald-400" : "text-zinc-500"}`} aria-hidden="true" />
          <h1 className="mt-3 text-2xl font-extrabold text-zinc-50">
            {isDraw ? j.drawTitle : j.winnerTitle.replace("{t}", JADVAL_TEAM_LABELS[result.winner as JadvalTeam][lang === "fa" ? "fa" : "en"])}
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            {j.solvedOf.replace("{s}", numFmt(myResult.solved)).replace("{t}", numFmt(myResult.total))}
          </p>
        </div>

        {/* نتیجهٔ تیم‌ها */}
        <h2 className="mt-8 text-sm font-bold text-zinc-400">{j.teamResult}</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {result.teams.map((team) => {
            const color = TEAM_COLOR[team.id];
            const pct = team.total > 0 ? Math.round((team.solved / team.total) * 100) : 0;
            return (
              <div key={team.id} className={`rounded-2xl border p-4 ${color.ring} bg-zinc-900/60`}>
                <div className="flex items-center justify-between">
                  <span className={`text-sm font-extrabold ${color.text}`}>
                    {JADVAL_TEAM_LABELS[team.id][lang === "fa" ? "fa" : "en"]}
                    {team.id === jadval.myTeam && (
                      <span className="ms-1.5 text-[10px] font-bold text-zinc-500">({j.youTeam})</span>
                    )}
                  </span>
                  <span className="text-lg font-black text-zinc-100">
                    {numFmt(team.solved)}
                    <span className="text-xs font-bold text-zinc-500">/{numFmt(team.total)}</span>
                  </span>
                </div>
                <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-zinc-800">
                  <div className={`h-full rounded-full ${color.bar}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>

        {/* اعضا و پاداش */}
        <h2 className="mt-8 text-sm font-bold text-zinc-400">{j.members}</h2>
        <ul className="mt-3 space-y-2">
          {st.members
            .slice()
            .sort((a, b) => b.score - a.score)
            .map((m) => {
              const row = result.members.find((x) => x.id === m.id);
              const team = row?.team ?? jadval.myTeam;
              const color = TEAM_COLOR[team];
              return (
                <li
                  key={m.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-black ${color.soft} ${color.text}`}>
                      {JADVAL_TEAM_LABELS[team][lang === "fa" ? "fa" : "en"]}
                    </span>
                    <span className="truncate text-sm font-semibold text-zinc-200">{m.name}</span>
                    {m.isHost && <Crown className="h-3.5 w-3.5 shrink-0 text-amber-300" aria-hidden="true" />}
                  </span>
                  <span className="flex shrink-0 items-center gap-3 text-xs">
                    <span className="text-zinc-500">
                      {j.bonus}: <b className="text-zinc-300">+{numFmt(row?.bonus ?? 0)}</b>
                    </span>
                    <span className="text-base font-black text-emerald-400">{numFmt(m.score)}</span>
                  </span>
                </li>
              );
            })}
        </ul>

        {/* جدول کامل — پاسخ‌ها بعد از پایان آشکار می‌شود */}
        <h2 className="mt-8 text-sm font-bold text-zinc-400">{j.solutionTitle}</h2>
        <div className="mt-3 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/40 p-2">
          <JadvalGrid view={jadval} solutionMode />
        </div>

        {/* چت مشترک اتاق بعد از مسابقه */}
        <section className="mt-8 h-[380px] overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60">
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
              {j.againCta}
            </Button>
          ) : (
            <p className="text-xs text-zinc-500">{j.waitingAgain}</p>
          )}
          <Button
            onClick={() => router.push("/arena")}
            variant="ghost"
            size="sm"
            className="rounded-full text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {j.backToArena}
          </Button>
        </div>
      </div>
    );
  }

  /* ---------- مسابقه در جریان ---------- */
  const acrossWords = words.filter((w) => w.d === "h").sort((a, b) => a.num - b.num);
  const downWords = words.filter((w) => w.d === "v").sort((a, b) => a.num - b.num);
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const pad = lang === "fa" ? "۰" : "0";
  const timeLabel = `${numFmt(Math.floor(totalSeconds / 60))}:${numFmt(totalSeconds % 60).padStart(2, pad)}`;
  const timeCritical = totalSeconds < 120;

  return (
    <div className="mx-auto max-w-6xl px-3 py-6 sm:px-6 sm:py-8">
      {/* نوار بالا: عنوان و زمان */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-extrabold text-zinc-50 sm:text-xl">
            {jadval.puzzle.title}
          </h1>
          <p className="mt-0.5 text-xs text-zinc-500">{j.hintInterlock}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMuted(sfxToggleMuted())}
            aria-label={muted ? r.sfxOff : r.sfxOn}
            title={muted ? r.sfxOff : r.sfxOn}
            className="rounded-full p-2 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-200"
          >
            {muted ? <VolumeX className="h-4 w-4" aria-hidden="true" /> : <Volume2 className="h-4 w-4" aria-hidden="true" />}
          </button>
          {beforeStart ? (
            <span className="rounded-full bg-violet-500/10 px-3 py-1.5 text-xs font-bold text-violet-300">
              {j.startingIn}
            </span>
          ) : (
            <span
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-black tabular-nums ${
                timeCritical ? "bg-rose-500/10 text-rose-300" : "bg-zinc-800 text-zinc-200"
              }`}
            >
              <Timer className="h-4 w-4" aria-hidden="true" />
              {timeLabel}
            </span>
          )}
        </div>
      </div>

      {/* نوار پیشرفت دو تیم */}
      <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
        {jadval.teams.map((team) => {
          const color = TEAM_COLOR[team.id];
          const pct = team.total > 0 ? Math.round((team.solved / team.total) * 100) : 0;
          const mine = team.id === jadval.myTeam;
          return (
            <div
              key={team.id}
              className={`rounded-xl border px-3.5 py-2.5 ${mine ? `${color.ring} ${color.soft}` : "border-zinc-800 bg-zinc-900/60"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className={`flex items-center gap-1.5 text-sm font-extrabold ${color.text}`}>
                  <span className={`h-2 w-2 rounded-full ${mine ? color.bg : "bg-zinc-600"}`} />
                  {JADVAL_TEAM_LABELS[team.id][lang === "fa" ? "fa" : "en"]}
                  {mine && <span className="text-[10px] font-bold text-zinc-500">({j.youTeam})</span>}
                </span>
                <span className="text-sm font-black tabular-nums text-zinc-100">
                  {numFmt(team.solved)}
                  <span className="text-xs text-zinc-500">/{numFmt(team.total)}</span>
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-800">
                <div className={`h-full rounded-full transition-all duration-500 ${color.bar}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_290px]">
        {/* ستون اصلی: جدول + پاسخ */}
        <div className="min-w-0">
          <JadvalGrid view={jadval} onCellClick={selectCell} selected={activeWordIdx} />

          {/* راهنمای خانه‌های خط‌خورده */}
          <p className="mt-2 text-center text-[11px] leading-5 text-zinc-500">
            {j.lostLegend}
          </p>

          {/* نوار ثبت واژه */}
          <div className={`mt-4 rounded-2xl border p-3.5 ${isLocked ? "border-rose-500/40 bg-rose-500/[0.06]" : "border-zinc-800 bg-zinc-900/60"}`}>
            {selectedWord ? (
              <p className="mb-2.5 text-sm font-bold text-zinc-200">
                <span className="me-1.5 inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-violet-500/15 px-1.5 text-xs font-black text-violet-300">
                  {numFmt(selectedWord.num)}
                </span>
                {selectedWord.clue}
                <span className="ms-2 text-[11px] font-bold text-zinc-500">
                  ({selectedWord.d === "h" ? j.across : j.down} — {numFmt(selectedWord.len)})
                </span>
                {selectedSolved && (
                  <span className="ms-2 inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                    <Check className="h-3 w-3" aria-hidden="true" />
                    {j.alreadySolved}
                  </span>
                )}
                {selectedLost && (
                  <span className="ms-2 inline-flex items-center gap-1 rounded-full bg-zinc-500/15 px-2 py-0.5 text-[10px] font-bold text-zinc-400">
                    <Ban className="h-3 w-3" aria-hidden="true" />
                    {j.stolenBadge}
                  </span>
                )}
              </p>
            ) : (
              <p className="mb-2.5 text-sm text-zinc-500">{j.selectClue}</p>
            )}

            {isLocked ? (
              <p className="flex items-center justify-center gap-2 rounded-xl bg-rose-500/10 py-3 text-sm font-bold text-rose-300">
                <Lock className="h-4 w-4" aria-hidden="true" />
                {j.locked.replace("{s}", numFmt(lockSeconds))}
              </p>
            ) : selectedLost ? (
              <p className="flex items-center justify-center gap-2 rounded-xl bg-zinc-800/70 py-3 text-sm font-bold text-zinc-400">
                <Ban className="h-4 w-4" aria-hidden="true" />
                {j.stolenNote}
              </p>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void submitWord();
                }}
                className="flex gap-2"
              >
                <input
                  value={answer}
                  onChange={(e) => setAnswer(cleanAnswerInput(e.target.value))}
                  disabled={!selectedWord || selectedSolved || selectedLost || beforeStart || sending}
                  placeholder={selectedWord ? j.answerPh : j.selectClue}
                  maxLength={30}
                  autoComplete="off"
                  className="h-11 min-w-0 flex-1 rounded-xl border border-zinc-700 bg-zinc-950 px-3.5 text-base font-bold text-zinc-100 outline-none transition-colors placeholder:font-normal placeholder:text-zinc-600 focus:border-violet-500/60 disabled:opacity-50"
                />
                <Button
                  type="submit"
                  disabled={!canSubmit}
                  className="h-11 shrink-0 rounded-xl bg-violet-500 px-5 text-sm font-bold text-zinc-950 hover:bg-violet-400 disabled:opacity-40"
                >
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Check className="h-4 w-4" aria-hidden="true" />
                  )}
                  {sending ? j.submitting : j.submit}
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

          {/* فهرست سؤال‌ها */}
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <ClueList
              title={j.across}
              words={acrossWords}
              selected={activeWordIdx}
              solvedSet={solvedSet}
              lostSet={lostSet}
              onSelect={(i) => setSelected(i)}
              numFmt={numFmt}
            />
            <ClueList
              title={j.down}
              words={downWords}
              selected={activeWordIdx}
              solvedSet={solvedSet}
              lostSet={lostSet}
              onSelect={(i) => setSelected(i)}
              numFmt={numFmt}
            />
          </div>
        </div>

        {/* چت شناور موبایل — دکمه گوشهٔ صفحه + پنجرهٔ بازشو */}
        {chatOpen && (
          <div className="fixed inset-x-3 bottom-24 z-40 flex max-h-[70vh] flex-col overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-950 shadow-2xl lg:hidden">
            <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2.5">
              <span className="flex items-center gap-2 text-sm font-bold text-zinc-100">
                <MessageCircle className="h-4 w-4 text-violet-400" aria-hidden="true" />
                {j.chatTitle}
              </span>
              <button
                onClick={() => setChatOpen(false)}
                aria-label="close chat"
                className="rounded-full p-1 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-200"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <JadvalTeamChat code={code} team={jadval.myTeam} playing />
          </div>
        )}
        <button
          onClick={() => setChatOpen((v) => !v)}
          aria-label={j.chatTitle}
          className={`fixed bottom-5 end-5 z-40 flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition-colors lg:hidden ${
            chatOpen ? "bg-zinc-700 text-zinc-100" : "bg-violet-500 text-zinc-950 hover:bg-violet-400"
          }`}
        >
          {chatOpen ? <X className="h-5 w-5" aria-hidden="true" /> : <MessageCircle className="h-5 w-5" aria-hidden="true" />}
        </button>

        {/* ستون کنار: چت مخفی تیم — فقط دسکتاپ؛ موبایل دکمهٔ شناور دارد */}
        <aside className="hidden max-h-[720px] min-h-[420px] flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60 lg:sticky lg:top-20 lg:flex lg:max-h-[calc(100vh-6rem)]">
          <JadvalTeamChat code={code} team={jadval.myTeam} playing />
        </aside>
      </div>
    </div>
  );
}

/* ================================================================
   فهرست سؤال‌ها
   ================================================================ */

function ClueList({
  title,
  words,
  selected,
  solvedSet,
  lostSet,
  onSelect,
  numFmt,
}: {
  title: string;
  words: { i: number; num: number; clue: string; len: number }[];
  selected: number | null;
  solvedSet: Set<number>;
  lostSet: Set<number>;
  onSelect: (i: number) => void;
  numFmt: (n: number) => string;
}) {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3">
      <h3 className="px-1 text-xs font-black text-zinc-400">{title}</h3>
      <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto pe-1 lg:max-h-80">
        {words.map((w) => {
          const solved = solvedSet.has(w.i);
          const lost = !solved && lostSet.has(w.i);
          const active = selected === w.i;
          return (
            <li key={w.i}>
              <button
                type="button"
                onClick={() => onSelect(w.i)}
                className={`flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-start transition-colors ${
                  active
                    ? "bg-violet-500/15 ring-1 ring-violet-500/40"
                    : solved
                      ? "bg-emerald-500/[0.05] hover:bg-zinc-800/60"
                      : lost
                        ? "bg-zinc-800/40 hover:bg-zinc-800/60"
                        : "hover:bg-zinc-800/60"
                }`}
              >
                <span
                  className={`mt-0.5 flex h-5 min-w-5 shrink-0 items-center justify-center rounded-md px-1 text-[10px] font-black ${
                    solved
                      ? "bg-emerald-500/15 text-emerald-300"
                      : lost
                        ? "bg-zinc-700/60 text-zinc-400"
                        : "bg-zinc-800 text-zinc-400"
                  }`}
                >
                  {numFmt(w.num)}
                </span>
                <span
                  className={`flex-1 text-[13px] leading-6 ${
                    solved
                      ? "text-zinc-500 line-through decoration-zinc-600"
                      : lost
                        ? "text-zinc-500 line-through decoration-zinc-500/70"
                        : "text-zinc-200"
                  }`}
                >
                  {w.clue}
                  <span className="ms-1.5 text-[10px] text-zinc-600">({numFmt(w.len)})</span>
                </span>
                {solved ? (
                  <Check className="mt-1 h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden="true" />
                ) : lost ? (
                  <Ban className="mt-1 h-3.5 w-3.5 shrink-0 text-zinc-500" aria-hidden="true" />
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ================================================================
   گرید جدول — راست‌به‌چپ؛ واژه‌های افقی از راست خوانده می‌شوند
   ================================================================ */

function JadvalGrid({
  view,
  selected,
  onCellClick,
  solutionMode = false,
}: {
  view: JadvalView;
  selected?: number | null;
  onCellClick?: (r: number, c: number) => void;
  solutionMode?: boolean;
}) {
  const { lang } = useLang();
  const size = view.puzzle.size;
  const rows = view.puzzle.rows;
  const letters = solutionMode ? (view.solution ?? view.cells) : view.cells;

  /* شماره‌ها روی خانه‌های شروع واژه‌ها */
  const numAt = useMemo(() => {
    const map = new Map<number, number>();
    for (const w of view.puzzle.words) {
      const idx = w.r * size + w.c;
      if (!map.has(idx) || w.num < (map.get(idx) ?? 0)) map.set(idx, w.num);
    }
    return map;
  }, [view.puzzle.words, size]);

  const numFmt = useCallback(
    (n: number) => new Intl.NumberFormat(lang === "fa" ? "fa-IR" : "en-US").format(n),
    [lang],
  );

  const selectedCells = useMemo(() => {
    if (solutionMode || selected == null) return new Set<number>();
    const w = view.puzzle.words.find((x) => x.i === selected);
    if (!w) return new Set<number>();
    const set = new Set<number>();
    for (let k = 0; k < w.len; k++) {
      const r = w.r + (w.d === "v" ? k : 0);
      const c = w.c + (w.d === "h" ? k : 0);
      set.add(r * size + c);
    }
    return set;
  }, [selected, view.puzzle.words, size, solutionMode]);

  /* خانه‌های فقط‌خط‌خورده: حرف دارند ولی هیچ واژهٔ حل‌شدهٔ تیم ما آنها را نمی‌پوشاند */
  const lostCells = useMemo(() => {
    if (solutionMode) return new Set<number>();
    const mineCells = new Set<number>();
    for (const w of view.puzzle.words) {
      if (!view.solved.includes(w.i)) continue;
      for (let k = 0; k < w.len; k++) {
        mineCells.add((w.r + (w.d === "v" ? k : 0)) * size + (w.c + (w.d === "h" ? k : 0)));
      }
    }
    const set = new Set<number>();
    for (const w of view.puzzle.words) {
      if (!view.lost?.includes(w.i)) continue;
      for (let k = 0; k < w.len; k++) {
        const idx = (w.r + (w.d === "v" ? k : 0)) * size + (w.c + (w.d === "h" ? k : 0));
        if (!mineCells.has(idx)) set.add(idx);
      }
    }
    return set;
  }, [view.puzzle.words, view.solved, view.lost, size, solutionMode]);

  return (
    <div
      dir="rtl"
      className="mx-auto w-full overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/60 p-1.5"
      style={{ maxWidth: `${Math.min(560, size * 46)}px` }}
    >
      <div
        className="grid gap-px"
        style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}
      >
        {rows.flatMap((row, rIdx) =>
          row.split("").map((ch, cIdx) => {
            const idx = rIdx * size + cIdx;
            if (ch === "#") {
              return <div key={idx} className="aspect-square rounded-[3px] bg-zinc-800/70" />;
            }
            const letter = letters[idx] ?? "";
            const num = numAt.get(idx);
            const inSel = selectedCells.has(idx);
            const isLostCell = lostCells.has(idx);
            return (
              <button
                key={idx}
                type="button"
                onClick={() => onCellClick?.(rIdx, cIdx)}
                aria-label={`cell ${rIdx + 1}-${cIdx + 1}`}
                className={`relative aspect-square rounded-[3px] transition-colors ${
                  inSel
                    ? "bg-violet-300"
                    : letter
                      ? isLostCell
                        ? "bg-zinc-500/70"
                        : "bg-zinc-100"
                      : "bg-zinc-300"
                } ${onCellClick ? "cursor-pointer" : "cursor-default"}`}
              >
                {num != null && (
                  <span className="absolute end-0.5 top-0 text-[8px] font-black leading-tight text-zinc-500 sm:text-[9px]">
                    {numFmt(num)}
                  </span>
                )}
                {letter && (
                  <span
                    className={`flex h-full w-full items-center justify-center text-[13px] font-black sm:text-base ${
                      isLostCell ? "text-zinc-300/80" : "text-zinc-900"
                    }`}
                  >
                    {letter}
                  </span>
                )}
              </button>
            );
          }),
        )}
      </div>
    </div>
  );
}
