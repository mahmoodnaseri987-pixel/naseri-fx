"use client";

/* میدان آتش — نسخه گروهی آنلاین (اتاق‌های کد-محور روی Ably).
   معماری «میزبان-محور»: اتاق‌ساز شبیه‌سازی را مثل نسخه آفلاین اجرا می‌کند و
   اسنپ‌شات می‌فرستد؛ مهمان‌ها «پیش‌بینی محلی با بازپخش ورودی» دارند — حرکت و
   شلیک خودشان همان لحظه اعمال می‌شود و فقط ورودی‌های تأییدنشده دوباره اجرا
   می‌شود تا تاخیر شبکه حس نشود.

   مسیر داده — ریشه‌ای‌ترین رفع لگ مهمان:
   هر مهمان به‌محض ورود به لابی با میزبان یک DataChannel مستقیم WebRTC
   (SCTP/UDP، بدون ترتیب و بدون بازپخش) باز می‌کند؛ ورودی مهمان و اسنپ‌شات
   میزبان دیگر از رلهٔ ابیلی عبور نمی‌کنند. رلهٔ WebSocket/TCP منبع اصلی
   «تند‌و‌کند شدن، پرش و گاهی انجماد» بود: روی خطوط پرگم، سرُری TCP همهٔ
   بسته‌ها را پشت‌هم می‌بندد و مهمان دچار جهش زمانی می‌شد. ابیلی فقط
   سیگنالینگ SDP/ICE، لابی/رستور و پیام‌های مطمئن (go/end) را برعهده دارد؛
   اگر P2P برای مهمانی باز نشد، همان مسیر رلهٔ قبلی برای او بی‌صدا ادامه
   می‌یابد (fallback کامل، بدون تغییر رفتار).

   ضد-لرزش (ریشه‌یابی تاخیر مهمان):
   • ساعت میان‌یابی نرم + تاخیر انطباقی بر اساس «فاصله و لرزش» رسیدن
     اسنپ‌شات‌ها — قبلاً رندر روی (now ثابت − ۵۵ms) بود و هر گام لرزش شبکه
     زمان رندر را از پنجرهٔ دو اسنپ‌شات بیرون می‌برد ⇒ آلفا به ۱ کلمپ می‌شد
     ⇒ تله‌پورت بازیکن‌های دیگر (حرکات پرشی/تند‌و‌کند). اکنون ساعت با ضریب
     انطباقی جلو می‌رود و هنگام گرسنگی بافر، برون‌یابی سرعت‌دار (≤۱۶۰ms)
     ادامهٔ مسیر را روان نشان می‌دهد.
   • ورودی مهمان همیشه با نرخ پایه ارسال می‌شود (نه فقط روی لبه) تا seq
     میزبان جلو برود و به‌روزرسانی پس از مکث شبکه فریز نشود؛ آستانهٔ کهنگی
     ورودی میزبان ۰٫۵→۱٫۰ ثانیه.
   • پینگ دوطرفه (t:"p"/"q") با نمایش RTT در HUD و هوک __fireNet برای
     عیب‌یابی زنده.

   هر کانال Ably سقف ۵۰ پیام بر ثانیه دارد (خطای 42913)؛ با P2P کامل کانال
   اتاق تقریباً خالی می‌شود. در حالت جانشین: اسنپ‌شات (~۳۰/ث) روی کانال اتاق
   و ورودی هر مهمان روی کانال اختصاصی خودش fire:room:<کد>-i:<شناسه> می‌رود. */

import { RtcLink, type RtcWire } from "@/components/site/fire-rtc";

import { createClient } from "@ably/pubsub-device";
import type { InboundMessage, PresenceMessage, PubSubClient, RealtimeChannel } from "@ably/pubsub-device";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  Flame,
  LogOut,
  Minus,
  Plus,
  RotateCcw,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLang } from "@/components/site/language-provider";
import {
  MAPS,
  OBSTACLES,
  MAP_W,
  MAP_H,
  PLAYER_R,
  PLAYER_HP,
  PLAYER_SPEED,
  BULLET_SPEED,
  BULLET_DMG,
  BULLET_R,
  BULLET_LIFE,
  FIRE_CD,
  RAPID_CD,
  RAPID_TIME,
  STICK_R,
  STICK_KNOB,
  STICK_DEAD,
  SHIELD_TIME,
  HOMING_TIME,
  MISSILE_SPEED,
  MISSILE_TURN,
  MISSILE_DMG,
  MISSILE_R,
  MISSILE_LIFE,
  MINE_TRIGGER,
  MINE_RADIUS,
  MINE_DMG,
  BOMB_RADIUS,
  BOMB_DMG,
  clamp,
  setMap,
  slideMove,
  hasLOS,
  makeSfx,
  type BotKind,
  type Pickup,
  type Stick,
  type Sfx,
} from "@/components/site/fire-offline";

/* ---------- ثابت‌های نبرد گروهی ---------- */
const MATCH_TIME = 300;
const KILL_TARGET = 15;
const RESPAWN_T = 3;
const MAX_HUMANS = 8;
const SNAP_MS = 33; // ~۳۰ اسنپ‌شات بر ثانیه
const INPUT_MS = 40; // نرخ پایه ارسال ورودی مهمان (۲۵/ث)؛ لبهٔ شلیک فوراً می‌رود — زیر سقف ۵۰/ث اِیبلی
const INTERP_MS = 90; // تاخیر اولیه میان‌یابی — بر اساس لرزش واقعی شبکه به‌صورت انطباقی تنظیم می‌شود

type Team = "r" | "b";
const TEAM_COLORS: Record<Team, string> = { r: "#ff3b5c", b: "#38bdf8" };
const TEAM_SPAWNS: Record<Team, readonly [number, number][]> = {
  r: [
    [80, 80],
    [800, 56],
    [56, 500],
  ],
  b: [
    [1520, 920],
    [800, 944],
    [1544, 500],
  ],
};
const BOT_BASE: Record<BotKind, { r: number; hp: number; speed: number }> = {
  chaser: { r: 15, hp: 44, speed: 225 },
  shooter: { r: 17, hp: 80, speed: 140 },
  tank: { r: 24, hp: 230, speed: 85 },
};
const BOT_KINDS: BotKind[] = ["chaser", "shooter", "tank"];
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/* ---------- انواع ---------- */
type REntry = { id: string; name: string; team: Team; bot: boolean };
type HPlayer = {
  id: string;
  name: string;
  team: Team;
  bot: boolean;
  kind: BotKind;
  speed: number;
  x: number;
  y: number;
  r: number;
  hp: number;
  aim: number;
  dead: boolean;
  respT: number;
  inv: number;
  shield: number;
  homing: number;
  rapid: number;
  fireCd: number;
  atkCd: number;
  phase: number;
  sq: number; // آخرین seq ورودی مهمان اعمال‌شده — مهمان برای پیش‌بینی می‌خواند
};
type NBullet = { x: number; y: number; vx: number; vy: number; r: number; dmg: number; life: number; ow: string; team: Team; kind: "normal" | "missile" };
type NMine = { x: number; y: number; arm: number; blink: number; ow: string; tm: Team };
type HWorld = {
  t: number;
  timeLeft: number;
  sr: number;
  sb: number;
  ps: HPlayer[];
  bs: NBullet[];
  pk: Pickup[];
  mn: NMine[];
  ev: [string, string, string][];
};
type PSnap = { id: string; x: number; y: number; r: number; hp: number; aim: number; team: Team; dead: 0 | 1; respT: number; sh: number; hm: number; rp: number; inv: 0 | 1; sq?: number };
/* [x, y, vx, vy, tm(0=قرمز/1=آبی), ms] — آرایهٔ فشرده تا حجم اسنپ‌شات و تاخیر شبکه کم بماند */
type BSnap = [number, number, number, number, 0 | 1, 0 | 1];
type Snap = {
  t: "s";
  tm: number;
  wt?: number; /* زمان شبیه‌سازی میزبان (ms) — بستهٔ نامرتب مسیر بدون‌ترتیب را می‌اندازد */
  sr: number;
  sb: number;
  ps: PSnap[];
  bs: BSnap[];
  pk: { x: number; y: number; k: Pickup["kind"] }[];
  mn: { x: number; y: number; ow: string }[];
  ev: [string, string, string][];
};
type RMsg = { t: "r"; host: string; started: boolean; bots: number; m: number; ps: REntry[] };
type GoMsg = { t: "go"; m: number };
type EndMsg = { t: "end"; w: Team | "d"; sr: number; sb: number };
type InMsg = { t: "i"; u: string; mv: [number, number]; a: number; f: 0 | 1; seq: number };
type LocalInput = { mv: [number, number]; aim: number; fire: boolean };
type Fx = { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string };
type FxText = { x: number; y: number; text: string; life: number; color: string };
type RPlayer = { id: string; name: string; team: Team; x: number; y: number; hp: number; aim: number; dead: boolean; respT: number; sh: boolean; hm: boolean; inv: boolean; bot: boolean };
type HudNet = { hp: number; sr: number; sb: number; tm: number; dead: boolean; respT: number; sh: number; hm: number; mn: number };
type Step = "menu" | "connecting" | "lobby" | "playing" | "over" | "setup" | "error";
type OpenRoom = { c: string; n: string; p: number; m: number; s: number };

const round2 = (v: number) => Math.round(v * 100) / 100;
const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

function genCode(): string {
  let s = "";
  for (let i = 0; i < 5; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}

/* کانال اختصاصی ورودی هر مهمان — تا نرخ کانال اتاق از ۵۰ پیام/ث عبور نکند */
function inputChanName(code: string, uid: string): string {
  return `fire:room:${code}-i:${uid.replace(/[^a-zA-Z0-9_-]/g, "")}`;
}

function fmtClock(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r < 10 ? "0" : ""}${r}`;
}

/* ---------- کامپوننت ---------- */
export function FireOnline() {
  const { t, lang } = useLang();
  const f = t.fireOffline;
  const o = t.fireOnline;

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sfxRef = useRef<Sfx | null>(null);
  const tRef = useRef(t);
  const langRef = useRef(lang);

  /* شبکه */
  const clientRef = useRef<PubSubClient | null>(null);
  const chanRef = useRef<RealtimeChannel | null>(null);
  const lobbyChanRef = useRef<RealtimeChannel | null>(null);
  /* کانال ورودی خودِ مهمان + کانال‌های ورودی مهمان‌ها که میزبان گوش می‌دهد */
  const inChanRef = useRef<RealtimeChannel | null>(null);
  const inChansRef = useRef<Map<string, RealtimeChannel>>(new Map());
  /* پیوندهای مستقیم WebRTC — میزبان: به هر مهمان؛ مهمان: به میزبان */
  const rtcPeersRef = useRef<Map<string, RtcLink>>(new Map());
  const rtcOpenRef = useRef(false); /* مهمان: DataChannel با میزبان باز است */
  const rtcTryRef = useRef<{ n: number; timer: number | null }>({ n: 0, timer: null });
  /* شماره‌گیر دوبارهٔ P2P — با واسطهٔ ref تا وابستگی دوری با startRtc رخ ندهد */
  const rtcDialRef = useRef<(peer: string) => void>(() => {});
  /* بالاترین wt اسنپ‌شات دریافتی — بستهٔ کهنه/نامرتب مسیر بدون‌ترتیب می‌افتد */
  const snapWtRef = useRef(0);
  const myUidRef = useRef("");
  const isHostRef = useRef(false);
  const hostUidRef = useRef("");
  const roomCodeRef = useRef("");
  const rosterRef = useRef<REntry[]>([]);
  const startedRef = useRef(false);
  const matchCountRef = useRef(0);
  const botsPerRef = useRef(1);

  /* بازی */
  const stepRef = useRef<Step>("menu");
  const worldRef = useRef<HWorld | null>(null);
  const snapsRef = useRef<{ rt: number; s: Snap }[]>([]);
  const inputsRef = useRef<Map<string, { im: InMsg; at: number }>>(new Map());
  const localInputRef = useRef<LocalInput>({ mv: [0, 0], aim: -Math.PI / 2, fire: false });
  const lastAimRef = useRef(-Math.PI / 2);
  const localSelfRef = useRef({ x: MAP_W / 2, y: MAP_H / 2 + 160 });
  const camRef = useRef({ camX: MAP_W / 2, camY: MAP_H / 2, scale: 1 });
  const seqRef = useRef(0);
  const lastInRef = useRef(0);
  /* شبکه‌سنج: RTT پینگ + فاصله/لرزش رسیدن اسنپ‌شات — موتور میان‌یابی انطباقی و HUD */
  const netRef = useRef({ rtt: 0, jit: 0, arr: 33, lastPing: 0, lastQ: 0 });
  /* ساعت میان‌یابی مهمان (بر حسب performance.now) + تاخیر انطباقی فعلی */
  const renderClockRef = useRef(0);
  const renderDelayRef = useRef(INTERP_MS);
  /* لاگ ارسال ورودی مهمان — برای «بازپخش» در پیش‌بینی محلی (حذف تاخیر حرکت مهمان) */
  const sendLogRef = useRef<{ seq: number; mv: [number, number]; t: number }[]>([]);
  const prevFireRef = useRef(false);
  const prevMoveRef = useRef(false);
  const prevDeadRef = useRef(false);
  const lastLocalShotRef = useRef(0);
  /* گلوله‌های دیداری محلی مهمان — آنی پس از فشردن شلیک، تا گلولهٔ واقعی سرور برسد */
  const localBulletsRef = useRef<{ x: number; y: number; vx: number; vy: number; born: number }[]>([]);
  /* موقعیت پیش‌بینی‌شدهٔ منطقی و موقعیت نمایشی نرم‌شده */
  const predSmoothRef = useRef({ x: MAP_W / 2, y: MAP_H / 2 + 160 });
  const lastSnapRef = useRef(0);
  const lastShotFxRef = useRef(0);
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });
  const rafRef = useRef(0);
  const keysRef = useRef<Set<string>>(new Set());
  const touchRef = useRef(false);
  const mouseRef = useRef({ x: 0, y: 0, has: false });
  const fireMouseRef = useRef(false);
  const moveStickRef = useRef<Stick | null>(null);
  const aimStickRef = useRef<Stick | null>(null);
  const lockPtRef = useRef<{ x: number; y: number } | null>(null);
  const fxRef = useRef<{ parts: Fx[]; floats: FxText[]; shake: number; hurt: number }>({ parts: [], floats: [], shake: 0, hurt: 0 });
  const rosterTimerRef = useRef<number | null>(null);
  const bannerTimerRef = useRef<number | null>(null);
  const autoJoinRef = useRef(false);

  const [step, setStepState] = useState<Step>("menu");
  const [nameInput, setNameInput] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [menuErr, setMenuErr] = useState("");
  const [errMsg, setErrMsg] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [amHostUi, setAmHostUi] = useState(false);
  const [myUidUi, setMyUidUi] = useState("");
  const [hostUidUi, setHostUidUi] = useState("");
  const [roster, setRoster] = useState<REntry[]>([]);
  const [botsPer, setBotsPer] = useState(1);
  const [copied, setCopied] = useState(false);
  const [openRooms, setOpenRooms] = useState<OpenRoom[]>([]);
  const [killFeed, setKillFeed] = useState<string[]>([]);
  const [hud, setHud] = useState<HudNet>({ hp: PLAYER_HP, sr: 0, sb: 0, tm: MATCH_TIME, dead: false, respT: 0, sh: 0, hm: 0, mn: 0 });
  const hudRef = useRef(hud);
  useEffect(() => {
    hudRef.current = hud;
  }, [hud]);
  const [finalNet, setFinalNet] = useState<{ w: Team | "d"; sr: number; sb: number } | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [touchUI, setTouchUI] = useState(false);
  const [muted, setMuted] = useState(false);
  /* حالت پاک موبایل — هنگام بازی هیچ نوشته‌ای روی صفحه نیست؛ فقط دکمه‌ها و نوار جان */
  const [cleanHud, setCleanHud] = useState(false);
  /* پینگ شبکه برای نمایش در HUD بازی — عیب‌یابی زندهٔ کیفیت اتصال */
  const [netHud, setNetHud] = useState<{ rtt: number; jit: number; mode: "p2p" | "relay" } | null>(null);
  const mutedStateRef = useRef(false);

  const setStep = useCallback((s: Step) => {
    stepRef.current = s;
    setStepState(s);
  }, []);

  useEffect(() => {
    tRef.current = t;
    langRef.current = lang;
  }, [t, lang]);

  const numFmt = useCallback(
    (n: number) => new Intl.NumberFormat(lang === "fa" ? "fa-IR" : "en-US").format(n),
    [lang],
  );

  const showBanner = useCallback((text: string) => {
    setBanner(text);
    if (bannerTimerRef.current) window.clearTimeout(bannerTimerRef.current);
    bannerTimerRef.current = window.setTimeout(() => setBanner(null), 2200);
  }, []);

  /* ---------- افکت‌های محلی ---------- */
  const fxBurst = useCallback((x: number, y: number, color: string, n: number, speed: number, size: number) => {
    const fx = fxRef.current;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.3 + Math.random() * 0.7);
      const life = 0.35 + Math.random() * 0.4;
      fx.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, size: size * (0.5 + Math.random()), color });
    }
    if (fx.parts.length > 260) fx.parts.splice(0, fx.parts.length - 260);
  }, []);

  const fxFloat = useCallback((x: number, y: number, text: string, color: string) => {
    fxRef.current.floats.push({ x, y, text, life: 0.95, color });
  }, []);

  /* ---------- قطع شبکه و بازگشت ---------- */
  const closeNet = useCallback(() => {
    try {
      lobbyChanRef.current?.presence.leave();
    } catch {
      /* ignore */
    }
    try {
      lobbyChanRef.current?.detach();
    } catch {
      /* ignore */
    }
    lobbyChanRef.current = null;
    try {
      inChanRef.current?.detach();
    } catch {
      /* ignore */
    }
    inChanRef.current = null;
    for (const ic of inChansRef.current.values()) {
      try {
        ic.detach();
      } catch {
        /* ignore */
      }
    }
    inChansRef.current.clear();
    try {
      chanRef.current?.presence.leave();
    } catch {
      /* ignore */
    }
    try {
      chanRef.current?.detach();
    } catch {
      /* ignore */
    }
    /* پیوندهای مستقیم P2P همه بسته می‌شوند */
    for (const lk of rtcPeersRef.current.values()) lk.close();
    rtcPeersRef.current.clear();
    rtcOpenRef.current = false;
    if (rtcTryRef.current.timer) {
      window.clearTimeout(rtcTryRef.current.timer);
      rtcTryRef.current.timer = null;
    }
    try {
      clientRef.current?.close();
    } catch {
      /* ignore */
    }
    chanRef.current = null;
    clientRef.current = null;
  }, []);

  const resetMatchLocal = useCallback(() => {
    worldRef.current = null;
    snapsRef.current = [];
    inputsRef.current.clear();
    seqRef.current = 0;
    startedRef.current = false;
    setKillFeed([]);
    setHud({ hp: PLAYER_HP, sr: 0, sb: 0, tm: MATCH_TIME, dead: false, respT: 0, sh: 0, hm: 0, mn: 0 });
    setFinalNet(null);
    setBanner(null);
    localSelfRef.current = { x: MAP_W / 2, y: MAP_H / 2 + 160 };
    predSmoothRef.current = { x: MAP_W / 2, y: MAP_H / 2 + 160 };
    renderClockRef.current = 0;
    renderDelayRef.current = INTERP_MS;
    rtcOpenRef.current = false;
    snapWtRef.current = 0;
    setNetHud(null);
    sendLogRef.current = [];
    localBulletsRef.current = [];
    prevFireRef.current = false;
    prevMoveRef.current = false;
    prevDeadRef.current = false;
    lastLocalShotRef.current = 0;
  }, []);

  const leaveToMenu = useCallback(() => {
    closeNet();
    resetMatchLocal();
    rosterRef.current = [];
    setRoster([]);
    setStep("menu");
  }, [closeNet, resetMatchLocal, setStep]);

  /* ---------- نام‌ها ---------- */
  const nameOf = useCallback((id: string) => rosterRef.current.find((e) => e.id === id)?.name ?? "؟", []);

  /* ---------- میزبان: رستور ---------- */
  const publishRoster = useCallback(() => {
    const ch = chanRef.current;
    if (!ch || !isHostRef.current) return;
    const msg: RMsg = {
      t: "r",
      host: myUidRef.current,
      started: startedRef.current,
      bots: botsPerRef.current,
      m: startedRef.current ? matchCountRef.current - 1 : 0,
      ps: rosterRef.current,
    };
    void ch.publish("r", msg);
    setRoster(rosterRef.current);
    /* اعلام اتاق باز روی کانال عمومی برای بنر سایت و فهرست منو */
    const lb = lobbyChanRef.current;
    if (lb && isHostRef.current) {
      const me = rosterRef.current.find((e) => e.id === myUidRef.current);
      void lb.presence.update({ c: roomCodeRef.current, n: me?.name ?? "؟", p: rosterRef.current.filter((e) => !e.bot).length, m: MAX_HUMANS, s: startedRef.current ? 1 : 0 });
    }
  }, []);

  const scheduleRoster = useCallback(() => {
    if (rosterTimerRef.current) window.clearTimeout(rosterTimerRef.current);
    rosterTimerRef.current = window.setTimeout(() => publishRoster(), 250);
  }, [publishRoster]);

  const humansCount = useCallback(() => rosterRef.current.filter((e) => !e.bot).length, []);

  /* ---------- میزبان: جنگ ---------- */
  const fxOf = fxRef;

  const killPlayer = useCallback(
    (w: HWorld, v: HPlayer, ow: string, wp: string) => {
      v.dead = true;
      v.respT = RESPAWN_T;
      v.hp = 0;
      const k = w.ps.find((p) => p.id === ow);
      if (k && k.id !== v.id) {
        if (k.team === "r") w.sr += 1;
        else w.sb += 1;
      }
      w.ev.push([ow, v.id, wp]);
      fxBurst(v.x, v.y, TEAM_COLORS[v.team], 22, 240, 4.5);
      fxFloat(v.x, v.y - 24, "✖", "#ff8fa3");
      fxOf.current.shake = Math.min(16, fxOf.current.shake + 8);
      sfxRef.current?.boom();
      /* جایزه */
      const roll = Math.random();
      const kind: Pickup["kind"] | null =
        roll < 0.14 ? "hp" : roll < 0.24 ? "rapid" : roll < 0.31 ? "shield" : roll < 0.38 ? "homing" : roll < 0.48 ? "mine" : roll < 0.54 ? "bomb" : null;
      if (kind && w.pk.length < 4) w.pk.push({ x: v.x, y: v.y, kind, t: 0 });
    },
    [fxBurst, fxFloat, fxOf],
  );

  const damage = useCallback(
    (w: HWorld, v: HPlayer, dmg: number, ow: string, wp: string) => {
      if (v.dead || v.hp <= 0 || v.inv > 0) return;
      if (v.shield > 0) {
        fxBurst(v.x, v.y, "#38bdf8", 6, 130, 2.6);
        return;
      }
      v.hp -= dmg;
      if (v.id === myUidRef.current) {
        sfxRef.current?.hurt();
        fxOf.current.hurt = 1;
        fxOf.current.shake = Math.min(16, fxOf.current.shake + 7);
      }
      if (v.hp <= 0) killPlayer(w, v, ow, wp);
    },
    [fxBurst, fxFloat, fxOf, killPlayer],
  );

  const explode = useCallback(
    (w: HWorld, x: number, y: number, radius: number, dmg: number, ow: string, team: Team, wp: string) => {
      fxBurst(x, y, wp === "b" ? "#ffd60a" : "#ff5c7a", 26, 300, 5);
      fxOf.current.shake = Math.min(18, fxOf.current.shake + 10);
      sfxRef.current?.boom();
      for (const e of w.ps) {
        if (e.team === team || e.dead) continue;
        const d = Math.hypot(e.x - x, e.y - y);
        if (d < radius + e.r) damage(w, e, dmg * (1 - Math.min(1, d / (radius + e.r)) * 0.4), ow, wp);
      }
    },
    [damage, fxBurst, fxOf],
  );

  const shootPlayer = useCallback((w: HWorld, p: HPlayer) => {
    const missile = p.homing > 0;
    p.fireCd = missile ? FIRE_CD : p.rapid > 0 ? RAPID_CD : FIRE_CD;
    const a = p.aim;
    w.bs.push(
      missile
        ? {
            x: p.x + Math.cos(a) * (PLAYER_R + 7),
            y: p.y + Math.sin(a) * (PLAYER_R + 7),
            vx: Math.cos(a) * MISSILE_SPEED,
            vy: Math.sin(a) * MISSILE_SPEED,
            r: MISSILE_R,
            dmg: MISSILE_DMG,
            life: MISSILE_LIFE,
            ow: p.id,
            team: p.team,
            kind: "missile",
          }
        : {
            x: p.x + Math.cos(a) * (PLAYER_R + 7),
            y: p.y + Math.sin(a) * (PLAYER_R + 7),
            vx: Math.cos(a) * BULLET_SPEED,
            vy: Math.sin(a) * BULLET_SPEED,
            r: BULLET_R,
            dmg: BULLET_DMG,
            life: BULLET_LIFE,
            ow: p.id,
            team: p.team,
            kind: "normal",
          },
    );
    if (p.id === myUidRef.current) sfxRef.current?.shoot();
  }, []);

  const respawnPlayer = useCallback((w: HWorld, p: HPlayer) => {
    const list = TEAM_SPAWNS[p.team];
    let best: readonly [number, number] = list[0];
    let bd = -1;
    for (const s of list) {
      let dm = 1e9;
      for (const e of w.ps) {
        if (e.team === p.team || e.dead) continue;
        dm = Math.min(dm, Math.hypot(e.x - s[0], e.y - s[1]));
      }
      if (dm > bd) {
        bd = dm;
        best = s;
      }
    }
    p.x = best[0];
    p.y = best[1];
    p.hp = PLAYER_HP;
    p.dead = false;
    p.respT = 0;
    p.inv = 1.5;
    p.shield = 0;
    p.homing = 0;
    p.rapid = 0;
  }, []);

  const botThink = useCallback(
    (w: HWorld, b: HPlayer, dt: number) => {
      let tgt: HPlayer | null = null;
      let td = 1e9;
      for (const e of w.ps) {
        if (e.team === b.team || e.dead || e.hp <= 0) continue;
        const d = Math.hypot(e.x - b.x, e.y - b.y);
        if (d < td) {
          td = d;
          tgt = e;
        }
      }
      if (!tgt) return;
      const dx = tgt.x - b.x;
      const dy = tgt.y - b.y;
      const d = td || 1;
      const ux = dx / d;
      const uy = dy / d;
      let mx = 0;
      let my = 0;
      if (b.kind === "chaser") {
        const wig = Math.sin(w.t * 3 + b.phase) * 0.3;
        mx = ux - uy * wig;
        my = uy + ux * wig;
      } else if (b.kind === "shooter") {
        const push = d > 360 ? 1 : d < 240 ? -1 : 0;
        const strafe = Math.sin(w.t * 1.7 + b.phase) * 0.85;
        mx = ux * push - uy * strafe;
        my = uy * push + ux * strafe;
      } else {
        const push = d > 330 ? 1 : -0.35;
        mx = ux * push;
        my = uy * push;
      }
      for (const o of w.ps) {
        if (o === b || o.dead) continue;
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
      b.aim = Math.atan2(dy, dx);
      if (b.kind === "chaser") {
        if (d < b.r + PLAYER_R + 5 && b.atkCd <= 0) {
          damage(w, tgt, 14, b.id, "c");
          b.atkCd = 0.7;
          slideMove(tgt, ux * 26, uy * 26, PLAYER_R);
        }
      } else {
        const range = b.kind === "shooter" ? 540 : 640;
        if (b.fireCd <= 0 && d < range && hasLOS(b.x, b.y, tgt.x, tgt.y)) {
          b.fireCd = b.kind === "shooter" ? 1.25 + Math.random() * 0.3 : 1.9 + Math.random() * 0.4;
          const spread = b.kind === "shooter" ? 0.09 : 0.05;
          const a = b.aim + (Math.random() - 0.5) * 2 * spread;
          const sp = b.kind === "shooter" ? 380 : 300;
          w.bs.push({
            x: b.x + Math.cos(a) * (b.r + 6),
            y: b.y + Math.sin(a) * (b.r + 6),
            vx: Math.cos(a) * sp,
            vy: Math.sin(a) * sp,
            r: b.kind === "shooter" ? 5 : 8,
            dmg: b.kind === "shooter" ? 12 : 24,
            life: BULLET_LIFE + 0.5,
            ow: b.id,
            team: b.team,
            kind: "normal",
          });
          if (d < 720) sfxRef.current?.eshoot();
        }
      }
    },
    [damage],
  );

  const simBullets = useCallback(
    (w: HWorld, dt: number) => {
      for (const bl of w.bs) {
        if (bl.kind === "missile") {
          let tb: HPlayer | null = null;
          let td = 720;
          for (const e of w.ps) {
            if (e.team === bl.team || e.dead) continue;
            const d = Math.hypot(e.x - bl.x, e.y - bl.y);
            if (d < td) {
              td = d;
              tb = e;
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
        }
        bl.x += bl.vx * dt;
        bl.y += bl.vy * dt;
        bl.life -= dt;
        if (bl.life <= 0) continue;
        if (bl.x < 0 || bl.x > MAP_W || bl.y < 0 || bl.y > MAP_H) {
          bl.life = 0;
          continue;
        }
        let dead = false;
        for (const [ox, oy, ow2, oh] of OBSTACLES) {
          if (bl.x > ox - bl.r && bl.x < ox + ow2 + bl.r && bl.y > oy - bl.r && bl.y < oy + oh + bl.r) {
            bl.life = 0;
            dead = true;
            break;
          }
        }
        if (dead) continue;
        for (const tg of w.ps) {
          if (tg.team === bl.team || tg.dead || tg.hp <= 0) continue;
          if (Math.hypot(bl.x - tg.x, bl.y - tg.y) < bl.r + tg.r) {
            damage(w, tg, bl.dmg, bl.ow, bl.kind === "missile" ? "m" : "g");
            bl.life = 0;
            break;
          }
        }
      }
      if (w.bs.length > 120) w.bs.splice(0, w.bs.length - 120);
      w.bs = w.bs.filter((b) => b.life > 0);
    },
    [damage],
  );

  const simMines = useCallback(
    (w: HWorld, dt: number) => {
      for (const mn of w.mn) {
        mn.arm -= dt;
        mn.blink += dt;
        if (mn.arm <= 0) {
          for (const e of w.ps) {
            if (e.team === mn.tm || e.dead) continue;
            if (Math.hypot(e.x - mn.x, e.y - mn.y) < MINE_TRIGGER + e.r) {
              explode(w, mn.x, mn.y, MINE_RADIUS, MINE_DMG, mn.ow, mn.tm, "mine");
              mn.arm = -1;
              break;
            }
          }
        }
      }
      w.mn = w.mn.filter((mn) => mn.arm >= 0);
    },
    [explode],
  );

  const simPickups = useCallback(
    (w: HWorld, dt: number) => {
      for (const pk of w.pk) {
        pk.t += dt;
        for (const p of w.ps) {
          if (p.dead) continue;
          if (Math.hypot(pk.x - p.x, pk.y - p.y) < PLAYER_R + 17) {
            pk.t = -1;
            const mine = p.id === myUidRef.current;
            if (mine) sfxRef.current?.pickup();
            if (pk.kind === "hp") {
              p.hp = Math.min(PLAYER_HP, p.hp + 30);
              if (mine) fxFloat(p.x, p.y - 26, "+30", "#3df07c");
            } else if (pk.kind === "rapid") {
              p.rapid = RAPID_TIME;
              if (mine) fxFloat(p.x, p.y - 26, "★", "#ffd60a");
            } else if (pk.kind === "shield") {
              p.shield = SHIELD_TIME;
              if (mine) fxFloat(p.x, p.y - 26, "⛨", "#38bdf8");
            } else if (pk.kind === "homing") {
              p.homing = HOMING_TIME;
              if (mine) fxFloat(p.x, p.y - 26, "🚀", "#ff8a3d");
            } else if (pk.kind === "mine") {
              if (w.mn.length >= 10) w.mn.shift();
              w.mn.push({ x: p.x, y: p.y, arm: 0.9, blink: 0, ow: p.id, tm: p.team });
              if (mine) fxFloat(p.x, p.y - 26, "+💣", "#ff3b5c");
            } else {
              explode(w, p.x, p.y, BOMB_RADIUS, BOMB_DMG, p.id, p.team, "b");
              if (mine) fxFloat(p.x, p.y - 26, "💥", "#ffd60a");
            }
            break;
          }
        }
      }
      w.pk = w.pk.filter((pk) => pk.t >= 0);
    },
    [explode, fxFloat],
  );

  /* ---------- میزبان: پایان مسابقه ---------- */
  const finishMatch = useCallback(() => {
    const w = worldRef.current;
    const ch = chanRef.current;
    if (!w || !isHostRef.current) return;
    const winner: Team | "d" = w.sr > w.sb ? "r" : w.sb > w.sr ? "b" : "d";
    const msg: EndMsg = { t: "end", w: winner, sr: w.sr, sb: w.sb };
    if (ch) void ch.publish("end", msg);
    setFinalNet({ w: winner, sr: w.sr, sb: w.sb });
    startedRef.current = false;
    publishRoster();
    setStep("over");
    sfxRef.current?.over();
  }, [publishRoster, setStep]);

  const hostSim = useCallback(
    (w: HWorld, dt: number) => {
      w.t += dt;
      w.timeLeft = Math.max(0, w.timeLeft - dt);
      const selfId = myUidRef.current;
      const li = localInputRef.current;
      for (const p of w.ps) {
        p.inv = Math.max(0, p.inv - dt);
        p.shield = Math.max(0, p.shield - dt);
        p.homing = Math.max(0, p.homing - dt);
        p.rapid = Math.max(0, p.rapid - dt);
        p.fireCd -= dt;
        p.atkCd -= dt;
        if (p.dead) {
          p.respT -= dt;
          if (p.respT <= 0) respawnPlayer(w, p);
          continue;
        }
        if (p.bot) {
          botThink(w, p, dt);
          continue;
        }
        let mvx = 0;
        let mvy = 0;
        let fire = false;
        if (p.id === selfId) {
          mvx = li.mv[0];
          mvy = li.mv[1];
          p.aim = li.aim;
          fire = li.fire;
        } else {
          const rec = inputsRef.current.get(p.id);
          /* ورودی کهنه (مثلاً تب مخفی) بعد از یک ثانیه نادیده گرفته می‌شود —
             مکث‌های کوتاه شبکه باعث فریز شدن بازیکن مهمان نمی‌شوند */
          if (rec && w.t - rec.at <= 1.0) {
            mvx = clamp(rec.im.mv[0], -1, 1);
            mvy = clamp(rec.im.mv[1], -1, 1);
            p.aim = rec.im.a;
            fire = rec.im.f === 1;
            p.sq = rec.im.seq; /* مهمان با این seq ورودی‌های تأییدنشده را بازپخش می‌کند */
          }
        }
        slideMove(p, mvx * PLAYER_SPEED * dt, mvy * PLAYER_SPEED * dt, PLAYER_R);
        if (fire && p.fireCd <= 0) shootPlayer(w, p);
      }
      /* برخورد دایره‌ای بازیکن‌ها — هیچ‌کس از بازیکن دیگر عبور نمی‌کند و
         حداقل فاصله بین دو بازیکن به‌اندازه یک دایره حفظ می‌شود
         (دو دور تکرار برای جدایی کامل کنار دیوارها و گوشه‌ها) */
      const aliveP = w.ps.filter((p) => !p.dead);
      for (let it = 0; it < 2; it++) {
        for (let i = 0; i < aliveP.length; i++) {
          for (let j = i + 1; j < aliveP.length; j++) {
            const a = aliveP[i];
            const b = aliveP[j];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const dd = Math.hypot(dx, dy);
            const min = a.r + b.r + 2;
            if (dd >= min) continue;
            if (dd < 0.01) {
              slideMove(a, -(min / 2), -(min / 2), a.r);
              slideMove(b, min / 2, min / 2, b.r);
              continue;
            }
            const ux = dx / dd;
            const uy = dy / dd;
            const push = (min - dd) / 2;
            slideMove(a, -ux * push, -uy * push, a.r);
            slideMove(b, ux * push, uy * push, b.r);
          }
        }
      }
      simBullets(w, dt);
      simMines(w, dt);
      simPickups(w, dt);
      if (w.timeLeft <= 0 || w.sr >= KILL_TARGET || w.sb >= KILL_TARGET) finishMatch();
    },
    [botThink, finishMatch, respawnPlayer, shootPlayer, simBullets, simMines, simPickups],
  );

  /* ---------- میزبان: اسنپ‌شات ---------- */
  const publishSnap = useCallback(() => {
    const w = worldRef.current;
    const ch = chanRef.current;
    if (!w || !ch) return;
    /* خوراک حذف‌ها برای خود میزبان هم پردازش شود */
    for (const [ow, vid] of w.ev) {
      setKillFeed((prev) => [...prev.slice(-3), `${nameOf(ow)} ✖ ${nameOf(vid)}`]);
      const v = w.ps.find((p) => p.id === vid);
      if (v && vid !== myUidRef.current) fxBurst(v.x, v.y, TEAM_COLORS[v.team], 14, 220, 4);
      if (vid === myUidRef.current) fxOf.current.hurt = 1;
    }
    const s: Snap = {
      t: "s",
      tm: Math.ceil(w.timeLeft),
      wt: Math.round(w.t * 1000),
      sr: w.sr,
      sb: w.sb,
      ps: w.ps.map((p) => ({
        id: p.id,
        x: Math.round(p.x),
        y: Math.round(p.y),
        r: Math.round(p.r),
        hp: Math.max(0, Math.ceil(p.hp)),
        aim: round2(p.aim),
        team: p.team,
        dead: p.dead ? 1 : 0,
        respT: Math.max(0, Math.ceil(p.respT)),
        sh: Math.ceil(p.shield),
        hm: Math.ceil(p.homing),
        rp: Math.ceil(p.rapid),
        inv: p.inv > 0 ? 1 : 0,
        sq: p.sq,
      })),
      bs: w.bs.slice(0, 60).map((b): BSnap => [Math.round(b.x), Math.round(b.y), Math.round(b.vx), Math.round(b.vy), b.team === "r" ? 0 : 1, b.kind === "missile" ? 1 : 0]),
      pk: w.pk.map((pk) => ({ x: Math.round(pk.x), y: Math.round(pk.y), k: pk.kind })),
      mn: w.mn.map((mn) => ({ x: Math.round(mn.x), y: Math.round(mn.y), ow: mn.ow })),
      ev: w.ev.splice(0, w.ev.length),
    };
    /* انتشار اسنپ‌شات — اولویت با DataChannel مستقیم هر مهمان؛ فقط وقتی برای
       حتی یک مهمان مسیر مستقیم باز نیست، نسخهٔ رله هم روی کانال اتاق می‌رود */
    const snapStr = JSON.stringify(s);
    const guests = rosterRef.current.filter((e) => !e.bot && e.id !== myUidRef.current);
    let viaRtc = 0;
    for (const g of guests) {
      const lk = rtcPeersRef.current.get(g.id);
      if (lk && lk.send(snapStr)) viaRtc += 1;
    }
    if (viaRtc < guests.length) {
      void ch.publish("s", s).catch(() => {
        /* در سقف نرخ، پیام بعدی ارسال می‌شود */
      });
    }
    const me = w.ps.find((p) => p.id === myUidRef.current);
    const mnOwn = w.mn.filter((mn) => mn.ow === myUidRef.current).length;
    setHud((prev) => {
      const nh: HudNet = {
        hp: me ? Math.max(0, Math.ceil(me.hp)) : 0,
        sr: w.sr,
        sb: w.sb,
        tm: Math.ceil(w.timeLeft),
        dead: me ? me.dead : false,
        respT: me ? Math.max(0, Math.ceil(me.respT)) : 0,
        sh: me ? Math.ceil(me.shield) : 0,
        hm: me ? Math.ceil(me.homing) : 0,
        mn: mnOwn,
      };
      const same =
        prev.hp === nh.hp && prev.sr === nh.sr && prev.sb === nh.sb && prev.tm === nh.tm && prev.dead === nh.dead && prev.respT === nh.respT && prev.sh === nh.sh && prev.hm === nh.hm && prev.mn === nh.mn;
      return same ? prev : nh;
    });
  }, [fxBurst, fxOf, nameOf]);

  /* ---------- کلاینت: پردازش اسنپ‌شات ---------- */
  const onSnap = useCallback(
    (s: Snap) => {
      /* روی کانال نامطمئن ممکن است بسته‌ای دیر برسد — wt بالاتر برنده است */
      if (typeof s.wt === "number") {
        if (s.wt <= snapWtRef.current) return;
        snapWtRef.current = s.wt;
      }
      const snaps = snapsRef.current;
      snaps.push({ rt: performance.now(), s });
      if (snaps.length > 10) snaps.shift();
      /* سنجش فاصله و لرزش رسیدن اسنپ‌شات — تاخیر میان‌یابی انطباقی از همین‌جا
         تنظیم می‌شود: با شبکه پرلرزش بافر عمیق‌تر می‌شود تا پرش نبینیم و با
         شبکه آرام کوتاه می‌شود تا تاخیر کم بماند */
      if (snaps.length >= 2) {
        const iv = snaps[snaps.length - 1].rt - snaps[snaps.length - 2].rt;
        const n = netRef.current;
        n.arr = n.arr * 0.85 + Math.min(400, Math.max(1, iv)) * 0.15;
        n.jit = n.jit * 0.85 + Math.abs(iv - n.arr) * 0.15;
        renderDelayRef.current = clamp(n.arr * 2 + n.jit * 3 + 15, 70, 240);
      }
      for (const [ow, vid] of s.ev) {
        setKillFeed((prev) => [...prev.slice(-3), `${nameOf(ow)} ✖ ${nameOf(vid)}`]);
        const v = s.ps.find((p) => p.id === vid);
        if (v) fxBurst(v.x, v.y, TEAM_COLORS[v.team], 14, 220, 4);
        if (vid === myUidRef.current) {
          fxOf.current.hurt = 1;
          sfxRef.current?.hurt();
        } else {
          sfxRef.current?.boom();
        }
      }
      if (stepRef.current === "lobby" || stepRef.current === "connecting") setStep("playing");
      const me = s.ps.find((p) => p.id === myUidRef.current);
      const mnOwn = s.mn.filter((mn) => mn.ow === myUidRef.current).length;
      setHud((prev) => {
        const nh: HudNet = {
          hp: me ? me.hp : 0,
          sr: s.sr,
          sb: s.sb,
          tm: s.tm,
          dead: me ? me.dead === 1 : false,
          respT: me ? me.respT : 0,
          sh: me ? me.sh : 0,
          hm: me ? me.hm : 0,
          mn: mnOwn,
        };
        const same =
          prev.hp === nh.hp && prev.sr === nh.sr && prev.sb === nh.sb && prev.tm === nh.tm && prev.dead === nh.dead && prev.respT === nh.respT && prev.sh === nh.sh && prev.hm === nh.hm && prev.mn === nh.mn;
        return same ? prev : nh;
      });
      if (me) {
        /* صدای برداشتن جایزه با تغییر وضعیت */
        if (prevFlagsRef.current.sh === 0 && me.sh > 0) sfxRef.current?.pickup();
        if (prevFlagsRef.current.hm === 0 && me.hm > 0) sfxRef.current?.pickup();
        if (prevFlagsRef.current.rp === 0 && me.rp > 0) sfxRef.current?.pickup();
        prevFlagsRef.current = { sh: me.sh, hm: me.hm, rp: me.rp };
      }
    },
    [fxBurst, fxOf, nameOf, setStep],
  );

  const prevFlagsRef = useRef({ sh: 0, hm: 0, rp: 0 });

  /* ---------- پیوند مستقیم WebRTC ---------- */
  const rtcSignalSend = useCallback((to: string, sig: { k: "offer"; sdp: string } | { k: "answer"; sdp: string } | { k: "ice"; cs: RTCIceCandidateInit[] }) => {
    const ch = chanRef.current;
    if (!ch) return;
    const wire: RtcWire = { t: "rtc", k: sig.k, from: myUidRef.current, to };
    if (sig.k === "ice") wire.cs = sig.cs;
    else wire.sdp = sig.sdp;
    void ch.publish("rtc", wire).catch(() => {
      /* ignore */
    });
  }, []);

  const handleRtcData = useCallback(
    (uid: string, str: string, reply: (out: string) => void) => {
      let d: Record<string, unknown>;
      try {
        d = JSON.parse(str) as Record<string, unknown>;
      } catch {
        return;
      }
      if (isHostRef.current) {
        if (d.t === "p") {
          /* پینگ روی مسیر مستقیم — پاسخ روی همان مسیر تا RTT واقعی P2P سنجیده شود */
          if (typeof d.ts === "number") reply(JSON.stringify({ t: "q", ts: d.ts }));
          return;
        }
        if (d.t !== "i" || d.u !== uid || !Array.isArray(d.mv) || typeof d.a !== "number" || typeof d.f !== "number" || typeof d.seq !== "number") return;
        if (!rosterRef.current.some((e) => e.id === uid)) return;
        const prev = inputsRef.current.get(uid);
        if (prev && prev.im.seq >= (d.seq as number)) return; /* کانال بدون‌ترتیب: بالاترین seq برنده است */
        inputsRef.current.set(uid, { im: d as unknown as InMsg, at: worldRef.current?.t ?? 0 });
        return;
      }
      if (uid !== hostUidRef.current) return;
      if (d.t === "q") {
        const rtt = Math.max(0, performance.now() - (d.ts as number));
        const n = netRef.current;
        n.rtt = n.rtt > 0 ? n.rtt * 0.7 + rtt * 0.3 : rtt;
        if (performance.now() - n.lastQ > 2100) {
          n.lastQ = performance.now();
          setNetHud({ rtt: Math.round(n.rtt), jit: Math.round(n.jit), mode: "p2p" });
        }
        return;
      }
      if (d.t === "s") onSnap(d as unknown as Snap);
    },
    [onSnap],
  );

  const startRtc = useCallback((initiator: boolean, peerUid: string): void => {
    if (!peerUid || typeof RTCPeerConnection === "undefined") return;
    const old = rtcPeersRef.current.get(peerUid);
    if (old) old.close();
    const retryHost = (): void => {
      if (rtcTryRef.current.n >= 4) return;
      const n = rtcTryRef.current.n + 1;
      rtcTryRef.current.n = n;
      if (rtcTryRef.current.timer) window.clearTimeout(rtcTryRef.current.timer);
      rtcTryRef.current.timer = window.setTimeout(
        () => {
          rtcTryRef.current.timer = null;
          if (!hostUidRef.current || rtcOpenRef.current) return;
          if (stepRef.current !== "playing" && stepRef.current !== "lobby") return;
          rtcDialRef.current(hostUidRef.current);
        },
        5000 + n * 2000,
      );
    };
    const link = new RtcLink({
      initiator,
      onSignal: (s) => rtcSignalSend(peerUid, s),
      onMessage: (str) => handleRtcData(peerUid, str, (out) => link.send(out)),
      onOpen: () => {
        if (initiator && peerUid === hostUidRef.current) {
          rtcOpenRef.current = true;
          rtcTryRef.current.n = 0;
          if (rtcTryRef.current.timer) {
            window.clearTimeout(rtcTryRef.current.timer);
            rtcTryRef.current.timer = null;
          }
          setNetHud((prev2) => prev2 ?? { rtt: 0, jit: 0, mode: "p2p" });
        }
      },
      onDown: () => {
        if (rtcPeersRef.current.get(peerUid) !== link) return;
        if (initiator && peerUid === hostUidRef.current) {
          rtcOpenRef.current = false;
          setNetHud((prev2) => (prev2 ? { ...prev2, mode: "relay" } : prev2));
          retryHost(); /* تلاش دوباره با فاصلهٔ فزاینده — تا ۴ بار */
        } else {
          /* میزبان: پیوند مرده حذف می‌شود؛ انتشار رله خودکار از سر گرفته می‌شود */
          rtcPeersRef.current.delete(peerUid);
          link.close();
        }
      },
    });
    rtcPeersRef.current.set(peerUid, link);
    if (initiator) {
      void link.offer().catch(() => {
        /* ignore */
      });
      /* نگهبان: اگر ۱۲ ثانیه باز نشد، همین پیوند را رها کن و دوباره تلاش کن */
      window.setTimeout(() => {
        if (rtcPeersRef.current.get(peerUid) !== link || link.open || link.closedByUs) return;
        link.close();
        rtcPeersRef.current.delete(peerUid);
        if (peerUid === hostUidRef.current) retryHost();
      }, 12000);
    }
  }, [handleRtcData, rtcSignalSend]);

  /* اتصال شماره‌گیر دوباره به startRtc پس از تعریف — در effect تا قاعدهٔ refs/renders رعایت شود */
  useEffect(() => {
    rtcDialRef.current = (peer: string) => startRtc(true, peer);
  }, [startRtc]);

  const onRtcSignal = useCallback(
    (m: RtcWire) => {
      const from = m.from ?? "";
      if (!from || from === myUidRef.current) return;
      try {
        if (m.k === "offer" && typeof m.sdp === "string") {
          startRtc(false, from);
          const lk = rtcPeersRef.current.get(from);
          void lk
            ?.acceptOffer(m.sdp)
            .catch(() => {
              /* ignore */
            });
        } else if (m.k === "answer" && typeof m.sdp === "string") {
          void rtcPeersRef.current
            .get(from)
            ?.acceptAnswer(m.sdp)
            .catch(() => {
              /* ignore */
            });
        } else if (m.k === "ice" && Array.isArray(m.cs)) {
          rtcPeersRef.current.get(from)?.addIce(m.cs);
        }
      } catch {
        /* ignore */
      }
    },
    [startRtc],
  );

  /* ---------- میزبان: شروع مسابقه ---------- */
  const startMatch = useCallback(() => {
    const ch = chanRef.current;
    if (!isHostRef.current || !ch) return;
    const o2 = tRef.current.fireOnline;
    const f2 = tRef.current.fireOffline;
    const humans = rosterRef.current.filter((e) => !e.bot);
    const bots: REntry[] = [];
    for (const tm of ["r", "b"] as Team[]) {
      for (let i = 0; i < botsPerRef.current; i++) {
        bots.push({ id: `bot-${tm}-${i}`, name: `${o2.botTag} ${i + 1}`, team: tm, bot: true });
      }
    }
    rosterRef.current = [...humans, ...bots];
    const mapIdx = matchCountRef.current % MAPS.length;
    matchCountRef.current += 1;
    setMap(mapIdx);
    const ps: HPlayer[] = rosterRef.current.map((e, idx) => {
      const kind: BotKind = e.bot ? BOT_KINDS[idx % BOT_KINDS.length] : "chaser";
      const base = e.bot ? BOT_BASE[kind] : { r: PLAYER_R, hp: PLAYER_HP, speed: PLAYER_SPEED };
      const list = TEAM_SPAWNS[e.team];
      const [sx, sy] = list[idx % list.length];
      return {
        id: e.id,
        name: e.name,
        team: e.team,
        bot: e.bot,
        kind,
        x: sx,
        y: sy,
        r: base.r,
        hp: base.hp,
        speed: base.speed,
        aim: e.team === "r" ? 0 : Math.PI,
        dead: false,
        respT: 0,
        inv: 1.5,
        shield: 0,
        homing: 0,
        rapid: 0,
        fireCd: 0,
        atkCd: 0.5,
        phase: Math.random() * Math.PI * 2,
        sq: 0,
      };
    });
    worldRef.current = { t: 0, timeLeft: MATCH_TIME, sr: 0, sb: 0, ps, bs: [], pk: [], mn: [], ev: [] };
    snapsRef.current = [];
    inputsRef.current.clear();
    setKillFeed([]);
    startedRef.current = true;
    publishRoster();
    const go: GoMsg = { t: "go", m: mapIdx };
    void ch.publish("go", go);
    setStep("playing");
    showBanner(f2.getReady);
    sfxRef.current?.wave();
  }, [publishRoster, setStep, showBanner]);

  /* ---------- ورود به اتاق ---------- */
  const connect = useCallback(
    async (asHost: boolean, name: string, code: string) => {
      const o2 = tRef.current.fireOnline;
      setMenuErr("");
      setErrMsg("");
      setStep("connecting");
      closeNet();
      resetMatchLocal();
      rosterRef.current = [];
      setRoster([]);
      try {
        sfxRef.current?.ensure();
        const probe = await fetch("/api/fire/token", { cache: "no-store" });
        if (!probe.ok) {
          const j = (await probe.json().catch(() => null)) as { setup?: boolean } | null;
          if (j?.setup) setStep("setup");
          else {
            setErrMsg(o2.connErr);
            setStep("error");
          }
          return;
        }
        const uid = "u" + Math.random().toString(36).slice(2, 10);
        myUidRef.current = uid;
        setMyUidUi(uid);
        roomCodeRef.current = code;
        setRoomCode(code);
        const client = createClient({ authUrl: "/api/fire/token", clientId: uid, echoMessages: false });
        clientRef.current = client;
        await new Promise<void>((resolve, reject) => {
          const timer = window.setTimeout(() => reject(new Error("timeout")), 15000);
          client.connection.once("connected", () => {
            window.clearTimeout(timer);
            resolve();
          });
          client.connection.once("failed", () => {
            window.clearTimeout(timer);
            reject(new Error("connection-failed"));
          });
        });
        const ch = client.channels.get(`fire:room:${code}`);
        chanRef.current = ch;
        await ch.presence.enter({ n: name, h: asHost ? 1 : 0, u: uid });
        const members = await ch.presence.get();
        const otherHost = members.find((m) => m.clientId !== uid && (m.data as { h?: number } | null)?.h === 1);
        if (asHost && otherHost) asHost = false;
        if (!asHost) {
          let hasHost = !!otherHost;
          if (!hasHost) {
            await sleep(2500);
            const m2 = await ch.presence.get();
            hasHost = m2.some((m) => m.clientId !== uid && (m.data as { h?: number } | null)?.h === 1);
          }
          if (!hasHost) {
            closeNet();
            setErrMsg(o2.roomNotFound);
            setStep("error");
            return;
          }
          hostUidRef.current = (otherHost?.clientId as string) ?? "";
          isHostRef.current = false;
          setHostUidUi(hostUidRef.current);
          setAmHostUi(false);
          /* پیوند مستقیم P2P با میزبان — از لابی شروع می‌شود تا هنگام مسابقه آماده باشد */
          rtcTryRef.current = { n: 0, timer: null };
          startRtc(true, hostUidRef.current);
        } else {
          isHostRef.current = true;
          hostUidRef.current = uid;
          setHostUidUi(uid);
          setAmHostUi(true);
          rosterRef.current = [{ id: uid, name, team: "r", bot: false }];
          try {
            const lb = client.channels.get("fire:lobby");
            lobbyChanRef.current = lb;
            await lb.attach();
            await lb.presence.enter({ c: code, n: name, p: 1, m: MAX_HUMANS, s: 0 });
          } catch {
            lobbyChanRef.current = null;
          }
        }
        /* مهمان: کانال اختصاصی ارسال ورودی — میزبان تنها شنونده آن است */
        if (!isHostRef.current) {
          try {
            const ic = client.channels.get(inputChanName(code, uid));
            await ic.attach();
            inChanRef.current = ic;
          } catch {
            inChanRef.current = null; /* جانشین: کانال اصلی اتاق */
          }
        }
        /* پیام‌ها */
        ch.subscribe((msg: InboundMessage) => {
          const d = msg.data as { t: string; to?: string } | null;
          if (!d || typeof d.t !== "string") return;
          /* ورودی بازیکن‌های دیگر — فقط میزبان ذخیره می‌کند (رفع باگ حرکت/شلیک مهمان‌ها) */
          if (d.t === "p" && isHostRef.current) {
            /* پینگ مهمان روی کانال اصلی (جانشین) — پاسخ فوری روی کانال اتاق */
            void ch.publish("q", { t: "q", to: (d as { u?: string }).u ?? "", ts: (d as { ts?: number }).ts ?? 0 });
            return;
          }
          if (d.t === "i") {
            if (isHostRef.current) {
              const im = d as unknown as InMsg;
              if (typeof im.u === "string" && im.u && im.u !== myUidRef.current && Array.isArray(im.mv) && typeof im.a === "number" && rosterRef.current.some((e) => e.id === im.u)) {
                inputsRef.current.set(im.u, { im, at: worldRef.current?.t ?? 0 });
              }
            }
            return;
          }
          if (d.t === "r") {
            const rm = d as unknown as RMsg;
            hostUidRef.current = rm.host;
            startedRef.current = rm.started;
            botsPerRef.current = rm.bots;
            setBotsPer(rm.bots);
            rosterRef.current = rm.ps;
            setRoster(rm.ps);
            if (rm.started) setMap(rm.m);
            if (stepRef.current === "connecting") setStep("lobby");
          } else if (d.t === "go") {
            if (isHostRef.current) return;
            const gm = d as unknown as GoMsg;
            setMap(gm.m);
            snapWtRef.current = 0; /* مسابقهٔ تازه — ساعت اسنپ‌شات از صفر */
            snapsRef.current = [];
            localBulletsRef.current = [];
            sendLogRef.current = [];
            setKillFeed([]);
            setStep("playing");
            showBanner(tRef.current.fireOffline.getReady);
            sfxRef.current?.wave();
          } else if (d.t === "s") {
            if (isHostRef.current) return;
            if (rtcOpenRef.current) return; /* مسیر مستقیم فعال است — نسخهٔ رله نادیده گرفته می‌شود */
            onSnap(d as unknown as Snap);
          } else if (d.t === "rtc" && d.to === myUidRef.current) {
            /* سیگنالینگ WebRTC — offer/answer/ICE */
            onRtcSignal(d as unknown as RtcWire);
          } else if (d.t === "end") {
            const em = d as unknown as EndMsg;
            setFinalNet({ w: em.w, sr: em.sr, sb: em.sb });
            startedRef.current = false;
            setStep("over");
            sfxRef.current?.over();
          } else if (d.t === "q" && d.to === myUidRef.current) {
            /* پاسخ پینگ — RTT واقعی مسیر مهمان↔میزبان، با EMA نرم */
            const q = d as unknown as { ts: number };
            const rtt = Math.max(0, performance.now() - q.ts);
            const n = netRef.current;
            n.rtt = n.rtt > 0 ? n.rtt * 0.7 + rtt * 0.3 : rtt;
            if (performance.now() - n.lastQ > 2100) {
              n.lastQ = performance.now();
              setNetHud({ rtt: Math.round(n.rtt), jit: Math.round(n.jit), mode: rtcOpenRef.current ? "p2p" : "relay" });
            }
          } else if (d.t === "deny" && d.to === myUidRef.current) {
            setErrMsg((d as { r?: string }).r === "started" ? o2.matchLive : o2.roomFull);
            leaveToMenu();
          }
        });
        /* حضور */
        ch.presence.subscribe("enter", async (m: PresenceMessage) => {
          if (!isHostRef.current) return;
          if (m.clientId === myUidRef.current) return;
          if (startedRef.current) {
            void ch.publish("deny", { t: "deny", to: m.clientId, r: "started" });
            return;
          }
          if (humansCount() >= MAX_HUMANS) {
            void ch.publish("deny", { t: "deny", to: m.clientId });
            return;
          }
          const pd = (m.data ?? {}) as { n?: string; h?: number };
          const nm = (pd.n ?? "بازیکن").slice(0, 16);
          const cr = rosterRef.current.filter((e) => !e.bot);
          const rc = cr.filter((e) => e.team === "r").length;
          const bc = cr.filter((e) => e.team === "b").length;
          const team: Team = rc <= bc ? "r" : "b";
          rosterRef.current = [...rosterRef.current.filter((e) => e.id !== m.clientId), { id: m.clientId, name: nm, team, bot: false }];
          scheduleRoster();
          /* گوش‌دادن میزبان به کانال ورودی اختصاصی این مهمان */
          try {
            const ic = client.channels.get(inputChanName(code, m.clientId));
            await ic.attach();
            ic.subscribe((im: InboundMessage) => {
              const d = im.data as (Omit<Partial<InMsg>, "t"> & { t?: string; ts?: number }) | null;
              if (!d) return;
              if (d.t === "p") {
                /* پینگ مهمان — پاسخ فوری تا RTT اندازه‌گیری شود */
                void ch.publish("q", { t: "q", to: m.clientId, ts: (d as { ts?: number }).ts ?? 0 });
                return;
              }
              if (d.t !== "i" || d.u !== m.clientId || !Array.isArray(d.mv) || typeof d.a !== "number" || typeof d.f !== "number") return;
              if (!rosterRef.current.some((e) => e.id === m.clientId)) return;
              inputsRef.current.set(m.clientId, { im: d as InMsg, at: worldRef.current?.t ?? 0 });
            });
            inChansRef.current.set(m.clientId, ic);
          } catch {
            /* اگر کانال ورودی در دسترس نبود، مهمان از کانال اصلی می‌فرستد */
          }
        });
        ch.presence.subscribe("leave", (m: PresenceMessage) => {
          const pd = (m.data ?? {}) as { u?: string };
          const uid2 = pd.u ?? m.clientId;
          if (isHostRef.current) {
            rosterRef.current = rosterRef.current.filter((e) => e.id !== uid2);
            const w = worldRef.current;
            if (w && startedRef.current) {
              w.ps = w.ps.filter((p) => p.id !== uid2);
            }
            inputsRef.current.delete(uid2);
            const lk = rtcPeersRef.current.get(uid2);
            if (lk) {
              lk.close();
              rtcPeersRef.current.delete(uid2);
            }
            const ic = inChansRef.current.get(uid2);
            if (ic) {
              try {
                ic.detach();
              } catch {
                /* ignore */
              }
              inChansRef.current.delete(uid2);
            }
            scheduleRoster();
          } else if (uid2 === hostUidRef.current) {
            setErrMsg(tRef.current.fireOnline.hostLeft);
            leaveToMenu();
          }
        });
        if (isHostRef.current) publishRoster();
        setStep("lobby");
        if (startedRef.current && !isHostRef.current) setStep("playing");
      } catch {
        setErrMsg(o2.connErr);
        setStep("error");
        closeNet();
      }
    },
    [closeNet, humansCount, leaveToMenu, onRtcSignal, onSnap, resetMatchLocal, scheduleRoster, setStep, showBanner, startRtc],
  );

  const createRoom = useCallback(() => {
    const nm = nameInput.trim().slice(0, 16);
    if (nm.length < 2) {
      setMenuErr(o.needName);
      return;
    }
    try {
      window.localStorage.setItem("fire-online-name", nm);
    } catch {
      /* ignore */
    }
    void connect(true, nm, genCode());
  }, [connect, nameInput, o.needName]);

  const joinRoom = useCallback(() => {
    const nm = nameInput.trim().slice(0, 16);
    const cd = codeInput.trim().toUpperCase();
    if (nm.length < 2) {
      setMenuErr(o.needName);
      return;
    }
    if (!/^[A-HJ-NP-Z2-9]{5}$/.test(cd)) {
      setMenuErr(o.codeShort);
      return;
    }
    try {
      window.localStorage.setItem("fire-online-name", nm);
    } catch {
      /* ignore */
    }
    void connect(false, nm, cd);
  }, [connect, codeInput, nameInput, o.codeShort, o.needName]);

  /* فهرست اتاق‌های باز از سرور */
  const loadRooms = useCallback(async () => {
    try {
      const r = await fetch("/api/fire/rooms", { cache: "no-store" });
      if (!r.ok) return;
      const j = (await r.json()) as { rooms?: OpenRoom[] };
      setOpenRooms(Array.isArray(j.rooms) ? j.rooms : []);
    } catch {
      /* ignore */
    }
  }, []);

  /* پیوستن با یک کلیک از فهرست */
  const quickJoin = useCallback(
    (rm: OpenRoom) => {
      const nm = nameInput.trim().slice(0, 16);
      if (nm.length < 2) {
        setMenuErr(o.needName);
        return;
      }
      try {
        window.localStorage.setItem("fire-online-name", nm);
      } catch {
        /* ignore */
      }
      void connect(false, nm, rm.c);
    },
    [connect, nameInput, o.needName],
  );

  const copyCode = useCallback(() => {
    try {
      void navigator.clipboard.writeText(roomCodeRef.current);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  }, []);

  const changeBots = useCallback(
    (delta: number) => {
      const next = clamp(botsPerRef.current + delta, 0, 3);
      botsPerRef.current = next;
      setBotsPer(next);
      if (!startedRef.current) publishRoster();
    },
    [publishRoster],
  );

  /* ---------- ورودی صفحه‌کلید ---------- */
  useEffect(() => {
    const PREVENT = new Set(["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);
    const editable = (el: EventTarget | null) => {
      const e2 = el as HTMLElement | null;
      return !!e2 && (e2.tagName === "INPUT" || e2.tagName === "TEXTAREA" || e2.isContentEditable);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (editable(e.target)) return;
      if (e.repeat) {
        if (PREVENT.has(e.code) && stepRef.current === "playing") e.preventDefault();
        return;
      }
      keysRef.current.add(e.code);
      if (PREVENT.has(e.code) && stepRef.current === "playing") e.preventDefault();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.code);
    };
    const onBlur = () => {
      keysRef.current.clear();
      fireMouseRef.current = false;
      moveStickRef.current = null;
      aimStickRef.current = null;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  /* ---------- تشخیص لمسی + صدا + رکورد اسم ---------- */
  useEffect(() => {
    try {
      const nm = window.localStorage.getItem("fire-online-name");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- بارگذاری یک‌باره اسم ذخیره‌شده
      if (nm) setNameInput(nm);
      const mu = window.localStorage.getItem("fire-offline-muted");
      if (mu === "1") {
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
    sfxRef.current.setMuted(window.localStorage.getItem("fire-offline-muted") === "1");
    /* قلاب اشکال‌زدایی فقط-خواندنی برای پشتیبانی از راه دور */
    (window as unknown as { __fireNet?: () => Record<string, unknown> }).__fireNet = () => {
      const w = worldRef.current;
      const me = w?.ps.find((p) => p.id === myUidRef.current);
      return {
        step: stepRef.current,
        touch: touchRef.current,
        x: Math.round(me?.x ?? localSelfRef.current.x),
        y: Math.round(me?.y ?? localSelfRef.current.y),
        mv: [Number((localInputRef.current.mv[0] ?? 0).toFixed(2)), Number((localInputRef.current.mv[1] ?? 0).toFixed(2))],
        fire: localInputRef.current.fire ? 1 : 0,
        aim: Math.round((localInputRef.current.aim * 180) / Math.PI),
        players: rosterRef.current.length,
        started: startedRef.current ? 1 : 0,
        bullets: w?.bs.length ?? 0,
        inN: isHostRef.current ? inputsRef.current.size : 0,
        others: w
          ? w.ps
              .filter((p) => p.id !== myUidRef.current && !p.dead)
              .map((p) => ({ id: p.id.slice(0, 8), x: Math.round(p.x), y: Math.round(p.y), hp: Math.round(p.hp) }))
              .slice(0, 12)
          : [],
        uid: myUidRef.current,
        host: isHostRef.current ? 1 : 0,
        room: roomCodeRef.current,
        logN: sendLogRef.current.length,
        localB: localBulletsRef.current.length,
        rtt: Math.round(netRef.current.rtt),
        jit: Math.round(netRef.current.jit),
        arr: Math.round(netRef.current.arr),
        rDelay: Math.round(renderDelayRef.current),
        rtc: rtcOpenRef.current ? 1 : 0,
        rtcN: rtcPeersRef.current.size,
        rtcS: Array.from(rtcPeersRef.current.values(), (l) => l.pc.connectionState.slice(0, 4)).join(","),
        ack: snapsRef.current.length ? (snapsRef.current[snapsRef.current.length - 1].s.ps.find((p) => p.id === myUidRef.current)?.sq ?? -1) : -1,
      };
    };
  }, []);

  /* فهرست اتاق‌های باز — فقط در منو */
  useEffect(() => {
    if (step !== "menu") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- بارگیری ناهمگام پس از پاسخ سرور
    void loadRooms();
    const iv = window.setInterval(() => void loadRooms(), 8000);
    return () => window.clearInterval(iv);
  }, [step, loadRooms]);

  /* پیوستن خودکار از لینک دعوت ?code= اگر اسم ذخیره‌شده باشد */
  useEffect(() => {
    if (autoJoinRef.current) return;
    try {
      const cp = new URLSearchParams(window.location.search).get("code");
      if (!cp) return;
      const cd = cp.toUpperCase();
      if (!/^[A-HJ-NP-Z2-9]{5}$/.test(cd)) return;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- پیش‌پر کردن کد از لینک دعوت، یک‌بار در شروع
      setCodeInput(cd);
      const saved = window.localStorage.getItem("fire-online-name");
      if (saved && saved.trim().length >= 2) {
        autoJoinRef.current = true;
        void connect(false, saved.trim().slice(0, 16), cd);
      }
    } catch {
      /* ignore */
    }
  }, [connect]);

  const toggleMute = useCallback(() => {
    const next = !mutedStateRef.current;
    mutedStateRef.current = next;
    setMuted(next);
    sfxRef.current?.setMuted(next);
    try {
      window.localStorage.setItem("fire-offline-muted", next ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);

  /* ---------- ورود اشاره‌گر ---------- */
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

  /* ---------- حلقه اصلی ---------- */
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let last = performance.now();

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

    /* ورودی محلی — موس/لمس/کیبورد */
    const computeLocalInput = (): LocalInput => {
      let mvx = 0;
      let mvy = 0;
      const ms = moveStickRef.current;
      if (ms) {
        const dx = ms.x - ms.ox;
        const dy = ms.y - ms.oy;
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
      /* نشانه‌گیری */
      let aim = lastAimRef.current;
      let touchFire = false;
      const as = aimStickRef.current;
      const selfPt = selfPoint();
      const enemies = enemyPoints();
      if (as) {
        const dx = as.x - as.ox;
        const dy = as.y - as.oy;
        const d = Math.hypot(dx, dy);
        if (d > STICK_DEAD * STICK_R) {
          aim = Math.atan2(dy, dx);
          /* کمک-نشانه‌گیری روی دشمن‌ها */
          let bestDiff = 0.3;
          lockPtRef.current = null;
          for (const e of enemies) {
            const bdx = e.x - selfPt.x;
            const bdy = e.y - selfPt.y;
            const bd = Math.hypot(bdx, bdy);
            if (bd > 580) continue;
            let da = Math.atan2(bdy, bdx) - aim;
            while (da > Math.PI) da -= 2 * Math.PI;
            while (da < -Math.PI) da += 2 * Math.PI;
            if (Math.abs(da) < bestDiff) {
              bestDiff = Math.abs(da);
              aim = Math.atan2(bdy, bdx);
              lockPtRef.current = { x: e.x, y: e.y };
            }
          }
          touchFire = true;
        } else {
          lockPtRef.current = null;
        }
      } else if (mouseRef.current.has && !touchRef.current) {
        const view = camRef.current;
        const { w: cwCss, h: chCss } = sizeRef.current;
        const wx = view.camX + (mouseRef.current.x - cwCss / 2) / view.scale;
        const wy = view.camY + (mouseRef.current.y - chCss / 2) / view.scale;
        aim = Math.atan2(wy - selfPt.y, wx - selfPt.x);
        lockPtRef.current = null;
      }
      lastAimRef.current = aim;
      const fire = touchFire || fireMouseRef.current || keysRef.current.has("Space");
      return { mv: [mvx, mvy], aim, fire };
    };

    const selfPoint = (): { x: number; y: number } => {
      if (isHostRef.current) {
        const me = worldRef.current?.ps.find((p) => p.id === myUidRef.current);
        if (me) return { x: me.x, y: me.y };
        return localSelfRef.current;
      }
      return predSmoothRef.current; /* موقعیت نمایشی پیش‌بینی‌شده — پاسخ آنی به ورودی */
    };

    const enemyPoints = (): { x: number; y: number }[] => {
      const out: { x: number; y: number }[] = [];
      if (isHostRef.current) {
        const w = worldRef.current;
        if (w) for (const p of w.ps) if (p.team !== teamOfMe() && !p.dead) out.push({ x: p.x, y: p.y });
      } else {
        const snaps = snapsRef.current;
        const cur = snaps[snaps.length - 1];
        if (cur) for (const p of cur.s.ps) if (p.team !== teamOfMe() && p.dead === 0) out.push({ x: p.x, y: p.y });
      }
      return out;
    };

    const teamOfMe = (): Team => rosterRef.current.find((e) => e.id === myUidRef.current)?.team ?? "r";

    /* رندر بازیکن‌ها */
    const buildRenderPlayers = (now: number): RPlayer[] => {
      const out: RPlayer[] = [];
      if (isHostRef.current) {
        const w = worldRef.current;
        if (w) {
          for (const p of w.ps) {
            if (p.id === myUidRef.current) continue;
            out.push({ id: p.id, name: p.name, team: p.team, x: p.x, y: p.y, hp: p.hp, aim: p.aim, dead: p.dead, respT: p.respT, sh: p.shield > 0, hm: p.homing > 0, inv: p.inv > 0, bot: p.bot });
          }
        }
        return out;
      }
      const snaps = snapsRef.current;
      if (snaps.length === 0) return out;
      /* ساعت میان‌یابی نرم (به‌جای now ثابت) — ریشهٔ پرش‌ها: با لرزش شبکه،
         زمان رندر از پنجرهٔ دو اسنپ‌شات بیرون می‌زد و آلفا به ۱ کلمپ می‌شد
         = تله‌پورت به تازه‌ترین اسنپ‌شات. اکنون هنگام گرسنگی بافر،
         برون‌یابی سرعت‌دار (حداکثر ۱۶۰ms) مسیر را روان ادامه می‌دهد. */
      const rt = renderClockRef.current || now - renderDelayRef.current;
      const L = snaps.length;
      let i1 = 0;
      while (i1 < L - 1 && snaps[i1 + 1].rt <= rt) i1++;
      const s1 = snaps[i1];
      const s2 = snaps[Math.min(i1 + 1, L - 1)];
      const span = s2.rt - s1.rt;
      const alpha = span > 0 ? clamp((rt - s1.rt) / span, 0, 1) : 1;
      const under = i1 > 0 && span === 0 && rt > s2.rt;
      for (const cur of s2.s.ps) {
        if (cur.id === myUidRef.current) continue;
        const prev = s1.s.ps.find((p) => p.id === cur.id) ?? cur;
        let x = prev.x + (cur.x - prev.x) * alpha;
        let y = prev.y + (cur.y - prev.y) * alpha;
        let aimA = cur.aim;
        if (span > 0) {
          /* نرم‌سازی زاویه نشانه‌گیری با کوتاه‌ترین کمان */
          let da = cur.aim - prev.aim;
          while (da > Math.PI) da -= 2 * Math.PI;
          while (da < -Math.PI) da += 2 * Math.PI;
          aimA = prev.aim + da * alpha;
        }
        if (under) {
          /* برون‌یابی با سرعت تخمینی از جفت اسنپ‌شات قبلی — بدون پرش */
          const p2 = snaps[i1 - 1];
          const q1 = p2.s.ps.find((p) => p.id === cur.id) ?? prev;
          const dts = Math.max(1, s1.rt - p2.rt) / 1000;
          const vx = clamp((prev.x - q1.x) / dts, -520, 520);
          const vy = clamp((prev.y - q1.y) / dts, -520, 520);
          const ad = Math.min(0.16, (rt - s2.rt) / 1000);
          x += vx * ad;
          y += vy * ad;
        }
        const ent = rosterRef.current.find((e) => e.id === cur.id);
        out.push({
          id: cur.id,
          name: ent?.name ?? "؟",
          team: cur.team,
          x,
          y,
          hp: cur.hp,
          aim: aimA,
          dead: cur.dead === 1,
          respT: cur.respT,
          sh: cur.sh > 0,
          hm: cur.hm > 0,
          inv: cur.inv === 1,
          bot: ent?.bot ?? false,
        });
      }
      return out;
    };

    const renderBullets = (now: number): { x: number; y: number; team: Team; ms: boolean }[] => {
      if (isHostRef.current) {
        const w = worldRef.current;
        if (!w) return [];
        return w.bs.map((b) => ({ x: b.x, y: b.y, team: b.team, ms: b.kind === "missile" }));
      }
      const snaps = snapsRef.current;
      const cur = snaps[snaps.length - 1];
      if (!cur) return [];
      const age = Math.min(260, Math.max(0, now - cur.rt)) / 1000;
      return cur.s.bs.map((b) => ({ x: b[0] + b[2] * age, y: b[1] + b[3] * age, team: b[4] === 0 ? "r" : "b", ms: b[5] === 1 }));
    };

    const renderPickups = (): Pickup[] => {
      if (isHostRef.current) return worldRef.current?.pk ?? [];
      const snaps = snapsRef.current;
      const cur = snaps[snaps.length - 1];
      if (!cur) return [];
      return cur.s.pk.map((pk) => ({ x: pk.x, y: pk.y, kind: pk.k, t: 0 }));
    };

    const renderMines = (): { x: number; y: number; arm: number; blink: number; own: boolean }[] => {
      if (isHostRef.current) {
        const w = worldRef.current;
        return (w?.mn ?? []).map((mn) => ({ x: mn.x, y: mn.y, arm: mn.arm, blink: mn.blink, own: mn.ow === myUidRef.current }));
      }
      const snaps = snapsRef.current;
      const cur = snaps[snaps.length - 1];
      if (!cur) return [];
      return cur.s.mn.map((mn) => ({ x: mn.x, y: mn.y, arm: 0, blink: 0, own: mn.ow === myUidRef.current }));
    };

    const cameraView = (px: number, py: number) => {
      const { w: cw, h: ch } = sizeRef.current;
      const scale = clamp(Math.min(cw / 1150, ch / 720), 0.55, 1.12);
      const viewW = cw / scale;
      const viewH = ch / scale;
      const camX = viewW >= MAP_W ? MAP_W / 2 : clamp(px, viewW / 2, MAP_W - viewW / 2);
      const camY = viewH >= MAP_H ? MAP_H / 2 : clamp(py, viewH / 2, MAP_H - viewH / 2);
      return { camX, camY, scale };
    };

    const draw = () => {
      const { w: cw, h: ch, dpr } = sizeRef.current;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#08090d";
      ctx.fillRect(0, 0, cw, ch);
      const st = stepRef.current;
      if (st !== "playing") return;
      const now = performance.now();
      const fx = fxRef.current;
      const self = selfPoint();
      const myAim = localInputRef.current.aim;
      const v = cameraView(self.x, self.y);
      camRef.current = v;

      ctx.save();
      const sh = fx.shake;
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
        } else {
          ctx.fillRect(ox, oy, ow, oh);
          ctx.fillStyle = "rgba(148,163,184,0.12)";
          ctx.fillRect(ox + 4, oy, ow - 8, 6);
        }
      }

      /* جوایز */
      for (const pk of renderPickups()) {
        const pulse = 1 + Math.sin(now / 180 + pk.t) * 0.08;
        ctx.save();
        ctx.translate(pk.x, pk.y);
        ctx.scale(pulse, pulse);
        ctx.fillStyle = "rgba(255,255,255,0.10)";
        ctx.beginPath();
        ctx.arc(0, 0, 17, 0, Math.PI * 2);
        ctx.fill();
        const col = pk.kind === "hp" ? "#3df07c" : pk.kind === "rapid" ? "#ffd60a" : pk.kind === "shield" ? "#38bdf8" : pk.kind === "homing" ? "#ff8a3d" : pk.kind === "mine" ? "#ff3b5c" : "#e2e8f0";
        ctx.fillStyle = col;
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
          ctx.strokeStyle = col;
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            ctx.beginPath();
            ctx.moveTo(Math.cos(a) * 5.5, Math.sin(a) * 5.5);
            ctx.lineTo(Math.cos(a) * 9.5, Math.sin(a) * 9.5);
            ctx.stroke();
          }
        } else {
          ctx.lineWidth = 2.6;
          ctx.strokeStyle = col;
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

      /* مین‌ها */
      for (const mn of renderMines()) {
        const blink = mn.arm > 0 ? 0.35 : 0.55 + Math.sin(mn.blink * 9) * 0.45;
        ctx.fillStyle = "#20242e";
        ctx.beginPath();
        ctx.arc(mn.x, mn.y, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = mn.own ? "rgba(255,214,10,0.8)" : "rgba(255,59,92,0.8)";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.globalAlpha = blink;
        ctx.fillStyle = mn.own ? "#ffd60a" : "#ff3b5c";
        ctx.beginPath();
        ctx.arc(mn.x, mn.y, 3.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      /* گلوله‌ها */
      for (const bl of renderBullets(now)) {
        const col = bl.ms ? "#ff8a3d" : bl.team === "r" ? "#ff7a6b" : "#5bc8ff";
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(bl.x, bl.y, bl.ms ? 7 : 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.25;
        ctx.beginPath();
        ctx.arc(bl.x, bl.y, (bl.ms ? 7 : 5) + 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        if (bl.ms && Math.random() < 0.5) {
          fx.parts.push({ x: bl.x, y: bl.y, vx: (Math.random() - 0.5) * 30, vy: (Math.random() - 0.5) * 30, life: 0.3, max: 0.3, size: 3, color: "#ff8a3d" });
        }
      }

      /* گلوله‌های دیداری محلی مهمان — لحظهٔ فشردن شلیک، تا گلولهٔ واقعی سرور برسد */
      if (!isHostRef.current && localBulletsRef.current.length > 0) {
        const myCol = TEAM_COLORS[teamOfMe()];
        for (const b of localBulletsRef.current) {
          ctx.fillStyle = myCol;
          ctx.beginPath();
          ctx.arc(b.x, b.y, 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 0.25;
          ctx.beginPath();
          ctx.arc(b.x, b.y, 9, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      }

      /* بازیکن‌های دیگر */
      const players = buildRenderPlayers(now);
      for (const p of players) {
        if (p.dead) continue;
        const blink = p.inv && Math.floor(now / 70) % 2 === 0;
        ctx.globalAlpha = blink ? 0.45 : 1;
        const col = TEAM_COLORS[p.team];
        if (p.sh) {
          ctx.fillStyle = "rgba(56,189,248,0.10)";
          ctx.beginPath();
          ctx.arc(p.x, p.y, PLAYER_R + 12, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "rgba(56,189,248,0.6)";
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(p.x, p.y, PLAYER_R + 12, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.strokeStyle = p.hm ? "#ff8a3d" : "#f5f5f4";
        ctx.lineWidth = 6;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(p.x + Math.cos(p.aim) * (PLAYER_R - 4), p.y + Math.sin(p.aim) * (PLAYER_R - 4));
        ctx.lineTo(p.x + Math.cos(p.aim) * (PLAYER_R + 9), p.y + Math.sin(p.aim) * (PLAYER_R + 9));
        ctx.stroke();
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(p.x, p.y, PLAYER_R, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.5)";
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.globalAlpha = 1;
        /* نام و جان */
        ctx.font = "bold 12px ui-sans-serif, system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillStyle = "rgba(8,9,13,0.75)";
        const nw = ctx.measureText(p.name).width + 10;
        ctx.fillRect(p.x - nw / 2, p.y - PLAYER_R - 26, nw, 16);
        ctx.fillStyle = col;
        ctx.fillText(p.name, p.x, p.y - PLAYER_R - 14);
        if (p.hp < PLAYER_HP) {
          ctx.fillStyle = "rgba(0,0,0,0.55)";
          ctx.fillRect(p.x - 18, p.y - PLAYER_R - 8, 36, 4);
          ctx.fillStyle = col;
          ctx.fillRect(p.x - 18, p.y - PLAYER_R - 8, 36 * clamp(p.hp / PLAYER_HP, 0, 1), 4);
        }
      }

      /* خود بازیکن */
      const me = isHostRef.current ? worldRef.current?.ps.find((p) => p.id === myUidRef.current) : null;
      const meDead = isHostRef.current ? (me?.dead ?? false) : hudRef.current.dead;
      if (!meDead) {
        const col = TEAM_COLORS[teamOfMe()];
        const blink = isHostRef.current ? (me?.inv ?? 0) > 0 && Math.floor(now / 70) % 2 === 0 : false;
        ctx.globalAlpha = blink ? 0.45 : 1;
        if ((isHostRef.current ? (me?.shield ?? 0) : hudRef.current.sh) > 0) {
          ctx.fillStyle = "rgba(56,189,248,0.10)";
          ctx.beginPath();
          ctx.arc(self.x, self.y, PLAYER_R + 12, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "rgba(56,189,248,0.6)";
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(self.x, self.y, PLAYER_R + 12, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.strokeStyle = "#f5f5f4";
        ctx.lineWidth = 6;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(self.x + Math.cos(myAim) * (PLAYER_R - 4), self.y + Math.sin(myAim) * (PLAYER_R - 4));
        ctx.lineTo(self.x + Math.cos(myAim) * (PLAYER_R + 9), self.y + Math.sin(myAim) * (PLAYER_R + 9));
        ctx.stroke();
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(self.x, self.y, PLAYER_R, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.5)";
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.globalAlpha = 1;

        /* نشانگر شلیک */
        const lock = lockPtRef.current;
        const pt = lock ?? { x: self.x + Math.cos(myAim) * (mouseRef.current.has && !touchRef.current ? 0 : 260), y: self.y + Math.sin(myAim) * (mouseRef.current.has && !touchRef.current ? 0 : 260) };
        const mousePt = mouseRef.current.has && !touchRef.current && !lock;
        const px = mousePt
          ? camRef.current.camX + (mouseRef.current.x - sizeRef.current.w / 2) / camRef.current.scale
          : pt.x;
        const py = mousePt
          ? camRef.current.camY + (mouseRef.current.y - sizeRef.current.h / 2) / camRef.current.scale
          : pt.y;
        ctx.setLineDash([3, 7]);
        ctx.strokeStyle = lock ? "rgba(255,59,92,0.55)" : "rgba(255,214,10,0.4)";
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(self.x + Math.cos(myAim) * (PLAYER_R + 10), self.y + Math.sin(myAim) * (PLAYER_R + 10));
        ctx.lineTo(px, py);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = lock ? "#ff3b5c" : "#ffd60a";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(px, py, lock ? 9 : 11, 0, Math.PI * 2);
        ctx.stroke();
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
          ctx.beginPath();
          ctx.moveTo(px + Math.cos(a) * 5, py + Math.sin(a) * 5);
          ctx.lineTo(px + Math.cos(a) * 10, py + Math.sin(a) * 10);
          ctx.stroke();
        }
        ctx.fillStyle = lock ? "#ff3b5c" : "#ffd60a";
        ctx.beginPath();
        ctx.arc(px, py, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }

      /* افکت‌ها */
      for (const pt of fx.parts) {
        ctx.globalAlpha = clamp(pt.life / pt.max, 0, 1);
        ctx.fillStyle = pt.color;
        ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
      }
      ctx.globalAlpha = 1;
      for (const fl of fx.floats) {
        ctx.globalAlpha = clamp(fl.life / 0.95, 0, 1);
        ctx.fillStyle = fl.color;
        ctx.font = "bold 17px ui-sans-serif, system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(fl.text, fl.x, fl.y);
      }
      ctx.globalAlpha = 1;
      ctx.restore();

      /* قرمزی آسیب */
      if (fx.hurt > 0) {
        const g = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.3, cw / 2, ch / 2, Math.max(cw, ch) * 0.72);
        g.addColorStop(0, "rgba(255,40,70,0)");
        g.addColorStop(1, `rgba(255,40,70,${0.4 * fx.hurt})`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, cw, ch);
      }

      /* اهرم‌های لمسی */
      if (touchRef.current && st === "playing") {
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
        const restY = ch - STICK_R - 46;
        drawStick(moveStickRef.current, STICK_R + 42, restY);
        drawStick(aimStickRef.current, cw - STICK_R - 42, restY);
      }
    };

    const frame = (now: number) => {
      rafRef.current = requestAnimationFrame(frame);
      const dt = clamp((now - last) / 1000, 0, 0.05);
      last = now;
      const st = stepRef.current;
      const fx = fxRef.current;
      /* افکت‌ها همیشه جلو بروند */
      for (const pt of fx.parts) {
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        pt.vx *= 1 - 3 * dt;
        pt.vy *= 1 - 3 * dt;
        pt.life -= dt;
      }
      fx.parts = fx.parts.filter((p2) => p2.life > 0);
      for (const fl of fx.floats) {
        fl.y -= 42 * dt;
        fl.life -= dt;
      }
      fx.floats = fx.floats.filter((fl) => fl.life > 0);
      fx.shake = Math.max(0, fx.shake - dt * 34);
      fx.hurt = Math.max(0, fx.hurt - dt * 2.2);

      if (st === "playing") {
        const li = computeLocalInput();
        localInputRef.current = li;
        /* افکت شلیک خودم */
        if (li.fire && now - lastShotFxRef.current > 160) {
          const sp = selfPoint();
          lastShotFxRef.current = now;
          fxBurst(sp.x + Math.cos(li.aim) * (PLAYER_R + 9), sp.y + Math.sin(li.aim) * (PLAYER_R + 9), "#ffd60a", 2, 80, 2);
        }
        if (isHostRef.current) {
          const w = worldRef.current;
          if (w) {
            const steps = dt > 0.025 ? 2 : 1;
            for (let i = 0; i < steps; i++) hostSim(w, dt / steps);
            if (now - lastSnapRef.current >= SNAP_MS) {
              lastSnapRef.current = now;
              publishSnap();
            }
          }
        } else {
          /* پیش‌بینی محلی مهمان — حرکت و شلیک بی‌درنگ، بدون انتظار برای شبکه.
             تصحیح با «بازپخش»: میزبان آخرین seq ورودی اعمال‌شده را در اسنپ‌شات
             برمی‌گرداند؛ مهمان موقعیت را روی سرور می‌گذارد و فقط ورودی‌های
             تأییدنشده را دوباره اجرا می‌کند — پس هیچ کشش عقب‌رو به سمت
             موقعیتِ عقب‌ماندهٔ سرور وجود ندارد (علت اصلی تاخیر قبلی). */
          const snaps = snapsRef.current;
          const cur = snaps[snaps.length - 1];
          const self = cur?.s.ps.find((p) => p.id === myUidRef.current);
          /* پیش‌رانش ساعت میان‌یابی — هدف: آخرین رسیدن منهای تاخیر انطباقی؛
             عقب/جلو رفتن ساعت نرم است نه پرشی (ضریب ۰٫۸ تا ۱٫۳۵) */
          if (snaps.length > 0) {
            const target = snaps[snaps.length - 1].rt - renderDelayRef.current;
            if (renderClockRef.current <= 0) renderClockRef.current = target;
            const err = target - renderClockRef.current;
            renderClockRef.current += dt * 1000 * clamp(1 + err / 220, 0.8, 1.35);
            if (renderClockRef.current > now - 10) renderClockRef.current = now - 10;
          }
          const pred = localSelfRef.current;
          const others = cur ? cur.s.ps : [];
          const sepPush = () => {
            for (const op of others) {
              if (op.id === myUidRef.current || op.dead === 1) continue;
              const dx2 = pred.x - op.x;
              const dy2 = pred.y - op.y;
              const dd2 = Math.hypot(dx2, dy2);
              const min2 = PLAYER_R + op.r + 2;
              if (dd2 <= 0.01) slideMove(pred, min2, min2, PLAYER_R);
              else if (dd2 < min2) slideMove(pred, (dx2 / dd2) * (min2 - dd2), (dy2 / dd2) * (min2 - dd2), PLAYER_R);
            }
          };
          if (self && self.dead === 1) {
            pred.x = self.x;
            pred.y = self.y;
            sendLogRef.current = [];
            prevDeadRef.current = true;
          } else if (self && typeof self.sq === "number") {
            /* بازپخش: پایه = موقعیت سرور + ورودی‌های پس از آخرین تأیید */
            const log = sendLogRef.current;
            if (prevDeadRef.current) {
              /* ریسپاون — ورودی‌های دوران مرگ هرگز اعمال نشده‌اند */
              log.length = 0;
              prevDeadRef.current = false;
            }
            const acked = self.sq;
            while (log.length > 0 && (log[0].seq <= acked || now - log[0].t > 1200)) log.shift();
            pred.x = self.x;
            pred.y = self.y;
            for (let i = 0; i < log.length; i++) {
              const e = log[i];
              const dur = i + 1 < log.length ? Math.min(0.15, (log[i + 1].t - e.t) / 1000) : Math.min(0.15, (now - e.t) / 1000);
              if (dur <= 0) continue;
              slideMove(pred, e.mv[0] * PLAYER_SPEED * dur, e.mv[1] * PLAYER_SPEED * dur, PLAYER_R);
              sepPush();
            }
          } else {
            /* جانشین (اسنپ‌شات بدون sq): پیش‌بینی آزاد + نرم‌سازی به سمت سرور */
            slideMove(pred, li.mv[0] * PLAYER_SPEED * dt, li.mv[1] * PLAYER_SPEED * dt, PLAYER_R);
            sepPush();
            if (self) {
              const dx = self.x - pred.x;
              const dy = self.y - pred.y;
              const dd = Math.hypot(dx, dy);
              if (dd > 90) {
                pred.x = self.x;
                pred.y = self.y;
              } else {
                const k = Math.min(1, dt * 7);
                pred.x += dx * k;
                pred.y += dy * k;
              }
            }
          }
          /* موقعیت نمایشی نرم — جذب لرزش میکروسکوپی بازپخش بدون تاخیر محسوس */
          const ps2 = predSmoothRef.current;
          if (Math.hypot(pred.x - ps2.x, pred.y - ps2.y) > 60) {
            ps2.x = pred.x;
            ps2.y = pred.y;
          } else {
            const k2 = Math.min(1, dt * 22);
            ps2.x += (pred.x - ps2.x) * k2;
            ps2.y += (pred.y - ps2.y) * k2;
          }
          /* شلیک محلی آنی: صدا + گلولهٔ دیداری + ارسال فوری ورودی روی لبهٔ فشردن */
          const fireEdge = li.fire && !prevFireRef.current;
          const moving = Math.abs(li.mv[0]) > 0.05 || Math.abs(li.mv[1]) > 0.05;
          const moveEdge = moving && !prevMoveRef.current;
          prevFireRef.current = li.fire;
          prevMoveRef.current = moving;
          if (fireEdge && !hudRef.current.dead && now - lastLocalShotRef.current >= 240) {
            lastLocalShotRef.current = now;
            sfxRef.current?.shoot();
            if (localBulletsRef.current.length < 6) {
              localBulletsRef.current.push({
                x: ps2.x + Math.cos(li.aim) * (PLAYER_R + 7),
                y: ps2.y + Math.sin(li.aim) * (PLAYER_R + 7),
                vx: Math.cos(li.aim) * BULLET_SPEED,
                vy: Math.sin(li.aim) * BULLET_SPEED,
                born: now,
              });
            }
          }
          /* گلوله‌های دیداری محلی — پیشروی و ادغام با گلولهٔ واقعی سرور */
          const lb = localBulletsRef.current;
          const myTmIdx = teamOfMe() === "r" ? 0 : 1;
          for (let i = lb.length - 1; i >= 0; i--) {
            const b = lb[i];
            b.x += b.vx * dt;
            b.y += b.vy * dt;
            let kill = now - b.born > 460;
            if (!kill && cur) {
              for (const sb of cur.s.bs) {
                if (sb[4] === myTmIdx && Math.hypot(sb[0] - b.x, sb[1] - b.y) < 64) {
                  kill = true; /* گلولهٔ واقعی رسید — نسخهٔ محلی کنار می‌رود */
                  break;
                }
              }
            }
            if (kill) lb.splice(i, 1);
          }
          /* انتشار ورودی — مسیر مستقیم DataChannel وقتی باز است (بدون رله، بدون سقف نرخ،
             بدون سرُری TCP)؛ وگرنه کانال اختصاصی Ably با نرخ پایهٔ همیشگی */
          const hostLink = rtcOpenRef.current ? rtcPeersRef.current.get(hostUidRef.current) : null;
          const seq = seqRef.current;
          const msg: InMsg = {
            t: "i",
            u: myUidRef.current,
            mv: [round2(clamp(li.mv[0], -1, 1)), round2(clamp(li.mv[1], -1, 1))],
            a: round2(li.aim),
            f: li.fire ? 1 : 0,
            seq,
          };
          if (hostLink && hostLink.open) {
            if (now - netRef.current.lastPing > 2000) {
              netRef.current.lastPing = now;
              hostLink.send(JSON.stringify({ t: "p", ts: Math.round(performance.now()) }));
            }
            if (fireEdge || moveEdge || now - lastInRef.current >= INPUT_MS) {
              lastInRef.current = now;
              seqRef.current = seq + 1;
              const log2 = sendLogRef.current;
              log2.push({ seq, mv: [msg.mv[0], msg.mv[1]], t: now });
              if (log2.length > 40) log2.shift();
              if (!hostLink.send(JSON.stringify(msg))) {
                const ix = log2.findIndex((e2) => e2.seq === seq);
                if (ix >= 0) log2.splice(ix, 1);
              }
            }
          } else {
            const outChan = inChanRef.current ?? chanRef.current;
            if (outChan && now - netRef.current.lastPing > 2000) {
              netRef.current.lastPing = now;
              void outChan.publish("i", { t: "p", u: myUidRef.current, ts: Math.round(performance.now()) }).catch(() => {
                /* ignore */
              });
            }
            if (outChan && (fireEdge || moveEdge || now - lastInRef.current >= INPUT_MS)) {
              lastInRef.current = now;
              seqRef.current = seq + 1;
              const log2 = sendLogRef.current;
              log2.push({ seq, mv: [msg.mv[0], msg.mv[1]], t: now });
              if (log2.length > 40) log2.shift();
              void outChan.publish("i", msg).catch(() => {
                /* در سقف نرخ یا قطعی، بستهٔ بعدی فرستاده می‌شود — این یکی بازپخش نمی‌شود */
                const ix = log2.findIndex((e2) => e2.seq === seq);
                if (ix >= 0) log2.splice(ix, 1);
              });
            }
          }
        }
      }
      draw();
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, []);

  /* قطع اتصال هنگام خروج از صفحه */
  useEffect(() => {
    return () => {
      closeNet();
    };
  }, [closeNet]);

  const BackIcon = lang === "fa" ? ChevronRight : ChevronLeft;
  const hpPct = clamp(hud.hp / PLAYER_HP, 0, 1);
  /* حالت پاک: در حال بازی روی موبایل هیچ نوشته‌ای دیده نمی‌شود — فقط دکمه‌ها و نوار جان */
  const hudHidden = cleanHud && step === "playing";

  /* ---------- رابط کاربری ---------- */
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

      {/* نوار بالا */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-2 p-3"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <div className="pointer-events-auto flex items-center gap-2">
          <Button
            size="icon"
            aria-label={o.leave}
            className="h-10 w-10 rounded-full border border-zinc-800 bg-zinc-950/80 text-zinc-300 backdrop-blur hover:bg-zinc-800 hover:text-zinc-100"
            onClick={leaveToMenu}
          >
            <LogOut className="h-5 w-5" aria-hidden="true" />
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

        {step === "playing" && (
          <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-1.5">
            {!hudHidden && (
              <>
                <span className="rounded-full border border-zinc-800 bg-zinc-950/80 px-3 py-1.5 text-xs font-bold backdrop-blur">
                  <b className="text-rose-400">{numFmt(hud.sr)}</b>
                  <span className="mx-1.5 text-zinc-500">—</span>
                  <b className="text-sky-400">{numFmt(hud.sb)}</b>
                </span>
                <span className="rounded-full border border-zinc-800 bg-zinc-950/80 px-3 py-1.5 text-xs font-bold text-zinc-200 backdrop-blur">
                  ⏱ {numFmt(Math.floor(hud.tm / 60))}:{numFmt(hud.tm % 60).padStart(2, "۰")}
                </span>
                {netHud && (
                  <span className="rounded-full border border-zinc-800 bg-zinc-950/80 px-3 py-1.5 text-xs font-bold backdrop-blur" dir="ltr">
                    ⚡ <b className={netHud.rtt < 90 ? "text-emerald-400" : netHud.rtt < 200 ? "text-amber-400" : "text-rose-400"}>{numFmt(netHud.rtt)}</b>
                    <span className="text-zinc-500">ms</span>
                    <span className={`ml-1 text-[10px] font-black ${netHud.mode === "p2p" ? "text-emerald-300" : "text-amber-300"}`}>· {netHud.mode === "p2p" ? o.netP2p : o.netRelay}</span>
                  </span>
                )}
              </>
            )}
            {/* حالت پاک موبایل — خاموش/روشن کردن نوشته‌ها */}
            <Button
              onClick={() => setCleanHud((v) => !v)}
              size="icon"
              aria-label={cleanHud ? o.cleanOff : o.cleanOn}
              title={cleanHud ? o.cleanOff : o.cleanOn}
              className="h-10 w-10 rounded-full border border-zinc-800 bg-zinc-950/80 text-zinc-300 backdrop-blur hover:bg-zinc-800 hover:text-zinc-100"
            >
              {cleanHud ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
            </Button>
            <Button
              onClick={toggleMute}
              size="icon"
              aria-label="sound"
              className="h-10 w-10 rounded-full border border-zinc-800 bg-zinc-950/80 text-zinc-300 backdrop-blur hover:bg-zinc-800 hover:text-zinc-100"
            >
              <span className="text-sm">{muted ? "🔇" : "🔊"}</span>
            </Button>
          </div>
        )}
      </div>

      {/* فید حذف — در حالت پاک پنهان */}
      {step === "playing" && !hudHidden && killFeed.length > 0 && (
        <div className="pointer-events-none absolute inset-x-0 top-16 z-10 flex flex-col items-center gap-1">
          {killFeed.map((kf, i) => (
            <span key={`${i}-${kf}`} className="rounded-full bg-zinc-950/70 px-3 py-1 text-[11px] font-bold text-zinc-300 backdrop-blur">
              {kf}
            </span>
          ))}
        </div>
      )}

      {/* جان و جوایز */}
      {step === "playing" && (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center p-3"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        >
          <div className="flex w-full max-w-md flex-col gap-1.5 rounded-2xl border border-zinc-800 bg-zinc-950/70 px-4 py-2.5 backdrop-blur">
            {!hudHidden && (
              <div className="flex items-center justify-between text-[11px] font-bold text-zinc-400">
                <span className="flex flex-wrap gap-1.5">
                  {hud.sh > 0 && <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-sky-300">⛨ {numFmt(hud.sh)}</span>}
                  {hud.hm > 0 && <span className="rounded-full bg-orange-500/15 px-2 py-0.5 text-orange-300">🚀 {numFmt(hud.hm)}</span>}
                  {hud.mn > 0 && <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-rose-300">💣 {numFmt(hud.mn)}</span>}
                </span>
                <span>
                  {o.ruleLine.replace("{n}", numFmt(KILL_TARGET)).replace("{s}", numFmt(5))}
                </span>
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

      {/* ریسپاون */}
      {step === "playing" && hud.dead && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <p className="rounded-2xl border border-rose-500/40 bg-zinc-950/80 px-6 py-3 text-lg font-black text-rose-300 backdrop-blur">
            {o.respawnIn.replace("{n}", numFmt(hud.respT))}
          </p>
        </div>
      )}

      {/* بنر — در حالت پاک پنهان */}
      {banner && step === "playing" && !hudHidden && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <div className="rounded-2xl border border-orange-500/40 bg-zinc-950/80 px-8 py-4 text-center backdrop-blur">
            <p className="text-2xl font-black text-orange-300">{banner}</p>
          </div>
        </div>
      )}

      {/* منو */}
      {step === "menu" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center overflow-y-auto bg-zinc-950/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-orange-500/30 bg-zinc-950/95 p-7 text-center shadow-2xl shadow-orange-500/10">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-500/30 bg-orange-500/10 px-3 py-1 text-[11px] font-bold text-orange-300">
              <Users className="h-3.5 w-3.5" aria-hidden="true" />
              {o.title}
            </span>
            <h1 className="mt-4 text-3xl font-black text-zinc-50">{f.menuTitle} — گروهی</h1>
            <p className="mt-2 text-sm leading-7 text-zinc-400">{o.subtitle}</p>
            <input
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder={o.namePh}
              maxLength={16}
              dir="auto"
              className="mt-5 h-12 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 text-center text-sm font-bold text-zinc-100 outline-none focus:border-orange-500/60"
            />
            <Button onClick={createRoom} className="mt-3 h-12 w-full rounded-xl bg-orange-500 text-base font-black text-zinc-950 hover:bg-orange-400">
              <Users className="h-4.5 w-4.5" aria-hidden="true" />
              {o.createRoom}
            </Button>
            <div className="my-4 flex items-center gap-3 text-[11px] text-zinc-500">
              <span className="h-px flex-1 bg-zinc-800" />
              <span>یا</span>
              <span className="h-px flex-1 bg-zinc-800" />
            </div>
            <input
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
              placeholder={o.codePh}
              maxLength={5}
              dir="ltr"
              className="h-12 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 text-center font-mono text-lg tracking-[0.3em] text-zinc-100 outline-none focus:border-orange-500/60"
            />
            <Button onClick={joinRoom} variant="outline" className="mt-3 h-11 w-full rounded-xl border-zinc-700 bg-transparent text-sm font-bold text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100">
              <LogOut className="h-4 w-4 rotate-180" aria-hidden="true" />
              {o.joinRoom}
            </Button>
            {openRooms.length > 0 && (
              <div className="mt-5 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3">
                <p className="text-[11px] font-bold text-zinc-400">{o.openRoomsTitle}</p>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {openRooms.slice(0, 6).map((rm) => (
                    <li key={rm.c} className="flex items-center justify-between gap-2 rounded-xl bg-zinc-950/60 px-3 py-2">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="shrink-0 font-mono text-sm font-black text-orange-300" dir="ltr">
                          {rm.c}
                        </span>
                        <span className="truncate text-xs font-bold text-zinc-300">{rm.n}</span>
                        <span className="shrink-0 rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-bold text-zinc-400">
                          {numFmt(rm.p)}/{numFmt(rm.m)}
                        </span>
                        {rm.s === 1 ? (
                          <span className="shrink-0 rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold text-rose-300">{o.liveTag}</span>
                        ) : (
                          <span className="shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-300">{o.waitTag}</span>
                        )}
                      </span>
                      {rm.s === 0 && (
                        <Button size="sm" onClick={() => quickJoin(rm)} className="h-8 shrink-0 rounded-lg bg-orange-500 px-3 text-xs font-black text-zinc-950 hover:bg-orange-400">
                          {o.joinShort}
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {menuErr && <p className="mt-3 text-xs font-bold text-rose-400">{menuErr}</p>}
            <Button asChild variant="ghost" className="mt-4 h-10 w-full text-xs text-zinc-400 hover:text-zinc-200">
              <a href="/fire">
                <BackIcon className="h-4 w-4" aria-hidden="true" />
                {f.back}
              </a>
            </Button>
          </div>
        </div>
      )}

      {/* اتصال */}
      {step === "connecting" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-zinc-950/85 p-4">
          <div className="flex flex-col items-center gap-4">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-zinc-700 border-t-orange-500" />
            <p className="text-sm font-bold text-zinc-300">{o.connecting}</p>
          </div>
        </div>
      )}

      {/* لابی */}
      {step === "lobby" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center overflow-y-auto bg-zinc-950/85 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl border border-zinc-800 bg-zinc-950/95 p-6 text-center">
            <div className="flex items-center justify-center gap-2">
              <span className="rounded-full border border-orange-500/40 bg-orange-500/10 px-4 py-1.5 font-mono text-lg font-black tracking-[0.25em] text-orange-300" dir="ltr">
                {roomCode}
              </span>
              <Button size="icon" variant="outline" aria-label="copy" onClick={copyCode} className="h-10 w-10 rounded-full border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800">
                <Copy className="h-4.5 w-4.5" aria-hidden="true" />
              </Button>
            </div>
            {copied && <p className="mt-2 text-[11px] font-bold text-emerald-400">{o.copyTip}</p>}
            <p className="mt-3 text-xs text-zinc-500">{o.subtitle}</p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              {(["r", "b"] as Team[]).map((tm) => (
                <div key={tm} className="rounded-2xl border p-3" style={{ borderColor: `${TEAM_COLORS[tm]}44` }}>
                  <p className="text-sm font-black" style={{ color: TEAM_COLORS[tm] }}>
                    {tm === "r" ? o.teamR : o.teamB}
                  </p>
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {roster.filter((e) => e.team === tm).map((e) => (
                      <li key={e.id} className="flex items-center justify-between gap-1 text-xs text-zinc-200">
                        <span className="truncate font-bold">{e.name}</span>
                        <span className="flex shrink-0 gap-1">
                          {e.id === myUidUi && <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-300">{o.youTag}</span>}
                          {e.id === hostUidUi && <span className="rounded-full bg-orange-500/15 px-1.5 py-0.5 text-[10px] text-orange-300">{o.hostTag}</span>}
                          {e.bot && <span className="rounded-full bg-zinc-700/60 px-1.5 py-0.5 text-[10px] text-zinc-300">{o.botTag}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            {amHostUi && (
              <div className="mt-4 flex items-center justify-center gap-3">
                <span className="text-xs font-bold text-zinc-400">{o.botsPer}</span>
                <Button size="icon" variant="outline" aria-label="less" onClick={() => changeBots(-1)} className="h-9 w-9 rounded-full border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800">
                  <Minus className="h-4 w-4" aria-hidden="true" />
                </Button>
                <span className="w-8 text-center text-sm font-black text-zinc-100">{numFmt(botsPer)}</span>
                <Button size="icon" variant="outline" aria-label="more" onClick={() => changeBots(1)} className="h-9 w-9 rounded-full border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800">
                  <Plus className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            )}
            <p className="mt-3 text-[11px] text-zinc-500">{o.ruleLine.replace("{n}", numFmt(KILL_TARGET)).replace("{s}", numFmt(5))}</p>
            {amHostUi ? (
              <Button onClick={startMatch} className="mt-4 h-13 w-full rounded-2xl bg-orange-500 text-lg font-black text-zinc-950 hover:bg-orange-400">
                <Flame className="h-5 w-5" aria-hidden="true" />
                {o.start}
              </Button>
            ) : (
              <p className="mt-4 flex items-center justify-center gap-2 text-sm font-bold text-zinc-400">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-700 border-t-orange-500" />
                {o.waitHost}
              </p>
            )}
            <Button onClick={leaveToMenu} variant="ghost" className="mt-3 h-10 w-full text-xs text-zinc-400 hover:text-zinc-200">
              <LogOut className="h-4 w-4" aria-hidden="true" />
              {o.leave}
            </Button>
          </div>
        </div>
      )}

      {/* پایان مسابقه */}
      {step === "over" && finalNet && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-zinc-950/85 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl border border-zinc-800 bg-zinc-950/95 p-7 text-center">
            <h2
              className="text-2xl font-black"
              style={{ color: finalNet.w === "d" ? "#e4e4e7" : TEAM_COLORS[finalNet.w] }}
            >
              {finalNet.w === "d" ? o.drawTitle : finalNet.w === teamOfMeUi() ? o.winTitle : o.loseTitle}
            </h2>
            <p className="mt-4 flex items-center justify-center gap-4 text-4xl font-black">
              <span className="text-rose-400">{numFmt(finalNet.sr)}</span>
              <span className="text-sm text-zinc-500">—</span>
              <span className="text-sky-400">{numFmt(finalNet.sb)}</span>
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              {o.teamR} — {o.teamB}
            </p>
            {amHostUi && (
              <Button onClick={startMatch} className="mt-5 h-12 w-full rounded-xl bg-orange-500 text-base font-bold text-zinc-950 hover:bg-orange-400">
                <RotateCcw className="h-4.5 w-4.5" aria-hidden="true" />
                {o.rematch}
              </Button>
            )}
            <Button onClick={leaveToMenu} variant="outline" className="mt-2.5 h-11 w-full rounded-xl border-zinc-700 bg-transparent text-sm text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100">
              <LogOut className="h-4 w-4" aria-hidden="true" />
              {o.backToMenu}
            </Button>
          </div>
        </div>
      )}

      {/* راه‌اندازی لازم */}
      {step === "setup" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-zinc-950/85 p-4">
          <div className="w-full max-w-md rounded-3xl border border-amber-500/40 bg-zinc-950/95 p-7 text-center">
            <AlertTriangle className="mx-auto h-10 w-10 text-amber-400" aria-hidden="true" />
            <h2 className="mt-3 text-xl font-black text-amber-300">{o.setupTitle}</h2>
            <p className="mt-2 text-sm leading-7 text-zinc-400">{o.setupDesc}</p>
            <Button asChild variant="outline" className="mt-5 h-11 w-full rounded-xl border-zinc-700 bg-transparent text-sm text-zinc-300 hover:bg-zinc-800">
              <a href="/fire">
                <BackIcon className="h-4 w-4" aria-hidden="true" />
                {f.back}
              </a>
            </Button>
          </div>
        </div>
      )}

      {/* خطا */}
      {step === "error" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-zinc-950/85 p-4">
          <div className="w-full max-w-md rounded-3xl border border-rose-500/40 bg-zinc-950/95 p-7 text-center">
            <AlertTriangle className="mx-auto h-10 w-10 text-rose-400" aria-hidden="true" />
            <h2 className="mt-3 text-lg font-black text-rose-300">{errMsg || o.connErr}</h2>
            <Button onClick={leaveToMenu} variant="outline" className="mt-5 h-11 w-full rounded-xl border-zinc-700 bg-transparent text-sm text-zinc-300 hover:bg-zinc-800">
              {o.backToMenu}
            </Button>
          </div>
        </div>
      )}
    </div>
  );

  /* تیم من برای رابط کاربری */
  function teamOfMeUi(): Team {
    return rosterRef.current.find((e) => e.id === myUidRef.current)?.team ?? "r";
  }
}
