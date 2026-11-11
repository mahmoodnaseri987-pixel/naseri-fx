/* موتور بازی «نبرد دایره‌ها» — نسخه آنلاین گروهی آرنا.
   شبیه‌سازی کاملاً قطعی (Deterministic): با seed یکسان و گام زمانی ثابت ۱/۶۰ ثانیه،
   همه مرورگرها دقیقاً همان مسابقه را می‌سازند — بدون نیاز به WebSocket.
   میزبان هر ~۱ ثانیه اسنپ‌شات مرجع می‌فرستد تا خطای ممیز شناور مرورگرها اصلاح شود.
   این فایل نباید به DOM وابسته باشد (سمت سرور هم ایمپورت می‌شود). */

export const NABARD_GAME_SLUG = "nabard-live";

export const ARENA_R = 500; // شعاع مجازی آرنا
export const RAY_SLOTS = 12; // جایگاه خط‌های دور دایره
export const LINES_START = 10; // خط اولیه هر دایره
export const HIT_LIMIT = 3; // ضربه سوم از یک حریف = انفجار
export const PAIR_CD = 0.7; // فاصله حداقل دو برخورد یک جفت
export const GRACE_T = 1.6; // ثانیه اول بدون ضربه
export const SUDDEN_AT = 90; // ثانیه شروع مرگ ناگهانی
export const SHRINK_RATE = 4; // کوچک‌شدن آرنا در مرگ ناگهانی
export const COUNTDOWN = 3; // شمارش معکوس شروع
export const WALL_REGEN = 1.2; // هر چند ثانیه دیواره یک خط می‌دهد
export const PRIZE_R = 12;
export const PRIZE_TTL = 5;
export const SHIELD_T = 10;
export const SPIKE_T = 10;
export const BOOST_T = 3; // مدت اثر شتاب
export const BOOST_MULT = 1.45;
export const MAX_BOOSTS = 2; // سقف شتاب هر بازیکن در هر مسابقه
export const TIMESTEP = 1 / 60;

export type PrizeKind = "shield" | "heart" | "spike" | "bomb";

export const NABARD_COLORS = [
  "#ff3b5c", "#ff8a00", "#ffd60a", "#3df07c",
  "#00e5c7", "#4da3ff", "#b45cff", "#ff4fd8",
] as const;

export type NabardCircle = {
  id: string;
  name: string;
  colorIdx: number;
  x: number;
  y: number;
  angle: number;
  speed: number;
  mask: number; // بیت‌های خط‌های فعال
  raySpin: number;
  alive: boolean;
  hitFlash: number;
  kills: number;
  hitsDealt: number;
  shieldT: number;
  spikeT: number;
  boostT: number;
  lastWallRegen: number;
  eliminatedAt: number | null;
};

export type NabardPrize = {
  id: number;
  kind: PrizeKind;
  x: number;
  y: number;
  angle: number;
  speed: number;
  ttl: number;
};

export type NabardEvent =
  | { k: "hit"; a: string; v: string; stolen: boolean }
  | { k: "boom"; a: string; v: string }
  | { k: "out"; v: string }
  | { k: "pickup"; id: string; kind: PrizeKind }
  | { k: "boost"; id: string }
  | { k: "sudden" }
  | { k: "wall"; id: string; gained: boolean };

export type NabardRankRow = {
  id: string;
  rank: number; // از ۱
  lines: number;
  kills: number;
  out: boolean;
};

/* ---------- RNG قطعی (mulberry32) ---------- */

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function popcount(n: number): number {
  let c = n;
  let count = 0;
  while (c) {
    c &= c - 1;
    count++;
  }
  return count;
}

function freeSlot(mask: number): number {
  for (let i = 0; i < RAY_SLOTS; i++) {
    if ((mask & (1 << i)) === 0) return i;
  }
  return -1;
}

export class NabardEngine {
  circles: NabardCircle[] = [];
  byId = new Map<string, NabardCircle>();
  prizes: NabardPrize[] = [];
  events: NabardEvent[] = [];
  hits: Record<string, Record<string, number>> = {};
  boostUsed: Record<string, number> = {};
  time = 0; // ثانیه از شروع (شامل شمارش معکوس)
  phase: "countdown" | "playing" | "over" = "countdown";
  countdownLeft = COUNTDOWN;
  sudden = false;
  arenaR = ARENA_R;
  circleR: number;
  eliminationOrder: string[] = [];

  private rng: () => number;
  private pairCd = new Map<string, number>();
  private pairTie = new Map<string, number>();
  private spikeCd = new Map<string, number>();
  private nextPrizeId = 1;
  private prizeCd = 4;

  constructor(players: { id: string; name: string }[], seed: number) {
    this.rng = mulberry32(seed);
    const n = Math.max(2, players.length);
    this.circleR = 34 * Math.max(0.8, 1 - 0.025 * (n - 2));
    players.forEach((p, i) => {
      const r = this.arenaR - this.circleR - 30;
      let x = 0;
      let y = 0;
      let ok = false;
      for (let tries = 0; tries < 400 && !ok; tries++) {
        const d = Math.sqrt(this.rng()) * r;
        const a = this.rng() * Math.PI * 2;
        x = Math.cos(a) * d;
        y = Math.sin(a) * d;
        ok = this.circles.every((c) => Math.hypot(c.x - x, c.y - y) > this.circleR * 2.7);
      }
      if (!ok) {
        const a = (i / n) * Math.PI * 2;
        const d = r * 0.75;
        x = Math.cos(a) * d;
        y = Math.sin(a) * d;
      }
      let mask = 0;
      for (let b = 0; b < RAY_SLOTS; b++) mask |= 1 << b;
      mask &= ~((1 << 3) | (1 << 9)); // دو جایگاه خالی مثل بازی اصلی
      const c: NabardCircle = {
        id: p.id,
        name: p.name,
        colorIdx: i % NABARD_COLORS.length,
        x,
        y,
        angle: this.rng() * Math.PI * 2 - Math.PI,
        speed: 205 + this.rng() * 55,
        mask,
        raySpin: this.rng() * Math.PI * 2,
        alive: true,
        hitFlash: 0,
        kills: 0,
        hitsDealt: 0,
        shieldT: 0,
        spikeT: 0,
        boostT: 0,
        lastWallRegen: -99,
        eliminatedAt: null,
      };
      this.circles.push(c);
      this.byId.set(p.id, c);
    });
  }

  /* ---------- ورودی بازیکن: شتاب ---------- */

  boost(id: string): boolean {
    if (this.phase !== "playing") return false;
    const c = this.byId.get(id);
    if (!c || !c.alive) return false;
    if ((this.boostUsed[id] ?? 0) >= MAX_BOOSTS) return false;
    this.boostUsed[id] = (this.boostUsed[id] ?? 0) + 1;
    c.boostT = BOOST_T;
    this.events.push({ k: "boost", id });
    return true;
  }

  /* ---------- حلقه شبیه‌سازی ---------- */

  step(dt: number): void {
    if (this.phase === "over") return;
    if (this.phase === "countdown") {
      this.countdownLeft -= dt;
      if (this.countdownLeft <= 0) this.phase = "playing";
      return;
    }

    this.time += dt;
    if (!this.sudden && this.time >= SUDDEN_AT) {
      this.sudden = true;
      this.events.push({ k: "sudden" });
    }
    if (this.sudden) {
      this.arenaR = Math.max(this.circleR * 5, this.arenaR - SHRINK_RATE * dt);
    }

    const boostMult = BOOST_MULT;
    for (const c of this.circles) {
      if (!c.alive) continue;
      if (c.hitFlash > 0) c.hitFlash = Math.max(0, c.hitFlash - dt * 3);
      if (c.shieldT > 0) c.shieldT = Math.max(0, c.shieldT - dt);
      if (c.spikeT > 0) c.spikeT = Math.max(0, c.spikeT - dt);
      if (c.boostT > 0) c.boostT = Math.max(0, c.boostT - dt);
      c.raySpin += 0.35 * dt;
      if (c.raySpin > Math.PI) c.raySpin -= Math.PI * 2;
      const m = c.boostT > 0 ? boostMult : 1;
      c.x += Math.cos(c.angle) * c.speed * m * dt;
      c.y += Math.sin(c.angle) * c.speed * m * dt;
    }

    this.wallCollisions();
    this.pairCollisions();
    this.updatePrizes(dt);
    this.spikeSteals();
    this.checkEnd();
  }

  private wallCollisions(): void {
    const limit = this.arenaR - this.circleR;
    for (const c of this.circles) {
      if (!c.alive) continue;
      const d = Math.hypot(c.x, c.y);
      if (d < limit || d === 0) continue;
      const nx = c.x / d;
      const ny = c.y / d;
      const vx = Math.cos(c.angle);
      const vy = Math.sin(c.angle);
      const dot = vx * nx + vy * ny;
      if (dot > 0) {
        let rx = vx - 2 * dot * nx;
        let ry = vy - 2 * dot * ny;
        // کمی انحراف تصادفی قطعی تا دایره‌ها در مسیر قفل نشوند
        const jitter = (this.rng() - 0.5) * 0.3;
        const cos = Math.cos(jitter);
        const sin = Math.sin(jitter);
        const jx = rx * cos - ry * sin;
        const jy = rx * sin + ry * cos;
        const jdot = jx * nx + jy * ny;
        if (jdot > 0) {
          rx = jx - 2 * jdot * nx;
          ry = jy - 2 * jdot * ny;
        }
        c.angle = Math.atan2(ry, rx);
        c.speed = Math.min(430, c.speed + 55);
        c.x = nx * limit;
        c.y = ny * limit;
        const gained =
          !this.sudden && this.time - c.lastWallRegen >= WALL_REGEN && popcount(c.mask) < RAY_SLOTS;
        if (gained) {
          const slot = freeSlot(c.mask);
          if (slot >= 0) {
            c.mask |= 1 << slot;
            c.lastWallRegen = this.time;
          }
        }
        this.events.push({ k: "wall", id: c.id, gained });
      }
    }
  }

  private pairCollisions(): void {
    const n = this.circles.length;
    for (let i = 0; i < n; i++) {
      const a = this.circles[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < n; j++) {
        const b = this.circles[j];
        if (!b.alive) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 0.0001;
        const minDist = this.circleR * 2;
        if (dist >= minDist) continue;

        const nx = dx / dist;
        const ny = dy / dist;
        const push = (minDist - dist) / 2;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;

        const ma = a.boostT > 0 ? BOOST_MULT : 1;
        const mb = b.boostT > 0 ? BOOST_MULT : 1;
        const inA = Math.cos(a.angle) * nx + Math.sin(a.angle) * ny; // سرعت نزدیک‌شدن A
        const inB = -(Math.cos(b.angle) * nx + Math.sin(b.angle) * ny); // سرعت نزدیک‌شدن B

        if (inA - inB > 0) {
          const e = inA - inB;
          a.angle = Math.atan2(Math.sin(a.angle) - e * ny, Math.cos(a.angle) - e * nx);
          b.angle = Math.atan2(Math.sin(b.angle) + e * ny, Math.cos(b.angle) + e * nx);
          a.speed = Math.max(205, a.speed * 0.965);
          b.speed = Math.max(205, b.speed * 0.965);
        }

        const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
        const cd = this.pairCd.get(key) ?? 0;
        if (this.time < GRACE_T || this.time < cd) continue;

        let attacker: NabardCircle;
        let victim: NabardCircle;
        if (a.shieldT > 0 && b.shieldT > 0) {
          this.pairCd.set(key, this.time + PAIR_CD);
          continue;
        }
        if (a.shieldT > 0) {
          attacker = b;
          victim = a;
          this.pairCd.set(key, this.time + PAIR_CD);
          continue; // برخورد با سپر → فقط جهش
        }
        if (b.shieldT > 0) {
          attacker = a;
          victim = b;
          this.pairCd.set(key, this.time + PAIR_CD);
          continue;
        }
        if (inA > inB + 0.000000001) {
          attacker = a;
          victim = b;
        } else if (inB > inA + 0.000000001) {
          attacker = b;
          victim = a;
        } else {
          const tie = this.pairTie.get(key) ?? 0;
          this.pairTie.set(key, tie + 1);
          attacker = tie % 2 === 0 ? a : b;
          victim = attacker === a ? b : a;
        }
        this.pairCd.set(key, this.time + PAIR_CD);
        this.registerHit(attacker, victim);
      }
    }
  }

  private registerHit(attacker: NabardCircle, victim: NabardCircle): void {
    if (!this.hits[attacker.id]) this.hits[attacker.id] = {};
    const mine = this.hits[attacker.id];
    mine[victim.id] = (mine[victim.id] ?? 0) + 1;
    const count = mine[victim.id];

    attacker.hitsDealt++;
    attacker.hitFlash = 1;
    victim.hitFlash = 1;

    const before = popcount(victim.mask);
    this.removeNearestLine(victim, Math.atan2(victim.y - attacker.y, victim.x - attacker.x));
    const stolen = popcount(victim.mask) < before;
    let attackerGained = false;
    if (stolen && attacker.alive && popcount(attacker.mask) < RAY_SLOTS) {
      const slot = freeSlot(attacker.mask);
      if (slot >= 0) {
        attacker.mask |= 1 << slot;
        attackerGained = true;
      }
    }
    this.events.push({ k: "hit", a: attacker.id, v: victim.id, stolen: attackerGained });

    if (count >= HIT_LIMIT) {
      attacker.kills++;
      this.eliminate(victim);
      this.events.push({ k: "boom", a: attacker.id, v: victim.id });
    } else if (popcount(victim.mask) <= 0) {
      attacker.kills++;
      this.eliminate(victim);
      this.events.push({ k: "out", v: victim.id });
    }
  }

  private removeNearestLine(c: NabardCircle, hitAngle: number): void {
    const rel = hitAngle - c.raySpin;
    const slotAngle = (Math.PI * 2) / RAY_SLOTS;
    const near = (Math.round(rel / slotAngle) % RAY_SLOTS + RAY_SLOTS) % RAY_SLOTS;
    for (let i = 0; i < RAY_SLOTS; i++) {
      const cw = (near + i) % RAY_SLOTS;
      if ((c.mask & (1 << cw)) !== 0) {
        c.mask &= ~(1 << cw);
        return;
      }
      const ccw = ((near - i) % RAY_SLOTS + RAY_SLOTS) % RAY_SLOTS;
      if ((c.mask & (1 << ccw)) !== 0) {
        c.mask &= ~(1 << ccw);
        return;
      }
    }
  }

  private eliminate(c: NabardCircle): void {
    c.alive = false;
    c.mask = 0;
    c.eliminatedAt = this.time;
    this.eliminationOrder.push(c.id);
  }

  /* ---------- جوایز ---------- */

  private spawnPrize(): void {
    const kinds: PrizeKind[] = ["shield", "heart", "spike", "bomb"];
    const kind = kinds[Math.floor(this.rng() * kinds.length)];
    const d = Math.sqrt(this.rng()) * this.arenaR * 0.7;
    const a = this.rng() * Math.PI * 2;
    const p: NabardPrize = {
      id: this.nextPrizeId++,
      kind,
      x: Math.cos(a) * d,
      y: Math.sin(a) * d,
      angle: this.rng() * Math.PI * 2,
      speed: 55 + this.rng() * 50,
      ttl: PRIZE_TTL,
    };
    this.prizes.push(p);
  }

  private updatePrizes(dt: number): void {
    const wall = this.arenaR - PRIZE_R;
    for (let i = this.prizes.length - 1; i >= 0; i--) {
      const p = this.prizes[i];
      p.ttl -= dt;
      if (p.ttl <= 0) {
        this.prizes.splice(i, 1);
        continue;
      }
      p.x += Math.cos(p.angle) * p.speed * dt;
      p.y += Math.sin(p.angle) * p.speed * dt;
      const d = Math.hypot(p.x, p.y);
      if (d > wall && d > 0) {
        const nx = p.x / d;
        const ny = p.y / d;
        const dot = Math.cos(p.angle) * nx + Math.sin(p.angle) * ny;
        if (dot > 0) {
          p.angle = Math.atan2(Math.sin(p.angle) - 2 * dot * ny, Math.cos(p.angle) - 2 * dot * nx);
        }
        p.x = nx * wall;
        p.y = ny * wall;
      }
      // برداشتن توسط نزدیک‌ترین دایره
      let taker: NabardCircle | null = null;
      let best = Infinity;
      for (const c of this.circles) {
        if (!c.alive) continue;
        const dd = Math.hypot(c.x - p.x, c.y - p.y);
        if (dd > this.circleR + PRIZE_R) continue;
        if (dd < best) {
          best = dd;
          taker = c;
        }
      }
      if (taker) {
        this.applyPrize(p, taker);
        this.prizes.splice(i, 1);
      }
    }
    this.prizeCd -= dt;
    if (this.prizeCd <= 0) {
      if (this.prizes.length < 2) {
        this.spawnPrize();
        this.prizeCd = 8 + this.rng() * 3;
      } else {
        this.prizeCd = 3;
      }
    }
  }

  private applyPrize(p: NabardPrize, c: NabardCircle): void {
    if (p.kind === "shield") {
      c.shieldT = SHIELD_T;
    } else if (p.kind === "heart") {
      const before = popcount(c.mask);
      for (let k = 0; k < 3 && popcount(c.mask) < RAY_SLOTS; k++) {
        const slot = freeSlot(c.mask);
        if (slot < 0) break;
        c.mask |= 1 << slot;
      }
      const gained = popcount(c.mask) - before;
      if (gained > 0) {
        // قلب ضربه‌های قبلیِ دریافتی را هم پاک می‌کند (اثر بازی اصلی)
        for (const key of Object.keys(this.hits)) {
          delete this.hits[key][c.id];
        }
      }
    } else if (p.kind === "spike") {
      c.spikeT = SPIKE_T;
    } else if (p.kind === "bomb") {
      if (c.shieldT <= 0) {
        this.removeNearestLine(c, Math.atan2(p.y - c.y, p.x - c.x));
        if (popcount(c.mask) <= 0) {
          this.eliminate(c);
          this.events.push({ k: "out", v: c.id });
        }
      }
    }
    this.events.push({ k: "pickup", id: c.id, kind: p.kind });
  }

  private spikeSteals(): void {
    if (this.time < GRACE_T) return;
    for (const a of this.circles) {
      if (!a.alive || a.spikeT <= 0) continue;
      const dx = Math.cos(a.angle);
      const dy = Math.sin(a.angle);
      const tipX = a.x + dx * this.arenaR;
      const tipY = a.y + dy * this.arenaR;
      for (const v of this.circles) {
        if (!v.alive || v.id === a.id || v.shieldT > 0) continue;
        // فاصله مرکز قربانی از پاره‌خط پرتو
        const px = v.x - (a.x + dx * this.circleR);
        const py = v.y - (a.y + dy * this.circleR);
        const len2 = (tipX - (a.x + dx * this.circleR)) ** 2 + (tipY - (a.y + dy * this.circleR)) ** 2 || 0.000000001;
        let t = (px * (tipX - (a.x + dx * this.circleR)) + py * (tipY - (a.y + dy * this.circleR))) / len2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const qx = a.x + dx * this.circleR + (tipX - (a.x + dx * this.circleR)) * t;
        const qy = a.y + dy * this.circleR + (tipY - (a.y + dy * this.circleR)) * t;
        if (Math.hypot(v.x - qx, v.y - qy) >= this.circleR) continue;
        const key = `s:${a.id}:${v.id}`;
        const cd = this.spikeCd.get(key) ?? 0;
        if (this.time < cd) continue;
        this.spikeCd.set(key, this.time + 0.9);
        this.removeNearestLine(v, Math.atan2(v.y - a.y, v.x - a.x));
        if (popcount(a.mask) < RAY_SLOTS) {
          const slot = freeSlot(a.mask);
          if (slot >= 0) a.mask |= 1 << slot;
        }
        a.hitsDealt++;
        this.events.push({ k: "hit", a: a.id, v: v.id, stolen: true });
        if (popcount(v.mask) <= 0) {
          this.eliminate(v);
          this.events.push({ k: "out", v: v.id });
        }
      }
    }
  }

  private checkEnd(): void {
    const alive = this.circles.filter((c) => c.alive);
    if (alive.length <= 1) {
      this.phase = "over";
      for (const c of alive) this.eliminationOrder = this.eliminationOrder.filter((id) => id !== c.id);
    }
  }

  /* ---------- رتبه‌بندی ---------- */

  getRanking(): NabardRankRow[] {
    const alive = this.circles.filter((c) => c.alive);
    const dead = [...this.eliminationOrder]
      .reverse()
      .map((id) => this.byId.get(id))
      .filter((c): c is NabardCircle => Boolean(c));
    const ordered = [
      ...alive.sort((x, y) => popcount(y.mask) - popcount(x.mask) || y.kills - x.kills || y.hitsDealt - x.hitsDealt),
      ...dead,
    ];
    return ordered.map((c, i) => ({
      id: c.id,
      rank: i + 1,
      lines: popcount(c.mask),
      kills: c.kills,
      out: !c.alive,
    }));
  }
}

/* ---------- سیگنالینگ WebRTC (بستهٔ SDP/ICE روی مسیر اتاق) ----------
   برای ساخت پیوند مستقیم DataChannel بین مهمان و میزبان، بسته‌های
   سیگنالینگ موقتاً در وضعیت اتاق نگه داشته می‌شوند و فقط به گیرنده
   نمایش داده می‌شوند؛ پس از ۲۵ ثانیه پاک می‌شوند. */
export type NabardSig = {
  i: string; // شناسهٔ یکتا برای جلوگیری از پردازش دوباره
  f: string; // فرستنده
  to: string; // گیرنده
  k: "offer" | "answer" | "ice";
  sdp?: string;
  cs?: { candidate: string; sdpMid?: string | null; sdpMLineIndex?: number | null }[];
  at: number; // زمان ثبت سرور
};

const SIG_TTL_MS = 25_000;

function validSig(s: unknown): s is NabardSig {
  if (typeof s !== "object" || s === null) return false;
  const v = s as Partial<NabardSig>;
  if (typeof v.i !== "string" || typeof v.f !== "string" || typeof v.to !== "string") return false;
  if (v.k !== "offer" && v.k !== "answer" && v.k !== "ice") return false;
  if (typeof v.at !== "number" || !Number.isFinite(v.at)) return false;
  return true;
}

/* ---------- اسنپ‌شات (میزبان → همه) ----------
   ردیف هر دایره: [id, x, y, angle, mask, alive, shieldT, spikeT] */

export type NabardSnap = {
  t: number; // زمان سرور
  el: number; // ثانیه شبیه‌سازی
  cs: [string, number, number, number, number, number, number, number][];
};

export function encodeSnap(e: NabardEngine, t: number): NabardSnap {
  return {
    t,
    el: Math.round(e.time * 100) / 100,
    cs: e.circles.map(
      (c) =>
        [
          c.id,
          Math.round(c.x * 10) / 10,
          Math.round(c.y * 10) / 10,
          Math.round(c.angle * 1000) / 1000,
          c.mask,
          c.alive ? 1 : 0,
          Math.round(c.shieldT * 10) / 10,
          Math.round(c.spikeT * 10) / 10,
        ] as [string, number, number, number, number, number, number, number],
    ),
  };
}

/** اصلاح نرم موقعیت‌ها با اسنپ‌شات میزبان — فقط اگر تازه باشد */
export function applySnap(e: NabardEngine, snap: NabardSnap, lerp: number): boolean {
  if (!Number.isFinite(snap.el) || Math.abs(snap.el - e.time) > 2.5) return false;
  let applied = 0;
  for (const row of snap.cs) {
    const c = e.byId.get(row[0]);
    if (!c || !c.alive) continue;
    const [ , x, y, angle, mask, alive, shieldT, spikeT ] = row;
    c.x += (x - c.x) * lerp;
    c.y += (y - c.y) * lerp;
    let diff = angle - c.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    c.angle += diff * lerp;
    c.mask = mask;
    c.alive = alive === 1;
    c.shieldT = shieldT;
    c.spikeT = spikeT;
    if (!c.alive && !e.eliminationOrder.includes(c.id)) e.eliminationOrder.push(c.id);
    applied++;
  }
  return applied > 0;
}

/* ---------- وضعیت اتاق نبرد (JSON داخل Room.state) ---------- */

export type NabardRoomState = {
  game: typeof NABARD_GAME_SLUG;
  startedAtMs: number;
  seed: number;
  players: { id: string; name: string }[];
  bq: { id: string; t: number; n?: string }[]; // صف شتاب‌ها با زمان سرور — n: ضدتکرار برای مسیر مستقیم
  snap: NabardSnap | null;
  result: NabardRankRow[] | null;
  sig?: NabardSig[]; // سیگنالینگ WebRTC در جریان — زودگذر
};

export function parseNabardState(raw: string): NabardRoomState | null {
  try {
    const data = JSON.parse(raw) as NabardRoomState;
    if (
      data &&
      data.game === NABARD_GAME_SLUG &&
      typeof data.startedAtMs === "number" &&
      typeof data.seed === "number" &&
      Array.isArray(data.players) &&
      data.players.length >= 2
    ) {
      return {
        ...data,
        bq: Array.isArray(data.bq)
          ? data.bq
              .filter((b) => b && typeof b.id === "string" && typeof b.t === "number")
              .map((b) => (typeof b.n === "string" ? { id: b.id, t: b.t, n: b.n.slice(0, 64) } : { id: b.id, t: b.t }))
          : [],
        snap: data.snap ?? null,
        result: data.result ?? null,
        sig: Array.isArray(data.sig) ? data.sig.filter(validSig).filter((s) => Date.now() - s.at < SIG_TTL_MS).slice(-64) : [],
      };
    }
  } catch {
    /* خراب */
  }
  return null;
}

/** امتیاز نهایی بر اساس رتبه */
export function pointsForRank(rank: number): number {
  if (rank === 1) return 100;
  if (rank === 2) return 75;
  if (rank === 3) return 60;
  return 40;
}
