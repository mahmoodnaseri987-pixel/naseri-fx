"use client";

/* ================================================================
   رنگ‌باز — میز بازی نئونی (نسخهٔ گرافیکی کامل)
   سالن شبانه: شفق قطبی متحرک به‌رنگ فعال میز، میز مخملی با لبهٔ
   نورانی و حلقهٔ جهت، کارت‌های طرح بیضی کلاسیک با آیکون SVG،
   صندلی‌های آواتاری با حلقهٔ تایمر، انیمیشن پخش/فرود/پرتاب جریمه،
   موج رنگ، کونفتی پیروزی و افکت صوتی سنتزشده.
   ================================================================ */

import { useEffect, useMemo, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import {
  RB_COLOR_META,
  RB_COLORS,
  type RbCard,
  type RbColor,
  type RbView,
} from "@/lib/rangbaz-shared";
import {
  sfxAmbientStart,
  sfxAmbientStop,
  sfxCapture,
  sfxDing,
  sfxHop,
  sfxIsMuted,
  sfxLose,
  sfxToggleMuted,
  sfxWin,
} from "@/lib/arena-sfx";

export type RbTableProps = {
  view: RbView;
  fa: boolean;
  busy: boolean;
  onPlay: (cardId: string, opts?: { color?: RbColor; targetId?: string; call?: boolean }) => void;
  onDrawPass: () => void;
  onCall?: () => void;
  onCatch?: () => void;
  onAgain?: () => void;
  header?: React.ReactNode;
  footer?: React.ReactNode;
};

const RB_TABLE_CSS = `
@keyframes rbAuroraA { 0%,100% { transform: translate(-12%, -8%) scale(1); } 50% { transform: translate(10%, 6%) scale(1.25); } }
@keyframes rbAuroraB { 0%,100% { transform: translate(10%, 10%) scale(1.15); } 50% { transform: translate(-8%, -6%) scale(.9); } }
@keyframes rbFloat { 0% { transform: translateY(0) scale(1); opacity: .35; } 50% { transform: translateY(-30px) scale(1.3); opacity: .9; } 100% { transform: translateY(0) scale(1); opacity: .35; } }
@keyframes rbSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
@keyframes rbSpinR { from { transform: rotate(0deg); } to { transform: rotate(-360deg); } }
@keyframes rbPulseRose { 0%,100% { box-shadow: 0 0 0 0 rgba(244,63,94,.55); } 50% { box-shadow: 0 0 0 16px rgba(244,63,94,0); } }
@keyframes rbPopIn { from { transform: scale(.55) translateY(14px); opacity: 0; } to { transform: scale(1) translateY(0); opacity: 1; } }
@keyframes rbLand { 0% { transform: translateY(-110px) rotate(13deg) scale(1.18); opacity: 0; } 55% { opacity: 1; } 78% { transform: translateY(6px) rotate(-2deg) scale(.97); } 100% { transform: none; opacity: 1; } }
@keyframes rbWave { from { transform: scale(.25); opacity: .85; } to { transform: scale(2.6); opacity: 0; } }
@keyframes rbThrow { 0% { transform: translate(0, 0) rotate(0deg) scale(.6); opacity: 0; } 12% { opacity: 1; } 100% { transform: translate(var(--tx), var(--ty)) rotate(var(--rot)) scale(1); opacity: 0; } }
@keyframes rbDeal { from { transform: translateY(46px) rotate(8deg) scale(.7); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes rbFall { 0% { transform: translateY(-8vh) rotate(0deg); opacity: 1; } 100% { transform: translateY(108vh) rotate(720deg); opacity: .15; } }
@keyframes rbWinGlow { 0%,100% { filter: drop-shadow(0 0 8px rgba(251,191,36,.7)); transform: scale(1); } 50% { filter: drop-shadow(0 0 26px rgba(251,191,36,1)); transform: scale(1.08); } }
@keyframes rbBreathe { 0%,100% { opacity: .75; } 50% { opacity: 1; } }
.rb-part { position: absolute; border-radius: 9999px; pointer-events: none; animation: rbFloat linear infinite; }
.rb-glass { background: linear-gradient(160deg, rgba(20,18,34,.78), rgba(10,10,20,.72)); backdrop-filter: blur(12px); border: 1px solid rgba(148,163,184,.14); }
.rb-cardface { transition: transform .16s ease, box-shadow .16s ease, filter .16s ease; will-change: transform; }
.rb-newcard { outline: 2px solid rgba(52,211,153,.9); outline-offset: 2px; filter: drop-shadow(0 0 14px rgba(52,211,153,.5)); }
`;

/* ---------- آیکون‌های SVG کارت‌ها ---------- */

function SkipIcon({ size = 1 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={30 * size} height={30 * size} aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="3.2" />
      <line x1="5.6" y1="18.4" x2="18.4" y2="5.6" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
    </svg>
  );
}

function ReverseIcon({ size = 1 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={30 * size} height={30 * size} aria-hidden="true">
      <path d="M4 8.5h12.5l-3.4-3.4" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 15.5H7.5l3.4 3.4" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function WildDot({ size = 1 }: { size?: number }) {
  const s = 26 * size;
  return (
    <span
      className="inline-block rounded-full border-[2.5px] border-white"
      style={{
        width: s,
        height: s,
        background: "conic-gradient(#f43f5e 0deg 90deg, #fbbf24 90deg 180deg, #34d399 180deg 270deg, #38bdf8 270deg 360deg)",
        boxShadow: "0 1px 4px rgba(0,0,0,.35)",
      }}
      aria-hidden="true"
    />
  );
}

/* ---------- کارت رو ---------- */

export function RbCardArt({ card, size = 1 }: { card: RbCard; size?: number }) {
  const w = 66 * size;
  const h = 96 * size;
  const isWild = card.k === "wild" || card.k === "wild4";
  const meta = card.c ? RB_COLOR_META[card.c] : null;
  const hex = meta?.hex ?? "#a78bfa";
  const glow = meta?.glow ?? "167,139,250";

  const center: React.ReactNode =
    card.k === "num" ? (
      <span
        className="font-black leading-none"
        style={{
          fontSize: 34 * size,
          color: hex,
          textShadow: `${2.5 * size}px ${2.5 * size}px 0 rgba(10,10,22,.3)`,
          transform: "skewX(-6deg)",
        }}
      >
        {card.n}
      </span>
    ) : card.k === "skip" ? (
      <span style={{ color: hex, filter: "drop-shadow(1.5px 1.5px 0 rgba(10,10,22,.3))" }}>
        <SkipIcon size={size} />
      </span>
    ) : card.k === "reverse" ? (
      <span style={{ color: hex, filter: "drop-shadow(1.5px 1.5px 0 rgba(10,10,22,.3))" }}>
        <ReverseIcon size={size} />
      </span>
    ) : card.k === "draw2" ? (
      <span
        className="font-black leading-none"
        style={{ fontSize: 30 * size, color: hex, textShadow: `${2 * size}px ${2 * size}px 0 rgba(10,10,22,.3)`, transform: "skewX(-6deg)" }}
      >
        +2
      </span>
    ) : card.k === "wild4" ? (
      <span
        className="font-black leading-none"
        style={{ fontSize: 26 * size, color: "#111827", textShadow: "1.5px 1.5px 0 rgba(255,255,255,.6)" }}
      >
        +4
      </span>
    ) : card.k === "wild" ? (
      <WildDot size={size} />
    ) : (
      <span style={{ fontSize: 26 * size }} aria-hidden="true">
        {card.k === "mirror" ? "🪞" : card.k === "swap" ? "🤝" : "🌫"}
      </span>
    );

  const cornerLabel =
    card.k === "num"
      ? String(card.n)
      : card.k === "draw2"
        ? "+2"
        : card.k === "wild4"
          ? "+4"
          : card.k === "skip"
            ? "⊘"
            : card.k === "reverse"
              ? "⇄"
              : card.k === "wild"
                ? "◆"
                : card.k === "mirror"
                  ? "🪞"
                  : card.k === "swap"
                    ? "🤝"
                    : "🌫";

  return (
    <div
      className="rb-cardface relative shrink-0 overflow-hidden rounded-[11px]"
      style={{
        width: w,
        height: h,
        background: isWild
          ? "linear-gradient(160deg, rgba(8,8,16,.55), rgba(8,8,16,.2)), conic-gradient(from 45deg, #f43f5e 0deg 90deg, #fbbf24 90deg 180deg, #34d399 180deg 270deg, #38bdf8 270deg 360deg)"
          : `linear-gradient(152deg, ${hex}f2 0%, ${hex} 42%, ${hex}b8 100%)`,
        border: "2.5px solid rgba(255,255,255,.95)",
        boxShadow: `0 6px 16px rgba(2,2,10,.5), 0 0 ${12 * size}px rgba(${glow},.4), inset 0 1px 0 rgba(255,255,255,.35)`,
      }}
    >
      {/* برق سطح کارت */}
      <span
        className="pointer-events-none absolute inset-0"
        style={{ background: "linear-gradient(120deg, rgba(255,255,255,.28) 0%, transparent 32%)" }}
      />
      {/* بیضی سفید کلاسیک */}
      <span
        className="pointer-events-none absolute left-1/2 top-1/2"
        style={{
          width: w * 1.32,
          height: h * 0.5,
          transform: "translate(-50%, -50%) rotate(-27deg)",
          borderRadius: "999px",
          background: "rgba(255,255,255,.94)",
          boxShadow: "inset 0 0 0 2px rgba(0,0,0,.07)",
        }}
      />
      {/* محتوای مرکزی */}
      <span className="absolute inset-0 flex items-center justify-center">{center}</span>
      {/* برچسب گوشه‌ها */}
      <span
        className="absolute left-1 top-0.5 font-black text-white"
        style={{ fontSize: 12 * size, textShadow: "1px 1px 0 rgba(10,10,22,.4)" }}
      >
        {cornerLabel}
      </span>
      <span
        className="absolute bottom-0.5 right-1 font-black text-white"
        style={{ fontSize: 12 * size, textShadow: "1px 1px 0 rgba(10,10,22,.4)", transform: "rotate(180deg)" }}
      >
        {cornerLabel}
      </span>
    </div>
  );
}

/* ---------- کارت پشت ---------- */

export function RbCardBackArt({ size = 1 }: { size?: number }) {
  const w = 66 * size;
  const h = 96 * size;
  return (
    <div
      className="rb-cardface relative shrink-0 overflow-hidden rounded-[11px]"
      style={{
        width: w,
        height: h,
        background: "linear-gradient(150deg, #221a4e 0%, #120f2e 55%, #0a0920 100%)",
        border: "2.5px solid rgba(167,139,250,.85)",
        boxShadow: "0 6px 16px rgba(2,2,10,.5), 0 0 12px rgba(139,92,246,.35), inset 0 1px 0 rgba(255,255,255,.12)",
      }}
    >
      <span
        className="pointer-events-none absolute inset-0"
        style={{ background: "repeating-linear-gradient(45deg, rgba(139,92,246,.16) 0 9px, transparent 9px 18px)" }}
      />
      <span
        className="pointer-events-none absolute left-1/2 top-1/2"
        style={{
          width: w * 1.34,
          height: h * 0.52,
          transform: "translate(-50%, -50%) rotate(-27deg)",
          borderRadius: "999px",
          border: "2px solid rgba(196,181,253,.75)",
          background: "rgba(17,14,40,.6)",
        }}
      />
      <span className="absolute inset-0 flex flex-col items-center justify-center gap-1">
        <span className="font-black" style={{ fontSize: 11 * size, color: "#ddd6fe", textShadow: "0 0 8px rgba(167,139,250,.9)" }}>
          رنگ‌باز
        </span>
        <span className="flex gap-1" aria-hidden="true">
          {RB_COLORS.map((c) => (
            <span key={c} className="rounded-full" style={{ width: 5 * size, height: 5 * size, background: RB_COLOR_META[c].hex }} />
          ))}
        </span>
      </span>
    </div>
  );
}

/* ---------- صندلی بازیکن ---------- */

const AVATAR_GRADS = [
  "linear-gradient(140deg,#8b5cf6,#6d28d9)",
  "linear-gradient(140deg,#38bdf8,#1d4ed8)",
  "linear-gradient(140deg,#34d399,#047857)",
  "linear-gradient(140deg,#fbbf24,#b45309)",
  "linear-gradient(140deg,#fb7185,#be123c)",
  "linear-gradient(140deg,#e879f9,#a21caf)",
  "linear-gradient(140deg,#94a3b8,#334155)",
];

function Seat({
  p,
  isTurn,
  fa,
  timerFrac,
  timerColor,
  index,
}: {
  p: RbView["players"][number];
  isTurn: boolean;
  fa: boolean;
  timerFrac: number;
  timerColor: string;
  index: number;
}) {
  const grad = AVATAR_GRADS[index % AVATAR_GRADS.length];
  const R = 21;
  const C = 2 * Math.PI * R;
  return (
    <div
      className="rb-glass relative w-[112px] rounded-2xl px-2 pb-2 pt-2.5 text-center"
      style={{
        borderColor: isTurn ? timerColor : undefined,
        boxShadow: isTurn ? `0 0 0 1.5px ${timerColor}, 0 0 22px ${timerColor}55` : "none",
        animation: isTurn ? "rbBreathe 2s ease-in-out infinite" : undefined,
        opacity: isTurn ? 1 : 0.85,
      }}
    >
      {/* بادبزن کوچک پشت کارت‌ها */}
      <span className="pointer-events-none absolute -top-3 left-1/2 hidden -translate-x-1/2 sm:flex" aria-hidden="true">
        <span style={{ transform: "rotate(-16deg) translateX(10px)" }}>
          <RbCardBackArt size={0.3} />
        </span>
        <span style={{ transform: "translateY(-3px)" }}>
          <RbCardBackArt size={0.3} />
        </span>
        <span style={{ transform: "rotate(16deg) translateX(-10px)" }}>
          <RbCardBackArt size={0.3} />
        </span>
      </span>

      {/* آواتار + حلقهٔ تایمر */}
      <span className="relative mx-auto block h-[52px] w-[52px]">
        <svg viewBox="0 0 48 48" className="absolute inset-0" aria-hidden="true">
          <circle cx="24" cy="24" r={R} fill="none" stroke="rgba(148,163,184,.25)" strokeWidth="3" />
          {isTurn && (
            <circle
              cx="24"
              cy="24"
              r={R}
              fill="none"
              stroke={timerColor}
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - timerFrac)}
              transform="rotate(-90 24 24)"
              style={{ transition: "stroke-dashoffset .5s linear" }}
            />
          )}
        </svg>
        <span
          className="absolute left-1/2 top-1/2 flex h-[40px] w-[40px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-base font-black text-white"
          style={{ background: grad, boxShadow: "inset 0 1px 0 rgba(255,255,255,.3)" }}
        >
          {p.name.slice(0, 1)}
        </span>
        <span
          className="absolute -bottom-0.5 -left-0.5 h-2.5 w-2.5 rounded-full border border-zinc-900"
          style={{ background: p.online === false ? "#71717a" : "#34d399" }}
          title={p.online === false ? (fa ? "آفلاین" : "offline") : fa ? "آنلاین" : "online"}
        />
      </span>

      <p className="mt-1.5 truncate text-[11px] font-black text-zinc-100">{p.name}</p>
      <p className="mt-0.5 text-[10px] font-bold" style={{ color: p.count === null ? "#a78bfa" : "#a1a1aa" }}>
        {p.count === null ? `🌫 ${fa ? "نامعلوم" : "?"}` : `${p.count} ${fa ? "کارت" : "cards"}`}
      </p>
      {isTurn && (
        <span
          className="absolute -top-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-2 py-0.5 text-[9px] font-black text-zinc-950"
          style={{ background: timerColor, boxShadow: `0 0 10px ${timerColor}` }}
        >
          {fa ? "نوبت" : "turn"}
        </span>
      )}
    </div>
  );
}

function useNowTick(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, []);
  return now;
}

/* ---------- میز اصلی ---------- */

export function RangbazTable({ view, fa, busy, onPlay, onDrawPass, onCall, onCatch, onAgain, header, footer }: RbTableProps) {
  const [colorPick, setColorPick] = useState<string | null>(null);
  const [swapPick, setSwapPick] = useState<string | null>(null);
  const [armedCall, setArmedCall] = useState(false);
  const [waveKey, setWaveKey] = useState(0);
  const [throwKey, setThrowKey] = useState(0);
  const [muted, setMuted] = useState(false);
  const [dealOn, setDealOn] = useState(true);
  const [confettiKey, setConfettiKey] = useState(0);
  const nowTick = useNowTick();

  const lastColorRef = useRef<RbColor>(view.color);
  const lastPendRef = useRef(0);
  const lastTopRef = useRef<string | null>(view.top?.id ?? null);
  const lastMyTurnRef = useRef(view.myTurn);
  const lastPhaseRef = useRef(view.phase);
  const dealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setMuted(sfxIsMuted());
  }, []);

  /* موسیقی پس‌زمینه در حین بازی */
  useEffect(() => {
    if (view.phase === "play") sfxAmbientStart();
    else sfxAmbientStop();
    return () => sfxAmbientStop();
  }, [view.phase]);

  /* واکنش‌های صوتی/انیمیشنی به تغییر وضعیت */
  useEffect(() => {
    const topId = view.top?.id ?? null;
    if (topId !== lastTopRef.current) {
      lastTopRef.current = topId;
      sfxHop();
    }
    if (view.color !== lastColorRef.current) {
      lastColorRef.current = view.color;
      setWaveKey((k) => k + 1);
    }
    if (view.pend > lastPendRef.current) {
      setThrowKey((k) => k + 1);
      sfxCapture();
    }
    lastPendRef.current = view.pend;
    if (view.myTurn && !lastMyTurnRef.current) sfxDing();
    lastMyTurnRef.current = view.myTurn;
    if (view.phase === "done" && lastPhaseRef.current === "play") {
      const winnerId = view.result?.rows[0]?.id;
      if (winnerId === view.me) {
        sfxWin();
        setConfettiKey((k) => k + 1);
      } else {
        sfxLose();
      }
    }
    lastPhaseRef.current = view.phase;
  }, [view.top?.id, view.color, view.pend, view.myTurn, view.phase, view.me, view.result]);

  /* انیمیشن پخش فقط در لحظهٔ ورود به میز */
  useEffect(() => {
    dealTimerRef.current = setTimeout(() => setDealOn(false), 1700);
    return () => {
      if (dealTimerRef.current) clearTimeout(dealTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (view.myHand.length !== 2) setArmedCall(false);
  }, [view.myHand.length]);

  const active = view.players.find((p) => p.id === view.cur);
  const others = view.players.filter((p) => p.id !== view.me);
  const victim = view.players.find((p) => p.id === view.cur);
  const colorMeta = RB_COLOR_META[view.color];
  const canCatch = view.callOpen && view.callOpen.id !== view.me && nowTick < view.callOpen.until;
  const showCallBtn = view.myHand.length === 2 && view.myTurn;
  const showLateCall = view.myHand.length === 1 && view.myTurn && !view.callOpen;
  const timerFrac = view.settings.turnMs > 0 ? Math.max(0, Math.min(1, view.turnRemainMs / view.settings.turnMs)) : 0;

  const sortedHand = useMemo(() => {
    const order = (c: RbCard) => (c.c ? RB_COLORS.indexOf(c.c) : 9);
    return [...view.myHand].sort((a, b) => order(a) - order(b) || (a.n ?? 0) - (b.n ?? 0));
  }, [view.myHand]);

  const playCard = (cardId: string) => {
    const card = view.myHand.find((c) => c.id === cardId);
    if (!card) return;
    if (card.k === "wild" || card.k === "wild4") {
      setColorPick(cardId);
      return;
    }
    if (card.k === "swap") {
      setSwapPick(cardId);
      return;
    }
    onPlay(cardId, { call: armedCall });
    setArmedCall(false);
  };

  const particles = useMemo(
    () =>
      Array.from({ length: 16 }, (_, i) => ({
        left: `${(i * 37 + 13) % 100}%`,
        top: `${(i * 53 + 7) % 100}%`,
        size: 2 + ((i * 7) % 4),
        dur: 5 + (i % 5),
        delay: (i % 7) * 0.8,
        color: RB_COLORS[i % 4],
      })),
    [],
  );

  const confetti = useMemo(
    () =>
      Array.from({ length: 40 }, (_, i) => ({
        left: `${(i * 17 + 5) % 100}%`,
        color: RB_COLORS[i % 4],
        dur: 1.6 + ((i * 13) % 12) / 10,
        delay: ((i * 7) % 14) / 10,
        w: 5 + (i % 3) * 2,
      })),
    [],
  );

  /* مقصد پرتاب جریمه — صندلی قربانی */
  const throwTarget = (() => {
    if (!victim) return { tx: "0px", ty: "-140px" };
    if (victim.id === view.me) return { tx: "0px", ty: "170px" };
    const i = others.findIndex((p) => p.id === victim.id);
    const off = (i - (others.length - 1) / 2) * 90;
    return { tx: `${off}px`, ty: "-150px" };
  })();

  return (
    <div className="relative mx-auto min-h-[100svh] w-full max-w-3xl overflow-hidden px-3 pb-8 pt-4 sm:px-6" dir="rtl">
      <style dangerouslySetInnerHTML={{ __html: RB_TABLE_CSS }} />

      {/* سالن نئونی — شفق قطبی به‌رنگ فعال میز */}
      <div className="pointer-events-none absolute inset-0 -z-30" style={{ background: "#05050d" }} />
      <div
        className="pointer-events-none absolute -left-1/4 -top-1/3 -z-20 h-[130%] w-[150%]"
        style={{
          background: `radial-gradient(closest-side, rgba(${colorMeta.glow},.16), transparent 70%)`,
          animation: "rbAuroraA 14s ease-in-out infinite",
          transition: "background 1.2s ease",
        }}
      />
      <div
        className="pointer-events-none absolute -left-1/4 -top-1/3 -z-20 h-[130%] w-[150%]"
        style={{
          background:
            "radial-gradient(closest-side, rgba(99,102,241,.14), transparent 70%), radial-gradient(closest-side, rgba(168,85,247,.1), transparent 72%)",
          animation: "rbAuroraB 18s ease-in-out infinite",
        }}
      />
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        {particles.map((p, i) => (
          <span
            key={i}
            className="rb-part"
            style={{
              left: p.left,
              top: p.top,
              width: p.size,
              height: p.size,
              background: RB_COLOR_META[p.color].hex,
              boxShadow: `0 0 8px rgba(${RB_COLOR_META[p.color].glow},.9)`,
              animationDuration: `${p.dur}s`,
              animationDelay: `${p.delay}s`,
            }}
          />
        ))}
      </div>
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        style={{ background: "radial-gradient(120% 90% at 50% 40%, transparent 55%, rgba(2,2,8,.75) 100%)" }}
      />

      {header}

      {/* صندلی حریف‌ها */}
      <div className="mt-3 flex flex-wrap items-start justify-center gap-2.5">
        {others.map((p, i) => (
          <Seat
            key={p.id}
            p={p}
            isTurn={p.id === view.cur}
            fa={fa}
            index={i + 1}
            timerFrac={p.id === view.cur ? timerFrac : 0}
            timerColor={colorMeta.hex}
          />
        ))}
      </div>

      {/* میز مخملی */}
      <div className="relative mx-auto mt-6">
        <div
          className="pointer-events-none absolute -inset-3 rounded-[46px] border-2 border-dashed sm:-inset-4"
          style={{
            borderColor: `rgba(${colorMeta.glow},.45)`,
            animation: `rbSpin 16s linear infinite ${view.dir === -1 ? "reverse" : "normal"}`,
            transition: "border-color 1s ease",
          }}
        />
        <div
          className="rb-glass relative overflow-hidden rounded-[40px] px-4 py-7 sm:px-8"
          style={{
            background: `radial-gradient(120% 130% at 50% 42%, rgba(${colorMeta.glow},.15) 0%, rgba(26,22,52,.6) 46%, rgba(9,9,20,.92) 100%)`,
            borderColor: `rgba(${colorMeta.glow},.3)`,
            boxShadow: `0 0 60px rgba(${colorMeta.glow},.14), inset 0 0 46px rgba(${colorMeta.glow},.07), inset 0 -14px 34px rgba(0,0,0,.5)`,
            transition: "background 1.2s ease, border-color 1.2s ease, box-shadow 1.2s ease",
          }}
        >
          <span className="pointer-events-none absolute inset-0 rounded-[40px]" style={{ boxShadow: "inset 0 0 90px rgba(0,0,0,.55)" }} />

          {/* نوار وضعیت */}
          <div className="absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-full border border-zinc-700/60 bg-zinc-950/70 px-2.5 py-1">
            <span className="inline-block" style={{ animation: `${view.dir === 1 ? "rbSpin" : "rbSpinR"} 2.6s linear infinite` }} aria-hidden="true">
              🔄
            </span>
            <span className="text-[10px] font-bold text-zinc-400">
              {view.dir === 1 ? (fa ? "رو به جلو" : "forward") : (fa ? "برعکس" : "reversed")}
            </span>
          </div>

          {view.pend > 0 && (
            <div
              className="absolute right-3 top-3 z-10 rounded-full border px-3 py-1 text-[11px] font-black"
              style={{
                borderColor: "rgba(244,63,94,.6)",
                background: "rgba(244,63,94,.14)",
                color: "#fda4af",
                animation: "rbPulseRose 1.5s ease-in-out infinite",
              }}
            >
              {fa ? "جریمه روی میز" : "pending"}: <b className="tabular-nums">{view.pend}</b>
            </div>
          )}

          {/* دک و پشته */}
          <div className="relative flex items-center justify-center gap-7 sm:gap-12">
            <div className="relative">
              <span className="absolute -left-1.5 -top-1.5" style={{ transform: "rotate(-7deg)", filter: "brightness(.85)" }}>
                <RbCardBackArt size={1.05} />
              </span>
              <span className="absolute -left-0.5 -top-0.5" style={{ transform: "rotate(-3deg)", filter: "brightness(.92)" }}>
                <RbCardBackArt size={1.05} />
              </span>
              <span className="relative block" style={{ transform: "rotate(2deg)" }}>
                <RbCardBackArt size={1.05} />
              </span>
              <span className="mt-2.5 block text-center text-[10px] font-bold text-zinc-500">{fa ? "دک" : "deck"}</span>
            </div>

            {/* پشتهٔ دورریز */}
            <div className="relative">
              {waveKey > 0 && (
                <span
                  key={waveKey}
                  className="pointer-events-none absolute left-1/2 top-1/2 rounded-full border-2"
                  style={{
                    width: 130,
                    height: 130,
                    marginLeft: -65,
                    marginTop: -65,
                    borderColor: `rgba(${colorMeta.glow},.7)`,
                    boxShadow: `0 0 24px rgba(${colorMeta.glow},.5)`,
                    animation: "rbWave 1s ease-out both",
                  }}
                />
              )}
              {view.top && (
                <>
                  <span className="absolute left-2 top-2.5" style={{ filter: "brightness(.4) blur(.6px)", transform: "rotate(-7deg)" }}>
                    <RbCardArt card={view.top} size={1.15} />
                  </span>
                  <span className="absolute left-1 top-1" style={{ filter: "brightness(.62)", transform: "rotate(-3deg)" }}>
                    <RbCardArt card={view.top} size={1.15} />
                  </span>
                </>
              )}
              <div key={view.top?.id ?? "empty"} className="relative" style={{ animation: "rbLand .5s cubic-bezier(.2,.8,.3,1.2) both" }}>
                {view.top ? <RbCardArt card={view.top} size={1.15} /> : <RbCardBackArt size={1.15} />}
              </div>
              <span className="mt-2.5 block text-center text-[10px] font-bold" style={{ color: colorMeta.hex, transition: "color 1s" }}>
                {fa ? `رنگ فعال: ${colorMeta.fa}` : `color: ${colorMeta.en}`}
              </span>
            </div>
          </div>

          {/* پرتاب جریمه — کارت‌های کوچک از دک به سمت قربانی */}
          {throwKey > 0 && view.pend > 0 && (
            <div key={throwKey} className="pointer-events-none absolute inset-0" style={{ perspective: "600px" }}>
              {Array.from({ length: Math.min(view.pend, 6) }, (_, i) => (
                <span
                  key={i}
                  className="absolute"
                  style={
                    {
                      left: "34%",
                      top: "52%",
                      "--tx": throwTarget.tx,
                      "--ty": throwTarget.ty,
                      "--rot": `${(i % 2 ? 1 : -1) * (140 + i * 40)}deg`,
                      animation: `rbThrow .8s ease-in ${i * 0.09}s both`,
                    } as React.CSSProperties
                  }
                >
                  <RbCardBackArt size={0.5} />
                </span>
              ))}
            </div>
          )}

          {canCatch && (
            <div className="absolute -bottom-6 left-1/2 z-10 -translate-x-1/2">
              <button
                type="button"
                disabled={busy || !onCatch}
                onClick={() => onCatch?.()}
                className="rounded-full bg-rose-500 px-5 py-2.5 text-xs font-black text-zinc-950"
                style={{ boxShadow: "0 0 24px rgba(244,63,94,.55)", animation: "rbPulseRose 1.1s ease-in-out infinite" }}
              >
                📢 {fa ? `لو رفت! ${view.callOpen?.name} رنگ‌باز نگفت` : "They forgot!"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* نوار اکشن */}
      <div className="mt-7 flex flex-wrap items-center justify-center gap-2">
        {view.myTurn ? (
          <span
            className="rounded-full border px-3.5 py-1.5 text-xs font-black text-emerald-300"
            style={{ borderColor: "rgba(52,211,153,.5)", background: "rgba(52,211,153,.1)", boxShadow: "0 0 14px rgba(52,211,153,.2)" }}
          >
            🎯 {fa ? "نوبت توئه!" : "your turn"}
            {view.turnRemainMs > 0 && <span className="ms-2 tabular-nums text-emerald-200/80">{Math.ceil(view.turnRemainMs / 1000)}ث</span>}
          </span>
        ) : (
          <span className="rounded-full border border-zinc-700 bg-zinc-950/70 px-3.5 py-1.5 text-xs font-bold text-zinc-400">
            {fa ? "نوبت" : "turn"}: <b className="text-zinc-200">{active?.name}</b>
          </span>
        )}
        {view.pend > 0 && view.myTurn && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onDrawPass()}
            className="rounded-full bg-gradient-to-l from-amber-400 to-orange-400 px-4 py-2 text-xs font-black text-zinc-950 shadow-lg shadow-amber-500/30 active:scale-95"
          >
            📤 {fa ? `گرفتن ${view.pend} کارت جریمه` : `take ${view.pend}`}
          </button>
        )}
        {view.myTurn && view.pend === 0 && (
          <button
            type="button"
            disabled={busy || (view.drew && view.drewPlayable)}
            onClick={() => onDrawPass()}
            className="rounded-full border border-sky-500/50 bg-sky-500/10 px-4 py-2 text-xs font-black text-sky-300 disabled:opacity-40 active:scale-95"
          >
            🃏 {view.drew ? (fa ? "گذر" : "pass") : fa ? "کارت بکش" : "draw"}
          </button>
        )}
        {showCallBtn && (
          <button
            type="button"
            onClick={() => setArmedCall((v) => !v)}
            className="rounded-full px-4 py-2 text-xs font-black text-zinc-950 active:scale-95"
            style={{
              background: armedCall ? "#34d399" : "#fbbf24",
              boxShadow: armedCall ? "0 0 22px rgba(52,211,153,.75)" : "0 0 22px rgba(251,191,36,.65)",
              animation: armedCall ? "rbBreathe 1.2s ease-in-out infinite" : undefined,
            }}
          >
            {armedCall ? (fa ? "🔔 رنگ‌باز مسلح شد!" : "🔔 armed!") : fa ? "🔔 رنگ‌باز!" : "🔔 one left!"}
          </button>
        )}
        {showLateCall && onCall && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onCall()}
            className="rounded-full bg-emerald-400 px-4 py-2 text-xs font-black text-zinc-950 active:scale-95"
            style={{ boxShadow: "0 0 22px rgba(52,211,153,.7)" }}
          >
            🔔 {fa ? "رنگ‌باز!" : "call!"}
          </button>
        )}
        <button
          type="button"
          onClick={() => setMuted(sfxToggleMuted())}
          className="rounded-full border border-zinc-700 bg-zinc-950/70 p-2 text-zinc-400 hover:text-zinc-200"
          aria-label={muted ? (fa ? "روشن کردن صدا" : "unmute") : fa ? "بی‌صدا" : "mute"}
        >
          {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* دست من — بادبزن */}
      <div className="mt-4">
        <div className="flex items-end justify-center pb-2" style={{ minHeight: 118 }}>
          {sortedHand.map((c, i) => {
            const playable = view.myTurn && view.playableIds.includes(c.id);
            const isNew = view.drew && view.drewId === c.id;
            const n = sortedHand.length;
            const rot = (i - (n - 1) / 2) * Math.min(4, 40 / Math.max(n, 1));
            const lift = playable ? -18 : 0;
            return (
              <button
                key={c.id}
                type="button"
                disabled={!playable || busy}
                onClick={() => playCard(c.id)}
                className="rb-cardface relative"
                style={{
                  marginLeft: i === 0 ? 0 : -14,
                  transform: `rotate(${rot}deg) translateY(${lift}px)`,
                  filter: playable ? "none" : "brightness(.5) saturate(.65)",
                  cursor: playable ? "pointer" : "default",
                  zIndex: playable ? 6 : 1,
                  ...(dealOn ? ({ animation: `rbDeal .5s cubic-bezier(.2,.8,.3,1.15) ${i * 0.07}s both` } as React.CSSProperties) : {}),
                }}
                aria-label={c.k === "num" ? String(c.n) : undefined}
              >
                <span className={isNew ? "rb-newcard inline-block rounded-[11px]" : "inline-block"}>
                  <RbCardArt card={c} size={n > 9 ? 0.85 : 1.02} />
                </span>
                {isNew && (
                  <span className="absolute -top-2 right-0 rounded-full bg-emerald-400 px-1.5 py-0.5 text-[8px] font-black text-zinc-950">
                    {fa ? "کشیدی!" : "new"}
                  </span>
                )}
              </button>
            );
          })}
          {view.myHand.length === 0 && <span className="text-xs text-zinc-500">{fa ? "دستت خالی است" : "empty hand"}</span>}
        </div>
        <p className="text-center text-[10px] font-bold text-zinc-500">
          {fa
            ? view.myTurn
              ? view.playableIds.length > 0
                ? "کارت‌های روشن قابل بازی‌اند — ضربه بزن"
                : "کارت قابل بازی نداری — بکش یا جریمه را بگیر"
              : "صبر کن تا نوبتت برسد"
            : view.myTurn
              ? "tap a lit card to play"
              : "wait for your turn"}
        </p>
      </div>

      {/* گزارش زنده */}
      <div className="rb-glass mt-4 rounded-2xl px-3.5 py-3">
        <p className="mb-1.5 text-[10px] font-black tracking-wide text-zinc-500">{fa ? "📡 گزارش سالن" : "📡 table feed"}</p>
        <ul className="space-y-1">
          {[...view.log].slice(-6).reverse().map((t, i) => (
            <li key={`${i}-${t.slice(0, 12)}`} className="text-[11px] leading-5 text-zinc-300">
              {t}
            </li>
          ))}
        </ul>
      </div>

      {footer}

      {/* مودال انتخاب رنگ */}
      {colorPick && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/85 p-6 backdrop-blur-sm" onClick={() => setColorPick(null)}>
          <div className="rb-glass w-full max-w-xs rounded-3xl p-5 text-center" style={{ animation: "rbPopIn .25s ease" }} onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-black text-zinc-100">{fa ? "🎨 رنگ بعدی را انتخاب کن" : "🎨 pick next color"}</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {RB_COLORS.map((c, i) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    const cid = colorPick;
                    setColorPick(null);
                    onPlay(cid, { color: c, call: armedCall });
                    setArmedCall(false);
                  }}
                  className="rounded-2xl py-4 text-sm font-black text-zinc-950 active:scale-95"
                  style={{
                    background: `linear-gradient(150deg, ${RB_COLOR_META[c].hex}, ${RB_COLOR_META[c].hex}aa)`,
                    boxShadow: `0 0 26px rgba(${RB_COLOR_META[c].glow},.6), inset 0 1px 0 rgba(255,255,255,.4)`,
                    animation: `rbPopIn .22s ease ${i * 0.05}s both`,
                  }}
                >
                  {fa ? RB_COLOR_META[c].fa : RB_COLOR_META[c].en}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* مودال هدف تعویض دست */}
      {swapPick && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/85 p-6 backdrop-blur-sm" onClick={() => setSwapPick(null)}>
          <div className="rb-glass w-full max-w-xs rounded-3xl p-5 text-center" style={{ animation: "rbPopIn .25s ease" }} onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-black text-zinc-100">{fa ? "🤝 دستت را با چه کسی عوض کنی؟" : "🤝 swap with whom?"}</p>
            <div className="mt-4 space-y-2">
              {view.players
                .filter((p) => p.id !== view.me)
                .map((p, i) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      const cid = swapPick;
                      setSwapPick(null);
                      onPlay(cid, { targetId: p.id, call: armedCall });
                      setArmedCall(false);
                    }}
                    className="flex w-full items-center justify-between rounded-2xl border border-violet-500/40 bg-violet-500/10 px-4 py-3 text-sm font-black text-violet-200 active:scale-95"
                    style={{ animation: `rbPopIn .2s ease ${i * 0.04}s both` }}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-black text-white"
                        style={{ background: AVATAR_GRADS[i % AVATAR_GRADS.length] }}
                      >
                        {p.name.slice(0, 1)}
                      </span>
                      {p.name}
                    </span>
                    <span className="text-[11px] font-bold text-violet-300/80">
                      {p.count !== null ? `${p.count} ${fa ? "کارت" : "cards"}` : "🌫"}
                    </span>
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* پردهٔ نتیجه + کونفتی */}
      {view.phase === "done" && view.result && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-zinc-950/88 p-6">
          {confettiKey > 0 && (
            <div key={confettiKey} className="pointer-events-none absolute inset-0">
              {confetti.map((c, i) => (
                <span
                  key={i}
                  className="absolute rounded-sm"
                  style={{
                    left: c.left,
                    top: "-4vh",
                    width: c.w,
                    height: c.w * 1.6,
                    background: RB_COLOR_META[c.color].hex,
                    boxShadow: `0 0 6px rgba(${RB_COLOR_META[c.color].glow},.8)`,
                    animation: `rbFall ${c.dur}s linear ${c.delay}s both`,
                  }}
                />
              ))}
            </div>
          )}
          <div className="rb-glass relative w-full max-w-sm rounded-3xl p-6 text-center" style={{ animation: "rbPopIn .35s ease" }}>
            <div className="text-4xl" style={{ animation: "rbWinGlow 1.6s ease-in-out infinite" }} aria-hidden="true">
              {view.result.rows[0]?.id === view.me ? "🏆" : "🥁"}
            </div>
            <h2 className="mt-2 text-xl font-black text-amber-300">
              {view.result.rows[0]?.id === view.me
                ? fa
                  ? "تو برنده شدی!"
                  : "You win!"
                : fa
                  ? `${view.result.rows[0]?.name} برنده شد`
                  : `${view.result.rows[0]?.name} wins`}
            </h2>
            <ul className="mt-4 space-y-1.5">
              {view.result.rows.map((r, i) => (
                <li
                  key={r.id}
                  className={`flex items-center justify-between rounded-xl border px-3 py-2 text-sm ${
                    r.id === view.me
                      ? "border-emerald-500/50 bg-emerald-500/10 font-black text-emerald-200"
                      : "border-zinc-800 bg-zinc-950/60 text-zinc-300"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span
                      className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-black text-white"
                      style={{ background: AVATAR_GRADS[i % AVATAR_GRADS.length] }}
                    >
                      {r.name.slice(0, 1)}
                    </span>
                    {r.name}
                    {r.id === view.me ? (fa ? " (شما)" : " (you)") : ""}
                  </span>
                  <span className="flex items-center gap-2">
                    {r.cards > 0 && <span className="text-[10px] font-bold text-zinc-500">{r.cards} {fa ? "مانده" : "left"}</span>}
                    <span className="tabular-nums text-amber-300">{r.score}</span>
                  </span>
                </li>
              ))}
            </ul>
            {onAgain && (
              <button
                type="button"
                onClick={() => onAgain()}
                className="mt-4 w-full rounded-2xl bg-gradient-to-l from-violet-500 to-fuchsia-500 py-3 text-sm font-black text-zinc-950 shadow-lg shadow-violet-500/30 active:scale-95"
              >
                🔁 {fa ? "دست دوباره" : "play again"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
