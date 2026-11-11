"use client";

/* میدان آتش — نسخه آفلاین تک‌نفره.
   همه‌چیز داخل همین مرورگر اجرا می‌شود: بدون سرور، بدون شبکه، بدون تاخیر.
   دسکتاپ: حرکت با WASD/جهت‌ها، نشانه‌گیری با موس، شلیک با کلیک یا Space.
   موبایل: نیمه چپ صفحه اهرم حرکت، نیمه راست اهرم نشانه‌گیری + شلیک خودکار. */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Flame,
  Home,
  Pause,
  Play,
  RotateCcw,
  Users,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLang } from "@/components/site/language-provider";

/* ---------- ثابت‌های میدان ---------- */
export const MAP_W= 1600;
export const MAP_H= 1000;
export const PLAYER_R= 16;
export const PLAYER_SPEED = 278;
export const PLAYER_HP= 100;
export const BULLET_DMG= 34;
export const BULLET_SPEED= 640;
export const BULLET_R= 5;
export const BULLET_LIFE= 1.5;
export const FIRE_CD= 0.22;
export const RAPID_CD= 0.11;
export const RAPID_TIME= 6;
export const STICK_R= 60;
export const STICK_KNOB= 26;
export const STICK_DEAD= 0.24;
export const SHIELD_TIME= 5;
export const HOMING_TIME= 7;
export const MISSILE_SPEED= 430;
export const MISSILE_TURN= 4.6;
export const MISSILE_DMG= 46;
export const MISSILE_R= 7;
export const MISSILE_LIFE= 2.2;
export const MINE_TRIGGER= 32;
export const MINE_RADIUS= 125;
export const MINE_DMG= 115;
export const BOMB_RADIUS= 175;
export const BOMB_DMG= 90;

/* موانع متقارن [x, y, w, h] */
export const MAPS: readonly (readonly [number, number, number, number][] )[] = [
  /* برج‌های دوقلو */
  [
    [220, 140, 130, 300],
    [1250, 140, 130, 300],
    [220, 560, 130, 300],
    [1250, 560, 130, 300],
    [690, 90, 220, 90],
    [690, 820, 220, 90],
    [700, 430, 200, 140],
  ],
  /* دالان‌ها */
  [
    [0, 300, 610, 70],
    [990, 300, 610, 70],
    [0, 630, 610, 70],
    [990, 630, 610, 70],
    [760, 120, 80, 130],
    [760, 750, 80, 130],
  ],
  /* قلب میدان */
  [
    [680, 400, 240, 200],
    [300, 150, 180, 180],
    [1120, 150, 180, 180],
    [300, 670, 180, 180],
    [1120, 670, 180, 180],
  ],
  /* پل‌ها */
  [
    [260, 250, 430, 60],
    [910, 250, 430, 60],
    [260, 690, 430, 60],
    [910, 690, 430, 60],
    [720, 440, 160, 120],
  ],
  /* تیغه‌ها */
  [
    [380, 120, 90, 260],
    [1130, 120, 90, 260],
    [380, 620, 90, 260],
    [1130, 620, 90, 260],
    [600, 420, 110, 160],
    [890, 420, 110, 160],
  ],
  /* حلقه دفاعی — با دهانه‌های باز در چهار گوشه تا تانک هرگز محصور نشود */
  [
    [680, 200, 240, 60],
    [680, 740, 240, 60],
    [540, 340, 60, 320],
    [1000, 340, 60, 320],
  ],
];
export let OBSTACLES: readonly [number, number, number, number][] = MAPS[0];

/* محافظ «همیشه راه باز» — اتصال کامل فضای آزاد نقشه با flood-fill سنجیده می‌شود؛
   نقشه‌ای که حتی بزرگ‌ترین موجود میدان (تانک، شعاع ۲۴) را در جزیره‌ای محصور کند
   هرگز انتخاب نمی‌شود و نقشهٔ فعلی باقی می‌ماند. */
const CLEAR_R = 24;
function isMapFullyOpen(rects: readonly [number, number, number, number][]): boolean {
  const CELL = 10;
  const nx = Math.ceil(MAP_W / CELL);
  const ny = Math.ceil(MAP_H / CELL);
  const blocked = new Uint8Array(nx * ny);
  for (let gy = 0; gy < ny; gy++) {
    for (let gx = 0; gx < nx; gx++) {
      const x = gx * CELL + CELL / 2;
      const y = gy * CELL + CELL / 2;
      for (const [ox, oy, ow, oh] of rects) {
        const cx = clamp(x, ox, ox + ow);
        const cy = clamp(y, oy, oy + oh);
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy < CLEAR_R * CLEAR_R) {
          blocked[gy * nx + gx] = 1;
          break;
        }
      }
    }
  }
  /* flood از نقطهٔ شروع پلیر (مرکز میدان، کمی پایین‌تر) */
  const sx = Math.floor(MAP_W / 2 / CELL);
  const sy = Math.floor((MAP_H / 2 + 160) / CELL);
  const startIdx = sy * nx + sx;
  if (blocked[startIdx]) return false;
  const seen = new Uint8Array(nx * ny);
  const stack: number[] = [startIdx];
  seen[startIdx] = 1;
  while (stack.length) {
    const c = stack.pop() as number;
    const cx = c % nx;
    const cy = (c / nx) | 0;
    if (cx + 1 < nx && !seen[c + 1] && !blocked[c + 1]) { seen[c + 1] = 1; stack.push(c + 1); }
    if (cx > 0 && !seen[c - 1] && !blocked[c - 1]) { seen[c - 1] = 1; stack.push(c - 1); }
    if (cy + 1 < ny && !seen[c + nx] && !blocked[c + nx]) { seen[c + nx] = 1; stack.push(c + nx); }
    if (cy > 0 && !seen[c - nx] && !blocked[c - nx]) { seen[c - nx] = 1; stack.push(c - nx); }
  }
  let free = 0;
  for (let i = 0; i < blocked.length; i++) if (!blocked[i]) free++;
  let reach = 0;
  for (let i = 0; i < seen.length; i++) if (seen[i]) reach++;
  return reach === free;
}

/* تعویض نقشه از بیرون (بازی گروهی) — index در محدوده MAPS؛
   محافظ اتصال: نقشهٔ محصورکننده پذیرفته نمی‌شود */
export function setMap(idx: number): void {
  const cand = MAPS[((idx % MAPS.length) + MAPS.length) % MAPS.length];
  if (cand !== OBSTACLES && !isMapFullyOpen(cand)) return;
  OBSTACLES = cand;
}
export const PICKUP_COLORS: Record<Pickup["kind"], { solid: string; glow: string }> = {
  hp: { solid: "#3df07c", glow: "rgba(61,240,124,0.16)" },
  rapid: { solid: "#ffd60a", glow: "rgba(255,214,10,0.16)" },
  shield: { solid: "#38bdf8", glow: "rgba(56,189,248,0.16)" },
  homing: { solid: "#ff8a3d", glow: "rgba(255,138,61,0.16)" },
  mine: { solid: "#ff3b5c", glow: "rgba(255,59,92,0.16)" },
  bomb: { solid: "#e2e8f0", glow: "rgba(226,232,240,0.16)" },
};

/* نقاط ظهور ربات‌ها */
export const SPAWNS: readonly [number, number][] = [
  [80, 80],
  [MAP_W / 2, 56],
  [MAP_W - 80, 80],
  [MAP_W - 56, MAP_H / 2],
  [MAP_W - 80, MAP_H - 80],
  [MAP_W / 2, MAP_H - 56],
  [80, MAP_H - 80],
  [56, MAP_H / 2],
];

export const BOT_COLORS: Record<BotKind, string> = {
  chaser: "#ff3b5c",
  shooter: "#ff8a00",
  tank: "#b45cff",
};
export const BOT_SCORE: Record<BotKind, number> = { chaser: 25, shooter: 40, tank: 70 };

/* ---------- انواع ---------- */
export type BotKind = "chaser" | "shooter" | "tank";
type Phase = "menu" | "playing" | "paused" | "over";

export type Bullet = { x: number; y: number; vx: number; vy: number; r: number; dmg: number; foe: boolean; life: number; kind?: "normal" | "missile" };
export type Bot = {
  x: number;
  y: number;
  r: number;
  kind: BotKind;
  hp: number;
  maxHp: number;
  speed: number;
  cd: number;
  atkCd: number;
  phase: number;
  flash: number;
};
export type Pickup = { x: number; y: number; kind: "hp" | "rapid" | "shield" | "homing" | "mine" | "bomb"; t: number };
export type Mine = { x: number; y: number; arm: number; blink: number };
export type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string };
export type Floater = { x: number; y: number; text: string; life: number; color: string };
export type Stick = { id: number; ox: number; oy: number; x: number; y: number };

type World = {
  t: number;
  p: { x: number; y: number };
  hp: number;
  inv: number;
  aim: number;
  fireCd: number;
  rapid: number;
  shield: number;
  homing: number;
  mines: Mine[];
  aimPt: { x: number; y: number } | null;
  lockBot: Bot | null;
  mapFlash: number;
  mapIdx: number;
  bots: Bot[];
  bullets: Bullet[];
  pickups: Pickup[];
  parts: Particle[];
  floats: Floater[];
  wave: number;
  waveState: "inter" | "fight";
  waveTimer: number;
  toSpawn: number;
  spawnTimer: number;
  score: number;
  kills: number;
  shake: number;
  hurt: number;
  over: boolean;
  bid: number;
};

export const clamp= (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

function makeWorld(): World {
  OBSTACLES = MAPS[0];
  return {
    t: 0,
    p: { x: MAP_W / 2, y: MAP_H / 2 + 160 },
    hp: PLAYER_HP,
    inv: 1.2,
    aim: -Math.PI / 2,
    fireCd: 0,
    rapid: 0,
    shield: 0,
    homing: 0,
    mines: [],
    aimPt: null,
    lockBot: null,
    mapFlash: 0,
    mapIdx: 0,
    bots: [],
    bullets: [],
    pickups: [],
    parts: [],
    floats: [],
    wave: 0,
    waveState: "inter",
    waveTimer: 2.4,
    toSpawn: 0,
    spawnTimer: 0,
    score: 0,
    kills: 0,
    shake: 0,
    hurt: 0,
    over: false,
    bid: 0,
  };
}

/* برخورد دایره با موانع ثابت */
export function hitRect(x: number, y: number, r: number): boolean {
  for (const [ox, oy, ow, oh] of OBSTACLES) {
    const cx = clamp(x, ox, ox + ow);
    const cy = clamp(y, oy, oy + oh);
    const dx = x - cx;
    const dy = y - cy;
    if (dx * dx + dy * dy < r * r) return true;
  }
  return false;
}

/* حرکت با لغزش روی دیوارها — هر محور جداگانه */
export function slideMove(ent: { x: number; y: number }, dx: number, dy: number, r: number) {
  if (dx !== 0 && !hitRect(ent.x + dx, ent.y, r)) ent.x += dx;
  if (dy !== 0 && !hitRect(ent.x, ent.y + dy, r)) ent.y += dy;
  ent.x = clamp(ent.x, r, MAP_W - r);
  ent.y = clamp(ent.y, r, MAP_H - r);
}

/* دید آزاد بین دو نقطه (برای شلیک هوشمند ربات‌ها) */
export function hasLOS(x1: number, y1: number, x2: number, y2: number): boolean {
  const steps = Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 36);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = x1 + (x2 - x1) * t;
    const y = y1 + (y2 - y1) * t;
    for (const [ox, oy, ow, oh] of OBSTACLES) {
      if (x > ox && x < ox + ow && y > oy && y < oy + oh) return false;
    }
  }
  return true;
}

/* ---------- موتور صدا (سنتز سبک، بدون فایل) ---------- */
export type Sfx = {
  ensure: () => void;
  setMuted: (m: boolean) => void;
  shoot: () => void;
  eshoot: () => void;
  hit: () => void;
  boom: () => void;
  hurt: () => void;
  pickup: () => void;
  wave: () => void;
  over: () => void;
};

export function makeSfx(): Sfx {
  let ctx: AudioContext | null = null;
  let muted = false;

  function ensure() {
    if (!ctx) {
      try {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        ctx = new AC();
      } catch {
        ctx = null;
      }
    }
    if (ctx && ctx.state === "suspended") void ctx.resume();
  }

  function tone(f0: number, f1: number, dur: number, type: OscillatorType, vol: number) {
    if (muted || !ctx) return;
    try {
      const t0 = ctx.currentTime;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t0);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
      g.gain.setValueAtTime(vol, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g).connect(ctx.destination);
      o.start(t0);
      o.stop(t0 + dur + 0.02);
    } catch {
      /* بی‌صدا */
    }
  }

  function noise(dur: number, vol: number, freq: number) {
    if (muted || !ctx) return;
    try {
      const t0 = ctx.currentTime;
      const n = Math.floor(ctx.sampleRate * dur);
      const buf = ctx.createBuffer(1, n, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = vol;
      src.connect(f).connect(g).connect(ctx.destination);
      src.start(t0);
    } catch {
      /* بی‌صدا */
    }
  }

  return {
    ensure,
    setMuted(m) {
      muted = m;
    },
    shoot: () => tone(340, 150, 0.09, "square", 0.05),
    eshoot: () => tone(180, 90, 0.1, "square", 0.03),
    hit: () => tone(220, 140, 0.06, "triangle", 0.06),
    boom: () => {
      noise(0.28, 0.14, 900);
      tone(130, 40, 0.3, "sine", 0.12);
    },
    hurt: () => tone(170, 60, 0.2, "sawtooth", 0.08),
    pickup: () => tone(520, 900, 0.13, "sine", 0.07),
    wave: () => {
      tone(420, 640, 0.14, "triangle", 0.07);
      window.setTimeout(() => tone(640, 860, 0.16, "triangle", 0.07), 130);
    },
    over: () => {
      tone(320, 150, 0.3, "sawtooth", 0.08);
      window.setTimeout(() => tone(200, 80, 0.5, "sawtooth", 0.08), 260);
    },
  };
}

/* ---------- کامپوننت ---------- */
export function FireOffline() {
  const { t, lang } = useLang();
  const f = t.fireOffline;

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const worldRef = useRef<World | null>(null);
  const phaseRef = useRef<Phase>("menu");
  const keysRef = useRef<Set<string>>(new Set());
  const sfxRef = useRef<Sfx | null>(null);
  const mutedRef = useRef(false);
  const touchRef = useRef(false);
  const mouseRef = useRef({ x: 0, y: 0, has: false });
  const fireMouseRef = useRef(false);
  const moveStickRef = useRef<Stick | null>(null);
  const aimStickRef = useRef<Stick | null>(null);
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });
  const bannerTimerRef = useRef<number | null>(null);
  const bestRef = useRef(0);
  const tRef = useRef(f);
  const langRef = useRef(lang);

  const [phase, setPhaseState] = useState<Phase>("menu");
  const [touchUI, setTouchUI] = useState(false);
  const [muted, setMuted] = useState(false);
  /* حالت پاک موبایل — هنگام بازی هیچ نوشته‌ای روی صفحه نیست؛ فقط دکمه‌ها و نوار جان */
  const [cleanHud, setCleanHud] = useState(false);
  const [best, setBest] = useState(0);
  const [banner, setBanner] = useState<{ title: string; sub?: string } | null>(null);
  const [hud, setHud] = useState({ hp: PLAYER_HP, score: 0, wave: 0, kills: 0, rapid: 0, shield: 0, homing: 0, mines: 0, isNewBest: false });

  const setPhase = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhaseState(p);
  }, []);

  /* همگام‌سازی refها برای استفاده در حلقه بازی */
  useEffect(() => {
    tRef.current = f;
    langRef.current = lang;
  }, [f, lang]);

  const numFmt = useCallback(
    (n: number) => new Intl.NumberFormat(lang === "fa" ? "fa-IR" : "en-US").format(n),
    [lang],
  );

  const showBanner = useCallback((title: string, sub?: string) => {
    setBanner({ title, sub });
    if (bannerTimerRef.current) window.clearTimeout(bannerTimerRef.current);
    bannerTimerRef.current = window.setTimeout(() => setBanner(null), 2100);
  }, []);

  /* ---------- شروع / توقف / پایان ---------- */
  const startGame = useCallback(() => {
    sfxRef.current?.ensure();
    worldRef.current = makeWorld();
    setHud({ hp: PLAYER_HP, score: 0, wave: 0, kills: 0, rapid: 0, shield: 0, homing: 0, mines: 0, isNewBest: false });
    setBanner(null);
    setPhase("playing");
    const ready = tRef.current.getReady;
    showBanner(ready);
  }, [setPhase, showBanner]);

  const togglePause = useCallback(() => {
    if (phaseRef.current === "playing") setPhase("paused");
    else if (phaseRef.current === "paused") setPhase("playing");
  }, [setPhase]);

  /* ---------- ورود صفحه‌کلید (روی window — بدون نیاز به فوکوس) ---------- */
  useEffect(() => {
    const PREVENT = new Set(["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (e.repeat) {
        if (PREVENT.has(e.code) && phaseRef.current === "playing") e.preventDefault();
        return;
      }
      keysRef.current.add(e.code);
      if (e.code === "Escape" || e.code === "KeyP") {
        if (phaseRef.current === "playing" || phaseRef.current === "paused") togglePause();
        return;
      }
      if ((e.code === "Enter" || e.code === "Space" || e.code === "NumpadEnter") && (phaseRef.current === "menu" || phaseRef.current === "over")) {
        e.preventDefault();
        startGame();
        return;
      }
      if (PREVENT.has(e.code) && phaseRef.current === "playing") e.preventDefault();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.code);
    };
    const onBlur = () => {
      keysRef.current.clear();
      fireMouseRef.current = false;
      moveStickRef.current = null;
      aimStickRef.current = null;
      if (phaseRef.current === "playing") setPhase("paused");
    };
    const onVis = () => {
      if (document.visibilityState === "hidden") onBlur();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [startGame, togglePause, setPhase]);

  /* ---------- تشخیص لمسی + بهترین رکورد + صدا ---------- */
  useEffect(() => {
    try {
      const b = window.localStorage.getItem("fire-offline-best");
      if (b) {
        bestRef.current = parseInt(b, 10) || 0;
        setBest(bestRef.current);
      }
      const m = window.localStorage.getItem("fire-offline-muted");
      if (m === "1") {
        mutedRef.current = true;
        setMuted(true);
      }
    } catch {
      /* ignore */
    }
    const coarse = window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
    touchRef.current = coarse;
    setTouchUI(coarse);
    /* روی موبایل بازی با صفحهٔ پاک شروع می‌شود — بدون نوشتهٔ مزاحم */
    if (coarse) setCleanHud(true);
    sfxRef.current = makeSfx();
    sfxRef.current.setMuted(mutedRef.current);
    worldRef.current = makeWorld();
    /* قلاب اشکال‌زدایی فقط-خواندنی برای پشتیبانی از راه دور */
    (window as unknown as { __fire?: () => Record<string, unknown> }).__fire = () => ({
      phase: phaseRef.current,
      x: Math.round(worldRef.current?.p.x ?? -1),
      y: Math.round(worldRef.current?.p.y ?? -1),
      hp: worldRef.current?.hp ?? 0,
      score: worldRef.current?.score ?? 0,
      wave: worldRef.current?.wave ?? 0,
      bots: worldRef.current?.bots.length ?? 0,
      bullets: worldRef.current?.bullets.length ?? 0,
      touch: touchRef.current,
    });
  }, []);

  const toggleMute = useCallback(() => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    sfxRef.current?.setMuted(next);
    try {
      window.localStorage.setItem("fire-offline-muted", next ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);

  /* ---------- ورود اشاره‌گر: موس / لمس دو-دسته‌ای ---------- */
  const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const lx = e.clientX - rect.left;
    const ly = e.clientY - rect.top;
    if (e.pointerType === "touch") {
      touchRef.current = true;
      setTouchUI(true);
      if (lx < rect.width / 2) {
        if (!moveStickRef.current) moveStickRef.current = { id: e.pointerId, ox: lx, oy: ly, x: lx, y: ly };
      } else {
        if (!aimStickRef.current) aimStickRef.current = { id: e.pointerId, ox: lx, oy: ly, x: lx, y: ly };
      }
    } else {
      mouseRef.current = { x: lx, y: ly, has: true };
      fireMouseRef.current = true;
      /* دستگاه دوحالته: آخرین ورود مشخص می‌کند رابط لمسی باشد یا موس */
      if (touchRef.current) {
        touchRef.current = false;
        setTouchUI(false);
      }
    }
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const lx = e.clientX - rect.left;
    const ly = e.clientY - rect.top;
    if (e.pointerType === "touch") {
      if (moveStickRef.current?.id === e.pointerId) {
        moveStickRef.current.x = lx;
        moveStickRef.current.y = ly;
      } else if (aimStickRef.current?.id === e.pointerId) {
        aimStickRef.current.x = lx;
        aimStickRef.current.y = ly;
      }
    } else {
      mouseRef.current = { x: lx, y: ly, has: true };
      if (touchRef.current) {
        touchRef.current = false;
        setTouchUI(false);
      }
    }
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === "touch") {
      if (moveStickRef.current?.id === e.pointerId) moveStickRef.current = null;
      if (aimStickRef.current?.id === e.pointerId) aimStickRef.current = null;
    } else {
      fireMouseRef.current = false;
    }
  }, []);

  /* ---------- حلقه اصلی بازی ---------- */
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let last = performance.now();
    let hudAcc = 0;

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      sizeRef.current = { w: rect.width, h: rect.height, dpr };
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    /* --- پرتاب ذرات --- */
    const burst = (w: World, x: number, y: number, color: string, n: number, speed: number, size: number) => {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = speed * (0.3 + Math.random() * 0.7);
        const life = 0.35 + Math.random() * 0.4;
        w.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, size: size * (0.5 + Math.random()), color });
      }
      if (w.parts.length > 260) w.parts.splice(0, w.parts.length - 260);
    };

    const floatText = (w: World, x: number, y: number, text: string, color: string) => {
      w.floats.push({ x, y, text, life: 0.95, color });
    };

    const killBot = (w: World, b: Bot) => {
      w.score += BOT_SCORE[b.kind];
      w.kills += 1;
      burst(w, b.x, b.y, BOT_COLORS[b.kind], b.kind === "tank" ? 26 : 16, b.kind === "tank" ? 260 : 200, b.kind === "tank" ? 5 : 4);
      floatText(w, b.x, b.y - b.r - 6, `+${BOT_SCORE[b.kind]}`, "#ffd60a");
      sfxRef.current?.boom();
      w.shake = Math.min(14, w.shake + (b.kind === "tank" ? 9 : 5));
      const roll = Math.random();
      const kind: Pickup["kind"] | null =
        roll < 0.14 ? "hp" : roll < 0.24 ? "rapid" : roll < 0.31 ? "shield" : roll < 0.38 ? "homing" : roll < 0.48 ? "mine" : roll < 0.54 ? "bomb" : null;
      if (kind && w.pickups.length < 4) w.pickups.push({ x: b.x, y: b.y, kind, t: 0 });
    };

    const damagePlayer = (w: World, dmg: number) => {
      if (w.inv > 0 || w.over) return;
      if (w.shield > 0) {
        burst(w, w.p.x, w.p.y, "#38bdf8", 6, 130, 2.6);
        return;
      }
      w.hp -= dmg;
      w.hurt = 1;
      w.inv = 0.5;
      w.shake = Math.min(16, w.shake + 7);
      sfxRef.current?.hurt();
    };

    const spawnBot = (w: World) => {
      const n = w.wave;
      const roll = Math.random();
      const shooterP = Math.min(0.5, 0.12 + n * 0.05);
      const tankP = n >= 3 ? Math.min(0.22, 0.06 * (n - 2)) : 0;
      const kind: BotKind = roll < tankP ? "tank" : roll < tankP + shooterP ? "shooter" : "chaser";
      const cand = SPAWNS.filter(([x, y]) => Math.hypot(x - w.p.x, y - w.p.y) > 380);
      const pool = cand.length > 0 ? cand : SPAWNS;
      const [sx, sy] = pool[Math.floor(Math.random() * pool.length)];
      const hpMul = Math.min(1.8, 1 + (n - 1) * 0.07);
      const spMul = Math.min(1.22, 1 + (n - 1) * 0.025);
      const base = kind === "chaser" ? { r: 15, hp: 34, speed: 242 } : kind === "shooter" ? { r: 17, hp: 68, speed: 152 } : { r: 24, hp: 210, speed: 90 };
      w.bots.push({
        x: sx,
        y: sy,
        r: base.r,
        kind,
        hp: base.hp * hpMul,
        maxHp: base.hp * hpMul,
        speed: base.speed * spMul,
        cd: 0.9 + Math.random() * 0.8,
        atkCd: 0.6,
        phase: Math.random() * Math.PI * 2,
        flash: 0,
      });
    };

    /* --- شبیه‌سازی یک گام --- */
    /* انفجار ناحیه‌ای — مین و بمب */
    const explode = (w: World, x: number, y: number, radius: number, dmg: number, color: string) => {
      burst(w, x, y, color, 26, 300, 5);
      w.shake = Math.min(18, w.shake + 10);
      sfxRef.current?.boom();
      for (const b of w.bots) {
        if (b.hp <= 0) continue;
        const d = Math.hypot(b.x - x, b.y - y);
        if (d < radius + b.r) {
          b.hp -= dmg * (1 - Math.min(1, d / (radius + b.r)) * 0.4);
          b.flash = 1;
          if (b.hp <= 0) killBot(w, b);
        }
      }
    };

    /* بعد از تعویض نقشه، هر چیزی که داخل دیوار افتاده جابه‌جا می‌شود */
    const fixOverlaps = (w: World) => {
      if (hitRect(w.p.x, w.p.y, PLAYER_R)) {
        const spot = SPAWNS.find(([sx, sy]) => !hitRect(sx, sy, PLAYER_R));
        if (spot) {
          w.p.x = spot[0];
          w.p.y = spot[1];
        }
        w.inv = Math.max(w.inv, 1.2);
      }
      for (const b of w.bots) {
        if (b.hp <= 0) continue;
        if (hitRect(b.x, b.y, b.r)) {
          const ok = SPAWNS.filter(([sx, sy]) => !hitRect(sx, sy, b.r) && Math.hypot(sx - w.p.x, sy - w.p.y) > 300);
          const pool = ok.length > 0 ? ok : SPAWNS.filter(([sx, sy]) => !hitRect(sx, sy, b.r));
          if (pool.length > 0) {
            const [sx, sy] = pool[Math.floor(Math.random() * pool.length)];
            b.x = sx;
            b.y = sy;
          }
        }
      }
      w.pickups = w.pickups.filter((pk) => !hitRect(pk.x, pk.y, 17));
      w.mines = w.mines.filter((mn) => !hitRect(mn.x, mn.y, 8));
    };

    const simulate = (w: World, dt: number) => {
      w.t += dt;
      w.inv = Math.max(0, w.inv - dt);
      w.hurt = Math.max(0, w.hurt - dt * 2.2);
      w.shake = Math.max(0, w.shake - dt * 34);
      w.fireCd -= dt;
      w.rapid = Math.max(0, w.rapid - dt);
      w.shield = Math.max(0, w.shield - dt);
      w.homing = Math.max(0, w.homing - dt);
      w.mapFlash = Math.max(0, w.mapFlash - dt * 1.6);

      /* --- ورود حرکت: اهرم لمسی مقدم است، بعد کیبورد --- */
      let mvx = 0;
      let mvy = 0;
      const ms = moveStickRef.current;
      if (ms) {
        let dx = ms.x - ms.ox;
        let dy = ms.y - ms.oy;
        const d = Math.hypot(dx, dy);
        if (d > 4) {
          const k = Math.min(1, d / STICK_R) / d;
          mvx = dx * k;
          mvy = dy * k;
        }
      }
      if (mvx === 0 && mvy === 0) {
        const k = keysRef.current;
        let kx = 0;
        let ky = 0;
        if (k.has("KeyA") || k.has("ArrowLeft")) kx -= 1;
        if (k.has("KeyD") || k.has("ArrowRight")) kx += 1;
        if (k.has("KeyW") || k.has("ArrowUp")) ky -= 1;
        if (k.has("KeyS") || k.has("ArrowDown")) ky += 1;
        const kl = Math.hypot(kx, ky);
        if (kl > 0) {
          mvx = kx / kl;
          mvy = ky / kl;
        }
      }
      slideMove(w.p, mvx * PLAYER_SPEED * dt, mvy * PLAYER_SPEED * dt, PLAYER_R);

      /* --- نشانه‌گیری --- */
      const as = aimStickRef.current;
      let touchFiring = false;
      if (as) {
        const dx = as.x - as.ox;
        const dy = as.y - as.oy;
        const d = Math.hypot(dx, dy);
        if (d > STICK_DEAD * STICK_R) {
          const ang = Math.atan2(dy, dx);
          /* کمک-نشانه‌گیری: قفل نرم روی نزدیک‌ترین ربات داخل مخروط */
          let bestA = ang;
          let bestDiff = 0.3;
          let lock: Bot | null = null;
          for (const b of w.bots) {
            const bdx = b.x - w.p.x;
            const bdy = b.y - w.p.y;
            const bd = Math.hypot(bdx, bdy);
            if (bd > 580) continue;
            let da = Math.atan2(bdy, bdx) - ang;
            while (da > Math.PI) da -= 2 * Math.PI;
            while (da < -Math.PI) da += 2 * Math.PI;
            if (Math.abs(da) < bestDiff) {
              bestDiff = Math.abs(da);
              bestA = Math.atan2(bdy, bdx);
              lock = b;
            }
          }
          w.aim = bestA;
          w.lockBot = lock;
          w.aimPt = lock
            ? { x: lock.x, y: lock.y }
            : { x: w.p.x + Math.cos(bestA) * 260, y: w.p.y + Math.sin(bestA) * 260 };
          touchFiring = true;
        } else {
          w.lockBot = null;
        }
      } else if (mouseRef.current.has && !touchRef.current) {
        /* تبدیل مختصات صفحه موس به مختصات دنیای بازی */
        const view = cameraView();
        const { w: cwCss, h: chCss } = sizeRef.current;
        const wx = view.camX + (mouseRef.current.x - cwCss / 2) / view.scale;
        const wy = view.camY + (mouseRef.current.y - chCss / 2) / view.scale;
        w.aim = Math.atan2(wy - w.p.y, wx - w.p.x);
        w.aimPt = { x: wx, y: wy };
        w.lockBot = null;
      } else {
        w.aimPt = null;
        w.lockBot = null;
      }

      /* --- شلیک --- */
      const wantFire = touchFiring || fireMouseRef.current || keysRef.current.has("Space");
      if (wantFire && w.fireCd <= 0) {
        const missile = w.homing > 0;
        w.fireCd = missile ? FIRE_CD : w.rapid > 0 ? RAPID_CD : FIRE_CD;
        const a = w.aim;
        w.bullets.push(
          missile
            ? {
                x: w.p.x + Math.cos(a) * (PLAYER_R + 7),
                y: w.p.y + Math.sin(a) * (PLAYER_R + 7),
                vx: Math.cos(a) * MISSILE_SPEED,
                vy: Math.sin(a) * MISSILE_SPEED,
                r: MISSILE_R,
                dmg: MISSILE_DMG,
                foe: false,
                life: MISSILE_LIFE,
                kind: "missile",
              }
            : {
                x: w.p.x + Math.cos(a) * (PLAYER_R + 7),
                y: w.p.y + Math.sin(a) * (PLAYER_R + 7),
                vx: Math.cos(a) * BULLET_SPEED,
                vy: Math.sin(a) * BULLET_SPEED,
                r: BULLET_R,
                dmg: BULLET_DMG,
                foe: false,
                life: BULLET_LIFE,
              },
        );
        burst(w, w.p.x + Math.cos(a) * (PLAYER_R + 9), w.p.y + Math.sin(a) * (PLAYER_R + 9), missile ? "#ff8a3d" : "#ffd60a", 3, 90, 2.4);
        sfxRef.current?.shoot();
      }

      /* --- گلوله‌ها --- */
      for (const bl of w.bullets) {
        if (bl.kind === "missile") {
          let tb: Bot | null = null;
          let td = 720;
          for (const b of w.bots) {
            if (b.hp <= 0) continue;
            const d = Math.hypot(b.x - bl.x, b.y - bl.y);
            if (d < td) {
              td = d;
              tb = b;
            }
          }
          const cur = Math.atan2(bl.vy, bl.vx);
          if (tb) {
            let da = Math.atan2(tb.y - bl.y, tb.x - bl.x) - cur;
            while (da > Math.PI) da -= 2 * Math.PI;
            while (da < -Math.PI) da += 2 * Math.PI;
            const na = cur + clamp(da, -MISSILE_TURN * dt, MISSILE_TURN * dt);
            bl.vx = Math.cos(na) * MISSILE_SPEED;
            bl.vy = Math.sin(na) * MISSILE_SPEED;
          }
          if (Math.random() < 0.6) {
            w.parts.push({ x: bl.x, y: bl.y, vx: (Math.random() - 0.5) * 30, vy: (Math.random() - 0.5) * 30, life: 0.3, max: 0.3, size: 3, color: "#ff8a3d" });
          }
        }
        bl.x += bl.vx * dt;
        bl.y += bl.vy * dt;
        bl.life -= dt;
        if (bl.life <= 0) continue;
        if (bl.x < 0 || bl.x > MAP_W || bl.y < 0 || bl.y > MAP_H) {
          bl.life = 0;
          continue;
        }
        for (const [ox, oy, ow, oh] of OBSTACLES) {
          if (bl.x > ox - bl.r && bl.x < ox + ow + bl.r && bl.y > oy - bl.r && bl.y < oy + oh + bl.r) {
            bl.life = 0;
            burst(w, bl.x, bl.y, bl.kind === "missile" ? "#ff8a3d" : bl.foe ? "#ff5c7a" : "#ffd60a", 4, 110, 2.2);
            break;
          }
        }
        if (bl.life <= 0) continue;
        if (bl.foe) {
          const d = Math.hypot(bl.x - w.p.x, bl.y - w.p.y);
          if (d < bl.r + PLAYER_R) {
            damagePlayer(w, bl.dmg);
            bl.life = 0;
          }
        } else {
          for (const b of w.bots) {
            if (b.hp <= 0) continue;
            const d = Math.hypot(bl.x - b.x, bl.y - b.y);
            if (d < bl.r + b.r) {
              b.hp -= bl.dmg;
              b.flash = 1;
              bl.life = 0;
              burst(w, bl.x, bl.y, "#ffffff", 5, 140, 2.4);
              sfxRef.current?.hit();
              if (b.hp <= 0) killBot(w, b);
              break;
            }
          }
        }
      }
      if (w.bullets.length > 140) w.bullets.splice(0, w.bullets.length - 140);
      w.bullets = w.bullets.filter((b) => b.life > 0);

      /* --- مین‌ها --- */
      for (const mn of w.mines) {
        mn.arm -= dt;
        mn.blink += dt;
        if (mn.arm <= 0) {
          for (const b of w.bots) {
            if (b.hp > 0 && Math.hypot(b.x - mn.x, b.y - mn.y) < MINE_TRIGGER + b.r) {
              explode(w, mn.x, mn.y, MINE_RADIUS, MINE_DMG, "#ff5c7a");
              mn.arm = -1;
              break;
            }
          }
        }
      }
      w.mines = w.mines.filter((mn) => mn.arm >= 0);

      /* --- ربات‌ها --- */
      for (const b of w.bots) {
        if (b.hp <= 0) continue;
        const dx = w.p.x - b.x;
        const dy = w.p.y - b.y;
        const d = Math.hypot(dx, dy) || 1;
        const ux = dx / d;
        const uy = dy / d;
        let mx = 0;
        let my = 0;
        if (b.kind === "chaser") {
          const wig = Math.sin(w.t * 3 + b.phase) * 0.3;
          mx = ux + -uy * wig;
          my = uy + ux * wig;
        } else if (b.kind === "shooter") {
          const push = d > 360 ? 1 : d < 240 ? -1 : 0;
          const strafe = Math.sin(w.t * 1.7 + b.phase) * 0.85;
          mx = ux * push + -uy * strafe;
          my = uy * push + ux * strafe;
        } else {
          const push = d > 330 ? 1 : -0.35;
          mx = ux * push;
          my = uy * push;
        }
        /* جدا نگه‌داشتن ربات‌ها از هم */
        for (const o of w.bots) {
          if (o === b || o.hp <= 0) continue;
          const ox = b.x - o.x;
          const oy = b.y - o.y;
          const od = Math.hypot(ox, oy);
          const min = b.r + o.r + 8;
          if (od > 0 && od < min) {
            mx += (ox / od) * 1.5;
            my += (oy / od) * 1.5;
          }
        }
        const ml = Math.hypot(mx, my);
        if (ml > 0.01) slideMove(b, (mx / ml) * b.speed * dt, (my / ml) * b.speed * dt, b.r);
        b.flash = Math.max(0, b.flash - dt * 6);
        b.cd -= dt;
        b.atkCd -= dt;
        if (b.kind === "chaser") {
          if (d < b.r + PLAYER_R + 5 && b.atkCd <= 0) {
            damagePlayer(w, 14);
            b.atkCd = 0.7;
            slideMove(w.p, ux * 26, uy * 26, PLAYER_R);
          }
        } else {
          const range = b.kind === "shooter" ? 540 : 640;
          if (b.cd <= 0 && d < range && hasLOS(b.x, b.y, w.p.x, w.p.y)) {
            b.cd = b.kind === "shooter" ? 1.25 - Math.min(0.45, w.wave * 0.04) + Math.random() * 0.3 : 1.9 + Math.random() * 0.4;
            const spread = b.kind === "shooter" ? 0.09 : 0.05;
            const a = Math.atan2(dy, dx) + (Math.random() - 0.5) * 2 * spread;
            const sp = b.kind === "shooter" ? 380 : 300;
            w.bullets.push({
              x: b.x + Math.cos(a) * (b.r + 6),
              y: b.y + Math.sin(a) * (b.r + 6),
              vx: Math.cos(a) * sp,
              vy: Math.sin(a) * sp,
              r: b.kind === "tank" ? 8 : 5,
              dmg: b.kind === "shooter" ? 12 : 24,
              foe: true,
              life: BULLET_LIFE + 0.5,
            });
            if (d < 720) sfxRef.current?.eshoot();
          }
        }
      }
      w.bots = w.bots.filter((b) => b.hp > 0);

      /* برخورد سخت ربات‌ها با بازیکن — هیچ رباتی از بازیکن عبور نمی‌کند */
      for (const b of w.bots) {
        const dx = w.p.x - b.x;
        const dy = w.p.y - b.y;
        const dd = Math.hypot(dx, dy);
        const min = PLAYER_R + b.r + 2;
        if (dd >= min) continue;
        if (dd < 0.01) {
          slideMove(w.p, min, min, PLAYER_R);
          slideMove(b, -min, -min, b.r);
          continue;
        }
        const ux = dx / dd;
        const uy = dy / dd;
        const push = (min - dd) / 2;
        slideMove(w.p, ux * push, uy * push, PLAYER_R);
        slideMove(b, -ux * push, -uy * push, b.r);
      }

      /* --- جوايز --- */
      for (const pk of w.pickups) {
        pk.t += dt;
        const d = Math.hypot(pk.x - w.p.x, pk.y - w.p.y);
        if (d < PLAYER_R + 17) {
          pk.t = -1;
          sfxRef.current?.pickup();
          if (pk.kind === "hp") {
            w.hp = Math.min(PLAYER_HP, w.hp + 30);
            floatText(w, w.p.x, w.p.y - 26, "+30", "#3df07c");
          } else if (pk.kind === "rapid") {
            w.rapid = RAPID_TIME;
            floatText(w, w.p.x, w.p.y - 26, "★", "#ffd60a");
          } else if (pk.kind === "shield") {
            w.shield = SHIELD_TIME;
            floatText(w, w.p.x, w.p.y - 26, "⛨", "#38bdf8");
          } else if (pk.kind === "homing") {
            w.homing = HOMING_TIME;
            floatText(w, w.p.x, w.p.y - 26, "🚀", "#ff8a3d");
          } else if (pk.kind === "mine") {
            if (w.mines.length >= 5) w.mines.shift();
            w.mines.push({ x: w.p.x, y: w.p.y, arm: 0.9, blink: 0 });
            floatText(w, w.p.x, w.p.y - 26, "+💣", "#ff3b5c");
          } else {
            explode(w, w.p.x, w.p.y, BOMB_RADIUS, BOMB_DMG, "#ffd60a");
            floatText(w, w.p.x, w.p.y - 26, "💥", "#ffd60a");
          }
        }
      }
      w.pickups = w.pickups.filter((pk) => pk.t >= 0);

      /* --- ذرات و متن‌ها --- */
      for (const pt of w.parts) {
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        pt.vx *= 1 - 3 * dt;
        pt.vy *= 1 - 3 * dt;
        pt.life -= dt;
      }
      w.parts = w.parts.filter((pt) => pt.life > 0);
      for (const fl of w.floats) {
        fl.y -= 42 * dt;
        fl.life -= dt;
      }
      w.floats = w.floats.filter((fl) => fl.life > 0);

      /* --- موج‌ها --- */
      if (w.waveState === "inter") {
        w.waveTimer -= dt;
        if (w.waveTimer <= 0) {
          w.wave += 1;
          w.waveState = "fight";
          w.toSpawn = Math.min(12, 2 + w.wave);
          w.spawnTimer = 0.25;
          showBanner(tRef.current.waveBanner.replace("{n}", numFmt(w.wave)));
          sfxRef.current?.wave();
        }
      } else {
        const cap = Math.min(9, 3 + w.wave);
        if (w.toSpawn > 0) {
          w.spawnTimer -= dt;
          if (w.spawnTimer <= 0 && w.bots.length < cap) {
            spawnBot(w);
            w.toSpawn -= 1;
            w.spawnTimer = 0.65;
          }
        } else if (w.bots.length === 0) {
          const bonus = 30 + w.wave * 15;
          w.score += bonus;
          w.waveState = "inter";
          w.waveTimer = 3;
          sfxRef.current?.wave();
          /* نقشه موج بعدی */
          const ni = w.wave % MAPS.length;
          const mapName = tRef.current.maps[ni] ?? "";
          if (ni !== w.mapIdx) {
            w.mapIdx = ni;
            OBSTACLES = MAPS[ni];
            w.mapFlash = 1;
            fixOverlaps(w);
          }
          showBanner(
            tRef.current.waveClear.replace("{n}", numFmt(w.wave)).replace("{b}", numFmt(bonus)),
            mapName ? tRef.current.mapBanner.replace("{m}", mapName) : undefined,
          );
        }
      }

      /* --- مرگ --- */
      if (w.hp <= 0 && !w.over) {
        w.over = true;
        w.hp = 0;
        burst(w, w.p.x, w.p.y, "#ffd60a", 34, 300, 5);
        w.shake = 18;
        sfxRef.current?.over();
        const isNewBest = w.score > bestRef.current;
        if (isNewBest) {
          bestRef.current = w.score;
          try {
            window.localStorage.setItem("fire-offline-best", String(w.score));
          } catch {
            /* ignore */
          }
          setBest(w.score);
        }
        setHud({ hp: 0, score: w.score, wave: w.wave, kills: w.kills, rapid: 0, shield: 0, homing: 0, mines: 0, isNewBest });
        setPhase("over");
      }
    };

    /* --- دوربین --- */
    function cameraView() {
      const w = worldRef.current;
      const { w: cw, h: ch } = sizeRef.current;
      const scale = clamp(Math.min(cw / 1150, ch / 720), 0.55, 1.12);
      const viewW = cw / scale;
      const viewH = ch / scale;
      const px = w ? w.p.x : MAP_W / 2;
      const py = w ? w.p.y : MAP_H / 2;
      const camX = viewW >= MAP_W ? MAP_W / 2 : clamp(px, viewW / 2, MAP_W - viewW / 2);
      const camY = viewH >= MAP_H ? MAP_H / 2 : clamp(py, viewH / 2, MAP_H - viewH / 2);
      return { camX, camY, scale, viewW, viewH, px, py };
    }

    /* --- ترسیم --- */
    const draw = () => {
      const w = worldRef.current;
      const { w: cw, h: ch, dpr } = sizeRef.current;
      const ph = phaseRef.current;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#08090d";
      ctx.fillRect(0, 0, cw, ch);
      if (!w) return;

      const v = cameraView();
      ctx.save();
      /* لرزش صفحه */
      const sh = w.shake;
      const shx = sh > 0 ? (Math.random() - 0.5) * sh : 0;
      const shy = sh > 0 ? (Math.random() - 0.5) * sh : 0;
      ctx.translate(cw / 2 + shx, ch / 2 + shy);
      ctx.scale(v.scale, v.scale);
      ctx.translate(-v.camX, -v.camY);

      /* زمین */
      ctx.fillStyle = "#0b0d13";
      ctx.fillRect(0, 0, MAP_W, MAP_H);
      ctx.strokeStyle = "rgba(148,163,184,0.07)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let gx = 80; gx < MAP_W; gx += 80) {
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, MAP_H);
      }
      for (let gy = 80; gy < MAP_H; gy += 80) {
        ctx.moveTo(0, gy);
        ctx.lineTo(MAP_W, gy);
      }
      ctx.stroke();
      /* دیوار بیرونی */
      ctx.strokeStyle = "rgba(255,138,0,0.25)";
      ctx.lineWidth = 4;
      ctx.strokeRect(2, 2, MAP_W - 4, MAP_H - 4);

      /* موانع */
      const canRound = typeof ctx.roundRect === "function";
      for (const [ox, oy, ow, oh] of OBSTACLES) {
        ctx.fillStyle = "#1a2130";
        if (canRound) {
          ctx.beginPath();
          ctx.roundRect(ox, oy, ow, oh, 12);
          ctx.fill();
          ctx.fillStyle = "rgba(148,163,184,0.12)";
          ctx.beginPath();
          ctx.roundRect(ox, oy, ow, 7, 4);
          ctx.fill();
          if (w.mapFlash > 0) {
            ctx.strokeStyle = `rgba(255,214,10,${0.65 * w.mapFlash})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.roundRect(ox, oy, ow, oh, 12);
            ctx.stroke();
          }
        } else {
          ctx.fillRect(ox, oy, ow, oh);
          ctx.fillStyle = "rgba(148,163,184,0.12)";
          ctx.fillRect(ox + 4, oy, ow - 8, 6);
        }
      }

      const inGame = ph !== "menu";

      /* مین‌ها */
      if (inGame) {
        for (const mn of w.mines) {
          const blink = mn.arm > 0 ? 0.35 : 0.55 + Math.sin(mn.blink * 9) * 0.45;
          ctx.fillStyle = "#20242e";
          ctx.beginPath();
          ctx.arc(mn.x, mn.y, 8, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "rgba(255,59,92,0.8)";
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.strokeStyle = "rgba(255,59,92,0.45)";
          for (let i = 0; i < 4; i++) {
            const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
            ctx.beginPath();
            ctx.moveTo(mn.x + Math.cos(a) * 8, mn.y + Math.sin(a) * 8);
            ctx.lineTo(mn.x + Math.cos(a) * 12, mn.y + Math.sin(a) * 12);
            ctx.stroke();
          }
          ctx.globalAlpha = blink;
          ctx.fillStyle = "#ff3b5c";
          ctx.beginPath();
          ctx.arc(mn.x, mn.y, 3.2, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      }

      /* جوایز */
      if (inGame) {
        for (const pk of w.pickups) {
          const pulse = 1 + Math.sin(w.t * 5 + pk.t) * 0.08;
          ctx.save();
          ctx.translate(pk.x, pk.y);
          ctx.scale(pulse, pulse);
          ctx.fillStyle = PICKUP_COLORS[pk.kind].glow;
          ctx.beginPath();
          ctx.arc(0, 0, 17, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = PICKUP_COLORS[pk.kind].solid;
          if (pk.kind === "hp") {
            ctx.fillRect(-7, -2.4, 14, 4.8);
            ctx.fillRect(-2.4, -7, 4.8, 14);
          } else if (pk.kind === "rapid") {
            ctx.beginPath();
            ctx.moveTo(2, -8);
            ctx.lineTo(-5, 1);
            ctx.lineTo(-1, 1);
            ctx.lineTo(-2.5, 8);
            ctx.lineTo(5, -1);
            ctx.lineTo(1, -1);
            ctx.closePath();
            ctx.fill();
          } else if (pk.kind === "shield") {
            ctx.beginPath();
            ctx.moveTo(0, -8.5);
            ctx.lineTo(6.5, -5.5);
            ctx.lineTo(6.5, 0.5);
            ctx.quadraticCurveTo(6.5, 6.5, 0, 9);
            ctx.quadraticCurveTo(-6.5, 6.5, -6.5, 0.5);
            ctx.lineTo(-6.5, -5.5);
            ctx.closePath();
            ctx.fill();
          } else if (pk.kind === "homing") {
            ctx.beginPath();
            ctx.moveTo(0, -9);
            ctx.lineTo(4.5, -1);
            ctx.lineTo(4.5, 6);
            ctx.lineTo(-4.5, 6);
            ctx.lineTo(-4.5, -1);
            ctx.closePath();
            ctx.fill();
            ctx.fillRect(-7, 4.5, 3, 4);
            ctx.fillRect(4, 4.5, 3, 4);
          } else if (pk.kind === "mine") {
            ctx.beginPath();
            ctx.arc(0, 0, 5.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.strokeStyle = PICKUP_COLORS.mine.solid;
            for (let i = 0; i < 8; i++) {
              const a = (i / 8) * Math.PI * 2;
              ctx.beginPath();
              ctx.moveTo(Math.cos(a) * 5.5, Math.sin(a) * 5.5);
              ctx.lineTo(Math.cos(a) * 9.5, Math.sin(a) * 9.5);
              ctx.stroke();
            }
          } else {
            ctx.lineWidth = 2.6;
            ctx.strokeStyle = PICKUP_COLORS.bomb.solid;
            for (let i = 0; i < 8; i++) {
              const a = (i / 8) * Math.PI * 2;
              const rr = i % 2 === 0 ? 9.5 : 4.5;
              ctx.beginPath();
              ctx.moveTo(0, 0);
              ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
              ctx.stroke();
            }
          }
          ctx.restore();
        }
      }

      /* گلوله‌ها */
      if (inGame) {
        for (const bl of w.bullets) {
          ctx.fillStyle = bl.foe ? "#ff5c7a" : "#ffd60a";
          ctx.beginPath();
          ctx.arc(bl.x, bl.y, bl.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = bl.foe ? "rgba(255,92,122,0.25)" : "rgba(255,214,10,0.25)";
          ctx.beginPath();
          ctx.arc(bl.x, bl.y, bl.r + 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      /* ربات‌ها */
      if (inGame) {
        for (const b of w.bots) {
          const col = BOT_COLORS[b.kind];
          ctx.fillStyle = b.flash > 0 ? "#ffffff" : col;
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "rgba(0,0,0,0.35)";
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
          ctx.lineWidth = 3;
          ctx.strokeStyle = "rgba(0,0,0,0.4)";
          ctx.stroke();
          /* چشم رو به بازیکن */
          const ang = Math.atan2(w.p.y - b.y, w.p.x - b.x);
          ctx.fillStyle = "rgba(8,9,13,0.85)";
          ctx.beginPath();
          ctx.arc(b.x + Math.cos(ang) * b.r * 0.45, b.y + Math.sin(ang) * b.r * 0.45, b.r * 0.32, 0, Math.PI * 2);
          ctx.fill();
          /* نوار جان */
          if (b.hp < b.maxHp) {
            const bw = b.r * 2.3;
            ctx.fillStyle = "rgba(0,0,0,0.55)";
            ctx.fillRect(b.x - bw / 2, b.y - b.r - 11, bw, 4.5);
            ctx.fillStyle = col;
            ctx.fillRect(b.x - bw / 2, b.y - b.r - 11, bw * clamp(b.hp / b.maxHp, 0, 1), 4.5);
          }
        }
      }

      /* بازیکن */
      if (inGame && !w.over) {
        const blink = w.inv > 0 && Math.floor(w.t * 14) % 2 === 0;
        ctx.globalAlpha = blink ? 0.45 : 1;
        if (w.rapid > 0) {
          ctx.strokeStyle = "rgba(255,214,10,0.7)";
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(w.p.x, w.p.y, PLAYER_R + 7 + Math.sin(w.t * 8) * 1.5, 0, Math.PI * 2);
          ctx.stroke();
        }
        if (w.shield > 0) {
          ctx.fillStyle = "rgba(56,189,248,0.10)";
          ctx.beginPath();
          ctx.arc(w.p.x, w.p.y, PLAYER_R + 12, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = `rgba(56,189,248,${0.55 + Math.sin(w.t * 7) * 0.2})`;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(w.p.x, w.p.y, PLAYER_R + 12, 0, Math.PI * 2);
          ctx.stroke();
        }
        /* لوله */
        ctx.strokeStyle = w.homing > 0 ? "#ff8a3d" : "#f5f5f4";
        ctx.lineWidth = 6;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(w.p.x + Math.cos(w.aim) * (PLAYER_R - 4), w.p.y + Math.sin(w.aim) * (PLAYER_R - 4));
        ctx.lineTo(w.p.x + Math.cos(w.aim) * (PLAYER_R + 9), w.p.y + Math.sin(w.aim) * (PLAYER_R + 9));
        ctx.stroke();
        ctx.fillStyle = "#ffd60a";
        ctx.beginPath();
        ctx.arc(w.p.x, w.p.y, PLAYER_R, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(120,80,0,0.65)";
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.globalAlpha = 1;

        /* نشانگر شلیک — خط نشانه + رهگیری هدف */
        const lock = w.lockBot && w.lockBot.hp > 0 ? w.lockBot : null;
        const pt = lock ? { x: lock.x, y: lock.y } : w.aimPt ?? { x: w.p.x + Math.cos(w.aim) * 120, y: w.p.y + Math.sin(w.aim) * 120 };
        ctx.setLineDash([3, 7]);
        ctx.strokeStyle = lock ? "rgba(255,59,92,0.55)" : "rgba(255,214,10,0.4)";
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(w.p.x + Math.cos(w.aim) * (PLAYER_R + 10), w.p.y + Math.sin(w.aim) * (PLAYER_R + 10));
        ctx.lineTo(pt.x, pt.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = lock ? "#ff3b5c" : "#ffd60a";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, lock ? 9 : 11, 0, Math.PI * 2);
        ctx.stroke();
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
          ctx.beginPath();
          ctx.moveTo(pt.x + Math.cos(a) * 5, pt.y + Math.sin(a) * 5);
          ctx.lineTo(pt.x + Math.cos(a) * 10, pt.y + Math.sin(a) * 10);
          ctx.stroke();
        }
        ctx.fillStyle = lock ? "#ff3b5c" : "#ffd60a";
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 2.2, 0, Math.PI * 2);
        ctx.fill();
        if (lock) {
          const br = lock.r + 9;
          const cc = 7;
          ctx.strokeStyle = "#ff3b5c";
          ctx.lineWidth = 2.4;
          const corners: [number, number][] = [
            [-1, -1],
            [1, -1],
            [1, 1],
            [-1, 1],
          ];
          for (const [sx, sy] of corners) {
            ctx.beginPath();
            ctx.moveTo(lock.x + sx * br - sx * cc, lock.y + sy * br);
            ctx.lineTo(lock.x + sx * br, lock.y + sy * br);
            ctx.lineTo(lock.x + sx * br, lock.y + sy * br - sy * cc);
            ctx.stroke();
          }
        }
      }

      /* ذرات */
      for (const pt of w.parts) {
        ctx.globalAlpha = clamp(pt.life / pt.max, 0, 1);
        ctx.fillStyle = pt.color;
        ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
      }
      ctx.globalAlpha = 1;

      /* امتیاز شناور */
      for (const fl of w.floats) {
        ctx.globalAlpha = clamp(fl.life / 0.95, 0, 1);
        ctx.fillStyle = fl.color;
        ctx.font = "bold 17px ui-sans-serif, system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(fl.text, fl.x, fl.y);
      }
      ctx.globalAlpha = 1;
      ctx.restore();

      /* قرمزی آسیب */
      if (w.hurt > 0) {
        const g = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.3, cw / 2, ch / 2, Math.max(cw, ch) * 0.72);
        g.addColorStop(0, "rgba(255,40,70,0)");
        g.addColorStop(1, `rgba(255,40,70,${0.4 * w.hurt})`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, cw, ch);
      }

      /* اهرم‌های لمسی (فضای صفحه) */
      if (touchRef.current && ph === "playing") {
        const drawStick = (s: Stick | null, hx: number, hy: number) => {
          const bx = s ? s.ox : hx;
          const by = s ? s.oy : hy;
          ctx.globalAlpha = s ? 0.5 : 0.16;
          ctx.strokeStyle = "#fbbf24";
          ctx.lineWidth = 2.5;
          ctx.setLineDash(s ? [] : [7, 8]);
          ctx.beginPath();
          ctx.arc(bx, by, STICK_R, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
          if (s) {
            let dx = s.x - s.ox;
            let dy = s.y - s.oy;
            const d = Math.hypot(dx, dy);
            if (d > STICK_R) {
              dx = (dx / d) * STICK_R;
              dy = (dy / d) * STICK_R;
            }
            ctx.globalAlpha = 0.75;
            ctx.fillStyle = "#fbbf24";
            ctx.beginPath();
            ctx.arc(bx + dx, by + dy, STICK_KNOB, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.globalAlpha = 1;
        };
        const { w: cw2, h: ch2 } = sizeRef.current;
        const restY = ch2 - STICK_R - 46;
        drawStick(moveStickRef.current, STICK_R + 42, restY);
        drawStick(aimStickRef.current, cw2 - STICK_R - 42, restY);
      }
    };

    /* --- گام حلقه --- */
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      let dt = (now - last) / 1000;
      last = now;
      if (dt > 0.05) dt = 0.05;
      const w = worldRef.current;
      const ph = phaseRef.current;
      if (w && ph === "playing") {
        const steps = dt > 0.025 ? 2 : 1;
        for (let i = 0; i < steps && phaseRef.current === "playing"; i++) simulate(w, dt / steps);
        hudAcc += dt;
        if (hudAcc >= 0.1 && phaseRef.current === "playing") {
          hudAcc = 0;
          setHud((prev) => {
            const nh = {
              hp: Math.max(0, Math.ceil(w.hp)),
              score: w.score,
              wave: w.wave,
              kills: w.kills,
              rapid: w.rapid > 0 ? Math.ceil(w.rapid) : 0,
              shield: Math.ceil(w.shield),
              homing: Math.ceil(w.homing),
              mines: w.mines.length,
              isNewBest: prev.isNewBest,
            };
            const same =
              prev.score === nh.score && prev.hp === nh.hp && prev.wave === nh.wave && prev.kills === nh.kills && prev.rapid === nh.rapid && prev.shield === nh.shield && prev.homing === nh.homing && prev.mines === nh.mines;
            return same ? prev : nh;
          });
        }
      }
      draw();
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [numFmt, setPhase, showBanner]);

  /* آیکون جهت درست برای دکمه بازگشت بسته به RTL */
  const BackIcon = lang === "fa" ? ChevronRight : ChevronLeft;
  const hpPct = clamp(hud.hp / PLAYER_HP, 0, 1);
  /* حالت پاک: در حال بازی روی موبایل هیچ نوشته‌ای دیده نمی‌شود — فقط دکمه‌ها و نوار جان */
  const hudHidden = cleanHud && phase === "playing";

  return (
    <div
      ref={wrapRef}
      dir="rtl"
      className="fixed inset-0 z-0 touch-none overflow-hidden bg-zinc-950 select-none"
      style={{ overscrollBehavior: "none" }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onContextMenu={(e) => e.preventDefault()}
      />

      {/* نوار بالای صفحه */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-2 p-3"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <div className="pointer-events-auto flex items-center gap-2">
          <Button
            asChild
            size="icon"
            aria-label={f.back}
            className="h-10 w-10 rounded-full border border-zinc-800 bg-zinc-950/80 text-zinc-300 backdrop-blur hover:bg-zinc-800 hover:text-zinc-100"
          >
            <a href="/games">
              <BackIcon className="h-5 w-5" aria-hidden="true" />
            </a>
          </Button>
          {!hudHidden && (
            <div className="rounded-full border border-zinc-800 bg-zinc-950/80 px-3.5 py-1.5 backdrop-blur">
              <p className="flex items-center gap-1.5 text-xs font-bold text-orange-300">
                <Flame className="h-3.5 w-3.5" aria-hidden="true" />
                {f.menuTitle}
              </p>
            </div>
          )}
        </div>

        {phase !== "menu" && (
          <div className="pointer-events-auto flex items-center gap-1.5">
            {!hudHidden && (
              <>
                <span className="rounded-full border border-zinc-800 bg-zinc-950/80 px-3 py-1.5 text-xs font-bold text-zinc-200 backdrop-blur">
                  {f.wave} <b className="text-orange-300">{numFmt(Math.max(1, hud.wave))}</b>
                </span>
                <span className="rounded-full border border-zinc-800 bg-zinc-950/80 px-3 py-1.5 text-xs font-bold text-zinc-200 backdrop-blur">
                  {f.score} <b className="text-amber-300">{numFmt(hud.score)}</b>
                </span>
              </>
            )}
            {/* حالت پاک موبایل — خاموش/روشن کردن نوشته‌ها */}
            <Button
              onClick={() => setCleanHud((v) => !v)}
              size="icon"
              aria-label={cleanHud ? f.cleanOff : f.cleanOn}
              title={cleanHud ? f.cleanOff : f.cleanOn}
              className="h-10 w-10 rounded-full border border-zinc-800 bg-zinc-950/80 text-zinc-300 backdrop-blur hover:bg-zinc-800 hover:text-zinc-100"
            >
              {cleanHud ? <EyeOff className="h-4.5 w-4.5" aria-hidden="true" /> : <Eye className="h-4.5 w-4.5" aria-hidden="true" />}
            </Button>
            <Button
              onClick={toggleMute}
              size="icon"
              aria-label={muted ? f.soundOff : f.soundOn}
              className="h-10 w-10 rounded-full border border-zinc-800 bg-zinc-950/80 text-zinc-300 backdrop-blur hover:bg-zinc-800 hover:text-zinc-100"
            >
              {muted ? <VolumeX className="h-4.5 w-4.5" aria-hidden="true" /> : <Volume2 className="h-4.5 w-4.5" aria-hidden="true" />}
            </Button>
            <Button
              onClick={togglePause}
              size="icon"
              aria-label={f.pause}
              className="h-10 w-10 rounded-full border border-zinc-800 bg-zinc-950/80 text-zinc-300 backdrop-blur hover:bg-zinc-800 hover:text-zinc-100"
            >
              <Pause className="h-4.5 w-4.5" aria-hidden="true" />
            </Button>
          </div>
        )}
      </div>

      {/* نوار جان + شلیک سریع */}
      {phase === "playing" && (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center p-3"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        >
          <div className="flex w-full max-w-md flex-col gap-1.5 rounded-2xl border border-zinc-800 bg-zinc-950/70 px-4 py-2.5 backdrop-blur">
            {!hudHidden && (
              <div className="flex items-center justify-between text-[11px] font-bold text-zinc-400">
                <span>
                  {f.best}: <b className="text-amber-300">{numFmt(Math.max(best, hud.score))}</b>
                </span>
                {hud.rapid > 0 && (
                  <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-300">★ {numFmt(hud.rapid)}</span>
                )}
                {hud.shield > 0 && (
                  <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-sky-300">⛨ {numFmt(hud.shield)}</span>
                )}
                {hud.homing > 0 && (
                  <span className="rounded-full bg-orange-500/15 px-2 py-0.5 text-orange-300">🚀 {numFmt(hud.homing)}</span>
                )}
                {hud.mines > 0 && (
                  <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-rose-300">💣 {numFmt(hud.mines)}</span>
                )}
              </div>
            )}
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-zinc-800">
              <div
                className={`h-full rounded-full transition-[width] duration-150 ${hpPct > 0.5 ? "bg-emerald-500" : hpPct > 0.25 ? "bg-amber-500" : "bg-rose-500"}`}
                style={{ width: `${hpPct * 100}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* بنر موج — در حالت پاک موبایل پنهان می‌شود */}
      {banner && phase === "playing" && !hudHidden && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <div className="animate-pulse rounded-2xl border border-orange-500/40 bg-zinc-950/80 px-8 py-4 text-center backdrop-blur">
            <p className="text-2xl font-black text-orange-300">{banner.title}</p>
            {banner.sub && <p className="mt-1 text-sm text-zinc-300">{banner.sub}</p>}
          </div>
        </div>
      )}

      {/* منوی شروع */}
      {phase === "menu" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-zinc-950/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-orange-500/30 bg-zinc-950/95 p-7 text-center shadow-2xl shadow-orange-500/10">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-500/30 bg-orange-500/10 px-3 py-1 text-[11px] font-bold text-orange-300">
              <Flame className="h-3.5 w-3.5" aria-hidden="true" />
              {f.menuBadge}
            </span>
            <h1 className="mt-4 text-4xl font-black text-zinc-50">{f.menuTitle}</h1>
            <p className="mt-2 text-sm leading-7 text-zinc-400">{f.menuSub}</p>
            <p className="mt-3 inline-block rounded-full bg-zinc-900 px-4 py-1.5 text-xs font-bold text-zinc-300">
              {f.best}: <b className="text-amber-300">{numFmt(best)}</b>
            </p>
            <p className="mt-5 rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3 text-xs leading-6 text-zinc-400">
              {touchUI ? f.hintTouch : f.hintDesktop}
            </p>
            <Button
              onClick={startGame}
              className="mt-6 h-14 w-full rounded-2xl bg-orange-500 text-lg font-black text-zinc-950 hover:bg-orange-400"
            >
              <Play className="h-5 w-5" aria-hidden="true" />
              {f.startCta}
            </Button>
            <Button
              asChild
              variant="outline"
              className="mt-2.5 h-12 w-full rounded-2xl border-zinc-700 bg-transparent text-sm font-bold text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
            >
              <a href="/fire/online">
                <Users className="h-4.5 w-4.5" aria-hidden="true" />
                {t.fireOnline.menuCta}
              </a>
            </Button>
          </div>
        </div>
      )}

      {/* توقف */}
      {phase === "paused" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-zinc-950/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl border border-zinc-800 bg-zinc-950/95 p-7 text-center">
            <h2 className="text-2xl font-black text-zinc-50">{f.pausedTitle}</h2>
            <div className="mt-6 flex flex-col gap-2.5">
              <Button
                onClick={togglePause}
                className="h-12 rounded-xl bg-orange-500 text-base font-bold text-zinc-950 hover:bg-orange-400"
              >
                <Play className="h-4.5 w-4.5" aria-hidden="true" />
                {f.resume}
              </Button>
              <Button
                onClick={startGame}
                variant="outline"
                className="h-11 rounded-xl border-zinc-700 bg-transparent text-sm text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
              >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                {f.restart}
              </Button>
              <Button
                asChild
                variant="outline"
                className="h-11 rounded-xl border-zinc-700 bg-transparent text-sm text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
              >
                <a href="/games">
                  <Home className="h-4 w-4" aria-hidden="true" />
                  {f.exit}
                </a>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* پایان بازی */}
      {phase === "over" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-zinc-950/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl border border-rose-500/30 bg-zinc-950/95 p-7 text-center">
            <span className="text-4xl">💀</span>
            <h2 className="mt-2 text-2xl font-black text-rose-300">{f.gameOver}</h2>
            {hud.isNewBest && (
              <p className="mt-2 inline-block rounded-full bg-amber-500/15 px-3 py-1 text-xs font-bold text-amber-300">
                🎉 {f.newRecord}
              </p>
            )}
            <p className="mt-4 text-5xl font-black text-amber-300">{numFmt(hud.score)}</p>
            <p className="mt-1 text-xs text-zinc-400">
              {f.waveReached.replace("{n}", numFmt(Math.max(1, hud.wave)))} · {f.killsLabel}: {numFmt(hud.kills)}
            </p>
            <p className="mt-1 text-xs font-bold text-zinc-300">
              {f.best}: {numFmt(best)}
            </p>
            <div className="mt-6 flex flex-col gap-2.5">
              <Button
                onClick={startGame}
                className="h-12 rounded-xl bg-orange-500 text-base font-bold text-zinc-950 hover:bg-orange-400"
              >
                <RotateCcw className="h-4.5 w-4.5" aria-hidden="true" />
                {f.againCta}
              </Button>
              <Button
                asChild
                variant="outline"
                className="h-11 rounded-xl border-zinc-700 bg-transparent text-sm text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
              >
                <a href="/games">
                  <Home className="h-4 w-4" aria-hidden="true" />
                  {f.exit}
                </a>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
