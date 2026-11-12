"use client";

/* ================================================================
   بازی گروهی «منچ» — تختهٔ کلاسیک با گرافیک SVG
   ================================================================
   طراحی برای موبایل: در جریان بازی هیچ نوشته‌ای روی صفحه نیست —
   فقط تخته، مهره‌ها، تاس و نشانگر نوبت. همهٔ بازخوردها با انیمیشن،
   فلش رنگی روی خانه‌ها و افکت صوتی منتقل می‌شود.
   • تمام‌صفحه واقعی (Fullscreen API) با جایگزین CSS برای iOS
   • قوانین قبل از شروع (لابی + مودال اختیاری با آیکون «؟»)
   • مهره‌ها گام‌به‌گام با پرش انیمیت می‌شوند؛ زدن مهره با پرتاب به پایگاه
   • تاس‌ها با چرخش تصادفی و فرود روی عدد واقعی سرور
   ================================================================ */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Bot,
  Crown,
  HelpCircle,
  Maximize2,
  MessageCircle,
  Minimize2,
  Play,
  Trophy,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useLang } from "@/components/site/language-provider";
import { ChatPanel } from "@/components/site/chat-panel";
import {
  LUDO_BASE_ANCHORS,
  LUDO_BOT_MOVE_MIN,
  LUDO_BOT_MOVE_VAR,
  LUDO_BOT_ROLL_MIN,
  LUDO_BOT_ROLL_VAR,
  LUDO_COLUMN,
  LUDO_COLUMN_START,
  LUDO_HOME_STEP,
  LUDO_HOME_ANCHORS,
  LUDO_COLOR_INFO,
  LUDO_MOVE_MS,
  LUDO_START_ABS,
  LUDO_TRACK,
  LUDO_TRACK_CELLS,
  LUDO_TURN_MS,
  ludoAbsCellOf,
  ludoActionsFor,
  type LudoColor,
  type LudoSurpriseKind,
} from "@/lib/ludo-shared";
import {
  sfxCapture,
  sfxDing,
  sfxDice,
  sfxFinisher,
  sfxHome,
  sfxHop,
  sfxIsMuted,
  sfxSurprise,
  sfxToggleMuted,
  sfxWin,
  sfxLose,
} from "@/lib/arena-sfx";
import type { ArenaStateResponse } from "@/lib/types";

const CELL = 40;
const BOARD = CELL * 15;

/* ریتم بازی — تاس با کلیک همان لحظه می‌چرخد (بدون انتظار شبکه)، با یک
   انتقال کاهنده روی عدد واقعی سرور فرود می‌آید و ۲ثانیه ثابت می‌ماند؛
   بعد حرکت مهره‌ها دیده می‌شود و نوبت بعدی اعلام می‌گردد */
const ROLL_SPIN_MS = 1500; // مدت چرخش تا فرود روی عدد سرور — آرام و خوانا
const ROLL_LAND_MIN_MS = 500; // حداقل زمان فرود بعد از رسیدن عدد سرور
const OPTIMISTIC_GLIDE_MS = 1050; // هر فاز چرخش خوش‌بینانه تا رسیدن عدد سرور
const SETTLE_MS = 2000; // مکث فرود — عدد حداقل ۲ثانیه روی زمین ثابت دیده می‌شود
const SURPRISE_PAUSE_MS = 1050; // مکث روی خانهٔ سورپرایز + نوشتهٔ اثر بالای مهره
const STEP_MS = 430; // فاصلهٔ هر گام مهره — نرم و قابل‌مشاهده

/** جای نشان صاحب پایگاه — روی نوار بیرونی هر پایگاه (درصد اندازهٔ تخته) */
const LUDO_AVATAR_POS: Record<LudoColor, [number, number]> = {
  0: [20, 4.3], // قرمز — بالا-چپ
  1: [80, 4.3], // سبز — بالا-راست
  2: [80, 95.7], // زرد — پایین-راست
  3: [20, 95.7], // آبی — پایین-چپ
};

type XY = [number, number];

function cellCenter(col: number, row: number): XY {
  return [(col + 0.5) * CELL, (row + 0.5) * CELL];
}

/** مرکز مهره برای هر گام — پایگاه، مسیر، ستون خانه‌ها و خانهٔ پایانی */
function stepPoint(color: LudoColor, step: number, idx: number): XY {
  if (step < 0) {
    const [c, r] = LUDO_BASE_ANCHORS[color][idx];
    return [c * CELL, r * CELL];
  }
  if (step === LUDO_HOME_STEP) {
    const [c, r] = LUDO_HOME_ANCHORS[color][idx];
    return [c * CELL, r * CELL];
  }
  if (step >= LUDO_COLUMN_START) {
    const [c, r] = LUDO_COLUMN[color][step - LUDO_COLUMN_START];
    return cellCenter(c, r);
  }
  const abs = ludoAbsCellOf(color, step)!;
  const [c, r] = LUDO_TRACK[abs];
  return cellCenter(c, r);
}

/** جهت حرکت مسیر در خانهٔ مطلق — برای فلش‌ها و نشانگرهای سورپرایز */
function trackDirection(abs: number): number {
  const [c1, r1] = LUDO_TRACK[abs];
  const [c2, r2] = LUDO_TRACK[(abs + 1) % LUDO_TRACK_CELLS];
  return (Math.atan2(r2 - r1, c2 - c1) * 180) / Math.PI;
}

function lerp(a: XY, b: XY, t: number): XY {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/* چیدمان نقاط تاس */
const PIP_MAP: Record<number, readonly [number, number][]> = {
  1: [[0, 0]],
  2: [[-1, -1], [1, 1]],
  3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
};

/** زاویهٔ هر وجه در جلو — مقصد نهایی فرود تاس (مضرب ۹۰؛ عدد کاملاً ثابت و خوانا) */
const DIE_FACE_ROT: Record<number, { x: number; y: number }> = {
  1: { x: 0, y: 0 },
  2: { x: -90, y: 0 },
  3: { x: 0, y: -90 },
  4: { x: 0, y: 90 },
  5: { x: 90, y: 0 },
  6: { x: 0, y: 180 },
};

/** نوشتهٔ اثر خانهٔ سورپرایز بالای مهره — نقش «خانهٔ جایزه» را روشن می‌کند */
const SURPRISE_FX_INFO: Record<LudoSurpriseKind, { text: string; bg: string; edge: string }> = {
  fwd4: { text: "۴ خانه جلو!", bg: "#ffe9a8", edge: "#e8a021" },
  fwd3: { text: "۳ خانه جلو!", bg: "#ffe9a8", edge: "#e8a021" },
  back4: { text: "۴ خانه عقب!", bg: "#ffd6d3", edge: "#e2453c" },
  back3: { text: "۳ خانه عقب!", bg: "#ffd6d3", edge: "#e2453c" },
  again: { text: "پرتاب دوباره!", bg: "#d6f5e3", edge: "#2fae5f" },
};

/** تاس سه‌بعدی CSS — چرخش و فرود با زاویهٔ انباشته از والد کنترل می‌شود؛
    انتقال کاهنده یعنی تاس آرام‌آرام روی عدد سرور می‌نشیند و ثابت می‌ماند */
function Die3D({
  dieStyle,
  settle,
}: {
  dieStyle: { transform: string; transition?: string };
  settle: boolean;
}) {
  return (
    <div className={`ludo-die-scene ${settle ? "ludo-die-settle" : ""}`} aria-hidden="true">
      <div className="ludo-die" style={dieStyle}>
        {([1, 2, 3, 4, 5, 6] as const).map((f) => (
          <div key={f} className={`ludo-die-face ludo-die-face-${f}`}>
            {PIP_MAP[f]?.map(([px, py], i) => (
              <span key={i} className="ludo-pip" style={{ left: `${50 + px * 27}%`, top: `${50 + py * 27}%` }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function LudoClient({
  st,
  sendAction,
}: {
  st: ArenaStateResponse;
  sendAction: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  const { t, lang } = useLang();
  const L = t.arena.ludo;
  const l = st.ludo!;
  const me = st.me;

  /* ---------- زمان محلی ---------- */
  const offsetRef = useRef(Date.now() - st.now);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    offsetRef.current = Date.now() - st.now;
  }, [st.now]);
  useEffect(() => {
    const id = setInterval(() => setTick((x) => x + 1), 200);
    return () => clearInterval(id);
  }, []);
  void tick; // فقط برای رندر دوباره

  const localNow = Date.now() - offsetRef.current;
  const countdown = Math.max(0, l.startedAtMs - localNow);

  /* ---------- موقعیت مهره‌ها + انیمیشن گام‌به‌گام ---------- */
  const posRef = useRef<Record<string, XY>>({});
  const [, forceRender] = useState(0);
  const prevStepsRef = useRef<Record<string, number[]>>({});
  const animToken = useRef(0);
  const [flash, setFlash] = useState<{ key: string; color: string; at: number } | null>(null);
  /* نوشتهٔ اثر خانهٔ سورپرایز بالای مهره — برای درک نقش «خانهٔ جایزه» */
  const [surpriseFx, setSurpriseFx] = useState<{ x: number; y: number; kind: LudoSurpriseKind; at: number } | null>(null);
  useEffect(() => {
    if (!surpriseFx) return;
    const id = window.setTimeout(() => setSurpriseFx(null), SURPRISE_PAUSE_MS + 300);
    return () => window.clearTimeout(id);
  }, [surpriseFx]);


  /* رد رنگی — خانه‌ها با عبور/فرود مهره به رنگ همان مهره در می‌آیند */
  type Tint = { id: number; col: number; row: number; color: string; strong: boolean };
  const [tints, setTints] = useState<Tint[]>([]);
  const tintIdRef = useRef(0);
  const addTint = useCallback((col: number, row: number, color: string, strong: boolean) => {
    if (col < 0 || col > 14 || row < 0 || row > 14) return;
    const id = ++tintIdRef.current;
    setTints((ts) => [...ts.slice(-16), { id, col, row, color, strong }]);
    window.setTimeout(() => setTints((ts) => ts.filter((t) => t.id !== id)), strong ? 2400 : 760);
  }, []);

  /* درخشش خانهٔ پایانی وسط تخته + لرزش تخته هنگام زدن مهره */
  const [homeBurst, setHomeBurst] = useState(0);
  const boardRef = useRef<HTMLDivElement>(null);
  const shakeBoard = useCallback(() => {
    const el = boardRef.current;
    if (!el) return;
    el.classList.remove("ludo-board-shake");
    void el.offsetWidth;
    el.classList.add("ludo-board-shake");
  }, []);

  const computeTargets = useCallback(
    (pieces: Record<string, number[]>, colors: Record<string, LudoColor>) => {
      const targets: Record<string, XY> = {};
      for (const [pid, steps] of Object.entries(pieces)) {
        const color = colors[pid];
        if (color === undefined) continue;
        steps.forEach((s, i) => {
          targets[`${pid}:${i}`] = stepPoint(color, s, i);
        });
      }
      return targets;
    },
    [],
  );

  const colorOf = useMemo(() => {
    const map: Record<string, LudoColor> = {};
    for (const p of l.players) map[p.id] = p.color;
    return map;
  }, [l.players]);

  /* انیمیشن روی هر تغییر seq */
  const seqRef = useRef(-1);
  useEffect(() => {
    if (l.seq === seqRef.current) return;
    const first = seqRef.current === -1;
    seqRef.current = l.seq;

    const prev = prevStepsRef.current;
    const targets = computeTargets(l.pieces, colorOf);
    prevStepsRef.current = Object.fromEntries(
      Object.entries(l.pieces).map(([pid, steps]) => [pid, [...steps]]),
    );

    if (first) {
      posRef.current = targets;
      forceRender((x) => x + 1);
      return;
    }

    /* تشخیص رخدادها برای صدا و فلش */
    let captured = false;
    let surpriseGood: boolean | null = null;
    let homeHit = false;
    const diceV = l.dice ? l.dice.v : null;
    for (const [pid, steps] of Object.entries(l.pieces)) {
      const color = colorOf[pid];
      if (color === undefined) continue;
      const before = prev[pid] ?? steps;
      steps.forEach((s, i) => {
        const b = before[i];
        if (b === s) return;
        if (s === -1 && b >= 0) {
          captured = true;
          const abs = ludoAbsCellOf(color, b);
          if (abs !== null && !LUDO_START_ABS.includes(abs)) {
            const [c, r] = LUDO_TRACK[abs];
            setFlash({ key: `${c}-${r}`, color: "#ef4444", at: Date.now() });
          }
        }
        if (b >= 0 && s >= 0 && diceV !== null) {
          const expected = s > b ? b + diceV : b - diceV;
          if (s !== expected) surpriseGood = s > b;
        }
        if (s === LUDO_HOME_STEP && b !== LUDO_HOME_STEP) homeHit = true;
        /* رنگ‌شدن خانهٔ فرود به رنگ مهره */
        if (s >= 0 && s < LUDO_HOME_STEP) {
          const cell =
            s >= LUDO_COLUMN_START
              ? LUDO_COLUMN[color][s - LUDO_COLUMN_START]
              : (() => {
                  const abs = ludoAbsCellOf(color, s);
                  return abs !== null ? LUDO_TRACK[abs] : null;
                })();
          if (cell) addTint(cell[0], cell[1], LUDO_COLOR_INFO[color].base, true);
        }
      });
    }
    if (captured) {
      sfxCapture();
      shakeBoard();
    }
    if (surpriseGood !== null) sfxSurprise(surpriseGood);
    if (homeHit) {
      sfxHome();
      setHomeBurst(Date.now());
    }

    /* زنجیرهٔ گام‌ها برای هر مهرهٔ تغییرکرده — هر گام پرچم «قدم واقعی» دارد */
    type ChainStep = { p: XY; hop: boolean; color?: LudoColor; pause?: LudoSurpriseKind };

    const chains: Record<string, ChainStep[]> = {};
    for (const [pid, steps] of Object.entries(l.pieces)) {
      const color = colorOf[pid];
      if (color === undefined) continue;
      const before = prev[pid] ?? steps;
      steps.forEach((s, i) => {
        const b = before[i];
        if (b === s) return;
        const key = `${pid}:${i}`;
        const from = posRef.current[key] ?? stepPoint(color, b, i);
        const to = targets[key];
        if (s === -1 || b === -1) {
          /* ورود یا زده‌شدن — پرتاب مستقیم در ۴ نقطه */
          chains[key] = [0.33, 0.66].map((t) => ({ p: lerp(from, to, t), hop: false }));
          chains[key].push({ p: to, hop: false });
        } else {
          const diceSteps = diceV ?? Math.abs(s - b);
          const chain: ChainStep[] = [];
          for (let k = 1; k <= diceSteps; k++) {
            const h = b + k;
            chain.push({ p: stepPoint(color, h, i), hop: h < LUDO_HOME_STEP, color });
          }
          /* فرود روی خانهٔ سورپرایز («خانهٔ جایزه»)؟ — مهره روی همان خانه مکث
             می‌کند و نوشتهٔ اثر («۳ خانه جلو!» و مانند آن) بالای مهره نشان
             داده می‌شود تا همه بفهمند چه اتفاقی افتاده؛ بعد مسیر تا مقصد
             نهایی ادامه می‌یابد. همین زنجیره توضیح «زدن با عدد دیگر» است. */
          const landStep = b + diceSteps;
          const landAbs = ludoAbsCellOf(color, landStep);
          const surp = diceV !== null && landAbs !== null ? l.surprise.find((sv) => sv.cell === landAbs) : undefined;
          if (surp) {
            chain[chain.length - 1].pause = surp.kind;
            if (s !== landStep) {
              const dir = Math.sign(s - landStep);
              for (let k = 1; k <= Math.abs(s - landStep); k++) {
                const h = landStep + dir * k;
                chain.push({ p: stepPoint(color, h, i), hop: h < LUDO_HOME_STEP, color });
              }
            }
          } else if (chain.length === 0 || Math.abs(s - b) !== diceSteps) {
            const last = chain[chain.length - 1]?.p ?? from;
            chain.push({ p: lerp(last, to, 0.5), hop: false }, { p: to, hop: false });
          }
          chains[key] = chain;
        }
      });
    }

    const myToken = ++animToken.current;
    (async () => {
      const cur = { ...posRef.current };
      const keys = Object.keys(chains);
    for (let step = 0; step < 14; step++) {
      if (animToken.current !== myToken) return;
      let moved = false;
      let anyHop = false;
      let pauseKind: LudoSurpriseKind | null = null;
      let pausePos: XY | null = null;
      for (const key of keys) {
        const nxt = chains[key]?.[step];
        if (nxt) {
          cur[key] = nxt.p;
          moved = true;
          if (nxt.hop && nxt.color !== undefined) {
            anyHop = true;
            const col = Math.round(nxt.p[0] / CELL - 0.5);
            const row = Math.round(nxt.p[1] / CELL - 0.5);
            addTint(col, row, LUDO_COLOR_INFO[nxt.color].base, false);
          }
          if (nxt.pause) {
            pauseKind = nxt.pause;
            pausePos = nxt.p;
          }
        }
      }
      if (!moved) break;
      posRef.current = { ...cur };
      forceRender((x) => x + 1);
      if (anyHop) sfxHop(); // صدای قدم در هر خانه
      await new Promise((r) => setTimeout(r, STEP_MS));
      /* مکث کوتاه روی خانهٔ سورپرایز + نوشتهٔ اثر بالای مهره */
      if (pauseKind && pausePos && animToken.current === myToken) {
        setSurpriseFx({ x: pausePos[0], y: pausePos[1], kind: pauseKind, at: Date.now() });
        await new Promise((r) => setTimeout(r, SURPRISE_PAUSE_MS));
      }
    }

      if (animToken.current !== myToken) return;
      posRef.current = { ...posRef.current, ...targets };
      forceRender((x) => x + 1);
    })();
  }, [l.seq, l.pieces, l.dice, colorOf, computeTargets, addTint, shakeBoard]);

  /* ---------- قوانین: اکشن‌های مجاز من ---------- */
  const myColor = colorOf[me];
  const myTurn = Boolean(l.myTurn) && !l.finished;
  const surpriseCells = useMemo(() => l.surprise.map((s) => s.cell), [l.surprise]);
  const legal = useMemo(() => {
    if (!myTurn || !l.dice || myColor === undefined) return [];
    return ludoActionsFor({ me, colorOf, pieces: l.pieces, dice: l.dice, surprise: surpriseCells });
  }, [myTurn, l.dice, l.pieces, colorOf, surpriseCells, me, myColor]);
  const movable = useMemo(() => new Set(legal.map((a) => a.piece)), [legal]);
  const hasEnter = legal.some((a) => a.kind === "enter");

  /* ---------- ریتم تاس: چرخش خوش‌بینانه + فرود نرم روی عدد سرور + مکث فرود ----------
     با کلیک، چرخش همان لحظه آغاز می‌شود (بدون انتظار برای شبکه — لگ ندارد)؛
     وقتی عدد سرور رسید، همین چرخش با یک انتقال کاهنده روی وجه واقعی فرود
     می‌آید — هیچ چرخش دوباره‌ای در کار نیست، تاس روی عدد ثابت می‌ماند و
     کلید پرتاب «at» سرور است (نه seq) تا حرکت و پاس باعث چرخش نشوند. */
  const [rolling, setRolling] = useState(false);
  const [settling, setSettling] = useState(false);
  const rollingRef = useRef(false);
  const settlingRef = useRef(false);
  const landedRef = useRef(true); // چرخش در جریان روی عدد واقعی فرود کرده؟
  const clickRollRef = useRef(false); // پرتابِ دستی خودم — صدای تاس در کلیک پخش شده
  const rollId = l.dice ? `${l.dice.at ?? "x"}:${l.dice.v}` : "";
  const lastRollIdRef = useRef("");
  const diceTimersRef = useRef<number[]>([]);
  const clearDiceTimers = useCallback(() => {
    diceTimersRef.current.forEach((x) => window.clearTimeout(x));
    diceTimersRef.current = [];
  }, []);
  const lastLandVRef = useRef(1); // آخرین وجه فرودشده — بعد از برداشتن تاس هم روی تاس می‌ماند

  /* چرخش تاس با زاویهٔ انباشته — هر فرود دقیقاً روی وجه واقعی می‌نشیند */
  const dieRotRef = useRef({ x: 0, y: 0 });
  const [dieAnim, setDieAnim] = useState({ x: 0, y: 0, dur: 0, ease: "cubic-bezier(.16,.72,.22,1)" });
  const spinStartRef = useRef(0);

  /** فاز چرخش بدون عدد (انتظار برای پاسخ سرور) — چرخش پیوسته و روان */
  const glideOnce = useCallback((dur: number) => {
    const r = dieRotRef.current;
    const nx = r.x + 250;
    const ny = r.y + 320;
    dieRotRef.current = { x: nx, y: ny };
    setDieAnim({ x: nx, y: ny, dur, ease: "linear" });
  }, []);

  /** فرود نرم روی عدد واقعی — انتقال کاهنده تا وجه دقیق؛ تاس آرام روی عدد می‌نشیند */
  const landDie = useCallback((v: number, dur: number, extraTurns: number) => {
    const r = dieRotRef.current;
    const f = DIE_FACE_ROT[v] ?? DIE_FACE_ROT[1];
    const mod = (a: number) => ((a % 360) + 360) % 360;
    const nx = r.x + mod(f.x - r.x) + 360 * extraTurns;
    const ny = r.y + mod(f.y - r.y) + 360 * extraTurns;
    dieRotRef.current = { x: nx, y: ny };
    lastLandVRef.current = v;
    landedRef.current = true;
    setDieAnim({ x: nx, y: ny, dur, ease: "cubic-bezier(.16,.72,.22,1)" });
  }, []);

  /** پایان چرخش — مکث فرود؛ عدد دست‌کم ۲ثانیه ثابت و خوانا دیده می‌شود */
  const beginSettle = useCallback((v: number) => {
    rollingRef.current = false;
    setRolling(false);
    settlingRef.current = true;
    setSettling(true);
    if (v === 6) diceTimersRef.current.push(window.setTimeout(() => sfxDing(), 350)); // دینگ آوردن ۶
    diceTimersRef.current.push(
      window.setTimeout(() => {
        settlingRef.current = false;
        setSettling(false);
      }, SETTLE_MS),
    );
  }, []);

  /** چرخش خوش‌بینانهٔ بی‌پاسخ — بدون عدد، تاس به وجه قبلی برمی‌گردد */
  const abortSpin = useCallback(() => {
    if (!rollingRef.current) return;
    clearDiceTimers();
    landDie(lastLandVRef.current, 450, 0);
    rollingRef.current = false;
    setRolling(false);
    settlingRef.current = false;
    setSettling(false);
  }, [clearDiceTimers, landDie]);

  useEffect(() => {
    if (!rollId) {
      /* تاس از زمین برداشته شد (حرکت/پاس) — وجه فرودشده روی تاس می‌ماند تا پرتاب بعدی؛
         هر چرخش یا مکثِ در جریان هم بسته می‌شود تا تاس هرگز بی‌وقفه نچرخد */
      if (lastRollIdRef.current) {
        lastRollIdRef.current = "";
        clearDiceTimers();
        rollingRef.current = false;
        settlingRef.current = false;
        landedRef.current = true;
        setRolling(false);
        setSettling(false);
      }
      return;
    }
    if (lastRollIdRef.current === rollId) return;
    lastRollIdRef.current = rollId;
    const v = l.dice?.v ?? 1;
    /* مکث فرود قبلی (اگر هنوز تمام نشده) همین‌جا بسته می‌شود — چرخش تازه آغاز می‌شود */
    clearDiceTimers();
    settlingRef.current = false;
    setSettling(false);
    if (!clickRollRef.current) sfxDice();
    clickRollRef.current = false;
    if (rollingRef.current) {
      /* چرخش خوش‌بینانه در جریان است — با بودجهٔ زمانی باقی‌مانده روی عدد واقعی فرود می‌آید */
      const elapsed = Date.now() - spinStartRef.current;
      const remaining = Math.max(ROLL_LAND_MIN_MS, ROLL_SPIN_MS - elapsed);
      landDie(v, remaining, 1);
      diceTimersRef.current.push(window.setTimeout(() => beginSettle(v), remaining));
    } else {
      /* تماشاگرها یا پاسخِ رسیده به سکون — یک چرخش کامل کاهنده تا فرود روی عدد سرور */
      rollingRef.current = true;
      landedRef.current = false;
      setRolling(true);
      landDie(v, ROLL_SPIN_MS, 1);
      diceTimersRef.current.push(window.setTimeout(() => beginSettle(v), ROLL_SPIN_MS));
    }
    return clearDiceTimers;
  }, [rollId, clearDiceTimers, landDie, beginSettle]);

  /* پاس خودکار وقتی هیچ حرکتی ممکن نیست — ولی فقط بعد از مکث فرود تاس،
     تا بازیکن عدد تاس را ببیند و نوبت جلوی چشمش رد نشود. گارد با
     پرچم‌های زنده (ref) است نه مقدار کهنهٔ رندر — وگرنه پاس بلافاصله بعد
     از رسیدن تاس می‌پرید، چرخش نیمه‌کاره قطع می‌شد و عدد هرگز دیده نمی‌شد. */
  const passSeqRef = useRef(-1);
  useEffect(() => {
    if (!myTurn || !l.dice || l.finished) return;
    if (rollingRef.current || settlingRef.current) return;
    if (legal.length === 0 && passSeqRef.current !== l.seq) {
      passSeqRef.current = l.seq;
      void sendAction({ type: "ludo_pass" });
    }
  }, [myTurn, l.dice, legal.length, l.finished, l.seq, rolling, settling, sendAction]);

  /* اتمام کار یک بازیکن — فانفار کوتاه */
  const finisherRef = useRef("");
  useEffect(() => {
    const done = l.players
      .filter((p) => p.finished)
      .map((p) => p.id)
      .sort()
      .join(",");
    if (!done || finisherRef.current === done) return;
    finisherRef.current = done;
    if (!l.finished) sfxFinisher();
  }, [l.players, l.finished]);

  const finishedRef = useRef("");
  useEffect(() => {
    if (!l.finished || !l.result) return;
    const key = `${st.room.code}:${l.result.map((r) => r.id).join(",")}`;
    if (finishedRef.current === key) return;
    finishedRef.current = key;
    const myRank = l.result.find((r) => r.id === me)?.rank ?? 9;
    if (myRank === 1) sfxWin();
    else sfxLose();
  }, [l.finished, l.result, me, st.room.code]);

  /* ---------- اکشن‌ها ---------- */
  const roll = useCallback(async () => {
    if (!myTurn || l.dice || rollingRef.current || settlingRef.current || l.finished) return;

    clickRollRef.current = true;
    sfxDice();
    /* چرخش خوش‌بینانه — همان لحظهٔ کلیک آغاز می‌شود؛ هیچ انتظاری برای شبکه
       در کار نیست. وقتی عدد سرور رسید، همین چرخش روی عدد واقعی فرود می‌آید. */
    landedRef.current = false;
    rollingRef.current = true;
    settlingRef.current = false;
    setRolling(true);
    setSettling(false);
    spinStartRef.current = Date.now();
    glideOnce(OPTIMISTIC_GLIDE_MS);
    const chainGlide = () => {
      if (!rollingRef.current || landedRef.current) return;
      glideOnce(OPTIMISTIC_GLIDE_MS);
      diceTimersRef.current.push(window.setTimeout(chainGlide, OPTIMISTIC_GLIDE_MS - 40));
    };
    diceTimersRef.current.push(window.setTimeout(chainGlide, OPTIMISTIC_GLIDE_MS - 40));
    /* امانی — اگر پاسخ سرور هرگز نرسد، چرخش به وجه قبلی برمی‌گردد */
    diceTimersRef.current.push(
      window.setTimeout(() => {
        if (rollingRef.current && !landedRef.current) abortSpin();
      }, OPTIMISTIC_GLIDE_MS * 3 + 400),
    );
    const ok = await sendAction({ type: "ludo_roll" });
    if (!ok) {
      clickRollRef.current = false;
      abortSpin();
    }

    /* پشتیبان — اگر حالت سرور نرسید، پرچم صدا خودکار پاک شود */
    window.setTimeout(() => {
      clickRollRef.current = false;
    }, 4000);
  }, [myTurn, l.dice, l.finished, sendAction, glideOnce, abortSpin]);


  const [shakeKey, setShakeKey] = useState<string | null>(null);
  const movePiece = useCallback(
    async (piece: number) => {
      /* تا پایان چرخش تاس مهره‌ها واکنشی نیستند؛ در مکث فرود (عدد ثابت) انتخاب آزاد است */
      if (!myTurn || !l.dice || l.finished || rolling) return;
      if (!movable.has(piece)) {
        setShakeKey(`${me}:${piece}`);
        setTimeout(() => setShakeKey(null), 500);
        return;
      }
      const ok = await sendAction({ type: "ludo_move", piece });
      if (!ok) {
        setShakeKey(`${me}:${piece}`);
        setTimeout(() => setShakeKey(null), 500);
      }
    },
    [myTurn, l.dice, l.finished, rolling, settling, movable, me, sendAction],
  );

  /* ---------- تمام‌صفحه ---------- */
  const wrapRef = useRef<HTMLDivElement>(null);
  const [fsReal, setFsReal] = useState(false);
  const [fsFake, setFsFake] = useState(false);
  const fs = fsReal || fsFake;
  const toggleFs = useCallback(() => {
    if (typeof document === "undefined") return;
    if (document.fullscreenElement) {
      void document.exitFullscreen?.().catch(() => undefined);
      setFsFake(false);
      return;
    }
    const el = wrapRef.current;
    const canRequest = Boolean(el?.requestFullscreen);
    el?.requestFullscreen?.().catch(() => setFsFake(true));
    if (!canRequest) setFsFake(true); // iOS Safari — تمام‌صفحهٔ CSS
  }, []);
  useEffect(() => {
    const h = () => setFsReal(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", h);
    return () => document.removeEventListener("fullscreenchange", h);
  }, []);

  /* ---------- قوانین ---------- */
  const [rulesOpen, setRulesOpen] = useState(false);
  /* داشبورد چت داخل بازی */
  const [chatOpen, setChatOpen] = useState(false);
  const autoRules = useRef(false);
  useEffect(() => {
    if (!autoRules.current && countdown > 0 && countdown < LUDO_RULES_AUTO_MS) {
      autoRules.current = true;
      setRulesOpen(true);
    }
  }, [countdown]);

  /* ---------- قطع صدا ---------- */
  const [muted, setMuted] = useState(false);
  useEffect(() => {
    setMuted(sfxIsMuted());
  }, []);
  const toggleMute = useCallback(() => {
    setMuted(sfxToggleMuted());
  }, []);

  /* ---------- چیدمان مهره‌ها با جابه‌جایی دسته‌ها ---------- */
  const pieceNodes = useMemo(() => {
    const groups = new Map<string, string[]>();
    for (const [key, p] of Object.entries(posRef.current)) {
      const gkey = `${Math.round(p[0])},${Math.round(p[1])}`;
      const arr = groups.get(gkey) ?? [];
      arr.push(key);
      groups.set(gkey, arr);
    }
    const nodes: {
      key: string;
      pid: string;
      idx: number;
      color: LudoColor;
      x: number;
      y: number;
      scale: number;
      movable: boolean;
      online: boolean;
      finishedPlayer: boolean;
    }[] = [];
    const playerById = new Map(l.players.map((p) => [p.id, p]));
    const movesVisible = !rolling; // تا پایان چرخش تاس، نبض مهره‌ها پنهان است — در مکث فرود انتخاب آزاد است
    for (const [gkey, keys] of groups) {
      const [gx, gy] = gkey.split(",").map(Number);
      keys.sort();
      keys.forEach((key, i) => {
        const [pid, idxStr] = [key.slice(0, key.lastIndexOf(":")), Number(key.slice(key.lastIndexOf(":") + 1))];
        const color = colorOf[pid];
        const p = posRef.current[key];
        if (!p || color === undefined) return;
        const base = [p[0], p[1]];
        const off = keys.length > 1 ? (i - (keys.length - 1) / 2) * 9 : 0;
        const player = playerById.get(pid);
        nodes.push({
          key,
          pid,
          idx: idxStr,
          color,
          x: base[0] + off,
          y: base[1],
          scale: keys.length > 1 ? 0.82 : 1,
          movable: movesVisible && movable.has(idxStr) && pid === me && myTurn,
          online: player?.online ?? true,
          finishedPlayer: player?.finished ?? false,
        });
      });
      void gx;
      void gy;
    }
    /* مهره‌های قابل‌حرکت و نوبت‌دار رو قرار می‌گیرند */
    return nodes.sort((a, b) => Number(a.movable) - Number(b.movable) || a.y - b.y);
  }, [colorOf, movable, me, myTurn, l.players, rolling, tick]);

  const turnPlayer = l.players.find((p) => p.id === l.turnId);
  const remainingMs = Math.max(0, l.deadline - localNow);
  /* پنجرهٔ زمانی نوبت — برای ربات‌ها پنجرهٔ واقعی کوتاه‌تر است تا قوس زمان درست تخلیه شود */
  const turnIsBot = turnPlayer?.bot ?? false;
  const windowMs = l.dice
    ? turnIsBot
      ? LUDO_BOT_MOVE_MIN + LUDO_BOT_MOVE_VAR
      : LUDO_MOVE_MS
    : turnIsBot
      ? LUDO_BOT_ROLL_MIN + LUDO_BOT_ROLL_VAR
      : LUDO_TURN_MS;
  const timerFrac = Math.min(1, Math.max(0, remainingMs / windowMs));
  const turnColor = turnPlayer ? LUDO_COLOR_INFO[turnPlayer.color].base : "#fbbf24";
  const myInfo = myColor !== undefined ? LUDO_COLOR_INFO[myColor] : null;
  const ctaActive = myTurn && !l.dice && !l.finished && countdown === 0 && !rolling;

  const surpriseBadge = (kind: LudoSurpriseKind): { good: boolean; chevrons: 0 | 1 | 2; back: boolean } => ({
    good: kind === "fwd4" || kind === "fwd3" || kind === "again",
    chevrons: kind === "fwd4" || kind === "back4" ? 2 : kind === "again" ? 0 : 1,
    back: kind === "back4" || kind === "back3",
  });

  return (
    <div
      ref={wrapRef}
      className={
        fs
          ? "fixed inset-0 z-[70] overflow-y-auto bg-zinc-950"
          : "relative"
      }
    >
      <style>{`
        .ludo-piece { transition: transform 400ms cubic-bezier(.32,.72,.35,1.06); will-change: transform; }
        .ludo-pulse { transform-box: fill-box; transform-origin: center; animation: ludoPulse 1.15s ease-in-out infinite; }
        @keyframes ludoPulse { 0%,100% { transform: scale(1); opacity: .35 } 50% { transform: scale(1.28); opacity: .95 } }
        .ludo-shake { animation: ludoShake .5s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
        @keyframes ludoShake { 0%,100% { transform: rotate(0deg) scale(1) } 25% { transform: rotate(-9deg) scale(1.06) } 75% { transform: rotate(9deg) scale(1.06) } }
        .ludo-shake2 { animation: ludoShake2 .45s ease-in-out; }
        @keyframes ludoShake2 { 0%,100% { transform: translateX(0) } 25% { transform: translateX(-4px) } 75% { transform: translateX(4px) } }
        .ludo-flash { animation: ludoFlash .9s ease-out forwards; }
        @keyframes ludoFlash { 0% { opacity: .85; transform: scale(.6) } 100% { opacity: 0; transform: scale(2.1) } }
        .ludo-glow { animation: ludoGlow 1.8s ease-in-out infinite; }
        @keyframes ludoGlow { 0%,100% { opacity: .12 } 50% { opacity: .42 } }
        .ludo-roll-cta { animation: ludoCta 1.4s ease-in-out infinite; }
        @keyframes ludoCta { 0%,100% { transform: scale(1); } 50% { transform: scale(1.08); } }
        .ludo-confetti { animation: ludoConf linear forwards; }
        @keyframes ludoConf { 0% { transform: translateY(-10vh) rotate(0deg); opacity: 1 } 100% { transform: translateY(105vh) rotate(720deg); opacity: .7 } }
        .ludo-tint { animation: ludoTint .75s ease-out forwards; transform-box: fill-box; transform-origin: center; }
        @keyframes ludoTint { 0% { opacity: .5 } 100% { opacity: 0 } }
        @keyframes ludoTintStrong { 0% { opacity: .7; transform: scale(.72) } 30% { opacity: .5; transform: scale(1.04) } 100% { opacity: 0; transform: scale(1.14) } }
        .ludo-board-shake { animation: ludoBoardShake .42s ease-in-out; }
        @keyframes ludoBoardShake { 0%,100% { transform: translate(0,0) rotate(0deg) } 22% { transform: translate(-5px,2px) rotate(-.45deg) } 48% { transform: translate(4px,-2px) rotate(.35deg) } 72% { transform: translate(-2px,1px) } }
        .ludo-die-scene { width: 64px; height: 64px; perspective: 480px; }
        @media (max-width: 639px) { .ludo-die-scene { transform: scale(.84); margin: -7px; } }
        .ludo-die-settle { animation: ludoSettlePop .95s ease-out; }
        @keyframes ludoSettlePop { 0% { transform: scale(1) } 30% { transform: scale(1.14); filter: drop-shadow(0 0 10px rgba(251,191,36,.65)) } 100% { transform: scale(1) } }
        .ludo-die { position: relative; width: 100%; height: 100%; transform-style: preserve-3d; }

        .ludo-surprise-fx { animation: ludoSurpriseFx 1.2s ease-out forwards; transform-box: fill-box; transform-origin: center; }
        @keyframes ludoSurpriseFx { 0% { opacity: 0; transform: scale(.45) } 16% { opacity: 1; transform: scale(1.14) } 28% { transform: scale(1) } 80% { opacity: 1; transform: scale(1) } 100% { opacity: 0; transform: scale(1.08) } }

        .ludo-die-face { position: absolute; inset: 0; border-radius: 14px; background: linear-gradient(150deg,#fffef8 0%,#f6ecd2 55%,#e4d3aa 100%); border: 1px solid #c9b78d; box-shadow: inset 0 0 12px rgba(255,255,255,.8), inset 0 -3px 8px rgba(176,146,86,.4); }
        .ludo-die-face-1 { transform: translateZ(32px) }
        .ludo-die-face-6 { transform: rotateY(180deg) translateZ(32px) }
        .ludo-die-face-3 { transform: rotateY(90deg) translateZ(32px) }
        .ludo-die-face-4 { transform: rotateY(-90deg) translateZ(32px) }
        .ludo-die-face-2 { transform: rotateX(90deg) translateZ(32px) }
        .ludo-die-face-5 { transform: rotateX(-90deg) translateZ(32px) }
        .ludo-pip { position: absolute; width: 16%; height: 16%; border-radius: 9999px; background: radial-gradient(circle at 34% 30%, #5a4620, #1f1503 72%); transform: translate(-50%,-50%); box-shadow: inset 0 1px 2px rgba(255,255,255,.4) }
      `}</style>

      <div
        className={`mx-auto flex w-full flex-col items-center gap-3 px-3 pb-5 pt-3 ${
          fs ? "min-h-dvh justify-center sm:gap-4" : "max-w-[620px]"
        }`}
      >
        {/* نوار آیکون‌ها — بدون هیچ نوشته‌ای */}
        <div className="flex w-full items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            {l.players.map((p) => {
              const info = LUDO_COLOR_INFO[p.color];
              const isTurn = p.id === l.turnId && !l.finished;
              return (
                <span
                  key={p.id}
                  className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 transition-all ${
                    isTurn
                      ? "scale-105"
                      : "border-zinc-800 bg-zinc-900/70"
                  } ${p.online ? "" : "opacity-45"}`}
                  style={
                    isTurn
                      ? {
                          borderColor: info.base,
                          background: `${info.base}1f`,
                          boxShadow: `0 0 16px ${info.base}40`,
                        }
                      : undefined
                  }
                >
                  <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0" aria-hidden="true">
                    <circle cx="10" cy="7" r="4.6" fill={info.base} />
                    <path d="M6.2 16.5c0-3 1.7-4.6 3.8-4.6s3.8 1.6 3.8 4.6z" fill={info.base} />
                  </svg>
                  <span className="hidden max-w-24 truncate text-xs font-bold text-zinc-200 sm:inline">
                    {p.name}
                  </span>
                  {p.bot && <Bot className="h-3.5 w-3.5 shrink-0 text-sky-300" aria-hidden="true" />}
                  {p.finished && <Crown className="h-3.5 w-3.5 shrink-0 text-amber-300" aria-hidden="true" />}
                  <span className="text-[10px] font-black text-zinc-400" aria-hidden="true">
                    {new Intl.NumberFormat(lang === "fa" ? "fa-IR" : "en-US").format(p.home)}
                  </span>
                </span>
              );
            })}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              id="ludo-mute"
              onClick={toggleMute}
              aria-label={muted ? "unmute" : "mute"}
              className="rounded-full border border-zinc-800 bg-zinc-900/70 p-2 text-zinc-400 transition hover:text-zinc-200"
            >
              {muted ? <VolumeX className="h-4 w-4" aria-hidden="true" /> : <Volume2 className="h-4 w-4" aria-hidden="true" />}
            </button>
            <button
              id="ludo-rules"
              onClick={() => setRulesOpen(true)}
              aria-label={L.openRules}
              className="rounded-full border border-zinc-800 bg-zinc-900/70 p-2 text-zinc-400 transition hover:text-zinc-200"
            >
              <HelpCircle className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              id="ludo-fs"
              onClick={toggleFs}
              aria-label={fs ? L.exitFullscreen : L.fullscreen}
              className="rounded-full border border-sky-500/40 bg-sky-500/10 p-2 text-sky-300 transition hover:bg-sky-500/20"
            >
              {fs ? <Minimize2 className="h-4 w-4" aria-hidden="true" /> : <Maximize2 className="h-4 w-4" aria-hidden="true" />}
            </button>
          </div>
        </div>

        {/* ---------- تخته ---------- */}
        <div ref={boardRef} className="relative w-full" style={{ width: fs ? "min(100%, calc(100dvh - 210px))" : "min(100%, 560px)" }}>
          <svg viewBox={`0 0 ${BOARD} ${BOARD}`} className="h-auto w-full select-none rounded-2xl shadow-2xl" role="img">
            <defs>
              <linearGradient id="ludoFrame" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#7a4a22" />
                <stop offset="0.5" stopColor="#5d3617" />
                <stop offset="1" stopColor="#462711" />
              </linearGradient>
              <linearGradient id="ludoField" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#fdf7e7" />
                <stop offset="1" stopColor="#f3e7c8" />
              </linearGradient>
              <radialGradient id="ludoSurprise" cx="0.5" cy="0.4" r="0.8">
                <stop offset="0" stopColor="#fff8dc" />
                <stop offset="1" stopColor="#ffe9a8" />
              </radialGradient>
              {([0, 1, 2, 3] as LudoColor[]).map((c) => {
                const info = LUDO_COLOR_INFO[c];
                return (
                  <radialGradient key={c} id={`ludoPg${c}`} cx="0.34" cy="0.28" r="0.95">
                    <stop offset="0" stopColor={info.light} />
                    <stop offset="0.55" stopColor={info.base} />
                    <stop offset="1" stopColor={info.dark} />
                  </radialGradient>
                );
              })}
              {([0, 1, 2, 3] as LudoColor[]).map((c) => {
                const info = LUDO_COLOR_INFO[c];
                return (
                  <linearGradient key={c} id={`ludoBase${c}`} x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor={info.light} stopOpacity="0.9" />
                    <stop offset="1" stopColor={info.base} stopOpacity="0.75" />
                  </linearGradient>
                );
              })}
              <filter id="ludoShadow" x="-60%" y="-60%" width="220%" height="220%">
                <feDropShadow dx="0" dy="2.4" stdDeviation="2.2" floodColor="#3a2a10" floodOpacity="0.45" />
              </filter>
            </defs>

            {/* قاب و میدان */}
            <rect x="0" y="0" width={BOARD} height={BOARD} rx="26" fill="url(#ludoFrame)" />
            <rect x="10" y="10" width={BOARD - 20} height={BOARD - 20} rx="20" fill="url(#ludoField)" />
            <rect x="10" y="10" width={BOARD - 20} height={BOARD - 20} rx="20" fill="none" stroke="#e3d3a8" strokeWidth="2" />

            {/* پایگاه‌ها */}
            {([0, 1, 2, 3] as LudoColor[]).map((c) => {
              const info = LUDO_COLOR_INFO[c];
              const bx = (c === 0 || c === 3 ? 0 : 9) * CELL;
              const by = (c === 0 || c === 1 ? 0 : 9) * CELL;
              const isTurn = l.turnId === l.players.find((p) => p.color === c)?.id && !l.finished;
              return (
                <g key={`base${c}`}>
                  {isTurn && (
                    <rect x={bx + 6} y={by + 6} width={228} height={228} rx="20" fill={info.base} className="ludo-glow" />
                  )}
                  <rect x={bx + 10} y={by + 10} width={220} height={220} rx="18" fill={`url(#ludoBase${c})`} stroke={info.dark} strokeWidth="2.5" />
                  <rect x={bx + 34} y={by + 34} width={172} height={172} rx="14" fill="#fffdf4" opacity="0.85" stroke={info.base} strokeWidth="1.5" />
                  {LUDO_BASE_ANCHORS[c].map(([ac, ar], i) => (
                    <circle key={i} cx={ac * CELL} cy={ar * CELL} r="19" fill={info.light} opacity="0.35" stroke={info.base} strokeWidth="1.5" />
                  ))}
                </g>
              );
            })}

            {/* خانه‌های مسیر */}
            {LUDO_TRACK.map(([c, r], abs) => {
              const startOwner = LUDO_START_ABS.indexOf(abs);
              const isStart = startOwner >= 0;
              const info = isStart ? LUDO_COLOR_INFO[startOwner as LudoColor] : null;
              const sur = l.surprise.find((s) => s.cell === abs);
              return (
                <g key={abs}>
                  <rect
                    x={c * CELL + 3}
                    y={r * CELL + 3}
                    width={CELL - 6}
                    height={CELL - 6}
                    rx="8"
                    fill={isStart ? `url(#ludoBase${startOwner as LudoColor})` : sur ? "url(#ludoSurprise)" : "#fffdf4"}
                    stroke={isStart ? info!.dark : sur ? "#d9a53f" : "#e2d4ab"}
                    strokeWidth={isStart || sur ? 2.2 : 1.4}
                  />
                  {/* فلش خانهٔ شروع در جهت حرکت */}
                  {isStart && (
                    <g transform={`translate(${(c + 0.5) * CELL} ${(r + 0.5) * CELL}) rotate(${trackDirection(abs)})`} opacity="0.9">
                      <path d="M -7 -6 L 7 0 L -7 6 Z" fill="#ffffff" stroke={info!.dark} strokeWidth="1" />
                    </g>
                  )}
                  {/* نشان سورپرایز — فقط شِورون و آیکون، بدون متن */}
                  {sur &&
                    (() => {
                      const b = surpriseBadge(sur.kind);
                      const angle = b.back ? trackDirection(abs) + 180 : trackDirection(abs);
                      return (
                        <g transform={`translate(${(c + 0.5) * CELL} ${(r + 0.5) * CELL})`}>
                          {b.chevrons > 0 ? (
                            <g transform={`rotate(${angle})`}>
                              {Array.from({ length: b.chevrons }).map((_, i) => (
                                <path
                                  key={i}
                                  d="M -5 -5.5 L 2 0 L -5 5.5"
                                  transform={`translate(${i * 5.5 - (b.chevrons - 1) * 2.75} 0)`}
                                  fill="none"
                                  stroke={b.good ? "#6d28d9" : "#be123c"}
                                  strokeWidth="2.8"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              ))}
                            </g>
                          ) : (
                            <g transform={`rotate(${trackDirection(abs)})`}>
                              <rect x="-8" y="-6.5" width="16" height="13" rx="3.5" fill="#fffdf4" stroke="#d9a53f" strokeWidth="1.6" />
                              <circle cx="-3.5" cy="-2" r="1.6" fill="#6d28d9" />
                              <circle cx="3.5" cy="-2" r="1.6" fill="#6d28d9" />
                              <circle cx="0" cy="3" r="1.6" fill="#6d28d9" />
                            </g>
                          )}
                        </g>
                      );
                    })()}
                  {/* فلش سلول فلش‌بک */}
                  {flash?.key === `${c}-${r}` && (
                    <circle cx={(c + 0.5) * CELL} cy={(r + 0.5) * CELL} r="17" fill={flash.color} opacity="0.55" className="ludo-flash" />
                  )}
                </g>
              );
            })}

            {/* ستون خانه‌های خودی */}
            {([0, 1, 2, 3] as LudoColor[]).map((c) =>
              LUDO_COLUMN[c].map(([cc, rr], i) => {
                const info = LUDO_COLOR_INFO[c];
                return (
                  <rect
                    key={`col${c}-${i}`}
                    x={cc * CELL + 3}
                    y={rr * CELL + 3}
                    width={CELL - 6}
                    height={CELL - 6}
                    rx="8"
                    fill={info.light}
                    opacity={0.55 + i * 0.09}
                    stroke={info.dark}
                    strokeWidth="1.6"
                  />
                );
              }),
            )}

            {/* رد رنگی — خانه‌ها با عبور/فرود مهره به رنگ او در می‌آیند */}
            {tints.map((t) => (
              <rect
                key={`t${t.id}`}
                x={t.col * CELL + 2}
                y={t.row * CELL + 2}
                width={CELL - 4}
                height={CELL - 4}
                rx="9"
                fill={t.color}
                className="ludo-tint"
                style={t.strong ? { animationName: "ludoTintStrong", animationDuration: "2.2s" } : undefined}
              />
            ))}

            {/* خانهٔ مرکزی — چهار مثلث */}
            <g stroke="#fffdf4" strokeWidth="2" strokeLinejoin="round">
              <polygon points="240,240 240,360 300,300" fill={LUDO_COLOR_INFO[0].base} opacity="0.95" />
              <polygon points="240,240 360,240 300,300" fill={LUDO_COLOR_INFO[1].base} opacity="0.95" />
              <polygon points="360,240 360,360 300,300" fill={LUDO_COLOR_INFO[2].base} opacity="0.95" />
              <polygon points="240,360 360,360 300,300" fill={LUDO_COLOR_INFO[3].base} opacity="0.95" />
            </g>

            {/* درخشش رسیدن مهره به خانه */}
            {homeBurst > 0 && (
              <g key={`hb${homeBurst}`} className="ludo-flash" style={{ transformOrigin: "300px 300px" }}>
                <circle cx="300" cy="300" r="24" fill="none" stroke="#fbbf24" strokeWidth="3" />
                <circle cx="300" cy="300" r="13" fill="#fde68a" />
              </g>
            )}

            {/* مهره‌ها */}
            {pieceNodes.map((n) => {
              const info = LUDO_COLOR_INFO[n.color];
              const isShaking = shakeKey === n.key;
              return (
                <g
                  key={n.key}
                  className={`ludo-piece ${isShaking ? "ludo-shake2" : ""}`}
                  style={{ transform: `translate(${n.x}px, ${n.y}px)`, cursor: n.movable ? "pointer" : "default" }}
                  onClick={() => movePiece(n.idx)}
                  role="button"
                  aria-label={`${info.fa} ${n.idx + 1}`}
                >
                  {n.movable && (
                    <g className="ludo-pulse">
                      <circle r="18" fill="none" stroke={info.light} strokeWidth="3" />
                    </g>
                  )}
                  <ellipse cx="0" cy="7" rx="10.5" ry="4" fill="#3a2a10" opacity="0.3" />
                  <g transform={`scale(${n.scale})`} opacity={n.online || n.finishedPlayer ? 1 : 0.55}>
                    <circle r="12.5" fill={`url(#ludoPg${n.color})`} stroke={info.dark} strokeWidth="1.8" filter="url(#ludoShadow)" />
                    <ellipse cx="-3.6" cy="-4.8" rx="4.4" ry="3" fill="#ffffff" opacity="0.6" />
                    <circle r="9.2" fill="none" stroke={info.dark} opacity="0.35" strokeWidth="1.2" />
                  </g>
                </g>
              );
            })}
            {/* نوشتهٔ اثر خانهٔ سورپرایز بالای مهره — نقش «خانهٔ جایزه» را نشان می‌دهد */}
            {surpriseFx && (
              <g
                transform={`translate(${Math.min(500, Math.max(100, surpriseFx.x))}, ${Math.max(36, surpriseFx.y - 32)})`}
                textAnchor="middle"
              >
                <g key={`sf${surpriseFx.at}`} className="ludo-surprise-fx">
                  <rect
                    x="-66"
                    y="-17"
                    width="132"
                    height="34"
                    rx="17"
                    fill={SURPRISE_FX_INFO[surpriseFx.kind].bg}
                    stroke={SURPRISE_FX_INFO[surpriseFx.kind].edge}
                    strokeWidth="2.2"
                  />
                  <text x="0" y="6" fontSize="17" fontWeight="800" fill="#2a1607">
                    {SURPRISE_FX_INFO[surpriseFx.kind].text}
                  </text>
                </g>
              </g>
            )}
          </svg>

          {/* آواتار صاحب هر رنگ — گوشهٔ پایگاه خودش */}
          <div className="pointer-events-none absolute inset-0" aria-hidden="true">
            {l.players.map((p) => {
              const pos = LUDO_AVATAR_POS[p.color];
              const info = LUDO_COLOR_INFO[p.color];
              const isTurn = p.id === l.turnId && !l.finished;
              return (
                <div
                  key={`av${p.id}`}
                  className="absolute aspect-square -translate-x-1/2 -translate-y-1/2"
                  style={{
                    left: `${pos[0]}%`,
                    top: `${pos[1]}%`,
                    width: "7.4%",
                    filter: isTurn ? `drop-shadow(0 0 6px ${info.base})` : undefined,
                  }}
                >
                  <div
                    className="relative h-full w-full overflow-hidden rounded-full border-2"
                    style={{ borderColor: isTurn ? info.base : info.dark, background: info.light }}
                  >
                    <svg viewBox="0 0 40 40" className="absolute inset-0 h-full w-full" aria-hidden="true">
                      <circle cx="20" cy="14" r="7.5" fill={info.base} />
                      <path d="M9 34c0-7 4.6-11 11-11s11 4 11 11z" fill={info.base} />
                    </svg>
                    {p.bot ? (
                      <svg viewBox="0 0 40 40" className="absolute inset-0 h-full w-full" aria-hidden="true">
                        <rect x="9" y="12" width="22" height="17" rx="5" fill="#38bdf8" stroke="#0c4a6e" strokeWidth="1.6" />
                        <circle cx="16" cy="20" r="2.6" fill="#082f49" />
                        <circle cx="24" cy="20" r="2.6" fill="#082f49" />
                        <path d="M16 25h8" stroke="#082f49" strokeWidth="1.6" strokeLinecap="round" />
                        <path d="M20 12V7" stroke="#0c4a6e" strokeWidth="1.8" strokeLinecap="round" />
                        <circle cx="20" cy="6" r="2.2" fill="#38bdf8" stroke="#0c4a6e" strokeWidth="1.2" />
                      </svg>
                    ) : (
                      <img
                        src={`/api/member/avatar/${p.id}`}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover"
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* شمارش معکوس شروع */}
          {countdown > 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-2xl bg-zinc-950/70 backdrop-blur-sm">
              <svg viewBox="0 0 44 44" className="ludo-shake h-14 w-14" aria-hidden="true">
                <rect x="2" y="2" width="40" height="40" rx="10" fill="#f7efdc" stroke="#c7b68c" strokeWidth="2" />
                <g fill="#33270f">
                  <circle cx="14" cy="14" r="4" />
                  <circle cx="30" cy="30" r="4" />
                  <circle cx="30" cy="14" r="4" />
                  <circle cx="14" cy="30" r="4" />
                </g>
              </svg>
              <p className="text-sm font-bold text-zinc-200">{L.startingIn}</p>
              <p className="text-5xl font-black text-amber-300">
                {new Intl.NumberFormat(lang === "fa" ? "fa-IR" : "en-US").format(Math.ceil(countdown / 1000))}
              </p>
            </div>
          )}

          {/* پایان مسابقه */}
          {l.finished && l.result && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl bg-zinc-950/85 px-4 backdrop-blur-sm">
              {Array.from({ length: 26 }).map((_, i) => (
                <span
                  key={i}
                  className="ludo-confetti absolute top-0 h-3 w-1.5 rounded-sm"
                  style={{
                    left: `${(i * 3.9) % 100}%`,
                    background: LUDO_COLOR_INFO[(i % 4) as LudoColor].base,
                    animationDuration: `${2.2 + (i % 5) * 0.55}s`,
                    animationDelay: `${(i % 7) * 0.28}s`,
                  }}
                />
              ))}
              <Trophy className="h-12 w-12 text-amber-400" aria-hidden="true" />
              <p className="text-lg font-extrabold text-amber-200">{L.finishedTitle}</p>
              <p className="text-base font-bold text-zinc-100">
                {L.champion}: {l.result.find((r) => r.rank === 1)
                  ? l.players.find((p) => p.id === l.result!.find((r) => r.rank === 1)!.id)?.name
                  : "—"}
              </p>
              <ul className="w-full max-w-xs space-y-1.5">
                {l.result.map((row) => {
                  const p = l.players.find((x) => x.id === row.id);
                  const pts = row.rank === 1 ? 100 : row.rank === 2 ? 75 : row.rank === 3 ? 60 : 40;
                  return (
                    <li
                      key={row.id}
                      className={`flex items-center justify-between rounded-xl border px-3 py-2 ${
                        row.rank === 1 ? "border-amber-500/50 bg-amber-500/10" : "border-zinc-800 bg-zinc-900/80"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span className="w-5 text-center text-sm font-black text-zinc-400">
                          {new Intl.NumberFormat(lang === "fa" ? "fa-IR" : "en-US").format(row.rank)}
                        </span>
                        <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0" aria-hidden="true">
                          <circle cx="10" cy="7" r="4.6" fill={LUDO_COLOR_INFO[p?.color ?? 0].base} />
                          <path d="M6.2 16.5c0-3 1.7-4.6 3.8-4.6s3.8 1.6 3.8 4.6z" fill={LUDO_COLOR_INFO[p?.color ?? 0].base} />
                        </svg>
                        <span className="max-w-32 truncate text-sm font-bold text-zinc-200">{p?.name ?? "—"}</span>
                        {p?.bot && <Bot className="h-3.5 w-3.5 text-sky-300" aria-hidden="true" />}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="flex gap-0.5" aria-hidden="true">
                          {[0, 1, 2, 3].map((i) => (
                            <span
                              key={i}
                              className={`h-2 w-2 rounded-full ${i < row.home ? "bg-emerald-400" : "bg-zinc-700"}`}
                            />
                          ))}
                        </span>
                        <span className="text-sm font-black text-emerald-400">
                          {new Intl.NumberFormat(lang === "fa" ? "fa-IR" : "en-US").format(pts)}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
                {st.room.hostId === me && (
                  <button
                    onClick={() => void sendAction({ type: "again" })}
                    className="flex items-center gap-2 rounded-xl bg-violet-500 px-5 py-2.5 text-sm font-bold text-zinc-950 transition hover:bg-violet-400"
                  >
                    <Play className="h-4 w-4" aria-hidden="true" />
                    {L.againCta}
                  </button>
                )}
                <a
                  href="/arena"
                  className="flex items-center gap-2 rounded-xl border border-zinc-700 px-5 py-2.5 text-sm font-bold text-zinc-300 transition hover:bg-zinc-800"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  {t.arena.room.backToArena ?? L.openRules}
                </a>
              </div>
            </div>
          )}
        </div>

        {/* ---------- تاس و نوبت ---------- */}
        <div className="relative flex items-center justify-center gap-3 py-1">
          {/* حلقهٔ رنگی دور تاس — همیشه به رنگ تیمِ نوبت‌دار */}
          {!l.finished && countdown === 0 && turnPlayer && (
            <svg viewBox="0 0 96 96" className="absolute left-1/2 top-1/2 h-[106px] w-[106px] -translate-x-1/2 -translate-y-1/2" aria-hidden="true">
              <circle cx="48" cy="48" r="44" fill="none" stroke="#27272a" strokeWidth="6" />
              <circle
                cx="48"
                cy="48"
                r="44"
                fill="none"
                stroke={turnColor}
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 44}`}
                strokeDashoffset={`${2 * Math.PI * 44 * (1 - timerFrac)}`}
                transform="rotate(-90 48 48)"
                style={{ transition: "stroke-dashoffset .2s linear, stroke .3s", opacity: timerFrac > 0 ? 1 : 0.35 }}
              />
            </svg>
          )}
          <button
            onClick={() => void roll()}
            disabled={!myTurn || Boolean(l.dice) || l.finished || countdown > 0}
            className={`flex items-center justify-center gap-2 rounded-2xl border p-3 transition active:scale-95 ${
              ctaActive ? "ludo-roll-cta" : "border-zinc-800 bg-zinc-900/70"
            } ${!myTurn && !l.finished ? "opacity-85" : ""}`}
            style={
              ctaActive && myInfo
                ? {
                    borderColor: myInfo.base,
                    background: `${myInfo.base}26`,
                    boxShadow: `0 0 22px ${myInfo.base}59`,
                  }
                : undefined
            }
            aria-label={L.yourTurn}
          >
            <Die3D
              dieStyle={{
                transform: `rotateX(${dieAnim.x}deg) rotateY(${dieAnim.y}deg)`,
                transition: dieAnim.dur > 0 ? `transform ${dieAnim.dur}ms ${dieAnim.ease}` : "none",
              }}
              settle={settling}
            />

          </button>
        </div>
      </div>

      {/* ---------- داشبورد کوچک چت — داخل پوستهٔ بازی تا در تمام‌صفحه هم بماند ---------- */}
      <div className="absolute bottom-3 start-3 z-50">
        {chatOpen && (
          <div className="mb-2 w-[min(300px,calc(100vw-24px))] overflow-hidden rounded-2xl border border-zinc-700/80 bg-zinc-950/90 shadow-2xl backdrop-blur">
            <div className="flex items-center justify-between border-b border-zinc-800/80 px-3 py-1.5">
              <span className="flex items-center gap-1.5 text-xs font-bold text-zinc-200">
                <MessageCircle className="h-3.5 w-3.5 text-violet-400" aria-hidden="true" />
                {t.chat.roomTitle}
              </span>
              <button
                onClick={() => setChatOpen(false)}
                aria-label="close chat"
                className="rounded-full p-1 text-zinc-500 transition hover:text-zinc-200"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
            <ChatPanel scope={st.room.code} className="h-52" hideHeader />
          </div>
        )}
        <button
          onClick={() => setChatOpen((v) => !v)}
          aria-label={t.chat.roomTitle}
          className={`flex h-10 w-10 items-center justify-center rounded-full border shadow-lg transition-colors ${
            chatOpen
              ? "border-zinc-600 bg-zinc-800 text-zinc-200"
              : "border-violet-400/40 bg-violet-500/90 text-zinc-950 hover:bg-violet-400"
          }`}
        >
          {chatOpen ? <X className="h-4 w-4" aria-hidden="true" /> : <MessageCircle className="h-4 w-4" aria-hidden="true" />}
        </button>
      </div>

      {/* ---------- مودال قوانین ---------- */}
      {rulesOpen && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          onClick={() => setRulesOpen(false)}
        >
          <div
            className="max-h-[86dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-sky-500/40 bg-zinc-900 p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-base font-extrabold text-sky-200">
                <span aria-hidden="true">🎲</span>
                {L.rulesTitle}
              </h2>
              <button
                onClick={() => setRulesOpen(false)}
                aria-label={L.closeRules}
                className="rounded-full p-1.5 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-200"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <ul className="mt-4 space-y-2.5">
              {[L.rule1, L.rule2, L.rule3, L.rule4, L.rule5, L.rule6, L.rule7, L.rule8, L.rule9, L.rule10, L.rule11].map(
                (rule, i) => (
                  <li key={i} className="flex gap-2.5 text-[13px] leading-6 text-zinc-300">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-500/15 text-[10px] font-black text-sky-300">
                      {new Intl.NumberFormat(lang === "fa" ? "fa-IR" : "en-US").format(i + 1)}
                    </span>
                    <span>{rule}</span>
                  </li>
                ),
              )}
            </ul>
            <button
              onClick={() => setRulesOpen(false)}
              className="mt-5 w-full rounded-xl bg-sky-500 py-2.5 text-sm font-bold text-zinc-950 transition hover:bg-sky-400"
            >
              {L.closeRules}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const LUDO_RULES_AUTO_MS = 4_000; // مودال قوانین فقط در ثانیه‌های اول شروع مسابقه خودکار باز می‌شود
