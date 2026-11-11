"use client";

/* چت آرنا — هم برای لابی عمومی (scope = lobby) و هم داخل اتاق‌ها.
   پیام‌ها زنده از استریم SSE می‌رسند (push سرور، بدون polling)؛
   کد اتاق‌های باز داخل متن پیام‌ها کلیک‌پذیر است
   و با یک کلیک مستقیم به اتاق می‌روی. */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogIn, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLang } from "@/components/site/language-provider";
import { MemberAvatar } from "@/components/site/member-avatar";
import { AvatarPicker } from "@/components/site/avatar-picker";
import { subscribeStream, type StreamStatus } from "@/lib/realtime";
import { NABARD_GAME_SLUG } from "@/lib/nabard-engine";
import { FIRE_GAME_SLUG } from "@/lib/fire-engine";
import { JADVAL_GAME_SLUG } from "@/lib/jadval-shared";
import type { ChatGetResponse, ChatMsgView } from "@/lib/types";

type ChatPanelProps = {
  scope: string; // "lobby" یا کد ۵ حرفی اتاق
  className?: string; // کنترل ارتفاع توسط والد
  hideHeader?: boolean; // وقتی والد خودش هدر دارد
};

export function ChatPanel({ scope, className = "", hideHeader = false }: ChatPanelProps) {
  const { t, lang } = useLang();
  const c = t.chat;
  const r = t.arena.room;
  const router = useRouter();

  const [msgs, setMsgs] = useState<ChatMsgView[] | null>(null);
  const [me, setMe] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [needAvatar, setNeedAvatar] = useState(false);
  const [gone, setGone] = useState(false);
  const [joining, setJoining] = useState("");
  const [status, setStatus] = useState<StreamStatus>("connecting");

  const scrollRef = useRef<HTMLDivElement>(null);
  const lastIdRef = useRef(0);
  const atBottomRef = useRef(true);
  const aliveRef = useRef(true);
  const scopeRef = useRef(scope);
  const goneRef = useRef(false);

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

  /** پیام‌های تازه را بدون تکرار به فهرست اضافه می‌کند (هم استریم، هم پایش پشتیبان) */
  const mergeIncoming = useCallback((incoming: ChatMsgView[]) => {
    if (!incoming.length) return;
    const initial = lastIdRef.current === 0;
    const last = incoming[incoming.length - 1].id;
    if (last > lastIdRef.current) lastIdRef.current = last;
    setMsgs((prev) => {
      if (initial) return incoming.slice(-150); // بار اول — جایگزینی کامل
      const base = prev ?? [];
      const seen = new Set(base.map((m) => m.id));
      return [...base, ...incoming.filter((m) => !seen.has(m.id))].slice(-150);
    });
  }, []);

  const pollOnce = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/chat?scope=${encodeURIComponent(scopeRef.current)}&after=${lastIdRef.current}`,
        { cache: "no-store" },
      );
      if (!aliveRef.current) return;
      if (res.status === 404) {
        goneRef.current = true;
        setGone(true);
        return;
      }
      if (!res.ok) return;
      const data = (await res.json()) as ChatGetResponse;
      setMe(data.me);
      setCodes(data.codes);
      mergeIncoming(data.messages);
    } catch {
      /* قطع لحظه‌ای — دور بعد */
    }
  }, [mergeIncoming]);

  useEffect(() => {
    aliveRef.current = true;
    scopeRef.current = scope;
    lastIdRef.current = 0;
    goneRef.current = false;
    setMsgs(null);
    setGone(false);
    setNeedAvatar(false);
    setError("");
    atBottomRef.current = true;
    setStatus("connecting");

    /* ۱) تاریخچه با GET — ۲) بعد استریم زنده پیام‌های تازه را push می‌کند */
    let unsub: (() => void) | undefined;
    (async () => {
      await pollOnce();
      if (!aliveRef.current || goneRef.current) return;
      unsub = subscribeStream(scope === "lobby" ? "lobby" : "room", scope, {
        initialChatCursor: lastIdRef.current,
        onChat: mergeIncoming,
        onStatus: (s) => setStatus(s),
        onGone: () => {
          goneRef.current = true;
          setGone(true);
        },
      });
    })();

    /* پایش پشتیبان — اگر استریم قطع ماند، هر ۶ ثانیه پیام‌های فوت‌شده گرفته می‌شوند */
    const backup = setInterval(() => {
      if (document.visibilityState === "visible") void pollOnce();
    }, 6000);

    return () => {
      aliveRef.current = false;
      clearInterval(backup);
      unsub?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, pollOnce, mergeIncoming]);

  /* اسکرول خودکار به آخرین پیام وقتی کاربر پایین است */
  useEffect(() => {
    const el = scrollRef.current;
    if (el && atBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [msgs]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 70;
  }

  async function joinByCode(code: string) {
    if (joining) return;
    setJoining(code);
    setError("");
    try {
      const res = await fetch("/api/arena/rooms/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (res.ok) {
        router.push(`/room/${code}`);
        return;
      }
      if (res.status === 404) setError(r.notFound);
      else if (res.status === 409) setError(r.joinPlaying);
      else setError(r.joinBad);
    } catch {
      setError(r.connectionLost);
    } finally {
      setJoining("");
    }
  }

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
        await pollOnce(); // پیام خودمان فوری دیده شود
      } else if (res.status === 403) {
        setNeedAvatar(true);
      } else if (res.status === 429) {
        setError(c.tooFast);
      } else if (res.status === 404) {
        setGone(true);
      } else {
        setError(c.sendError);
      }
    } catch {
      setError(c.sendError);
    } finally {
      setSending(false);
    }
  }

  /** متن پیام را به قطعات متن + کد اتاق می‌شکند تا کد کلیک‌پذیر شود */
  function renderContent(content: string) {
    if (!codes.length || !/[A-Z0-9]{5}/.test(content)) return content;
    const parts: { txt: string; code: string | null }[] = [];
    const re = /[A-Z0-9]{5}/g;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      if (codes.includes(m[0])) {
        if (m.index > last) parts.push({ txt: content.slice(last, m.index), code: null });
        parts.push({ txt: m[0], code: m[0] });
        last = m.index + 5;
      }
    }
    if (last < content.length) parts.push({ txt: content.slice(last), code: null });
    if (!parts.some((p) => p.code)) return content;
    return parts.map((p, i) =>
      p.code ? (
        <button
          key={i}
          type="button"
          onClick={() => joinByCode(p.code as string)}
          disabled={joining === p.code}
          className="mx-0.5 inline-flex translate-y-0.5 items-center gap-1 rounded-md bg-violet-500/15 px-1.5 py-0.5 align-middle text-[11px] font-black text-violet-300 ring-1 ring-violet-500/40 transition hover:bg-violet-500/30 disabled:opacity-50"
          dir="ltr"
        >
          <LogIn className="h-3 w-3" aria-hidden="true" />
          {p.code}
        </button>
      ) : (
        <span key={i}>{p.txt}</span>
      ),
    );
  }

  function gameName(slug: string | null): string {
    if (slug === NABARD_GAME_SLUG) return t.arena.gameNabard;
    if (slug === FIRE_GAME_SLUG) return t.arena.gameFire;
    if (slug === JADVAL_GAME_SLUG) return t.arena.gameJadval;
    return t.arena.gameQuiz; // پیش‌فرض و ARENA_GAME_SLUG
  }

  return (
    <div className={`flex min-h-0 flex-col overflow-hidden ${className}`}>
      {!hideHeader && (
        <div className="flex items-center justify-between gap-2 border-b border-zinc-800 px-4 py-3">
          <h3 className="flex items-center gap-2 text-sm font-bold text-zinc-100">
            {scope === "lobby" ? c.lobbyTitle : c.roomTitle}
          </h3>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-bold transition-colors ${
              status === "live"
                ? "bg-emerald-500/10 text-emerald-300"
                : status === "connecting"
                  ? "bg-amber-500/10 text-amber-300"
                  : "bg-rose-500/10 text-rose-300"
            }`}
          >
            {status === "live" ? c.liveOk : status === "connecting" ? c.liveConnecting : c.liveOffline}
          </span>
        </div>
      )}

      {/* پیام‌ها */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4"
      >
        {msgs === null ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-zinc-600" aria-hidden="true" />
          </div>
        ) : msgs.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-800 px-4 py-8 text-center text-xs leading-6 text-zinc-500">
            {scope === "lobby" ? c.empty : c.emptyRoom}
            <br />
            {c.hint}
          </p>
        ) : (
          msgs.map((m) => {
            if (m.kind === "system") {
              /* اعلان ساخت اتاق — کارت با دکمه پیوستن */
              const open = m.roomCode ? codes.includes(m.roomCode) : false;
              return (
                <div key={m.id}>
                  <div className="mx-auto max-w-[95%] rounded-xl border border-violet-500/30 bg-violet-500/[0.07] px-3.5 py-3 text-center">
                    <p className="text-xs leading-6 text-zinc-300">
                      <b className="text-violet-300">{m.name}</b>{" "}
                      {c.sysCreated.replace("{n}", numFmt(m.roomNumber)).replace("{g}", gameName(m.gameSlug))}{" "}
                      <span dir="ltr" className="font-black tracking-widest text-violet-200">
                        {m.roomCode}
                      </span>
                    </p>
                    {m.roomCode &&
                      (open ? (
                        <Button
                          onClick={() => joinByCode(m.roomCode as string)}
                          disabled={joining === m.roomCode}
                          size="sm"
                          className="mt-2 h-8 rounded-lg bg-violet-500 px-4 text-xs font-bold text-zinc-950 hover:bg-violet-400"
                        >
                          {joining === m.roomCode ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                          ) : (
                            <LogIn className="h-3.5 w-3.5" aria-hidden="true" />
                          )}
                          {c.joinCta}
                        </Button>
                      ) : (
                        <span className="mt-1.5 inline-block text-[10px] font-semibold text-zinc-500">
                          {c.closedRoom}
                        </span>
                      ))}
                  </div>
                </div>
              );
            }

            const mine = m.memberId === me;
            return (
              <div key={m.id}>
                <div className={`flex gap-2.5 ${mine ? "flex-row-reverse" : ""}`}>
                  <MemberAvatar memberId={m.memberId} name={m.name} size={30} />
                  <div className={`min-w-0 max-w-[85%] ${mine ? "text-end" : ""}`}>
                    <div
                      className={`flex items-baseline gap-2 ${mine ? "flex-row-reverse" : ""}`}
                    >
                      <span className={`truncate text-[11px] font-bold ${mine ? "text-violet-300" : "text-zinc-400"}`}>
                        {mine ? c.you : m.name}
                      </span>
                      <span className="shrink-0 text-[10px] text-zinc-600" suppressHydrationWarning>
                        {timeFmt(m.createdAt)}
                      </span>
                    </div>
                    <p
                      className={`mt-1 inline-block whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-start text-[13px] leading-6 ${
                        mine
                          ? "bg-violet-500/15 text-zinc-100 ring-1 ring-violet-500/30"
                          : "bg-zinc-800/80 text-zinc-200"
                      }`}
                    >
                      {renderContent(m.content)}
                    </p>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {error && (
        <p className="mx-3 mb-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-[11px] font-semibold text-rose-300">
          {error}
        </p>
      )}

      {/* ورودی پیام — یا کارت گذاشتن عکس پروفایل */}
      {gone ? (
        <p className="border-t border-zinc-800 bg-zinc-950/60 px-4 py-4 text-center text-xs font-semibold text-zinc-500">
          {c.closedRoom}
        </p>
      ) : needAvatar ? (
        <div className="border-t border-zinc-800 bg-zinc-950/60 px-4 py-3">
          <p className="mb-2 text-[11px] font-bold text-amber-300">{c.needAvatar}</p>
          <AvatarPicker
            variant="upload"
            onDone={() => {
              setNeedAvatar(false);
              setError("");
            }}
          />
        </div>
      ) : (
        <form onSubmit={send} className="flex items-center gap-2 border-t border-zinc-800 bg-zinc-950/60 p-2.5">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={c.ph}
            maxLength={500}
            className="h-10 min-w-0 flex-1 rounded-xl border border-zinc-700 bg-zinc-900 px-3.5 text-sm text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-violet-500/60"
          />
          <Button
            type="submit"
            disabled={sending || !text.trim()}
            size="icon"
            aria-label={c.send}
            className="h-10 w-10 shrink-0 rounded-xl bg-violet-500 text-zinc-950 hover:bg-violet-400 disabled:opacity-40"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />
            )}
          </Button>
        </form>
      )}
    </div>
  );
}
