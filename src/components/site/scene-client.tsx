"use client";

/* بازی «صحنه‌گردان» — پانتومیم کارتی بدون دوربین.
   کارگردان با کشیدن کارت‌ها صحنه را می‌چیند؛ هر تغییر با دیباounces ~۴۰۰ms
   به سرور می‌رود (فقط مختصات و کلید کارت — چند صد بایت) و تماشاچی‌ها همان
   لحظه از استریم می‌بینند. واژهٔ مخفی فقط برای خود کارگردان می‌آید.
   درگ‌ودراپ با Pointer Events — موبایل و دسکتاپ یکسان. */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronRight,
  Clock,
  Crown,
  Eraser,
  FlipHorizontal,
  Loader2,
  RotateCw,
  Scale,
  Send,
  Sparkles,
  Trash2,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLang } from "@/components/site/language-provider";
import { subscribeStream } from "@/lib/realtime";
import { sfxAmbientStart, sfxAmbientStop, sfxIsMuted, sfxLose, sfxToggleMuted, sfxWin } from "@/lib/arena-sfx";
import {
  SCENE_BG_TONES,
  SCENE_CARD_MAP,
  SCENE_CARDS,
  SCENE_DIFF_LABELS,
  SCENE_FRAME_TITLES,
  SCENE_MAX_CARDS,
  SCENE_MAX_CARDS_PER_FRAME,
  SCENE_MODE_LABELS,
  type SceneBoard,
  type SceneCardCat,
  type SceneCardDef,
  type ScenePlaced,
  type SceneView,
} from "@/lib/scene-shared";
import type { ArenaStateResponse } from "@/lib/types";

/* ---------- ابزارهای محلی ---------- */

function cloneBoard(b: SceneBoard): SceneBoard {
  return { bg: b.bg, frames: b.frames.map((f) => f.map((c) => ({ ...c }))) };
}

function boardCardCount(b: SceneBoard, frameIdx?: number): number {
  if (frameIdx !== undefined) return b.frames[frameIdx]?.length ?? 0;
  return b.frames.reduce((acc, f) => acc + f.length, 0);
}

/* ================================================================
   کارت روی صحنه — مختصات درصدی، چرخش، آینه، اندازه
   ================================================================ */

function StageCard({
  card,
  selected,
  onSelect,
  onDragStart,
  onDragMove,
  onDragEnd,
  interactive,
}: {
  card: ScenePlaced;
  selected: boolean;
  onSelect?: () => void;
  onDragStart?: () => void;
  onDragMove?: (dxPct: number, dyPct: number) => void;
  onDragEnd?: () => void;
  interactive?: boolean;
}) {
  const def = SCENE_CARD_MAP.get(card.k);
  if (!def) return null;
  const ref = useRef<HTMLDivElement>(null);
  const startRef = useRef<{ px: number; py: number } | null>(null);

  return (
    <div
      ref={ref}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onPointerDown={(e) => {
        if (!interactive) return;
        onSelect?.();
        startRef.current = { px: e.clientX, py: e.clientY };
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        onDragStart?.();
      }}
      onPointerMove={(e) => {
        if (!interactive || !startRef.current || !ref.current) return;
        const stage = ref.current.parentElement;
        if (!stage) return;
        const rect = stage.getBoundingClientRect();
        const dx = ((e.clientX - startRef.current.px) / rect.width) * 100;
        const dy = ((e.clientY - startRef.current.py) / rect.height) * 100;
        onDragMove?.(dx, dy);
      }}
      onPointerUp={() => {
        if (!interactive) return;
        startRef.current = null;
        onDragEnd?.();
      }}
      onPointerCancel={() => {
        startRef.current = null;
        onDragEnd?.();
      }}
      className={`absolute flex select-none items-center justify-center rounded-xl ${
        interactive ? "touch-none" : "touch-pan-y"
      } ${
        selected
          ? "z-20 ring-2 ring-fuchsia-400 ring-offset-2 ring-offset-zinc-950"
          : "z-10"
      }`}
      style={{
        left: `${card.x}%`,
        top: `${card.y}%`,
        transform: `translate(-50%, -50%) rotate(${card.r}deg) scaleX(${card.f ? -1 : 1})`,
        fontSize: `${(card.s ?? 1) * 2.6}rem`,
        lineHeight: 1,
      }}
      aria-label={def.fa}
    >
      <span
        className="drop-shadow-[0_2px_6px_rgba(0,0,0,0.55)]"
        style={{ display: card.f ? "inline-block" : undefined, transform: card.f ? "scaleX(-1)" : undefined }}
        aria-hidden="true"
      >
        {def.e}
      </span>
    </div>
  );
}

/* ================================================================
   صحنه — بوم با پس‌زمینهٔ موضوعی
   ================================================================ */

function Stage({
  board,
  frameIdx,
  activeKey,
  onCardSelect,
  onDragStart,
  onDragMove,
  onDragEnd,
  interactive,
}: {
  board: SceneBoard;
  frameIdx: number;
  activeKey: string | null;
  onCardSelect?: (frameIdx: number, idx: number) => void;
  onDragStart?: () => void;
  onDragMove?: (frameIdx: number, idx: number, x: number, y: number) => void; // هدف مطلق
  onDragEnd?: () => void;
  interactive?: boolean;
}) {
  const { lang } = useLang();
  const tone = SCENE_BG_TONES[board.bg] ?? SCENE_BG_TONES[""];
  const bgDef = board.bg ? SCENE_CARD_MAP.get(board.bg) : null;
  const cards = board.frames[frameIdx] ?? [];
  const dragOriginRef = useRef<{ idx: number; x: number; y: number } | null>(null);
  return (
    <div
      dir="ltr"
      className={`relative w-full overflow-hidden rounded-2xl border border-zinc-700/80 shadow-inner ${tone}`}
      style={{ aspectRatio: "16 / 10" }}
    >
      {bgDef && (
        <span className="pointer-events-none absolute top-2 left-2 text-2xl opacity-45" aria-hidden="true">
          {bgDef.e}
        </span>
      )}
      {cards.length === 0 && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm font-bold text-zinc-400/70" dir={lang === "fa" ? "rtl" : "ltr"}>
          {interactive ? "…" : ""}
        </span>
      )}
      {cards.map((c, idx) => (
        <StageCard
          key={`${frameIdx}:${idx}:${c.k}`}
          card={c}
          selected={activeKey === `${frameIdx}:${idx}`}
          interactive={interactive}
          onSelect={interactive ? () => onCardSelect?.(frameIdx, idx) : undefined}
          onDragStart={() => {
            dragOriginRef.current = { idx, x: c.x, y: c.y };
            onDragStart?.();
          }}
          onDragMove={
            interactive
              ? (dx, dy) => {
                  /* هدف مطلق = مبداِ کشیدن + جابه‌جایی انگشت — به کارت لحظه‌ای وابسته نیست */
                  const o = dragOriginRef.current ?? { idx, x: c.x, y: c.y };
                  onDragMove?.(frameIdx, o.idx, o.x + dx, o.y + dy);
                }
              : undefined
          }
          onDragEnd={() => {
            dragOriginRef.current = null;
            onDragEnd?.();
          }}
        />
      ))}
      {/* شمارندهٔ کارت روی صحنه برای تماشاچی */}
      <span className="absolute bottom-2 left-2 rounded-full bg-black/45 px-2 py-0.5 text-[10px] font-bold text-zinc-300" dir="rtl">
        🎬 {cards.length}
      </span>
    </div>
  );
}

/* ================================================================
   جعبه ابزار کارگردان — دسته‌بندی‌ها + پس‌زمینه
   ================================================================ */

function Toolbox({
  toolbox,
  kit,
  onAdd,
  onBg,
  currentBg,
  disabled,
}: {
  toolbox: string[] | null;
  kit: string[] | null;
  onAdd: (key: string) => void;
  onBg: (key: string) => void;
  currentBg: string;
  disabled?: boolean;
}) {
  const { lang } = useLang();
  const [cat, setCat] = useState<SceneCardCat>("actor");
  const cats: { c: SceneCardCat; label: string }[] = [
    { c: "actor", label: lang === "fa" ? "بازیگر" : "Actors" },
    { c: "obj", label: lang === "fa" ? "شیء" : "Objects" },
    { c: "feel", label: lang === "fa" ? "حس" : "Feelings" },
    { c: "shape", label: lang === "fa" ? "شکل" : "Shapes" },
    { c: "bg", label: lang === "fa" ? "پس‌زمینه" : "Background" },
  ];
  const cards = SCENE_CARDS.filter((c) => c.cat === cat).filter((c) => !toolbox || c.cat === "bg" || toolbox.includes(c.k));
  /* کارت‌های پیشنهادیِ هماهنگ با معنی واژه — پین‌شده بالای جعبه ابزار */
  const kitCards = (kit ?? []).map((k) => SCENE_CARD_MAP.get(k)).filter((c): c is SceneCardDef => Boolean(c));
  return (
    <section aria-label={lang === "fa" ? "جعبه ابزار" : "Toolbox"} className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-3">
      {kitCards.length > 0 && (
        <div className="mb-2.5 rounded-xl border border-amber-500/40 bg-amber-500/[0.08] p-2.5">
          <p className="text-[11px] font-black text-amber-300">
            ⭐ {lang === "fa" ? "پیشنهادی برای این واژه — متناسب با معنی‌اش" : "Suggested for this word"}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {kitCards.map((c) => {
              const isBg = c.cat === "bg";
              const active = isBg && currentBg === c.k;
              return (
                <button
                  key={`kit:${c.k}`}
                  type="button"
                  disabled={disabled}
                  onClick={() => (isBg ? onBg(c.k) : onAdd(c.k))}
                  title={lang === "fa" ? c.fa : c.en}
                  aria-label={lang === "fa" ? c.fa : c.en}
                  className={`flex items-center gap-1 rounded-lg border px-2 py-1.5 text-lg transition-colors disabled:opacity-40 ${
                    active ? "border-amber-400 bg-amber-400/20" : "border-amber-500/50 bg-zinc-950/60 hover:border-amber-300"
                  }`}
                >
                  <span aria-hidden="true">{c.e}</span>
                  <span className="text-[9px] font-bold text-amber-200/90">{lang === "fa" ? c.fa : c.en}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        {cats.map(({ c, label }) => (
          <button
            key={c}
            type="button"
            aria-pressed={cat === c}
            onClick={() => setCat(c)}
            className={`rounded-lg border px-2.5 py-1.5 text-xs font-bold transition-colors ${
              cat === c
                ? "border-fuchsia-500/60 bg-fuchsia-500/10 text-fuchsia-200"
                : "border-zinc-800 bg-zinc-950/40 text-zinc-400"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="mt-2.5 grid grid-cols-6 gap-1.5 sm:grid-cols-9 lg:grid-cols-11">
        {cards.map((c) => {
          const isBg = c.cat === "bg";
          const active = isBg && currentBg === c.k;
          return (
            <button
              key={c.k}
              type="button"
              disabled={disabled}
              onClick={() => (isBg ? onBg(c.k) : onAdd(c.k))}
              title={lang === "fa" ? c.fa : c.en}
              aria-label={lang === "fa" ? c.fa : c.en}
              className={`flex aspect-square flex-col items-center justify-center rounded-lg border text-xl transition-colors disabled:opacity-40 ${
                active
                  ? "border-amber-400/70 bg-amber-400/15"
                  : "border-zinc-800 bg-zinc-950/60 hover:border-zinc-600 hover:bg-zinc-900"
              }`}
            >
              <span aria-hidden="true">{c.e}</span>
              <span className="mt-0.5 text-[8px] font-bold leading-none text-zinc-400">
                {lang === "fa" ? c.fa : c.en}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/* ================================================================
   تایم‌لپس افشا — پخش اسنپ‌شات‌های چیدمان
   ================================================================ */

function Timelapse({ history }: { history: SceneBoard[] }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (history.length < 2) return;
    const id = setInterval(() => setI((x) => (x + 1) % history.length), 420);
    return () => clearInterval(id);
  }, [history.length]);
  const board = history[Math.min(i, history.length - 1)];
  if (!board) return null;
  return (
    <div className="relative">
      <Stage board={board} frameIdx={0} activeKey={null} />
      <span className="absolute top-2 right-2 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-black text-zinc-300">
        ⏱ {i + 1}/{history.length}
      </span>
    </div>
  );
}

/* ================================================================
   بازی — صحنه‌گردان
   ================================================================ */

export function SceneClient({ st, offsetMs }: { st: ArenaStateResponse; offsetMs: number }) {
  const { t, lang } = useLang();
  const s = t.arena.scene;
  const view = st.scene;
  const code = st.room.code;
  const me = st.me;

  const [tick, setTick] = useState(0);
  const [sending, setSending] = useState(false);
  const [guess, setGuess] = useState("");
  const [flash, setFlash] = useState<{ kind: "ok" | "bad" | "info"; text: string } | null>(null);
  const [frameIdx, setFrameIdx] = useState(0);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const stingerRef = useRef("");
  const aliveRef = useRef(true);

  /* پیش‌نویس کارگردان — تا sync بعدی، منبع حقیقت محلی */
  const [draft, setDraft] = useState<SceneBoard | null>(null);
  const draftRoundRef = useRef<number>(-1);
  const undoStackRef = useRef<SceneBoard[]>([]);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);
  const guessFeedRef = useRef<HTMLDivElement>(null);

  const numFmt = useCallback((n: number) => new Intl.NumberFormat(lang === "fa" ? "fa-IR" : "en-US").format(n), [lang]);

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
    const id = setTimeout(() => setFlash(null), flash.kind === "ok" ? 3000 : 3800);
    return () => clearTimeout(id);
  }, [flash]);

  /* استریم اتاق — تغییرها (چیدمان، حدس‌ها، فازها) همان لحظه می‌رسند */
  useEffect(() => {
    const unsub = subscribeStream("room", code, {});
    return () => unsub();
  }, [code]);

  /* فید حدس‌ها — اسکرول به آخر */
  useEffect(() => {
    guessFeedRef.current?.scrollTo({ top: guessFeedRef.current.scrollHeight });
  }, [view?.guesses.length]);

  /* سینک پیش‌نویس با سرور — هر تغییر کارگردان با دیبای ۴۰۰ms می‌رود */
  const flushSync = useCallback(
    (board: SceneBoard) => {
      void fetch(`/api/arena/rooms/${encodeURIComponent(code)}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "scene_set", board }),
      }).catch(() => undefined);
      dirtyRef.current = false;
    },
    [code],
  );

  const scheduleSync = useCallback(
    (board: SceneBoard) => {
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
      undoStackRef.current = [];
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
  const remainingMs = Math.max(0, view.phaseEnds - now);
  const remainSec = Math.ceil(remainingMs / 1000);
  const beforeStart = now < view.startedAtMs && view.seq <= 1;
  const isDirector = view.isMyTurn && view.phase === "build";
  const mode = view.mode;
  const frameTitles = SCENE_FRAME_TITLES[mode];
  const solvedCount = view.solvedCount;

  /* پیش‌نویس فعال کارگردان یا صحنهٔ سرور برای تماشاچی */
  const board = isDirector && draft ? draft : view.board;
  if (!board) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-600" aria-hidden="true" />
      </div>
    );
  }
  const myFrameCount = view.frameCount;
  const safeFrameIdx = Math.min(frameIdx, myFrameCount - 1);
  const budgetOf = isDirector
    ? myFrameCount === 3
      ? `${boardCardCount(board, safeFrameIdx)}/${SCENE_MAX_CARDS_PER_FRAME}`
      : `${boardCardCount(board)}/${SCENE_MAX_CARDS}`
    : `${view.cardCount}`;

  /* --- اعمال کارگردان روی پیش‌نویس --- */
  const pushUndo = (b: SceneBoard) => {
    undoStackRef.current.push(cloneBoard(b));
    if (undoStackRef.current.length > 30) undoStackRef.current.shift();
  };

  const mutate = (fn: (b: SceneBoard) => void) => {
    if (!isDirector || !draft) return;
    pushUndo(draft);
    const next = cloneBoard(draft);
    fn(next);
    setDraft(next);
    scheduleSync(next);
  };

  function addCard(key: string) {
    if (!isDirector || !draft) return;
    const frame = draft.frames[safeFrameIdx] ?? [];
    const cap = myFrameCount === 3 ? SCENE_MAX_CARDS_PER_FRAME : SCENE_MAX_CARDS;
    if (frame.length >= cap) {
      setFlash({ kind: "info", text: lang === "fa" ? "سقف کارت این کادر پر است" : "Frame card budget is full" });
      return;
    }
    mutate((b) => {
      const n = (b.frames[safeFrameIdx] ?? []).length;
      b.frames[safeFrameIdx].push({
        k: key,
        x: 30 + ((n * 19) % 44),
        y: 34 + ((n * 27) % 34),
        r: 0,
      });
    });
  }

  function setBg(key: string) {
    mutate((b) => {
      b.bg = b.bg === key ? "" : key;
    });
  }

  function cardOp(op: "rot" | "flip" | "scale" | "del" | "front") {
    if (!activeKey || !draft) return;
    const [f, i] = activeKey.split(":").map(Number);
    mutate((b) => {
      const arr = b.frames[f];
      const c = arr[i];
      if (!c) return;
      if (op === "rot") c.r = ((c.r + 45 + 180) % 360) - 180;
      if (op === "flip") c.f = !c.f;
      if (op === "scale") c.s = c.s === 2 ? 1 : c.s === 1 ? 1.5 : 2;
      if (op === "del") arr.splice(i, 1);
      if (op === "front") arr.push(arr.splice(i, 1)[0]);
    });
    if (op === "del") setActiveKey(null);
  }

  function undo() {
    const prev = undoStackRef.current.pop();
    if (!prev || !draft) return;
    setDraft(prev);
    scheduleSync(prev);
  }

  function clearFrame() {
    mutate((b) => {
      b.frames[safeFrameIdx] = [];
    });
    setActiveKey(null);
  }

  /* --- حدس --- */
  async function submitGuess() {
    const text = guess.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/arena/rooms/${encodeURIComponent(code)}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "scene_guess", text }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; correct?: boolean; points?: number; error?: string };
      if (!aliveRef.current) return;
      if (res.ok && data.ok) {
        if (data.correct) {
          setFlash({ kind: "ok", text: s.guessedOk.replace("{p}", numFmt(data.points ?? 0)) });
          setGuess("");
        } else {
          setFlash({ kind: "info", text: s.guessedBad });
        }
      } else if (data.error === "already") {
        setFlash({ kind: "info", text: s.alreadyGuessed });
      } else if (data.error === "director") {
        setFlash({ kind: "info", text: s.directorNoGuess });
      } else {
        setFlash({ kind: "bad", text: s.sendError });
      }
    } catch {
      if (aliveRef.current) setFlash({ kind: "bad", text: s.sendError });
    } finally {
      if (aliveRef.current) setSending(false);
    }
  }

  async function playAgain() {
    setSending(true);
    try {
      await fetch(`/api/arena/rooms/${encodeURIComponent(code)}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "again" }),
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
        <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-b from-amber-500/10 to-transparent p-6 text-center">
          <p className="text-sm font-bold text-amber-300">{s.finishedTitle}</p>
          <h2 className="mt-2 text-2xl font-black text-amber-100">
            <Crown className="me-1.5 inline h-6 w-6 text-amber-400" aria-hidden="true" />
            {champion ? `${champion.name} — ${s.champion}` : s.champion}
          </h2>
          {/* جوایز طنز */}
          <div className="mt-5 grid gap-2.5 sm:grid-cols-3">
            {[
              { icon: "🎬", label: s.awardOscar, w: awards.oscar },
              { icon: "🦅", label: s.awardEagle, w: awards.eagle },
              { icon: "🎨", label: s.awardMini, w: awards.mini },
            ].map(({ icon, label, w }) => (
              <div
                key={label}
                className={`rounded-xl border p-3 text-center ${
                  w ? "border-fuchsia-500/40 bg-fuchsia-500/[0.08]" : "border-zinc-800 bg-zinc-900/50 opacity-50"
                }`}
              >
                <span className="text-xl" aria-hidden="true">{icon}</span>
                <p className="mt-1 text-[11px] font-bold text-zinc-400">{label}</p>
                <p className="mt-0.5 text-sm font-black text-zinc-100">{w ? w.name : "—"}</p>
                {w && <p className="text-[10px] text-zinc-500">{w.detail}</p>}
              </div>
            ))}
          </div>
          {!awards.oscar && !awards.eagle && !awards.mini && (
            <p className="mt-3 text-xs text-zinc-500">{s.noAwards}</p>
          )}
        </div>

        <section className="mt-5 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
          <p className="text-sm font-bold text-zinc-300">{s.scoresTitle}</p>
          <ul className="mt-3 space-y-1.5">
            {view.result.rows.map((row) => (
              <li
                key={row.id}
                className={`flex items-center justify-between rounded-xl border px-3.5 py-2.5 ${
                  row.id === me ? "border-violet-500/40 bg-violet-500/10" : "border-zinc-800 bg-zinc-950/40"
                }`}
              >
                <span className="flex items-center gap-2 text-sm font-bold text-zinc-200">
                  <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-zinc-800 px-1.5 text-xs font-black text-zinc-300">
                    {numFmt(row.rank)}
                  </span>
                  {row.name}
                  {row.id === me && <span className="text-[10px] text-zinc-500">({lang === "fa" ? "تو" : "you"})</span>}
                </span>
                <span className="text-sm font-black tabular-nums text-amber-300">{numFmt(row.score)}</span>
              </li>
            ))}
          </ul>
        </section>

        {st.room.hostId === me && (
          <Button
            onClick={playAgain}
            disabled={sending}
            className="mt-6 h-12 w-full rounded-xl bg-fuchsia-500 text-base font-bold text-zinc-950 hover:bg-fuchsia-400"
          >
            {sending ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <RotateCw className="h-5 w-5" aria-hidden="true" />}
            {lang === "fa" ? "مسابقه دوباره" : "Play again"}
          </Button>
        )}
      </div>
    );
  }

  const modeLabel = SCENE_MODE_LABELS[mode][lang === "fa" ? "fa" : "en"];
  const diffLabel = SCENE_DIFF_LABELS[view.difficulty]?.[lang === "fa" ? "fa" : "en"] ?? view.difficulty;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6" dir="rtl">
      {/* سربرگ */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-lg font-extrabold text-zinc-50">
            <Sparkles className="h-5 w-5 text-fuchsia-400" aria-hidden="true" />
            {lang === "fa" ? "صحنه‌گردان" : "Scene Director"}
            <span className="rounded-full border border-fuchsia-500/40 bg-fuchsia-500/10 px-2 py-0.5 text-[10px] font-black text-fuchsia-300">
              {modeLabel}
            </span>
            <span
              className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-black text-amber-300"
              title={s.firstPointsLine.replace("{p}", numFmt(view.firstPoints))}
            >
              {diffLabel} · {numFmt(view.firstPoints)}
            </span>
          </h1>
          <p className="mt-1 text-xs text-zinc-500">
            {s.round} {numFmt(view.round)} {s.of} {numFmt(view.totalRounds)}
            {" · "}
            {s.directorTurn}: <b className="text-zinc-300">{view.directorName}</b>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMuted(sfxToggleMuted())}
            aria-label={lang === "fa" ? "صدا" : "sound"}
            className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-2 text-zinc-400"
          >
            {muted ? "🔇" : "🔊"}
          </button>
          <span
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm font-black tabular-nums ${
              view.phase === "reveal" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-amber-500/40 bg-amber-500/10 text-amber-300"
            }`}
          >
            <Clock className="h-4 w-4" aria-hidden="true" />
            {beforeStart ? "…" : numFmt(remainSec)}
          </span>
        </div>
      </div>

      {/* نوار وضعیت فاز */}
      <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3">
        {view.phase === "build" ? (
          isDirector ? (
            <p className="flex items-center justify-between gap-2 text-sm font-bold text-fuchsia-200">
              <span>
                🎬 {s.yourTurn} — {s.wordLabel}:
                <span className="ms-1 inline-flex rounded-lg bg-fuchsia-500/15 px-2.5 py-1 text-base font-black text-fuchsia-100">
                  {view.word ?? "؟"}
                </span>
              </span>
              <span className="shrink-0 text-[11px] font-bold text-zinc-400" dir="ltr">
                {budgetOf}
              </span>
            </p>
          ) : (
            <p className="flex items-center justify-between gap-2 text-sm font-bold text-zinc-300">
              <span>👀 {s.watchTitle}</span>
              {solvedCount > 0 && (
                <span className="shrink-0 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-black text-emerald-300">
                  {s.solvedBy.replace("{n}", numFmt(solvedCount))}
                </span>
              )}
            </p>
          )
        ) : (
          <p className="text-sm font-bold text-emerald-200">
            {s.revealTitle}:
            <span className="ms-1.5 text-lg font-black text-emerald-100">«{view.word ?? "؟"}»</span>
            {solvedCount > 0 && (
              <span className="ms-2 text-[11px] font-bold text-zinc-400">
                {s.solvedBy.replace("{n}", numFmt(solvedCount))}
              </span>
            )}
          </p>
        )}
      </div>

      {beforeStart && (
        <p className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/[0.07] px-4 py-2.5 text-center text-xs font-bold text-amber-200">
          {s.startingIn}
        </p>
      )}

      {flash && (
        <p
          className={`mt-3 rounded-xl px-4 py-2.5 text-center text-sm font-bold ${
            flash.kind === "ok"
              ? "bg-emerald-500/15 text-emerald-200"
              : flash.kind === "bad"
                ? "bg-rose-500/10 text-rose-300"
                : "bg-zinc-800 text-zinc-300"
          }`}
        >
          {flash.text}
        </p>
      )}

      {/* صحنه — کلاسیک یک کادر؛ ۳کادری تب‌ها */}
      <div className="mt-4">
        {myFrameCount === 3 && (
          <div className="mb-2 grid grid-cols-3 gap-1.5">
            {frameTitles.map((ft, i) => (
              <button
                key={i}
                type="button"
                aria-pressed={safeFrameIdx === i}
                onClick={() => {
                  setFrameIdx(i);
                  setActiveKey(null);
                }}
                className={`rounded-xl border px-2 py-2 text-[11px] font-bold transition-colors ${
                  safeFrameIdx === i
                    ? "border-fuchsia-500/60 bg-fuchsia-500/10 text-fuchsia-200"
                    : "border-zinc-800 bg-zinc-950/40 text-zinc-400"
                }`}
              >
                {lang === "fa" ? ft : `Frame ${i + 1}`}
              </button>
            ))}
          </div>
        )}

        {view.phase === "reveal" && view.history && view.history.length > 1 ? (
          <Timelapse history={view.history} />
        ) : (
          <Stage
            board={board}
            frameIdx={safeFrameIdx}
            activeKey={activeKey}
            interactive={isDirector}
            onCardSelect={(f, idx) => setActiveKey(`${f}:${idx}`)}
            onDragStart={() => undefined}
            onDragMove={(f, idx, x, y) => {
              if (!draft) return;
              const arr = draft.frames[f];
              const c = arr?.[idx];
              if (!c) return;
              c.x = Math.min(98, Math.max(2, x));
              c.y = Math.min(98, Math.max(2, y));
              setDraft(cloneBoard(draft));
              dirtyRef.current = true;
            }}
            onDragEnd={() => {
              if (draft && dirtyRef.current) scheduleSync(draft);
            }}
          />
        )}
        {view.phase === "build" && <p className="mt-2 text-center text-[11px] leading-5 text-zinc-500">{s.selectHint}</p>}
        {view.phase === "reveal" && view.history && view.history.length > 1 && (
          <p className="mt-2 text-center text-[11px] font-bold text-zinc-500">🎞 {s.timelapse}</p>
        )}
      </div>

      {/* ابزار کارت انتخاب‌شده */}
      {isDirector && activeKey && (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5 rounded-xl border border-fuchsia-500/30 bg-fuchsia-500/[0.06] p-2">
          {[
            { op: "rot" as const, icon: <RotateCw className="h-4 w-4" />, label: s.rotate },
            { op: "flip" as const, icon: <FlipHorizontal className="h-4 w-4" />, label: s.flip },
            { op: "scale" as const, icon: <Scale className="h-4 w-4" />, label: s.scale },
            { op: "front" as const, icon: <ChevronRight className="h-4 w-4" />, label: lang === "fa" ? "جلوبیار" : "Front" },
            { op: "del" as const, icon: <Trash2 className="h-4 w-4" />, label: s.delete },
          ].map(({ op, icon, label }) => (
            <button
              key={op}
              type="button"
              onClick={() => cardOp(op)}
              aria-label={label}
              className="flex items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-950/60 px-2.5 py-1.5 text-[11px] font-bold text-zinc-200 hover:border-zinc-500"
            >
              {icon}
              {label}
            </button>
          ))}
          <button
            type="button"
            onClick={undo}
            aria-label={s.undo}
            className="flex items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-950/60 px-2.5 py-1.5 text-[11px] font-bold text-zinc-200 hover:border-zinc-500"
          >
            <Undo2 className="h-4 w-4" />
            {s.undo}
          </button>
          <button
            type="button"
            onClick={clearFrame}
            aria-label={s.clear}
            className="flex items-center gap-1 rounded-lg border border-rose-500/40 bg-rose-500/10 px-2.5 py-1.5 text-[11px] font-bold text-rose-300"
          >
            <Eraser className="h-4 w-4" />
            {s.clear}
          </button>
        </div>
      )}

      {/* جعبه ابزار — فقط کارگردان در فاز چیدمان */}
      {isDirector && (
        <div className="mt-3">
          <Toolbox toolbox={view.toolbox} kit={view.kit} onAdd={addCard} onBg={setBg} currentBg={board.bg} />
        </div>
      )}

      {/* حدس + فید — تماشاچی‌ها در فاز چیدمان */}
      {!isDirector && view.phase === "build" && (
        <div className="mt-4">
          <div className="flex gap-2">
            <input
              value={guess}
              onChange={(e) => setGuess(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submitGuess();
              }}
              maxLength={120}
              placeholder={s.guessPh}
              aria-label={s.guessBtn}
              className="h-12 flex-1 rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 text-sm font-bold text-zinc-100 outline-none focus:border-fuchsia-500/60"
            />
            <Button
              onClick={() => void submitGuess()}
              disabled={sending || !guess.trim()}
              className="h-12 rounded-xl bg-fuchsia-500 px-5 font-bold text-zinc-950 hover:bg-fuchsia-400 disabled:opacity-50"
            >
              {sending ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Send className="h-5 w-5" aria-hidden="true" />}
              {s.guessBtn}
            </Button>
          </div>
        </div>
      )}

      {/* فید حدس‌ها */}
      <section className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3">
        <p className="text-xs font-bold text-zinc-400">💬 {s.guessesTitle}</p>
        <div ref={guessFeedRef} className="mt-2 max-h-40 space-y-1.5 overflow-y-auto">
          {view.guesses.length === 0 ? (
            <p className="py-3 text-center text-xs text-zinc-600">{s.noGuesses}</p>
          ) : (
            view.guesses.map((g, i) => (
              <p key={i} className="rounded-lg bg-zinc-950/50 px-3 py-1.5 text-xs text-zinc-300">
                <b className="text-zinc-100">{g.name}</b>: {g.text}
              </p>
            ))
          )}
        </div>
      </section>

      {/* امتیاز زنده */}
      <section className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3">
        <p className="text-xs font-bold text-zinc-400">{s.scoresTitle}</p>
        <ul className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {[...view.players]
            .sort((a, b) => b.score - a.score)
            .map((p) => (
              <li
                key={p.id}
                className={`flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-xs font-bold ${
                  p.id === me ? "border-violet-500/40 bg-violet-500/10 text-violet-200" : "border-zinc-800 bg-zinc-950/40 text-zinc-300"
                }`}
              >
                <span className="truncate">{p.name}</span>
                <span className="ms-1.5 shrink-0 tabular-nums text-amber-300">{numFmt(p.score)}</span>
              </li>
            ))}
        </ul>
      </section>
    </div>
  );
}
