/* بازی اکشن گروهی «میدان آتش» — مغز بازی سمت سرور.
   شبیه‌سازی به‌صورت «lazy tick» روی سرور جلو می‌رود: هر بار که کسی
   وضعیت را می‌خواهد یا اکشن می‌فرستد، شبیه‌سازی از آخرین گام تا «همین
   لحظه» جلو کشیده می‌شود و نتیجه در Room.state ذخیره می‌گردد.
   بنابراین سرور مرجع واحد است؛ هیچ بازیکنی (حتی میزبان) مزیت ندارد.
   این فایل نباید به DOM وابسته باشد. */

export const FIRE_GAME_SLUG = "fire-arena";

/* ---------- ثابت‌های میدان ---------- */
export const MAP_W = 1280;
export const MAP_H = 800;
export const PLAYER_R = 16;
export const BASE_SPEED = 245; // واحد بر ثانیه
export const RAGE_SPEED = 1.22; // ضریب سرعت در مرگ ناگهانی
export const RAGE_LEFT_MS = 30_000; // ۳۰ ثانیه آخر مرگ ناگهانی
export const BULLET_SPEED = 560;
export const BULLET_R = 5;
export const BULLET_TTL_MS = 1_300;
export const FIRE_CD_MS = 280;
export const FIRE_CD_MIN_MS = 220; // کف سخت سرور
export const DMG = 25; // چهار ضربه = حذف
export const START_HP = 100;
export const RESPAWN_MS = 1_500;
export const MATCH_MS = 120_000; // مسابقه ۱۲۰ ثانیه‌ای
export const COUNTDOWN_MS = 3_500;
export const TICK_MS = 40; // گام شبیه‌سازی سرور (۲۵ هرتز)
export const MAX_BULLETS = 48;
export const AUTO_AIM_RANGE = 760;
export const PELLET_COUNT = 12;
export const PELLET_R = 9;
export const PELLET_RESPAWN_MS = 6_000;
export const PELLET_HP = 15;
export const SCORE_HIT = 8;
export const SCORE_KILL = 40;
export const SCORE_PELLET = 5;
export const MAX_EVENTS = 12;

export const FIRE_COLORS = [
  "#ff3b5c", "#ff8a00", "#ffd60a", "#3df07c",
  "#00e5c7", "#4da3ff", "#b45cff", "#ff4fd8",
] as const;

/* موانع ثابت میدان — [x, y, w, h]؛ چیدمان متقارن تا بازی منصفانه باشد */
export const OBSTACLES: readonly [number, number, number, number][] = [
  [180, 110, 100, 250],
  [1000, 110, 100, 250],
  [180, 440, 100, 250],
  [1000, 440, 100, 250],
  [550, 80, 180, 80],
  [550, 640, 180, 80],
  [555, 345, 170, 110],
];

/* ---------- انواع ---------- */

export type FirePlayer = {
  id: string;
  name: string;
  ci: number; // اندیس رنگ
  x: number;
  y: number;
  angle: number; // جهت نشانه‌گیری
  hp: number;
  score: number;
  kills: number;
  deaths: number;
  mvx: number; // بردار حرکت (واحد؛ صفر = ایست)
  mvy: number;
  aim: number | null; // null = نشانه‌گیری خودکار سرور
  lastShotMs: number; // ساعت دیوار — کف فاصله شلیک
  deadUntil: number; // زمان شبیه‌سازی؛ کوچکتر از simMs یعنی زنده
  lastInputMs: number; // ساعت دیوار — برای شناخت بازیکن بی‌پاسخ
  lfa?: number; // آخرین fireAt اعمال‌شده — کرسر جلوگیری از شلیک دوباره
};

export type FireBullet = { o: string; x: number; y: number; a: number; born: number };

export type FirePellet = { x: number; y: number; back: number }; // back > simMs یعنی برداشته‌شده

export type FireEvent =
  | { k: "kill"; a: string; v: string; t: number }
  | { k: "hit"; a: string; v: string; t: number };

export type FireRankRow = { id: string; rank: number; score: number; kills: number; deaths: number };

export type FireState = {
  game: typeof FIRE_GAME_SLUG;
  startedAtMs: number; // شبیه‌سازی زمان صفر = همین مقدار (بعد از شمارش معکوس)
  seed: number;
  simMs: number; // آخرین گام شبیه‌سازی‌شده (می‌تواند منفی باشد در شمارش معکوس)
  players: FirePlayer[];
  bullets: FireBullet[];
  pellets: FirePellet[];
  events: FireEvent[];
  result: FireRankRow[] | null;
  resultWritten: boolean;
  rc?: number; // شمارنده RNG دانه‌دار — شبیه‌سازی یکسان روی همه نمونه‌های سرورless
};

/* ---------- کمکی ---------- */

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/* RNG دانه‌دار (mulberry32) — روی سرورless چند نمونه همزمان از یک پایه
   شبیه‌سازی می‌کنند؛ تصادفِ Math.random باعث واگرایی نمونه‌ها می‌شد.
   با دانه seed + شمارنده rc همه نمونه‌ها دقیقاً همان دنباله را می‌سازند. */
function seededRand(seed: number, call: number): () => number {
  let a = (seed ^ Math.imul(call + 1, 0x9e3779b9)) | 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

export function circleRectPush(x: number, y: number, r: number, rx: number, ry: number, rw: number, rh: number): [number, number] {
  const cx = clamp(x, rx, rx + rw);
  const cy = clamp(y, ry, ry + rh);
  const dx = x - cx;
  const dy = y - cy;
  const d = Math.hypot(dx, dy);
  if (d >= r) return [x, y];
  if (d > 0.0001) {
    return [cx + (dx / d) * r, cy + (dy / d) * r];
  }
  /* مرکز داخل مستطیل — کمترین نفوذ را پیدا کن */
  const left = x - rx;
  const right = rx + rw - x;
  const top = y - ry;
  const bottom = ry + rh - y;
  const m = Math.min(left, right, top, bottom);
  if (m === left) return [rx - r, y];
  if (m === right) return [rx + rw + r, y];
  if (m === top) return [x, ry - r];
  return [x, ry + rh + r];
}

function pointInRect(x: number, y: number, rx: number, ry: number, rw: number, rh: number): boolean {
  return x >= rx && x <= rx + rw && y >= ry && y <= ry + rh;
}

function bulletHitsObstacle(x: number, y: number): boolean {
  for (const [rx, ry, rw, rh] of OBSTACLES) {
    if (x >= rx - BULLET_R && x <= rx + rw + BULLET_R && y >= ry - BULLET_R && y <= ry + rh + BULLET_R) {
      if (pointInRect(x, y, rx, ry, rw, rh)) return true;
    }
  }
  return false;
}

/** نقطه آزاد دور از بازیکنان زنده — بهترین از چند نامزد تصادفیِ دانه‌دار */
function safeSpot(st: FireState, ignoreId: string | null): [number, number] {
  const rng = seededRand(st.seed, st.rc ?? 0);
  st.rc = (st.rc ?? 0) + 1;
  let best: [number, number] = [MAP_W / 2, MAP_H / 2];
  let bestScore = -1;
  for (let i = 0; i < 14; i++) {
    const x = PLAYER_R + 26 + rng() * (MAP_W - 2 * (PLAYER_R + 26));
    const y = PLAYER_R + 26 + rng() * (MAP_H - 2 * (PLAYER_R + 26));
    let ok = true;
    for (const [rx, ry, rw, rh] of OBSTACLES) {
      const cx = clamp(x, rx, rx + rw);
      const cy = clamp(y, ry, ry + rh);
      if (dist(x, y, cx, cy) < PLAYER_R + 14) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    let nearest = Infinity;
    for (const p of st.players) {
      if (p.id === ignoreId || p.deadUntil > 0) continue;
      nearest = Math.min(nearest, dist(x, y, p.x, p.y));
    }
    const s = Number.isFinite(nearest) ? nearest : 9999;
    if (s > bestScore) {
      bestScore = s;
      best = [x, y];
    }
  }
  return best;
}

function spawnPellets(): FirePellet[] {
  const out: FirePellet[] = [];
  for (let i = 0; i < PELLET_COUNT; i++) {
    let x = 0;
    let y = 0;
    let ok = false;
    for (let t = 0; t < 60 && !ok; t++) {
      x = 40 + Math.random() * (MAP_W - 80);
      y = 40 + Math.random() * (MAP_H - 80);
      ok = !OBSTACLES.some(([rx, ry, rw, rh]) => pointInRect(x, y, rx - PELLET_R - 6, ry - PELLET_R - 6, rw + 2 * (PELLET_R + 6), rh + 2 * (PELLET_R + 6)));
      if (ok) ok = !out.some((p) => dist(p.x, p.y, x, y) < 90);
    }
    out.push({ x: Math.round(x), y: Math.round(y), back: 0 });
  }
  return out;
}

/* ---------- ساخت وضعیت اولیه ---------- */

export function createFireState(
  players: { id: string; name: string }[],
  seed: number,
  startedAtMs: number,
): FireState {
  const n = players.length;
  const st: FireState = {
    game: FIRE_GAME_SLUG,
    startedAtMs,
    seed,
    simMs: -COUNTDOWN_MS,
    players: [],
    bullets: [],
    pellets: spawnPellets(),
    events: [],
    result: null,
    resultWritten: false,
    rc: 0,
  };
  players.forEach((p, i) => {
    /* چیدمان دایره‌ای متقارن دور مرکز */
    const a = (i / n) * Math.PI * 2 - Math.PI / 2 + (Math.random() - 0.5) * 0.3;
    const d = 300;
    let x = MAP_W / 2 + Math.cos(a) * d;
    let y = MAP_H / 2 + Math.sin(a) * d;
    x = clamp(x, PLAYER_R + 30, MAP_W - PLAYER_R - 30);
    y = clamp(y, PLAYER_R + 30, MAP_H - PLAYER_R - 30);
    for (const [rx, ry, rw, rh] of OBSTACLES) {
      [x, y] = circleRectPush(x, y, PLAYER_R + 8, rx, ry, rw, rh);
    }
    st.players.push({
      id: p.id,
      name: p.name,
      ci: i % FIRE_COLORS.length,
      x: Math.round(x),
      y: Math.round(y),
      angle: Math.atan2(MAP_H / 2 - y, MAP_W / 2 - x),
      hp: START_HP,
      score: 0,
      kills: 0,
      deaths: 0,
      mvx: 0,
      mvy: 0,
      aim: null,
      lastShotMs: 0,
      deadUntil: 0,
      lastInputMs: startedAtMs - COUNTDOWN_MS,
    });
  });
  return st;
}

/* ---------- ورودی بازیکن ---------- */

/** آیا پاره‌خط از «me» تا هدف از میان موانع رد می‌شود؟ */
function lineClear(me: FirePlayer, tx: number, ty: number): boolean {
  const d = dist(me.x, me.y, tx, ty);
  const steps = Math.max(2, Math.ceil(d / 24));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = me.x + (tx - me.x) * t;
    const y = me.y + (ty - me.y) * t;
    for (const [rx, ry, rw, rh] of OBSTACLES) {
      if (pointInRect(x, y, rx + BULLET_R, ry + BULLET_R, rw - 2 * BULLET_R, rh - 2 * BULLET_R)) {
        return false;
      }
    }
  }
  return true;
}

export function autoAim(st: FireState, me: FirePlayer): number {
  let best: FirePlayer | null = null;
  let bestD = AUTO_AIM_RANGE;
  let bestVisible: FirePlayer | null = null;
  let bestVD = AUTO_AIM_RANGE;
  for (const p of st.players) {
    if (p.id === me.id || p.deadUntil > st.simMs) continue;
    const d = dist(p.x, p.y, me.x, me.y);
    /* نزدیک‌ترین هدف در تیررس */
    if (d < bestD) {
      bestD = d;
      best = p;
    }
    /* ترجیح: نزدیک‌ترین هدف با خط دید باز — شلیک به دیوار هدر نرود */
    if (d < bestVD && lineClear(me, p.x, p.y)) {
      bestVD = d;
      bestVisible = p;
    }
  }
  const target = bestVisible ?? best;
  if (target) return Math.atan2(target.y - me.y, target.x - me.x);
  return me.angle;
}

export type FireInput = { mv: [number, number]; aim: number | null; fire: boolean };

/* ورودی لحظه‌ای هر بازیکن — در ستون fireInput ردیف خودش ذخیره می‌شود؛
   هر بازیکن فقط ردیف خودش را می‌نویسد، پس هیچ رقابتی با نویسنده‌های
   وضعیت مسابقه ندارد و روی شبکه‌های کند هم گم نمی‌شود. */
export type FirePlayerInput = { mv: [number, number]; aim: number | null; fireAt: number };

/** تجزیهٔ امن fireInput — نامعتبر = null */
export function parseFireInput(raw: string | null | undefined): FirePlayerInput | null {
  try {
    const d = JSON.parse(raw ?? "{}") as { mv?: unknown; aim?: unknown; fireAt?: unknown };
    if (!d || typeof d !== "object") return null;
    const rawMv = Array.isArray(d.mv) ? (d.mv as unknown[]) : null;
    const okMv =
      !!rawMv &&
      rawMv.length === 2 &&
      rawMv.every((v) => typeof v === "number" && Number.isFinite(v));
    const mv: [number, number] =
      okMv && rawMv ? [rawMv[0] as number, rawMv[1] as number] : [0, 0];
    const aim = typeof d.aim === "number" && Number.isFinite(d.aim) ? d.aim : null;
    const fireAt = typeof d.fireAt === "number" && Number.isFinite(d.fireAt) ? d.fireAt : 0;
    return { mv, aim, fireAt };
  } catch {
    return null;
  }
}

/**
 * اعمال ورودی‌های همهٔ بازیکنان — از ردیف اعضا خوانده می‌شود، بیرون از گام شبیه‌سازی.
 * شلیک برای هر fireAt فقط یک‌بار اعمال می‌شود (کرسر lfa در وضعیت مسابقه) تا
 * چند نمونهٔ همزمان سرورless همان شلیک را دوباره تولید نکنند.
 */
export function applyInputs(
  st: FireState,
  inputs: Record<string, FirePlayerInput>,
  wallNow: number,
): void {
  for (const p of st.players) {
    const inp = inputs[p.id];
    if (!inp) continue;
    let [mx, my] = inp.mv;
    if (!Number.isFinite(mx) || !Number.isFinite(my)) {
      mx = 0;
      my = 0;
    }
    const mag = Math.hypot(mx, my);
    if (mag > 1) {
      mx /= mag;
      my /= mag;
    }
    if (Math.abs(mx) < 0.05 && Math.abs(my) < 0.05) {
      mx = 0;
      my = 0;
    }
    p.mvx = mx;
    p.mvy = my;
    p.lastInputMs = wallNow;
    if (inp.aim !== null && Number.isFinite(inp.aim)) {
      p.aim = clamp(inp.aim, -Math.PI * 4, Math.PI * 4);
    } else {
      p.aim = null;
    }
    /* شلیک — فقط درخواست‌های همین مسابقه، فقط یک‌بار برای هر درخواست */
    if (
      inp.fireAt >= st.startedAtMs &&
      inp.fireAt > (p.lfa ?? 0) &&
      inp.fireAt <= wallNow &&
      inp.fireAt - p.lastShotMs >= FIRE_CD_MIN_MS &&
      p.deadUntil <= st.simMs &&
      st.simMs >= 0
    ) {
      p.lfa = inp.fireAt;
      p.lastShotMs = inp.fireAt;
      p.angle = p.aim ?? autoAim(st, p);
      if (st.bullets.length < MAX_BULLETS) {
        st.bullets.push({
          o: p.id,
          x: p.x + Math.cos(p.angle) * (PLAYER_R + 6),
          y: p.y + Math.sin(p.angle) * (PLAYER_R + 6),
          a: p.angle,
          born: Math.max(st.simMs, inp.fireAt - st.startedAtMs),
        });
      }
    }
  }
}

/* ---------- یک گام شبیه‌سازی ---------- */

function stepSim(st: FireState, dtMs: number): void {
  /* شمارش معکوس — هیچ حرکت و رویدادی قبل از شروع رسمی */
  if (st.simMs < 0) {
    st.simMs += dtMs;
    return;
  }
  const dt = dtMs / 1000;
  const rage = st.simMs >= MATCH_MS - RAGE_LEFT_MS;
  const mult = rage ? RAGE_SPEED : 1;

  /* حرکت بازیکنان زنده */
  for (const p of st.players) {
    if (p.deadUntil > st.simMs) continue;
    if (p.mvx !== 0 || p.mvy !== 0) {
      p.x += p.mvx * BASE_SPEED * mult * dt;
      p.y += p.mvy * BASE_SPEED * mult * dt;
    }
    p.x = clamp(p.x, PLAYER_R, MAP_W - PLAYER_R);
    p.y = clamp(p.y, PLAYER_R, MAP_H - PLAYER_R);
    for (const [rx, ry, rw, rh] of OBSTACLES) {
      const [nx, ny] = circleRectPush(p.x, p.y, PLAYER_R, rx, ry, rw, rh);
      p.x = nx;
      p.y = ny;
    }
    if (p.aim !== null) p.angle = p.aim;
    else if (p.mvx !== 0 || p.mvy !== 0) p.angle = Math.atan2(p.mvy, p.mvx);
  }

  /* گلوله‌ها */
  const step = BULLET_SPEED * dt;
  for (let i = st.bullets.length - 1; i >= 0; i--) {
    const b = st.bullets[i];
    b.x += Math.cos(b.a) * step;
    b.y += Math.sin(b.a) * step;
    if (b.x < 0 || b.x > MAP_W || b.y < 0 || b.y > MAP_H || bulletHitsObstacle(b.x, b.y)) {
      st.bullets.splice(i, 1);
      continue;
    }
    if (st.simMs - b.born > BULLET_TTL_MS) {
      st.bullets.splice(i, 1);
      continue;
    }
    /* برخورد با بازیکنان */
    for (const p of st.players) {
      if (p.id === b.o || p.deadUntil > st.simMs) continue;
      if (dist(p.x, p.y, b.x, b.y) > PLAYER_R + BULLET_R) continue;
      const killer = st.players.find((k) => k.id === b.o);
      st.bullets.splice(i, 1);
      if (!killer) break;
      p.hp -= DMG;
      if (p.hp <= 0) {
        p.hp = 0;
        p.deadUntil = st.simMs + RESPAWN_MS;
        p.deaths++;
        p.mvx = 0;
        p.mvy = 0;
        killer.kills++;
        killer.score += SCORE_KILL;
        st.events.push({ k: "kill", a: killer.id, v: p.id, t: st.simMs });
      } else {
        killer.score += SCORE_HIT;
        st.events.push({ k: "hit", a: killer.id, v: p.id, t: st.simMs });
      }
      break;
    }
  }

  /* خوراکی‌ها */
  for (const pel of st.pellets) {
    if (pel.back > st.simMs) continue;
    for (const p of st.players) {
      if (p.deadUntil > st.simMs) continue;
      if (dist(p.x, p.y, pel.x, pel.y) > PLAYER_R + PELLET_R + 2) continue;
      pel.back = st.simMs + PELLET_RESPAWN_MS;
      const [nx, ny] = safeSpot(st, p.id);
      pel.x = Math.round(nx);
      pel.y = Math.round(ny);
      p.score += SCORE_PELLET;
      p.hp = Math.min(START_HP, p.hp + PELLET_HP);
      break;
    }
  }

  /* بازتولید حذف‌شده‌ها */
  for (const p of st.players) {
    if (p.deadUntil > 0 && p.deadUntil <= st.simMs) {
      p.deadUntil = 0;
      p.hp = START_HP;
      const [x, y] = safeSpot(st, p.id);
      p.x = Math.round(x);
      p.y = Math.round(y);
      p.mvx = 0;
      p.mvy = 0;
    }
  }

  st.simMs += dtMs;
}

/** پیش‌بردن شبیه‌سازی تا «همین لحظه» — از هر مسیر GET/POST صدها می‌شود */
export function simulate(st: FireState, wallNow: number): void {
  let target = wallNow - st.startedAtMs;
  if (target <= st.simMs) return;
  if (target > MATCH_MS) target = MATCH_MS;
  let guard = 0;
  while (st.simMs < target - 0.5 && guard++ < 4000) {
    const dt = Math.min(TICK_MS, target - st.simMs);
    stepSim(st, dt);
  }
  st.simMs = Math.max(st.simMs, target - 0.5);
  if (st.simMs >= MATCH_MS && !st.result) finishMatch(st);
  /* حلقه رویدادها محدود بماند — کلاینت فقط تازه‌ها را می‌خواهد */
  if (st.events.length > MAX_EVENTS) st.events = st.events.slice(-MAX_EVENTS);
}

/* ---------- پایان مسابقه ---------- */

export function ranking(st: FireState): FireRankRow[] {
  const sorted = [...st.players].sort(
    (a, b) => b.score - a.score || b.kills - a.kills || a.deaths - b.deaths || a.id.localeCompare(b.id),
  );
  return sorted.map((p, i) => ({
    id: p.id,
    rank: i + 1,
    score: p.score,
    kills: p.kills,
    deaths: p.deaths,
  }));
}

function finishMatch(st: FireState): void {
  st.result = ranking(st);
  /* پاک‌سازی انتهای مسابقه — میدان آرام می‌شود */
  st.bullets = [];
}

/* ---------- سریال‌سازی ---------- */

export function parseFireState(raw: string): FireState | null {
  try {
    const d = JSON.parse(raw) as FireState;
    if (
      d &&
      d.game === FIRE_GAME_SLUG &&
      typeof d.startedAtMs === "number" &&
      typeof d.simMs === "number" &&
      Array.isArray(d.players) &&
      d.players.length >= 2 &&
      Array.isArray(d.bullets) &&
      Array.isArray(d.pellets) &&
      Array.isArray(d.events)
    ) {
      return d;
    }
  } catch {
    /* خراب */
  }
  return null;
}

/* ---------- نمای فشرده برای SSE (به‌ازای هر عضو) ---------- */

export type FireView = {
  startedAtMs: number;
  simMs: number; // زمان شبیه‌سازی در لحظه اسنپ‌شات
  rage: boolean;
  matchMs: typeof MATCH_MS;
  /** [id, x, y, angle(۲ رقم اعشار), hp, score, deadUntilSimMs, ci] */
  ps: [string, number, number, number, number, number, number, number][];
  /** [x, y, angle(۲ رقم اعشار)] — سرعت همه گلوله‌ها یکسان */
  bs: [number, number, number][];
  /** [x, y] خوراکی‌های حاضر */
  pl: [number, number][];
  /** رویدادهای تازه برای فید حذف — فقط kill ها */
  ev: { k: string; a: string; v: string; t: number }[];
  result: FireRankRow[] | null;
};

export function buildFireView(st: FireState): FireView {
  /* شبیه‌سازی تا لحظه ارسال پیش رفته — نمایی از همان گام */
  const ps = st.players.map(
    (p) =>
      [
        p.id,
        Math.round(p.x),
        Math.round(p.y),
        Math.round(p.angle * 100) / 100,
        Math.max(0, Math.round(p.hp)),
        p.score,
        Math.round(p.deadUntil),
        p.ci,
      ] as [string, number, number, number, number, number, number, number],
  );
  const bs = st.bullets.map(
    (b) => [Math.round(b.x), Math.round(b.y), Math.round(b.a * 100) / 100] as [number, number, number],
  );
  const pl = st.pellets.filter((p) => p.back <= st.simMs).map((p) => [p.x, p.y] as [number, number]);
  const ev = st.events.slice(-6).map((e) => ({ k: e.k, a: e.a, v: "v" in e ? e.v : "", t: e.t }));
  return {
    startedAtMs: st.startedAtMs,
    simMs: st.simMs,
    rage: st.simMs >= MATCH_MS - RAGE_LEFT_MS && st.simMs < MATCH_MS,
    matchMs: MATCH_MS,
    ps,
    bs,
    pl,
    ev,
    result: st.result,
  };
}
