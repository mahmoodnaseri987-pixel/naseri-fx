"use client";

/* ================================================================
   رنگ‌باز — میز بازی نئونی (مشترک بین آنلاین و سولوی آفلاین)
   سالن شبانه: پس‌زمینهٔ تیرهٔ آبی‌بنفش، پنل‌های شیشه‌ای مات، هالهٔ
   رنگی کارت‌ها، ذرات شناور، بادبزن دست بازیکن، حلقهٔ جهت بازی.
   ================================================================ */

import { useEffect, useMemo, useState } from "react";
import { RB_COLOR_META, RB_COLORS, type RbCard, type RbColor, type RbView } from "@/lib/rangbaz-shared";

export type RbTableProps = {
  view: RbView;
  fa: boolean;
  busy: boolean;
  onPlay: (cardId: string, opts?: { color?: RbColor; targetId?: string; call?: boolean }) => void;
  onDrawPass: () => void;
  onCall?: () => void;
  onCatch?: () => void;
  header?: React.ReactNode;
  footer?: React.ReactNode;
};

const RB_TABLE_CSS = `
@keyframes rbFloat { 0% { transform: translateY(0) scale(1); opacity: .5; } 50% { transform: translateY(-26px) scale(1.25); opacity: .95; } 100% { transform: translateY(0) scale(1); opacity: .5; } }
@keyframes rbSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
@keyframes rbSpinR { from { transform: rotate(0deg); } to { transform: rotate(-360deg); } }
@keyframes rbPulse { 0%,100% { box-shadow: 0 0 0 0 rgba(52,211,153,.45); } 50% { box-shadow: 0 0 0 12px rgba(52,211,153,0); } }
@keyframes rbPopIn { from { transform: scale(.6); opacity: 0; } to { transform: scale(1); opacity: 1; } }
@keyframes rbWinGlow { 0%,100% { filter: drop-shadow(0 0 6px rgba(251,191,36,.6)); } 50% { filter: drop-shadow(0 0 22px rgba(251,191,36,.95)); } }
.rb-part { position: absolute; border-radius: 9999px; pointer-events: none; animation: rbFloat linear infinite; }
.rb-glass { background: rgba(13,13,22,.62); backdrop-filter: blur(10px); border: 1px solid rgba(148,163,184,.16); }
.rb-cardface { transition: transform .18s ease, box-shadow .18s ease, filter .18s ease; will-change: transform; }
`;

const KIND_GLYPH: Record<string, string> = {
  skip: "⛔",
  reverse: "🔁",
  draw2: "+2",
  wild: "🎨",
  wild4: "+4",
  mirror: "🪞",
  swap: "🤝",
  fog: "🌫",
};

const KIND_FA: Record<string, string> = {
  skip: "ممنوع",
  reverse: "برگشت",
  draw2: "جریمه",
  wild: "تغییر رنگ",
  wild4: "تغییر رنگ +۴",
  mirror: "آینه",
  swap: "تعویض دست",
  fog: "مه",
};

const KIND_EN: Record<string, string> = {
  skip: "Skip",
  reverse: "Reverse",
  draw2: "+2",
  wild: "Color",
  wild4: "Color +4",
  mirror: "Mirror",
  swap: "Swap",
  fog: "Fog",
};

function CardFace({ card, size = 1 }: { card: RbCard; size?: number }) {
  const meta = card.c ? RB_COLOR_META[card.c] : null;
  const w = 62 * size;
  const h = 90 * size;
  const bg = meta
    ? `linear-gradient(150deg, rgba(${meta.glow},.28), rgba(${meta.glow},.08)), linear-gradient(160deg,#171721,#0c0c14)`
    : "linear-gradient(160deg,#1d1b30,#101018)";
  const glyph = KIND_GLYPH[card.k] ?? "";
  return (
    <div
      className="rb-cardface relative flex shrink-0 flex-col items-center justify-center rounded-xl border"
      style={{
        width: w,
        height: h,
        background: bg,
        borderColor: meta ? `rgba(${meta.glow},.75)` : "rgba(167,139,250,.5)",
        boxShadow: meta ? `0 0 14px rgba(${meta.glow},.28), inset 0 0 12px rgba(${meta.glow},.12)` : "0 0 14px rgba(167,139,250,.22)",
      }}
    >
      <span
        className="pointer-events-none absolute inset-1.5 rounded-lg border opacity-40"
        style={{ borderColor: meta ? `rgba(${meta.glow},.5)` : "rgba(167,139,250,.4)" }}
      />
      {card.k === "num" ? (
        <span
          className="font-black leading-none"
          style={{ fontSize: 30 * size, color: meta ? `rgb(${meta.glow})` : "#e4e4e7", textShadow: meta ? `0 0 10px rgba(${meta.glow},.8)` : "none" }}
        >
          {card.n}
        </span>
      ) : (
        <>
          <span style={{ fontSize: (card.k === "draw2" || card.k === "wild4" ? 24 : 26) * size }} aria-hidden="true">
            {glyph}
          </span>
          <span
            className="mt-0.5 text-center font-black leading-tight"
            style={{ fontSize: 9 * size, color: meta ? `rgb(${meta.glow})` : "#c4b5fd" }}
          >
            {card.k === "draw2" || card.k === "wild4" ? "" : ""}
          </span>
        </>
      )}
    </div>
  );
}

function CardBack({ size = 1 }: { size?: number }) {
  const w = 62 * size;
  const h = 90 * size;
  return (
    <div
      className="rb-cardface relative flex shrink-0 items-center justify-center rounded-xl border border-violet-500/40"
      style={{
        width: w,
        height: h,
        background: "repeating-linear-gradient(45deg,#14121f 0 8px,#1a1730 8px 16px)",
        boxShadow: "0 0 14px rgba(139,92,246,.3)",
      }}
    >
      <span className="rounded-full border border-violet-400/60 px-2 py-0.5 text-[10px] font-black text-violet-300">
        رنگ‌باز
      </span>
    </div>
  );
}

export function RangbazTable({ view, fa, busy, onPlay, onDrawPass, onCall, onCatch, header, footer }: RbTableProps) {
  const [colorPick, setColorPick] = useState<string | null>(null); // cardId در انتظار انتخاب رنگ
  const [swapPick, setSwapPick] = useState<string | null>(null); // cardId در انتظار انتخاب هدف
  const [armedCall, setArmedCall] = useState(false); // «رنگ‌باز!» برای وقتی کارت از ۲ به ۱ می‌رسد
  const nowTick = useNowTick();

  useEffect(() => {
    if (view.myHand.length !== 2) setArmedCall(false);
  }, [view.myHand.length]);

  const me = view.players.find((p) => p.id === view.me);
  const active = view.players.find((p) => p.id === view.cur);
  const others = view.players.filter((p) => p.id !== view.me);
  const colorMeta = RB_COLOR_META[view.color];
  const canCatch = view.callOpen && view.callOpen.id !== view.me && nowTick < view.callOpen.until;
  const showCallBtn = view.myHand.length === 2 && view.myTurn;
  const showLateCall = view.myHand.length === 1 && view.myTurn && !view.callOpen;

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
      Array.from({ length: 14 }, (_, i) => ({
        left: `${(i * 37 + 13) % 100}%`,
        top: `${(i * 53 + 7) % 100}%`,
        size: 2 + ((i * 7) % 4),
        dur: 5 + (i % 5),
        delay: (i % 7) * 0.8,
        color: RB_COLORS[i % 4],
      })),
    [],
  );

  return (
    <div className="relative mx-auto min-h-[100svh] w-full max-w-3xl overflow-hidden px-3 pb-6 pt-4 sm:px-6" dir="rtl">
      <style dangerouslySetInnerHTML={{ __html: RB_TABLE_CSS }} />
      {/* پس‌زمینهٔ سالن نئونی */}
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(900px 420px at 50% -10%, rgba(99,102,241,.14), transparent 60%), radial-gradient(700px 500px at 85% 110%, rgba(168,85,247,.12), transparent 60%), radial-gradient(600px 400px at 8% 90%, rgba(56,189,248,.1), transparent 60%), #09090f",
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

      {header}

      {/* حریف‌ها — بالا */}
      <div className="mt-2 flex flex-wrap items-start justify-center gap-2">
        {others.map((p) => {
          const isTurn = p.id === view.cur;
          return (
            <div
              key={p.id}
              className={`rb-glass relative w-[104px] rounded-2xl px-2 py-2 text-center ${isTurn ? "" : "opacity-80"}`}
              style={{
                boxShadow: isTurn ? `0 0 0 1.5px ${colorMeta.hex}, 0 0 18px rgba(${colorMeta.glow},.4)` : "none",
              }}
            >
              <p className="truncate text-[11px] font-black text-zinc-100">
                {p.name}
                {p.id === view.me ? "" : ""}
              </p>
              <p className="mt-0.5 text-[10px] font-bold" style={{ color: p.count === null ? "#a78bfa" : "#a1a1aa" }}>
                {p.count === null ? (fa ? "🌫 نامعلوم" : "🌫 hidden") : `${fa ? "" : ""}${p.count} ${fa ? "کارت" : "cards"}`}
              </p>
              {isTurn && (
                <span
                  className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full px-2 py-0.5 text-[9px] font-black text-zinc-950"
                  style={{ background: colorMeta.hex }}
                >
                  {fa ? "نوبت" : "turn"}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* میز مرکزی */}
      <div
        className="rb-glass relative mx-auto mt-4 flex items-center justify-center gap-5 rounded-[28px] px-4 py-6 sm:gap-8"
        style={{
          background: `radial-gradient(420px 240px at 50% 45%, rgba(${colorMeta.glow},.13), transparent 70%), rgba(13,13,22,.62)`,
          borderColor: `rgba(${colorMeta.glow},.35)`,
          boxShadow: `0 0 40px rgba(${colorMeta.glow},.12), inset 0 0 30px rgba(${colorMeta.glow},.05)`,
        }}
      >
        {/* حلقهٔ جهت */}
        <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full border border-zinc-700/60 bg-zinc-900/60 px-2.5 py-1">
          <span
            className="inline-block"
            style={{ animation: `${view.dir === 1 ? "rbSpin" : "rbSpinR"} 2.6s linear infinite` }}
            aria-hidden="true"
          >
            🔄
          </span>
          <span className="text-[10px] font-bold text-zinc-400">{view.dir === 1 ? (fa ? "رو به جلو" : "forward") : (fa ? "برعکس" : "reversed")}</span>
        </div>

        {view.pend > 0 && (
          <div
            className="absolute right-3 top-3 rounded-full border px-3 py-1 text-[11px] font-black"
            style={{
              borderColor: "rgba(244,63,94,.6)",
              background: "rgba(244,63,94,.12)",
              color: "#fda4af",
              animation: "rbPulse 1.6s ease-in-out infinite",
            }}
          >
            {fa ? "جریمهٔ در انتظار" : "pending"}: {view.pend} {fa ? "کارت" : ""}
          </div>
        )}

        {/* دک + پشته */}
        <div className="flex flex-col items-center gap-1.5">
          <CardBack size={1} />
          <span className="text-[10px] font-bold text-zinc-500">{fa ? "دک" : "deck"}</span>
        </div>

        <div className="flex flex-col items-center gap-1.5">
          {view.top ? <CardFace card={view.top} size={1.15} /> : <CardBack size={1.15} />}
          <span className="text-[10px] font-bold" style={{ color: colorMeta.hex }}>
            {fa ? `رنگ فعال: ${colorMeta.fa}` : `color: ${colorMeta.en}`}
          </span>
        </div>

        {/* لو دادن و رنگ‌باز */}
        <div className="absolute -bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-2">
          {canCatch && (
            <button
              type="button"
              disabled={busy || !onCatch}
              onClick={() => onCatch?.()}
              className="rounded-full bg-rose-500 px-4 py-2 text-xs font-black text-zinc-950 shadow-lg"
              style={{ animation: "rbPulse 1.1s ease-in-out infinite" }}
            >
              📢 {fa ? "لو رفت! کسی رنگ‌باز نگفت" : "They forgot!"}
            </button>
          )}
        </div>
      </div>

      {/* نوار وضعیت نوبت من */}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        {view.myTurn ? (
          <span className="rounded-full border border-emerald-500/50 bg-emerald-500/10 px-3.5 py-1.5 text-xs font-black text-emerald-300">
            🎯 {fa ? "نوبت توئه!" : "your turn"}
            {view.turnRemainMs > 0 && (
              <span className="ms-2 tabular-nums text-emerald-200/80">{Math.ceil(view.turnRemainMs / 1000)}ث</span>
            )}
          </span>
        ) : (
          <span className="rounded-full border border-zinc-700 bg-zinc-900/60 px-3.5 py-1.5 text-xs font-bold text-zinc-400">
            {fa ? "نوبت" : "turn"}: <b className="text-zinc-200">{active?.name}</b>
          </span>
        )}
        {view.pend > 0 && view.myTurn && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onDrawPass()}
            className="rounded-full bg-amber-400 px-4 py-2 text-xs font-black text-zinc-950"
          >
            📤 {fa ? `گرفتن ${view.pend} کارت جریمه` : `take ${view.pend}`}
          </button>
        )}
        {view.myTurn && view.pend === 0 && (
          <button
            type="button"
            disabled={busy || (view.drew && view.drewPlayable)}
            onClick={() => onDrawPass()}
            className="rounded-full border border-sky-500/50 bg-sky-500/10 px-4 py-2 text-xs font-black text-sky-300 disabled:opacity-40"
          >
            🃏 {view.drew ? (fa ? "گذر" : "pass") : fa ? "کارت بکش" : "draw"}
          </button>
        )}
        {showCallBtn && (
          <button
            type="button"
            onClick={() => setArmedCall((v) => !v)}
            className="rounded-full px-4 py-2 text-xs font-black text-zinc-950"
            style={{
              background: armedCall ? "#34d399" : "#fbbf24",
              boxShadow: armedCall ? "0 0 18px rgba(52,211,153,.7)" : "0 0 18px rgba(251,191,36,.6)",
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
            className="rounded-full bg-emerald-400 px-4 py-2 text-xs font-black text-zinc-950"
          >
            🔔 {fa ? "رنگ‌باز!" : "call!"}
          </button>
        )}
      </div>

      {/* دست من — بادبزن */}
      <div className="mt-4">
        <div className="flex items-end justify-center pb-2" style={{ minHeight: 110 }}>
          {sortedHand.map((c, i) => {
            const playable = view.myTurn && view.playableIds.includes(c.id);
            const n = sortedHand.length;
            const rot = (i - (n - 1) / 2) * Math.min(4, 40 / Math.max(n, 1));
            const lift = playable ? -16 : 0;
            return (
              <button
                key={c.id}
                type="button"
                disabled={!playable || busy}
                onClick={() => playCard(c.id)}
                className="rb-cardface"
                style={{
                  marginLeft: i === 0 ? 0 : -14,
                  transform: `rotate(${rot}deg) translateY(${lift}px)`,
                  filter: playable ? "none" : "brightness(.55) saturate(.7)",
                  cursor: playable ? "pointer" : "default",
                  zIndex: playable ? 5 : 1,
                }}
                aria-label={c.k === "num" ? String(c.n) : (fa ? KIND_FA[c.k] : KIND_EN[c.k])}
              >
                <CardFace card={c} size={n > 9 ? 0.82 : 1} />
              </button>
            );
          })}
          {view.myHand.length === 0 && <span className="text-xs text-zinc-500">{fa ? "دستت خالی است" : "empty hand"}</span>}
        </div>
        <p className="text-center text-[10px] font-bold text-zinc-500">
          {fa
            ? view.playableIds.length > 0 && view.myTurn
              ? "کارت‌های روشن قابل بازی‌اند — ضربه بزن"
              : view.myTurn
                ? "کارت قابل بازی نداری — بکش یا جریمه را بگیر"
                : "صبر کن تا نوبتت برسد"
            : view.myTurn
              ? "tap a lit card to play"
              : "wait for your turn"}
        </p>
      </div>

      {/* گزارش زنده */}
      <div className="rb-glass mt-4 rounded-2xl px-3.5 py-3">
        <p className="mb-1.5 text-[10px] font-black text-zinc-500">{fa ? "📡 گزارش سالن" : "📡 table feed"}</p>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 p-6" onClick={() => setColorPick(null)}>
          <div className="rb-glass w-full max-w-xs rounded-3xl p-5 text-center" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-black text-zinc-100">{fa ? "🎨 رنگ بعدی را انتخاب کن" : "🎨 pick next color"}</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {RB_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    const cid = colorPick;
                    setColorPick(null);
                    onPlay(cid, { color: c, call: armedCall });
                    setArmedCall(false);
                  }}
                  className="rounded-2xl px-4 py-4 text-sm font-black text-zinc-950"
                  style={{
                    background: RB_COLOR_META[c].hex,
                    boxShadow: `0 0 22px rgba(${RB_COLOR_META[c].glow},.55)`,
                    animation: "rbPopIn .18s ease",
                  }}
                >
                  {fa ? RB_COLOR_META[c].fa : RB_COLOR_META[c].en}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* مودال انتخاب هدف تعویض دست */}
      {swapPick && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/80 p-6" onClick={() => setSwapPick(null)}>
          <div className="rb-glass w-full max-w-xs rounded-3xl p-5 text-center" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-black text-zinc-100">{fa ? "🤝 دستت را با چه کسی عوض کنی؟" : "🤝 swap with whom?"}</p>
            <div className="mt-4 space-y-2">
              {view.players
                .filter((p) => p.id !== view.me)
                .map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      const cid = swapPick;
                      setSwapPick(null);
                      onPlay(cid, { targetId: p.id, call: armedCall });
                      setArmedCall(false);
                    }}
                    className="w-full rounded-2xl border border-violet-500/40 bg-violet-500/10 px-4 py-3 text-sm font-black text-violet-200"
                  >
                    {p.name} {p.count !== null ? `· ${p.count} ${fa ? "کارت" : "cards"}` : ""}
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* پردهٔ نتیجه */}
      {view.phase === "done" && view.result && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/85 p-6">
          <div className="rb-glass w-full max-w-sm rounded-3xl p-6 text-center" style={{ animation: "rbPopIn .3s ease" }}>
            <div style={{ animation: "rbWinGlow 1.6s ease-in-out infinite" }} className="text-4xl" aria-hidden="true">
              🏆
            </div>
            <h2 className="mt-2 text-xl font-black text-amber-300">
              {fa ? `${view.result.rows[0]?.name} برنده شد!` : `${view.result.rows[0]?.name} wins!`}
            </h2>
            <ul className="mt-4 space-y-1.5">
              {view.result.rows.map((r, i) => (
                <li
                  key={r.id}
                  className={`flex items-center justify-between rounded-xl border px-3 py-2 text-sm ${
                    r.id === view.me ? "border-emerald-500/50 bg-emerald-500/10 font-black text-emerald-200" : "border-zinc-800 bg-zinc-900/60 text-zinc-300"
                  }`}
                >
                  <span>
                    {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`} {r.name}
                    {r.id === view.me ? (fa ? " (شما)" : " (you)") : ""}
                  </span>
                  <span className="tabular-nums text-amber-300">{r.score}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
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
