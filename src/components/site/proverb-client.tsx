"use client";

/* ================================================================
   «ضرب‌المثل‌چین» — کلاینت بازی
   چینش‌گر ضرب‌المثل مخفی را می‌بیند و با کارت‌های کلمه‌ای متحرک
   صحنه می‌چیند؛ صفت‌ها روی کارت اسم می‌نشینند؛ بقیه ضرب‌المثل را
   کامل حدس می‌زنند؛ در افشا واکنش‌های متحرک و رأی خلاقیت هست.
   انیمیشن کارت‌ها CSS خالص است — سبک، یکدست و بدون حق کپی‌رایت.
   ================================================================ */

import { useCallback, useEffect, useRef, useState } from "react";
import { Clapperboard, Crown, Eraser, Loader2, Send, Undo2 } from "lucide-react";
import { useLang } from "@/components/site/language-provider";
import { subscribeStream } from "@/lib/realtime";
import { sfxAmbientStart, sfxAmbientStop, sfxIsMuted, sfxLose, sfxToggleMuted, sfxWin } from "@/lib/arena-sfx";
import {
  PC_MAX_CARDS,
  PC_MODE_LABELS,
  pcJokerNext,
  type PcBoard,
  type PcPlaced,
  type PcView,
} from "@/lib/proverb-shared";
import { PC_CARD_MAP, PC_REACTIONS, type PcCardDef } from "@/lib/proverb-cards";
import type { ArenaStateResponse } from "@/lib/types";

type Flash = { kind: "ok" | "info" | "bad"; text: string } | null;

/* ---------- انیمیشن‌های حلقه‌ای کارت‌ها — CSS خالص ---------- */
const PC_ANIM_CSS = `
@keyframes pc-steam { 0%,100%{transform:translateY(0) scale(1)} 50%{transform:translateY(-5px) scale(1.06)} }
@keyframes pc-ripple { 0%,100%{transform:translateY(0)} 25%{transform:translateY(-3px)} 75%{transform:translateY(3px)} }
@keyframes pc-spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
@keyframes pc-sway { 0%,100%{transform:rotate(-8deg)} 50%{transform:rotate(8deg)} }
@keyframes pc-bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
@keyframes pc-flicker { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.55;transform:scale(.92)} }
@keyframes pc-fall { 0%{transform:translateY(-4px);opacity:.7} 100%{transform:translateY(4px);opacity:1} }
@keyframes pc-drift { 0%,100%{transform:translateX(-3px)} 50%{transform:translateX(3px)} }
@keyframes pc-pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.14)} }
@keyframes pc-wobble { 0%,100%{transform:rotate(-6deg)} 50%{transform:rotate(6deg)} }
@keyframes pc-shake { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-2px)} 60%{transform:translateX(2px)} }
@keyframes pc-breathe { 0%,100%{transform:scale(1)} 50%{transform:scale(1.05)} }
@keyframes pc-glow { 0%,100%{filter:brightness(1);transform:scale(1)} 50%{filter:brightness(1.35);transform:scale(1.08)} }
.pc-motion{animation:pc-breathe 2.4s ease-in-out infinite}
.pc-motion[data-m="steam"]{animation-name:pc-steam}
.pc-motion[data-m="ripple"]{animation-name:pc-ripple}
.pc-motion[data-m="spin"]{animation-name:pc-spin;animation-duration:3.2s}
.pc-motion[data-m="sway"]{animation-name:pc-sway}
.pc-motion[data-m="bounce"]{animation-name:pc-bounce}
.pc-motion[data-m="flicker"]{animation-name:pc-flicker;animation-duration:1.6s}
.pc-motion[data-m="fall"]{animation-name:pc-fall;animation-duration:1.9s}
.pc-motion[data-m="drift"]{animation-name:pc-drift}
.pc-motion[data-m="pulse"]{animation-name:pc-pulse}
.pc-motion[data-m="wobble"]{animation-name:pc-wobble}
.pc-motion[data-m="shake"]{animation-name:pc-shake;animation-duration:1.1s}
.pc-motion[data-m="glow"]{animation-name:pc-glow}
@keyframes pc-floatup { from{opacity:1;transform:translateY(0) scale(1)} to{opacity:0;transform:translateY(-26px) scale(1.25)} }
.pc-react-float{animation:pc-floatup 1.8s ease-out forwards}
`;

function cloneBoard(b: PcBoard): PcBoard {
  return { items: b.items.map((i) => ({ ...i })) };
}

/* ---------- یک کارت کلمه‌ای متحرک در جعبه ---------- */
function CardChip({
  card,
  big = false,
  onClick,
  disabled,
}: {
  card: PcCardDef;
  big?: boolean;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={card.w}
      className={`flex shrink-0 flex-col items-center justify-center rounded-xl border transition-colors disabled:opacity-40 ${
        card.t === "mod"
          ? "border-sky-500/40 bg-sky-950/40 text-sky-100"
          : card.t === "link"
            ? "border-teal-500/40 bg-teal-950/40 text-teal-100"
            : card.t === "joker"
              ? "border-fuchsia-500/40 bg-fuchsia-950/40 text-fuchsia-100"
              : "border-zinc-700 bg-zinc-900/80 text-zinc-100"
      } ${big ? "h-16 w-16 px-1" : "h-12 w-12 px-0.5"} ${onClick ? "hover:border-zinc-400 active:scale-95" : ""}`}
    >
      {card.e && (
        <span aria-hidden="true" className={`pc-motion ${big ? "text-2xl" : "text-lg"}`} data-m={card.m}>
          {card.e}
        </span>
      )}
      <span className={`mt-0.5 w-full truncate text-center font-bold leading-tight ${big ? "text-[10px]" : "text-[9px]"}`}>
        {card.w}
      </span>
    </button>
  );
}

/* ---------- کارت چیده‌شده روی صحنه ---------- */
function PlacedCard({
  item,
  card,
  attached,
  active,
  onPointerDown,
}: {
  item: PcPlaced;
  card: PcCardDef;
  attached: PcPlaced[];
  active: boolean;
  onPointerDown?: (e: React.PointerEvent) => void;
}) {
  return (
    <div
      className="absolute"
      style={{
        left: `${item.x}%`,
        top: `${item.y}%`,
        transform: `translate(-50%,-50%) rotate(${item.r ?? 0}deg)`,
        touchAction: "none",
      }}
    >
      <div
        onPointerDown={onPointerDown}
        className={`relative flex h-14 w-14 select-none flex-col items-center justify-center rounded-xl border shadow-lg ${
          onPointerDown ? "cursor-grab" : ""
        } ${active ? "border-amber-400 bg-amber-400/15" : card.t === "mod" ? "border-sky-500/50 bg-sky-950/70" : card.t === "joker" ? "border-fuchsia-500/50 bg-fuchsia-950/70" : "border-zinc-500 bg-zinc-900/90"}`}
      >
        {card.e && (
          <span aria-hidden="true" className="pc-motion text-2xl" data-m={card.m}>
            {card.e}
          </span>
        )}
        <span className="mt-0.5 max-w-full truncate px-0.5 text-[9px] font-bold text-zinc-200">{card.w}</span>
        {/* صفت‌های سوارشده — نشان گوشهٔ کارت */}
        {attached.map((m) => {
          const mc = PC_CARD_MAP.get(m.k);
          if (!mc) return null;
          return (
            <span
              key={`att:${m.k}`}
              className={`absolute -top-2.5 -left-2.5 flex items-center gap-0.5 rounded-full border px-1 py-0.5 text-[9px] font-black ${
                mc.k === "m.نه" ? "border-red-500 bg-red-950 text-red-300" : "border-sky-500 bg-sky-950 text-sky-200"
              }`}
            >
              <span aria-hidden="true" className="pc-motion text-[10px]" data-m={mc.m}>
                {mc.e}
              </span>
              {mc.w}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- صحنه — چیدمان با کشیدن، جوکر با ضربه عوض می‌شود ---------- */
function SceneCanvas({
  board,
  editable,
  activeIdx,
  onActivate,
  onMove,
  onCycleJoker,
  tone,
}: {
  board: PcBoard;
  editable: boolean;
  activeIdx: number | null;
  onActivate: (idx: number | null) => void;
  onMove: (idx: number, x: number, y: number) => void;
  onCycleJoker: (idx: number) => void;
  tone: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ idx: number; moved: boolean } | null>(null);

  const toPct = (clientX: number, clientY: number) => {
    const el = ref.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const x = ((clientX - r.left) / r.width) * 100;
    const y = ((clientY - r.top) / r.height) * 100;
    return { x: Math.min(98, Math.max(2, x)), y: Math.min(98, Math.max(2, y)) };
  };

  return (
    <div
      ref={ref}
      className={`relative h-64 w-full overflow-hidden rounded-2xl border border-zinc-800 sm:h-72 ${tone}`}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!editable || !d) return;
        const p = toPct(e.clientX, e.clientY);
        if (p) {
          drag.current = { idx: d.idx, moved: true };
          onMove(d.idx, p.x, p.y);
        }
      }}
      onPointerUp={(e) => {
        const d = drag.current;
        drag.current = null;
        if (!editable || !d) return;
        if (!d.moved) {
          const card = PC_CARD_MAP.get(board.items[d.idx]?.k ?? "");
          if (card?.t === "joker") onCycleJoker(d.idx);
          else onActivate(activeIdx === d.idx ? null : d.idx);
        }
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
    >
      {board.items.map((it, i) => {
        const card = PC_CARD_MAP.get(it.k);
        if (!card) return null;
        /* صفتِ سوارشده جداگانه رندر نمی‌شود — روی مادر نشان می‌شود */
        if (it.p) return null;
        const attached = board.items.filter((o) => o.p === it.k && o !== it);
        return (
          <PlacedCard
            key={`pc:${i}:${it.k}`}
            item={it}
            card={card}
            attached={attached}
            active={activeIdx === i}
            onPointerDown={
              editable
                ? (e) => {
                    e.preventDefault();
                    drag.current = { idx: i, moved: false };
                  }
                : undefined
            }
          />
        );
      })}
    </div>
  );
}

/* ================================================================ */
export function ProverbClient({ st, offsetMs }: { st: ArenaStateResponse; offsetMs: number }) {
  const { t, lang } = useLang();
  const s = t.arena.pc;
  const fa = lang === "fa";
  const code = st.room.code;
  const me = st.me;
  const view = st.proverb;
  const [flash, setFlash] = useState<Flash>(null);
  const [, setTick] = useState(0);
  const [muted, setMuted] = useState(false);
  const [draft, setDraft] = useState<PcBoard | null>(null);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [guessText, setGuessText] = useState("");
  const [sending, setSending] = useState(false);
  const [undoStack, setUndoStack] = useState<PcBoard[]>([]);
  const dirtyRef = useRef(false);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRoundRef = useRef(-1);
  const feedRef = useRef<HTMLDivElement | null>(null);
  const stingerRef = useRef("");
  const aliveRef = useRef(true);

  /* تیک محلی برای تایمرها */
  useEffect(() => {
    const id = setInterval(() => setTick((x) => x + 1), 250);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    setMuted(sfxIsMuted());
    return () => {
      aliveRef.current = false;
      sfxAmbientStop();
    };
  }, []);

  /* موزیک ملایم + استینگر پایان */
  const resultRef = view?.result ?? null;
  const roomStatus = st.room.status;
  useEffect(() => {
    if (roomStatus === "playing" && !resultRef) {
      sfxAmbientStart();
      return () => sfxAmbientStop();
    }
    if (resultRef && roomStatus === "finished") {
      sfxAmbientStop();
      const key = `${code}:${resultRef.rows[0]?.id ?? "draw"}`;
      if (stingerRef.current !== key) {
        stingerRef.current = key;
        const myRank = resultRef.rows.find((r) => r.id === me)?.rank ?? 9;
        if (myRank === 1) sfxWin();
        else sfxLose();
      }
    }
  }, [resultRef, roomStatus, code, me]);

  /* پیام‌های گذرا محو می‌شوند */
  useEffect(() => {
    if (!flash) return;
    const id = setTimeout(() => setFlash(null), flash.kind === "bad" ? 3800 : 3000);
    return () => clearTimeout(id);
  }, [flash]);

  /* استریم اتاق — چیدمان، حدس‌ها و فازها همان لحظه می‌رسند */
  useEffect(() => {
    const unsub = subscribeStream("room", code, {});
    return () => unsub();
  }, [code]);

  /* فید حدس‌ها — اسکرول به آخر */
  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight });
  }, [view?.guesses.length]);

  /* سینک پیش‌نویس با سرور — هر تغییر با دیبای ۴۰۰ms می‌رود */
  const flushSync = useCallback(
    (board: PcBoard) => {
      void fetch(`/api/arena/rooms/${encodeURIComponent(code)}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "pc_set", board }),
      }).catch(() => undefined);
      dirtyRef.current = false;
    },
    [code],
  );

  const scheduleSync = useCallback(
    (board: PcBoard) => {
      dirtyRef.current = true;
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
      syncTimerRef.current = setTimeout(() => flushSync(board), 400);
    },
    [flushSync],
  );

  /* نوبت/دور جدید → پیش‌نویس از سرور تازه می‌شود */
  useEffect(() => {
    if (!view) return;
    if (draftRoundRef.current !== view.round || !view.isMyTurn) {
      draftRoundRef.current = view.round;
      setDraft(view.board ? cloneBoard(view.board) : null);
      setUndoStack([]);
      setActiveIdx(null);
    }
  }, [view]);

  useEffect(() => () => {
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
  }, []);

  if (!view) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-600" aria-hidden="true" />
      </div>
    );
  }

  const now = Date.now() + offsetMs;
  const remainSec = Math.max(0, Math.ceil((view.phaseEnds - now) / 1000));
  const beforeStart = now < view.startedAtMs && view.seq <= 1;
  const isArranger = view.isMyTurn && view.phase === "build";
  const board = isArranger && draft ? draft : view.board ?? { items: [] };
  const modeLabel = PC_MODE_LABELS[view.mode][fa ? "fa" : "en"];
  const phoneMode = view.mode === "phone";
  const canGuess = !phoneMode && view.phase === "build" && !view.isMyTurn;

  /* --- اعمال چینش‌گر روی پیش‌نویس --- */
  const pushUndo = (b: PcBoard) => {
    setUndoStack((u) => [...u.slice(-29), cloneBoard(b)]);
  };

  const mutate = (fn: (b: PcBoard) => void) => {
    if (!isArranger || !draft) return;
    pushUndo(draft);
    const next = cloneBoard(draft);
    fn(next);
    setDraft(next);
    scheduleSync(next);
  };

  function addCard(key: string) {
    if (!isArranger || !draft) return;
    if (draft.items.length >= PC_MAX_CARDS) {
      setFlash({ kind: "info", text: fa ? "سقف کارت پر است" : "Card budget is full" });
      return;
    }
    mutate((b) => {
      const n = b.items.length;
      const def = PC_CARD_MAP.get(key);
      const item: PcPlaced = { k: key, x: 30 + ((n * 19) % 44), y: 34 + ((n * 27) % 34) };
      /* صفت نزدیک کارت اسم می‌افتد — سوارِ همان می‌شود */
      if (def?.t === "mod") {
        let best: { d: number; k: string } | null = null;
        for (const it of b.items) {
          const pdef = PC_CARD_MAP.get(it.k);
          if (!pdef || pdef.t !== "name" || it.p) continue;
          const d = Math.hypot(it.x - item.x, it.y - item.y);
          if (!best || d < best.d) best = { d, k: it.k };
        }
        if (best && best.d <= 16) item.p = best.k;
      }
      b.items.push(item);
    });
  }

  function cycleJoker(idx: number) {
    mutate((b) => {
      const it = b.items[idx];
      if (!it) return;
      it.k = pcJokerNext(it.k);
    });
  }

  function delActive() {
    if (activeIdx === null || !draft) return;
    const idx = activeIdx;
    mutate((b) => {
      const del = b.items[idx];
      if (!del) return;
      b.items = b.items.filter((it) => it !== del);
      /* صفت‌های سوار این کارت آزاد می‌شوند */
      for (const it of b.items) if (it.p === del.k) delete it.p;
    });
    setActiveIdx(null);
  }

  function undo() {
    if (!isArranger || undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setUndoStack((u) => u.slice(0, -1));
    setDraft(cloneBoard(prev));
    scheduleSync(cloneBoard(prev));
  }

  function clearAll() {
    if (!isArranger) return;
    mutate((b) => {
      b.items = [];
    });
    setActiveIdx(null);
  }

  /* --- حدس --- */
  async function sendGuess() {
    const text = guessText.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/arena/rooms/${encodeURIComponent(code)}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "pc_guess", text }),
      });
      const data = (await res.json()) as { ok?: boolean; grade?: string; points?: number };
      if (data.ok) {
        if (data.grade === "full") setFlash({ kind: "ok", text: s.fullToast.replace("{p}", String(data.points ?? 10)) });
        else if (data.grade === "near") setFlash({ kind: "ok", text: s.nearToast.replace("{p}", String(data.points ?? 5)) });
        else if (data.grade === "miss-word") setFlash({ kind: "ok", text: s.missingToast.replace("{p}", String(data.points ?? 3)) });
        else setFlash({ kind: "bad", text: s.wrongToast });
        setGuessText("");
      } else {
        setFlash({ kind: "bad", text: s.sendError });
      }
    } catch {
      setFlash({ kind: "bad", text: s.sendError });
    } finally {
      if (aliveRef.current) setSending(false);
    }
  }

  async function act(type: string, extra: Record<string, unknown> = {}) {
    setSending(true);
    try {
      await fetch(`/api/arena/rooms/${encodeURIComponent(code)}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, ...extra }),
      });
    } catch {
      /* بی‌صدا */
    } finally {
      if (aliveRef.current) setSending(false);
    }
  }

  /* ---------- صفحهٔ نتیجه ---------- */
  if (view.finished && view.result) {
    const champion = view.result.rows.find((r) => r.rank === 1);
    const awards = view.result.awards;
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6" dir="rtl">
        <style dangerouslySetInnerHTML={{ __html: PC_ANIM_CSS }} />
        <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-b from-amber-500/10 to-transparent p-6 text-center">
          <p className="text-sm font-bold text-amber-300">{s.revealTitle}</p>
          <h2 className="mt-2 text-2xl font-black text-amber-100">
            <Crown className="me-1.5 inline h-6 w-6 text-amber-400" aria-hidden="true" />
            {champion ? `${champion.name} — ${s.champion}` : s.champion}
          </h2>
          <div className="mt-5 grid gap-2.5 sm:grid-cols-4">
            {[
              { icon: "🎨", label: s.awardPicasso, w: awards.picasso },
              { icon: "🎬", label: s.awardOscar, w: awards.oscar },
              { icon: "🌀", label: s.awardSurreal, w: awards.surreal },
              { icon: "✂️", label: s.awardLaconic, w: awards.laconic },
            ].map((a) => (
              <div key={a.label} className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 text-center">
                <p className="text-xs font-bold text-zinc-400">{a.icon} {a.label}</p>
                <p className="mt-1 text-sm font-black text-zinc-100">{a.w ? a.w.name : "—"}</p>
                {a.w && <p className="text-[11px] text-zinc-500">{a.w.detail}</p>}
              </div>
            ))}
          </div>
          {!awards.picasso && !awards.oscar && !awards.surreal && !awards.laconic && (
            <p className="mt-3 text-xs text-zinc-500">{s.noAwards}</p>
          )}
        </div>
        {/* جدول امتیازها */}
        <div className="mt-5 overflow-hidden rounded-2xl border border-zinc-800">
          {view.result.rows.map((r) => (
            <div
              key={r.id}
              className={`flex items-center justify-between px-4 py-2.5 ${r.rank === 1 ? "bg-amber-500/10" : "bg-zinc-950/60"} border-b border-zinc-800 last:border-0`}
            >
              <span className="text-sm font-bold text-zinc-200">
                {r.rank}. {r.name}
              </span>
              <span className="text-sm font-black tabular-nums text-amber-300">{r.score}</span>
            </div>
          ))}
        </div>
        {st.room.hostId === me && (
          <button
            type="button"
            onClick={() => void act("again")}
            disabled={sending}
            className="mt-5 w-full rounded-xl bg-amber-500 px-4 py-3 text-sm font-black text-amber-950 transition-colors hover:bg-amber-400 disabled:opacity-50"
          >
            {fa ? "مسابقه دوباره" : "Play again"}
          </button>
        )}
      </div>
    );
  }

  /* ---------- صحنهٔ بازی ---------- */
  const reveal = view.phase === "reveal";
  const tone = "bg-gradient-to-b from-zinc-800/80 to-zinc-900";
  const tr = view.tray ?? [];
  const trayNames = tr.filter((k) => PC_CARD_MAP.get(k)?.t === "name");
  const trayMods = tr.filter((k) => PC_CARD_MAP.get(k)?.t === "mod");
  const trayLinks = tr.filter((k) => PC_CARD_MAP.get(k)?.t === "link");
  const trayJokers = tr.filter((k) => PC_CARD_MAP.get(k)?.t === "joker");

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6" dir="rtl">
      <style dangerouslySetInnerHTML={{ __html: PC_ANIM_CSS }} />

      {/* سربرگ */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-2 text-lg font-extrabold text-zinc-50">
            <Clapperboard className="h-5 w-5 text-sky-400" aria-hidden="true" />
            {fa ? "ضرب‌المثل‌چین" : "Proverb Craft"}
            <span className="rounded-full border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-[10px] font-black text-sky-300">
              {modeLabel}
            </span>
            {view.hasMissing && view.mode === "incomplete" && (
              <span className="rounded-full border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-[10px] font-black text-red-300">
                {s.hasMissingBadge}
              </span>
            )}
          </h1>
          <p className="mt-1 text-xs text-zinc-500">
            {s.round} {view.round} {s.of} {view.totalRounds}
            {" · "}
            {s.arrangerTurn}: <b className="text-zinc-300">{view.arrangerName}</b>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMuted(sfxToggleMuted())}
            aria-label={fa ? "صدا" : "sound"}
            className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-2 text-zinc-400"
          >
            {muted ? "🔇" : "🔊"}
          </button>
          <span
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm font-black tabular-nums ${
              reveal ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-sky-500/40 bg-sky-500/10 text-sky-300"
            }`}
          >
            <Clock className="h-4 w-4" aria-hidden="true" />
            {beforeStart ? "…" : remainSec}
          </span>
        </div>
      </div>

      {beforeStart && <p className="mt-3 text-center text-xs text-zinc-500">{s.startingIn}</p>}

      {/* فلاش */}
      {flash && (
        <div
          role="status"
          className={`mt-3 rounded-xl border px-4 py-2.5 text-center text-sm font-bold ${
            flash.kind === "ok"
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
              : flash.kind === "bad"
                ? "border-red-500/40 bg-red-500/10 text-red-300"
                : "border-sky-500/40 bg-sky-500/10 text-sky-300"
          }`}
        >
          {flash.text}
        </div>
      )}

      {/* ---------- چیدمان ---------- */}
      {view.phase === "build" && (
        <div className="mt-4 space-y-3">
          {/* پنل چینش‌گر */}
          {isArranger && (
            <div className="rounded-2xl border border-sky-500/30 bg-sky-500/[0.06] p-4">
              <p className="text-[11px] font-bold text-sky-300">{s.yourPuzzle}</p>
              <p className="mt-1 text-lg font-black leading-7 text-sky-100">{view.puzzle}</p>
              <div className="mt-1.5 flex flex-wrap gap-2 text-[11px] text-sky-200/80">
                {view.lockedCount > 0 && (
                  <span className="rounded-lg border border-red-500/40 bg-red-500/10 px-2 py-0.5 font-bold text-red-300">
                    🔒 {s.hintLocked}: {view.lockedCount}
                  </span>
                )}
                {view.swapped && <span className="rounded-lg border border-amber-500/40 px-2 py-0.5 font-bold text-amber-300">{s.swapped}</span>}
              </div>
              {!phoneMode && (
                <button
                  type="button"
                  disabled={view.swapped || sending}
                  onClick={() => void act("pc_swap")}
                  className="mt-2.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-[11px] font-bold text-amber-300 disabled:opacity-40"
                >
                  {s.swapBtn}
                </button>
              )}
            </div>
          )}

          {/* تلفن‌چی — هدف برای بازساز */}
          {phoneMode && view.targetBoard && (
            <div className="rounded-2xl border border-fuchsia-500/30 bg-fuchsia-500/[0.06] p-3">
              <p className="text-[11px] font-black text-fuchsia-300">{s.targetLabel}</p>
              <p className="mt-1 text-[11px] leading-5 text-zinc-400">{s.phoneNote}</p>
              <SceneCanvas
                board={view.targetBoard}
                editable={false}
                activeIdx={null}
                onActivate={() => undefined}
                onMove={() => undefined}
                onCycleJoker={() => undefined}
                tone={tone}
              />
            </div>
          )}

          {/* صحنه */}
          <SceneCanvas
            board={board}
            editable={isArranger}
            activeIdx={activeIdx}
            onActivate={setActiveIdx}
            onMove={(idx, x, y) => {
              mutate((b) => {
                const it = b.items[idx];
                if (!it) return;
                it.x = x;
                it.y = y;
                delete it.r;
              });
            }}
            onCycleJoker={cycleJoker}
            tone={tone}
          />

          {/* ابزار چینش‌گر */}
          {isArranger && (
            <>
              <div className="flex items-center gap-2">
                <span className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-2.5 py-1 text-xs font-black tabular-nums text-zinc-300">
                  {board.items.length}/{PC_MAX_CARDS}
                </span>
                <button
                  type="button"
                  onClick={undo}
                  disabled={undoStack.length === 0}
                  className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-2.5 py-1.5 text-xs font-bold text-zinc-300 disabled:opacity-40"
                >
                  <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={delActive}
                  disabled={activeIdx === null}
                  className="rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-xs font-bold text-red-300 disabled:opacity-40"
                >
                  <Eraser className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={clearAll}
                  className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-2.5 py-1.5 text-xs font-bold text-zinc-400"
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                {activeIdx !== null && PC_CARD_MAP.get(board.items[activeIdx]?.k ?? "")?.t === "joker" && (
                  <span className="text-[11px] font-bold text-fuchsia-300">{fa ? "ضربه روی جوکر = شکل بعدی" : "tap joker = next shape"}</span>
                )}
              </div>
              <p className="text-[11px] leading-5 text-zinc-500">{s.placeHint}</p>

              {/* جعبه کارت‌ها */}
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-3">
                <p className="text-[11px] font-black text-zinc-300">{s.trayTitle}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {trayNames.map((k) => (
                    <CardChip key={k} card={PC_CARD_MAP.get(k)!} onClick={() => addCard(k)} />
                  ))}
                </div>
                {trayMods.length > 0 && (
                  <>
                    <p className="mt-3 text-[11px] font-black text-sky-300">{s.trayMods}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {trayMods.map((k) => (
                        <CardChip key={k} card={PC_CARD_MAP.get(k)!} onClick={() => addCard(k)} />
                      ))}
                    </div>
                  </>
                )}
                {trayLinks.length > 0 && (
                  <>
                    <p className="mt-3 text-[11px] font-black text-teal-300">{s.trayLinks}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {trayLinks.map((k) => (
                        <CardChip key={k} card={PC_CARD_MAP.get(k)!} onClick={() => addCard(k)} />
                      ))}
                    </div>
                  </>
                )}
                {trayJokers.length > 0 && (
                  <>
                    <p className="mt-3 text-[11px] font-black text-fuchsia-300">{s.trayJokers}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {trayJokers.map((k) => (
                        <CardChip key={k} card={PC_CARD_MAP.get(k)!} onClick={() => addCard(k)} />
                      ))}
                    </div>
                  </>
                )}
              </div>
            </>
          )}

          {/* ---------- تماشاچی: کمک‌ها، حدس، فید ---------- */}
          {!isArranger && (
            <>
              {/* کمک‌ها */}
              {(view.puzzleWordCount !== null || view.puzzleHintWord) && (
                <div className="flex flex-wrap gap-2">
                  {view.puzzleWordCount !== null && (
                    <span className="rounded-xl border border-sky-500/40 bg-sky-500/10 px-3 py-1.5 text-xs font-bold text-sky-300">
                      {s.wordCount}: {view.puzzleWordCount}
                    </span>
                  )}
                  {view.puzzleHintWord && (
                    <span className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-bold text-amber-300">
                      {s.hintWord}: «{view.puzzleHintWord}»
                    </span>
                  )}
                </div>
              )}

              {/* حدس */}
              {!phoneMode && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void sendGuess();
                  }}
                  className="flex gap-2"
                >
                  <input
                    value={guessText}
                    onChange={(e) => setGuessText(e.target.value)}
                    placeholder={s.guessPlaceholder}
                    maxLength={160}
                    className="min-w-0 flex-1 rounded-xl border border-zinc-800 bg-zinc-950/70 px-4 py-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-sky-500/60"
                  />
                  <button
                    type="submit"
                    disabled={sending || !guessText.trim()}
                    className="rounded-xl bg-sky-500 px-4 py-3 text-sm font-black text-sky-950 transition-colors hover:bg-sky-400 disabled:opacity-50"
                  >
                    <Send className="h-4 w-4" aria-hidden="true" />
                  </button>
                </form>
              )}

              {/* فید حدس‌ها + درست‌گویان */}
              {!phoneMode && (
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70">
                  <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2.5">
                    <p className="text-xs font-black text-zinc-400">{s.guessFeed}</p>
                    <p className="text-xs font-black text-emerald-400">
                      ✓ {view.scorers.filter((x) => x.tier === "full").length}
                    </p>
                  </div>
                  <div ref={feedRef} className="max-h-44 space-y-1.5 overflow-y-auto px-4 py-3">
                    {view.guesses.length === 0 && <p className="text-xs text-zinc-600">—</p>}
                    {view.guesses.map((g) => (
                      <div key={`${g.id}:${g.atMs}`} className="flex items-center justify-between gap-2 text-xs">
                        <span className="truncate text-zinc-400">
                          <b className="text-zinc-300">{g.name}:</b> {g.text}
                        </span>
                        {g.tier === "full" && <span className="font-black text-emerald-400">✓</span>}
                        {g.tier === "near" && <span className="font-black text-amber-400">½</span>}
                        {g.tier === "miss-word" && <span className="font-black text-sky-400">🎯</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ---------- افشا: ضرب‌المثل، تایم‌لپس، واکنش‌ها، رأی ---------- */}
      {reveal && (
        <div className="mt-4 space-y-3">
          {view.puzzle && (
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.06] p-4 text-center">
              <p className="text-[11px] font-bold text-emerald-300">{s.revealTitle}</p>
              <p className="mt-1 text-xl font-black leading-8 text-emerald-100">{view.puzzle}</p>
            </div>
          )}

          {/* تایم‌لپس — آخرین اسنپ‌شات */}
          {view.board && <SceneCanvas board={view.board} editable={false} activeIdx={null} onActivate={() => undefined} onMove={() => undefined} onCycleJoker={() => undefined} tone={tone} />}

          {/* واکنش‌های متحرک */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-3">
            <p className="text-[11px] font-black text-zinc-300">{s.reactionsTitle}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {PC_REACTIONS.map((r) => (
                <button
                  key={r.k}
                  type="button"
                  onClick={() => void act("pc_react", { k: r.k })}
                  title={fa ? r.fa : r.en}
                  className="flex items-center gap-1 rounded-xl border border-zinc-700 bg-zinc-950/60 px-2.5 py-1.5 text-lg transition-colors hover:border-zinc-400 active:scale-95"
                >
                  <span aria-hidden="true" className="pc-motion" data-m={r.m}>
                    {r.e}
                  </span>
                  <span className="text-[10px] font-bold text-zinc-300">{fa ? r.fa : r.en}</span>
                </button>
              ))}
            </div>
            {view.reactions.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {view.reactions.slice(-10).map((r, i) => {
                  const rd = PC_REACTIONS.find((x) => x.k === r.k);
                  return (
                    <span key={`${r.id}:${r.atMs}:${i}`} className="pc-react-float rounded-full bg-zinc-800/80 px-2 py-0.5 text-[11px] text-zinc-300">
                      {rd?.e} {r.name}
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          {/* رأی خلاقیت — برای غیرچینش‌گرها */}
          {!view.isMyTurn && !phoneMode && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] p-3 text-center">
              <p className="text-[11px] font-black text-amber-300">{s.voteTitle}</p>
              {view.myVote > 0 ? (
                <p className="mt-2 text-xs font-bold text-amber-200">{s.voted} · ⭐{view.myVote}</p>
              ) : (
                <div className="mt-2 flex justify-center gap-2">
                  {[1, 2, 3].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => void act("pc_vote", { value: v })}
                      className="rounded-xl border border-amber-500/50 bg-amber-500/10 px-4 py-2 text-sm font-black text-amber-300 hover:border-amber-300"
                    >
                      ⭐{v}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {view.votesTotal > 0 && (
            <p className="text-center text-xs font-bold text-zinc-400">
              {s.votesTotal}: ⭐{view.votesTotal}
            </p>
          )}

          {/* امتیاز زنده */}
          <div className="overflow-hidden rounded-2xl border border-zinc-800">
            {[...view.players]
              .sort((x, y) => y.score - x.score)
              .map((p) => (
                <div
                  key={p.id}
                  className={`flex items-center justify-between border-b border-zinc-800 px-4 py-2 last:border-0 ${p.id === view.arrangerId ? "bg-sky-500/10" : "bg-zinc-950/60"}`}
                >
                  <span className="text-sm font-bold text-zinc-200">
                    {p.id === view.arrangerId ? "🎬 " : ""}
                    {p.name}
                  </span>
                  <span className="text-sm font-black tabular-nums text-amber-300">{p.score}</span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
