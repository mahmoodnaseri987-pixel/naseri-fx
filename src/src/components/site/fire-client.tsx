"use client";

/* بازی «میدان آتش» — کلاینت کنواسی.
   مرجع شبیه‌سازی سرور است؛ اینجا فقط نمایش با درون‌یابی و پیش‌بینی
   حرکت خود بازیکن است تا کنترل بی‌وقفه و روان حس شود.
   کنترل‌ها:
     دسکتاپ: WASD/جهت‌ها حرکت، ماوس نشانه‌گیری، کلیک/Space شلیک
     موبایل: نیمه چپ کنوس جوی‌استیک، دکمه «آتش» با نشانه‌گیری خودکار */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Flame, Loader2 } from "lucide-react";
import { useLang } from "@/components/site/language-provider";
import {
  BASE_SPEED,
  BULLET_SPEED,
  BULLET_TTL_MS,
  FIRE_COLORS,
  MAP_H,
  MAP_W,
  MATCH_MS,
  OBSTACLES,
  PELLET_R,
  PLAYER_R,
  RAGE_SPEED,
  circleRectPush,
} from "@/lib/fire-engine";
import type { ArenaStateResponse, FireView } from "@/lib/types";

const RENDER_DELAY_MS = 110; // تاخیر بافر درون‌یابی بازیکنان دیگر
const ZOOM_BASE = 880; // عرض دید منطقی

type Props = {
  st: ArenaStateResponse;
  offsetMs: number;
  sendAction: (body: Record<string, unknown>) => Promise<boolean>;
};

type Fx = { x: number; y: number; a: number; t: number; kind: "muzzle" | "boom"; ci: number };

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function angDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
}

function clampMap(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/* حدس اولیه «پوینتر اصلی درشت» (موبایل/تبلت) —
   لپ‌تاپ‌های لمسی پوینتر اصلی‌شان ماوس است پس دسکتاپ حساب می‌شوند */
function subscribeCoarse(onChange: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mq = window.matchMedia("(pointer: coarse)");
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
function getCoarse(): boolean {
  return typeof window !== "undefined" && Boolean(window.matchMedia?.("(pointer: coarse)")?.matches);
}

export function FireClient({ st, offsetMs, sendAction }: Props) {
  const { lang } = useLang();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const stRef = useRef(st);
  const offsetRef = useRef(offsetMs);
  useEffect(() => {
    stRef.current = st;
    offsetRef.current = offsetMs;
  }, [st, offsetMs]);

  /* ورودی */
  const input = useRef({
    mx: 0, my: 0, // بردار حرکت فعلی
    kx: 0, ky: 0, // کیبورد
    jx: 0, jy: 0, // جوی‌استیک لمسی
    aim: null as number | null,
    firing: false,
    lastFire: 0,
    lastAny: 0,
    lastMvAngle: -9,
    lastMoving: false,
  });
  const keys = useRef(new Set<string>());
  const joy = useRef({ active: false, id: -1, ox: 0, oy: 0, x: 0, y: 0 });

  /* پیش‌بینی و دوربین */
  const pred = useRef({ x: MAP_W / 2, y: MAP_H / 2, init: false });
  const cam = useRef({ x: MAP_W / 2, y: MAP_H / 2, init: false });
  const prevView = useRef<{ v: FireView; t: number } | null>(null);
  const lastFeedT = useRef(0);
  const fx = useRef<Fx[]>([]);

  const [hud, setHud] = useState({
    hp: 100, score: 0, kills: 0, dead: false, respawnIn: 0,
    timeLeft: MATCH_MS, countdown: 0, rage: false,
  });
  const [feed, setFeed] = useState<{ id: number; a: string; v: string; at: number }[]>([]);
  /* کنترل لمسی یا دسکتاپ؟ — حدس اولیه از پوینتر اصلی،
     سپس با اولین لمس/کلیک واقعی قطعی می‌شود (override) */
  const coarseGuess = useSyncExternalStore(subscribeCoarse, getCoarse, () => false);
  const [touchOverride, setTouchOverride] = useState<"mouse" | "touch" | null>(null);
  const touchUI = touchOverride !== null ? touchOverride === "touch" : coarseGuess;
  const [joyOn, setJoyOn] = useState(false);
  const [joyPos, setJoyPos] = useState({ ox: 0, oy: 0 });

  const nameOf = useCallback(
    (id: string) => stRef.current.members.find((m) => m.id === id)?.name ?? "?",
    [],
  );
  const faNum = useCallback(
    (n: number) => new Intl.NumberFormat(lang === "fa" ? "fa-IR" : "en-US").format(n),
    [lang],
  );

  /* ---------- فید حذف‌ها از رویدادهای سرور ---------- */
  useEffect(() => {
    const v = st.fire;
    if (!v) return;
    const kills = v.ev.filter((e) => e.k === "kill" && e.t > lastFeedT.current);
    if (kills.length === 0) return;
    lastFeedT.current = Math.max(...kills.map((k) => k.t));
    setFeed((prev) => {
      const now = Date.now();
      const rows = [
        ...prev,
        ...kills.map((k, i) => ({ id: now + i, a: nameOf(k.a), v: nameOf(k.v), at: now })),
      ];
      return rows.filter((r) => now - r.at < 4200).slice(-4);
    });
    /* افکت انفجار برای حذف‌های تازه */
    const cur = stRef.current.fire;
    if (cur) {
      for (const k of kills) {
        const row = cur.ps.find((p) => p[0] === k.v);
        if (row) {
          fx.current.push({ x: row[1], y: row[2], a: 0, t: Date.now(), kind: "boom", ci: row[7] });
        }
      }
    }
  }, [st, nameOf]);

  /* ---------- شلیک خودم → افکت دهانه ---------- */
  const muzzleRef = useRef(0);
  useEffect(() => {
    const v = st.fire;
    if (!v) return;
    const me = v.ps.find((p) => p[0] === st.me);
    if (!me) return;
    /* اگر من دارم شلیک می‌کنم و گلوله‌ها بیشتر شده‌اند → افکت دهانه بگذار */
    if (v.bs.length > muzzleRef.current && me[6] <= v.simMs && input.current.firing) {
      fx.current.push({ x: me[1], y: me[2], a: me[3], t: Date.now(), kind: "muzzle", ci: me[7] });
    }
    muzzleRef.current = v.bs.length;
  }, [st, st.me]);

  /* ---------- کلیدها ---------- */
  useEffect(() => {
    function isEditable(el: EventTarget | null): boolean {
      return (
        el instanceof HTMLElement &&
        (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)
      );
    }
    function refreshK() {
      const k = keys.current;
      const has = (...ks: string[]) => ks.some((x) => k.has(x));
      /* e.code = مستقل از چیدمان کیبورد؛ WASD روی چیدمان فارسی هم کار می‌کند */
      const kx = (has("KeyD", "ArrowRight") ? 1 : 0) - (has("KeyA", "ArrowLeft") ? 1 : 0);
      const ky = (has("KeyS", "ArrowDown") ? 1 : 0) - (has("KeyW", "ArrowUp") ? 1 : 0);
      input.current.kx = kx;
      input.current.ky = ky;
    }
    function down(e: KeyboardEvent) {
      if (isEditable(e.target)) return; /* تایپ در چت → بازی کلیدها را نمی‌دزدد */
      const blocked = ["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
      if (blocked.includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      keys.current.add(e.code);
      if (e.code === "Space") input.current.firing = true;
      refreshK();
    }
    function up(e: KeyboardEvent) {
      keys.current.delete(e.code);
      if (e.code === "Space") input.current.firing = false;
      refreshK();
    }
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  /* رهاکردن شلیک هنگام رها کردن ماوس بیرون کنوس یا از دست رفتن فوکوس پنجره */
  useEffect(() => {
    const stopFire = () => {
      input.current.firing = false;
    };
    const stopAll = () => {
      input.current.firing = false;
      keys.current.clear();
      input.current.kx = 0;
      input.current.ky = 0;
    };
    window.addEventListener("mouseup", stopFire);
    window.addEventListener("blur", stopAll);
    return () => {
      window.removeEventListener("mouseup", stopFire);
      window.removeEventListener("blur", stopAll);
    };
  }, []);

  /* ---------- حلقه ارسال ورودی (۱۱۰ms) ---------- */
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      const i = input.current;
      /* ترکیب کیبورد + جوی‌استیک */
      let mx = i.kx + i.jx;
      let my = i.ky + i.jy;
      const mag = Math.hypot(mx, my);
      if (mag > 1) {
        mx /= mag;
        my /= mag;
      }
      if (Math.abs(mx) < 0.06 && Math.abs(my) < 0.06) {
        mx = 0;
        my = 0;
      }
      i.mx = mx;
      i.my = my;
      const moving = mx !== 0 || my !== 0;
      const mvAngle = moving ? Math.atan2(my, mx) : -9;
      const fireDue = i.firing && now - i.lastFire >= 270;
      const mvChanged =
        moving !== i.lastMoving ||
        (moving && angDiff(mvAngle, i.lastMvAngle) > 0.16);
      const stale = moving && now - i.lastAny >= 320;
      if (fireDue || mvChanged || stale) {
        void sendAction({ type: "input", mv: [mx, my], aim: i.aim, fire: fireDue });
        if (fireDue) i.lastFire = now;
        i.lastMvAngle = mvAngle;
        i.lastMoving = moving;
        i.lastAny = now;
      }
    }, 110);
    return () => clearInterval(id);
  }, [sendAction]);

  /* ---------- حلقه رندر + شبیه‌سازی محلی ---------- */
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let hudAt = 0;

    function frame(nowPerf: number) {
      raf = requestAnimationFrame(frame);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const dtMs = Math.min(80, nowPerf - last);
      last = nowPerf;
      const dt = dtMs / 1000;

      const cur = stRef.current;
      const v = cur.fire;
      if (!v) return;
      const serverNow = Date.now() + offsetRef.current;
      const snapWall = v.startedAtMs + v.simMs; // زمان دیواری متناظر با گام شبیه‌سازی اسنپ‌شات
      const simNow = serverNow - v.startedAtMs; // زمان شبیه‌سازی «الان»
      const rageMult = v.rage ? RAGE_SPEED : 1;

      /* --- پیش‌بینی حرکت خودم --- */
      const meRow = v.ps.find((p) => p[0] === cur.me);
      if (meRow && !pred.current.init) {
        pred.current.x = meRow[1];
        pred.current.y = meRow[2];
        pred.current.init = true;
      }
      const meDead = meRow ? meRow[6] > v.simMs : false;
      const inp = input.current;
      const movingLocal = !meDead && (inp.mx !== 0 || inp.my !== 0);
      if (movingLocal && simNow >= 0 && simNow < MATCH_MS) {
        pred.current.x += inp.mx * BASE_SPEED * rageMult * dt;
        pred.current.y += inp.my * BASE_SPEED * rageMult * dt;
        pred.current.x = clampMap(pred.current.x, PLAYER_R, MAP_W - PLAYER_R);
        pred.current.y = clampMap(pred.current.y, PLAYER_R, MAP_H - PLAYER_R);
        for (const [rx, ry, rw, rh] of OBSTACLES) {
          const [nx, ny] = circleRectPush(pred.current.x, pred.current.y, PLAYER_R, rx, ry, rw, rh);
          pred.current.x = nx;
          pred.current.y = ny;
        }
      }
      if (meRow && !meDead) {
        const errX = meRow[1] - pred.current.x;
        const errY = meRow[2] - pred.current.y;
        const err = Math.hypot(errX, errY);
        if (err > 90) {
          pred.current.x = meRow[1];
          pred.current.y = meRow[2];
        } else {
          const k = Math.min(1, dt * 4.5);
          pred.current.x += errX * k;
          pred.current.y += errY * k;
        }
      }

      /* --- دوربین --- */
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const cssW = canvas.clientWidth || 480;
      const cssH = Math.round((cssW * MAP_H) / MAP_W);
      const dprSize = Math.round(Math.max(300, Math.min(560, cssW)));
      const scale = dprSize / ZOOM_BASE;
      const viewW = dprSize / scale;
      const viewH = (dprSize * (MAP_H / MAP_W)) / scale;
      if (!cam.current.init) {
        cam.current = { x: pred.current.x, y: pred.current.y, init: true };
      }
      let cx = pred.current.x;
      let cy = pred.current.y;
      if (viewW < MAP_W) cx = clampMap(cx, viewW / 2, MAP_W - viewW / 2);
      else cx = MAP_W / 2;
      if (viewH < MAP_H) cy = clampMap(cy, viewH / 2, MAP_H - viewH / 2);
      else cy = MAP_H / 2;
      const ck = Math.min(1, dt * 6);
      cam.current.x = lerp(cam.current.x, cx, ck);
      cam.current.y = lerp(cam.current.y, cy, ck);

      /* --- درون‌یابی بازیکنان دیگر در T = serverNow - RENDER_DELAY --- */
      const T = serverNow - RENDER_DELAY_MS;
      const pv = prevView.current;
      const drawPlayers: { x: number; y: number; a: number; hp: number; score: number; dead: boolean; ci: number; id: string; name: string }[] = [];
      for (const row of v.ps) {
        const [id, x, y, a, hp, score, deadUntil, ci] = row;
        const dead = deadUntil > v.simMs;
        let px = x;
        let py = y;
        if (id !== cur.me && !dead && pv && pv.v.startedAtMs === v.startedAtMs) {
          const prowp = pv.v.ps.find((p) => p[0] === id);
          if (prowp && prowp[6] <= pv.v.simMs) {
            const t1 = pv.v.startedAtMs + pv.v.simMs;
            const t2 = snapWall;
            if (t2 > t1) {
              const alpha = clampMap((T - t1) / (t2 - t1), 0, 1);
              px = lerp(prowp[1], x, alpha);
              py = lerp(prowp[2], y, alpha);
            }
          }
        }
        if (id === cur.me) {
          px = pred.current.x;
          py = pred.current.y;
        }
        drawPlayers.push({
          x: px, y: py, a, hp, score, dead, ci, id,
          name: cur.members.find((m) => m.id === id)?.name ?? "?",
        });
      }
      prevView.current = { v, t: snapWall };

      /* --- رندر --- */
      if (canvas.width !== dprSize * dpr || canvas.height !== Math.round(dprSize * (MAP_H / MAP_W)) * dpr) {
        canvas.width = dprSize * dpr;
        canvas.height = Math.round(dprSize * (MAP_H / MAP_W)) * dpr;
        canvas.style.height = `${Math.round((cssW * MAP_H) / MAP_W)}px`;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, dprSize, dprSize);

      /* پس‌زمینه */
      const bg = ctx.createLinearGradient(0, 0, 0, dprSize);
      bg.addColorStop(0, "#0b0b14");
      bg.addColorStop(1, "#131322");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, dprSize, dprSize);

      ctx.save();
      ctx.translate(dprSize / 2, dprSize / 2);
      ctx.scale(scale, scale);
      ctx.translate(-cam.current.x, -cam.current.y);

      /* کف و شبکه */
      ctx.fillStyle = "#10101c";
      ctx.fillRect(0, 0, MAP_W, MAP_H);
      ctx.strokeStyle = "rgba(139, 92, 246, 0.07)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let gx = 0; gx <= MAP_W; gx += 80) {
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, MAP_H);
      }
      for (let gy = 0; gy <= MAP_H; gy += 80) {
        ctx.moveTo(0, gy);
        ctx.lineTo(MAP_W, gy);
      }
      ctx.stroke();

      /* لبه میدان */
      ctx.strokeStyle = v.rage ? "rgba(244, 63, 94, 0.8)" : "rgba(139, 92, 246, 0.55)";
      ctx.lineWidth = 10;
      ctx.shadowColor = v.rage ? "#f43f5e" : "#8b5cf6";
      ctx.shadowBlur = 24;
      ctx.strokeRect(0, 0, MAP_W, MAP_H);
      ctx.shadowBlur = 0;

      /* موانع */
      for (const [rx, ry, rw, rh] of OBSTACLES) {
        ctx.fillStyle = "#1c1c2e";
        ctx.strokeStyle = "rgba(139, 92, 246, 0.35)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.roundRect(rx, ry, rw, rh, 12);
        ctx.fill();
        ctx.stroke();
      }

      /* خوراکی‌ها */
      const pulse = 0.75 + 0.25 * Math.sin(nowPerf / 180);
      for (const [px, py] of v.pl) {
        ctx.fillStyle = `rgba(52, 211, 153, ${0.22 * pulse})`;
        ctx.beginPath();
        ctx.arc(px, py, PELLET_R + 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#34d399";
        ctx.beginPath();
        ctx.arc(px, py, PELLET_R, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(6, 78, 59, 0.9)";
        ctx.beginPath();
        ctx.arc(px, py, PELLET_R * 0.45, 0, Math.PI * 2);
        ctx.fill();
      }

      /* افکت‌های محلی */
      const nowWall = Date.now();
      fx.current = fx.current.filter((f) => nowWall - f.t < 420);
      for (const f of fx.current) {
        const age = (nowWall - f.t) / 420;
        if (f.kind === "muzzle") {
          ctx.strokeStyle = `rgba(253, 224, 71, ${1 - age})`;
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(f.x + Math.cos(f.a) * PLAYER_R, f.y + Math.sin(f.a) * PLAYER_R);
          ctx.lineTo(f.x + Math.cos(f.a) * (PLAYER_R + 22 * (1 - age)), f.y + Math.sin(f.a) * (PLAYER_R + 22 * (1 - age)));
          ctx.stroke();
        } else {
          for (let i = 0; i < 10; i++) {
            const ang = (i / 10) * Math.PI * 2 + f.a;
            const d = age * 90;
            ctx.fillStyle = `${FIRE_COLORS[f.ci]}${Math.round((1 - age) * 12).toString(16).padStart(2, "0")}`;
            ctx.beginPath();
            ctx.arc(f.x + Math.cos(ang) * d, f.y + Math.sin(ang) * d, 6 * (1 - age), 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      /* گلوله‌ها — برون‌یابی با سرعت ثابت */
      const bAge = Math.max(0, serverNow - snapWall);
      for (const [bx, by, ba] of v.bs) {
        const age = bAge;
        if (age > BULLET_TTL_MS) continue;
        const x = bx + Math.cos(ba) * BULLET_SPEED * (age / 1000);
        const y = by + Math.sin(ba) * BULLET_SPEED * (age / 1000);
        ctx.strokeStyle = "rgba(253, 224, 71, 0.35)";
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(x - Math.cos(ba) * 26, y - Math.sin(ba) * 26);
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.fillStyle = "#fde047";
        ctx.shadowColor = "#facc15";
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      /* بازیکنان */
      for (const p of drawPlayers) {
        if (p.dead) continue;
        const color = FIRE_COLORS[p.ci];
        const isMe = p.id === cur.me;
        /* هاله */
        ctx.fillStyle = `${color}26`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, PLAYER_R + 12, 0, Math.PI * 2);
        ctx.fill();
        /* لوله */
        ctx.strokeStyle = color;
        ctx.lineWidth = 7;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(p.x + Math.cos(p.a) * (PLAYER_R - 4), p.y + Math.sin(p.a) * (PLAYER_R - 4));
        ctx.lineTo(p.x + Math.cos(p.a) * (PLAYER_R + 13), p.y + Math.sin(p.a) * (PLAYER_R + 13));
        ctx.stroke();
        /* بدنه */
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = isMe ? 20 : 10;
        ctx.beginPath();
        ctx.arc(p.x, p.y, PLAYER_R, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = "rgba(0,0,0,0.28)";
        ctx.beginPath();
        ctx.arc(p.x, p.y, PLAYER_R * 0.55, 0, Math.PI * 2);
        ctx.fill();
        /* حلقه «من» */
        if (isMe) {
          ctx.strokeStyle = "rgba(255,255,255,0.9)";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(p.x, p.y, PLAYER_R + 6, 0, Math.PI * 2);
          ctx.stroke();
        }
        /* نام + نوار جان */
        ctx.font = "600 15px Vazirmatn, Tahoma, sans-serif";
        ctx.textAlign = "center";
        ctx.fillStyle = isMe ? "#ffffff" : "rgba(228, 228, 231, 0.92)";
        ctx.fillText(p.name, p.x, p.y - PLAYER_R - 16);
        const barW = 46;
        const hpRatio = p.hp / 100;
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.beginPath();
        ctx.roundRect(p.x - barW / 2, p.y - PLAYER_R - 12, barW, 6, 3);
        ctx.fill();
        ctx.fillStyle = hpRatio > 0.5 ? "#34d399" : hpRatio > 0.25 ? "#fbbf24" : "#f87171";
        ctx.beginPath();
        ctx.roundRect(p.x - barW / 2, p.y - PLAYER_R - 12, barW * hpRatio, 6, 3);
        ctx.fill();
      }

      /* خط نشانه‌گیری خودم */
      if (!meDead && inp.aim !== null) {
        ctx.strokeStyle = "rgba(255,255,255,0.25)";
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 8]);
        ctx.beginPath();
        ctx.moveTo(pred.current.x + Math.cos(inp.aim) * (PLAYER_R + 14), pred.current.y + Math.sin(inp.aim) * (PLAYER_R + 14));
        ctx.lineTo(pred.current.x + Math.cos(inp.aim) * 130, pred.current.y + Math.sin(inp.aim) * 130);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.restore();

      /* شبنم قرمز مرگ ناگهانی */
      if (v.rage) {
        const rg = ctx.createRadialGradient(dprSize / 2, dprSize / 2, dprSize * 0.3, dprSize / 2, dprSize / 2, dprSize * 0.75);
        rg.addColorStop(0, "rgba(244,63,94,0)");
        rg.addColorStop(1, "rgba(244,63,94,0.22)");
        ctx.fillStyle = rg;
        ctx.fillRect(0, 0, dprSize, dprSize);
      }

      /* --- HUD --- */
      if (nowPerf - hudAt > 90) {
        hudAt = nowPerf;
        const me = meRow;
        const respawnLeft = me ? Math.max(0, me[6] - Math.max(v.simMs, simNow)) : 0;
        setHud({
          hp: me ? Math.max(0, Math.round(me[4])) : 0,
          score: me ? me[5] : 0,
          kills: me ? me[5] : 0,
          dead: meDead,
          respawnIn: Math.ceil(respawnLeft / 1000),
          timeLeft: Math.max(0, MATCH_MS - Math.max(simNow, v.simMs)),
          countdown: Math.max(0, Math.ceil(-simNow / 1000)),
          rage: v.rage,
        });
      }
    }

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  /* ---------- ماوس ---------- */
  function updateAimFromEvent(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scale = rect.width / ZOOM_BASE;
    const viewH = rect.height / scale;
    let cx = cam.current.x;
    let cy = cam.current.y;
    if (viewH >= MAP_H) cy = MAP_H / 2;
    const worldX = (e.clientX - rect.left) / scale + cx - ZOOM_BASE / 2;
    const worldY = (e.clientY - rect.top) / scale + cy - viewH / 2;
    input.current.aim = Math.atan2(worldY - pred.current.y, worldX - pred.current.x);
  }

  function onMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    updateAimFromEvent(e);
  }
  function onMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    setTouchOverride("mouse"); /* کلیک ماوس واقعی → حالت دسکتاپ، حتی روی لپ‌تاپ لمسی */
    canvasRef.current?.focus();
    updateAimFromEvent(e);
    input.current.firing = true;
  }
  function onMouseUp() {
    input.current.firing = false;
  }

  /* ---------- لمس: جوی‌استیک نیمه چپ ---------- */
  function onTouchStart(e: React.TouchEvent<HTMLCanvasElement>) {
    setTouchOverride("touch"); /* لمس واقعی → کنترل‌های لمسی فعال شود */
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    for (const t of Array.from(e.changedTouches)) {
      if (t.clientX - rect.left < rect.width / 2 && !joy.current.active) {
        joy.current = { active: true, id: t.identifier, ox: t.clientX, oy: t.clientY, x: t.clientX, y: t.clientY };
        setJoyPos({ ox: t.clientX, oy: t.clientY });
        setJoyOn(true);
      }
    }
    e.preventDefault();
  }
  function onTouchMove(e: React.TouchEvent<HTMLCanvasElement>) {
    for (const t of Array.from(e.changedTouches)) {
      if (joy.current.active && t.identifier === joy.current.id) {
        joy.current.x = t.clientX;
        joy.current.y = t.clientY;
        const dx = t.clientX - joy.current.ox;
        const dy = t.clientY - joy.current.oy;
        const d = Math.hypot(dx, dy);
        const max = 46;
        const cl = Math.min(1, d / max);
        input.current.jx = d > 4 ? (dx / (d || 1)) * cl : 0;
        input.current.jy = d > 4 ? (dy / (d || 1)) * cl : 0;
      }
    }
    e.preventDefault();
  }
  function onTouchEnd(e: React.TouchEvent<HTMLCanvasElement>) {
    for (const t of Array.from(e.changedTouches)) {
      if (joy.current.active && t.identifier === joy.current.id) {
        joy.current = { active: false, id: -1, ox: 0, oy: 0, x: 0, y: 0 };
        input.current.jx = 0;
        input.current.jy = 0;
        setJoyOn(false);
      }
    }
  }

  function startFire() {
    input.current.aim = null; // نشانه‌گیری خودکار سرور
    input.current.firing = true;
  }
  function stopFire() {
    input.current.firing = false;
  }

  const v = st.fire;
  if (!v) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-600" aria-hidden="true" />
      </div>
    );
  }

  const timeLeft = Math.max(0, hud.timeLeft);
  const mm = Math.floor(timeLeft / 60000);
  const ss = Math.floor((timeLeft % 60000) / 1000);
  const timeStr = `${faNum(mm)}:${faNum(ss).padStart(2, lang === "fa" ? "۰" : "0")}`;
  const nameMap = new Map(st.members.map((m) => [m.id, m.name] as const));
  const liveScores = [...v.ps]
    .map((row) => ({ id: row[0], name: nameMap.get(row[0]) ?? "?", score: row[5], ci: row[7] }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return (
    <div className="relative mx-auto w-full max-w-3xl select-none px-2 py-4 sm:px-4">
      {/* نوار بالا */}
      <div className="mb-3 flex items-center justify-between gap-3">
        <div
          className={`flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-black tabular-nums ${
            hud.rage
              ? "border-rose-500/50 bg-rose-500/10 text-rose-300"
              : "border-zinc-800 bg-zinc-900/70 text-zinc-200"
          }`}
        >
          <Flame className={`h-4 w-4 ${hud.rage ? "text-rose-400" : "text-violet-400"}`} aria-hidden="true" />
          {timeStr}
        </div>
        <div className="flex items-center gap-1.5">
          {liveScores.map((p, i) => (
            <span
              key={p.id}
              className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold ${
                p.id === st.me ? "border-violet-500/60 bg-violet-500/15 text-violet-200" : "border-zinc-800 bg-zinc-900/70 text-zinc-400"
              }`}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: FIRE_COLORS[p.ci] }} aria-hidden="true" />
              {i === 0 && "👑"}
              {faNum(p.score)}
            </span>
          ))}
        </div>
      </div>

      {/* فید حذف */}
      <div className="pointer-events-none absolute end-4 top-14 z-20 space-y-1.5">
        {feed.map((f) => (
          <div key={f.id} className="rounded-lg border border-rose-500/30 bg-zinc-950/85 px-3 py-1.5 text-xs font-bold text-rose-200 shadow-lg">
            {f.a} ⚡ {f.v}
          </div>
        ))}
      </div>

      {/* کنوس */}
      <div ref={wrapRef} className="relative overflow-hidden rounded-2xl border border-zinc-800 shadow-2xl">
        <canvas
          ref={canvasRef}
          tabIndex={-1}
          className="block w-full touch-none outline-none"
          onMouseMove={onMouseMove}
          onMouseDown={onMouseDown}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchEnd}
          aria-label={lang === "fa" ? "میدان آتش" : "Fire Arena"}
        />

        {/* شمارش معکوس */}
        {hud.countdown > 0 && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-zinc-950/60 backdrop-blur-sm">
            <p className="text-8xl font-black text-violet-300 drop-shadow-lg">
              {faNum(hud.countdown)}
            </p>
            <p className="mt-2 text-sm font-bold text-zinc-400">
              {lang === "fa" ? "آماده باش…" : "Get ready…"}
            </p>
          </div>
        )}

        {/* حذف‌شده‌ای */}
        {hud.dead && hud.countdown === 0 && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-rose-950/50 backdrop-blur-sm">
            <p className="text-3xl font-black text-rose-300">
              {lang === "fa" ? "حذف شدی!" : "You're down!"}
            </p>
            <p className="mt-2 text-sm font-bold text-zinc-300">
              {lang === "fa" ? `بازگشت در ${faNum(Math.max(1, hud.respawnIn))} ثانیه` : `Respawn in ${faNum(Math.max(1, hud.respawnIn))}s`}
            </p>
          </div>
        )}

        {/* هشدار مرگ ناگهانی */}
        {hud.rage && !hud.dead && (
          <div className="pointer-events-none absolute inset-x-0 top-3 z-20 text-center">
            <span className="rounded-full border border-rose-500/50 bg-rose-500/20 px-4 py-1 text-xs font-black text-rose-200">
              {lang === "fa" ? "🔥 مرگ ناگهانی — همه سریع‌تر شدند!" : "🔥 Sudden death — everyone is faster!"}
            </span>
          </div>
        )}

        {/* دکمه آتش (لمسی) */}
        {touchUI && (
          <button
            type="button"
            aria-label={lang === "fa" ? "شلیک" : "Fire"}
            onTouchStart={(e) => {
              e.preventDefault();
              startFire();
            }}
            onTouchEnd={(e) => {
              e.preventDefault();
              stopFire();
            }}
            onTouchCancel={stopFire}
            className="absolute bottom-4 end-4 z-30 flex h-20 w-20 touch-none items-center justify-center rounded-full border-2 border-amber-400/60 bg-amber-500/25 text-amber-300 shadow-xl backdrop-blur active:bg-amber-500/45"
          >
            <Flame className="h-9 w-9" aria-hidden="true" />
          </button>
        )}

        {/* جوی‌استیک بصری (لمسی) */}
        {touchUI && joyOn && (
          <div
            className="pointer-events-none absolute z-20"
            style={{ left: joyPos.ox - 60, top: joyPos.oy - 60 }}
          >
            <div className="h-[120px] w-[120px] rounded-full border-2 border-violet-500/40 bg-violet-500/10" />
            <div className="absolute left-[36px] top-[36px] h-12 w-12 rounded-full bg-violet-400/70" />
          </div>
        )}
      </div>

      {/* جان و امتیاز من */}
      <div className="mt-3 flex items-center justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center justify-between text-xs font-bold">
            <span className="text-zinc-400">{lang === "fa" ? "جان" : "HP"}</span>
            <span className={hud.hp > 50 ? "text-emerald-400" : hud.hp > 25 ? "text-amber-400" : "text-rose-400"}>
              {faNum(hud.hp)}٪
            </span>
          </div>
          <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-zinc-800">
            <div
              className={`h-full rounded-full transition-all duration-150 ${
                hud.hp > 50 ? "bg-emerald-400" : hud.hp > 25 ? "bg-amber-400" : "bg-rose-400"
              }`}
              style={{ width: `${hud.hp}%` }}
            />
          </div>
        </div>
        <div className="text-end">
          <p className="text-xs font-bold text-zinc-500">{lang === "fa" ? "امتیاز" : "Score"}</p>
          <p className="text-lg font-black tabular-nums text-emerald-400">{faNum(hud.score)}</p>
        </div>
      </div>

      {/* راهنما */}
      <p className="mt-3 text-center text-[11px] leading-5 text-zinc-600">
        {touchUI
          ? lang === "fa"
            ? "نیمه چپ صفحه را بکش تا حرکت کنی — دکمه آتش خودکار نشانه می‌گیرد"
            : "Drag the left half to move — the Fire button auto-aims"
          : lang === "fa"
            ? "WASD یا جهت‌ها حرکت — ماوس نشانه‌گیری — کلیک یا Space شلیک"
            : "WASD/arrows to move — mouse to aim — click or Space to shoot"}
      </p>
      <p className="mt-1 text-center text-[10px] text-zinc-700">
        {lang === "fa" ? "خوراکی سبز = جان و امتیاز • ۴ ضربه = حذف" : "Green pellet = HP & score • 4 hits = elimination"}
      </p>
    </div>
  );
}
