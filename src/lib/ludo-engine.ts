/* ================================================================
   بازی «منچ» — مغز سمت سرور
   ================================================================
   وضعیت مسابقه در ستون state اتاق ذخیره می‌شود؛ همهٔ تغییرها با
   «seq» رو به جلو شماره‌گذاری شده‌اند تا روی serverless هیچ نوشتهٔ
   کهنه‌ای روی پایهٔ تازه‌تر بازنویسی نشود (الگوی همان میدان آتش).
   این ماژول فقط منطق است؛ نوشتن در دیتابیس با arena-live و مسیر action
   انجام می‌شود. کلاینت هرگز نباید این فایل را ایمپورت کند — برای قوانین
   از ludo-shared.ts استفاده می‌کند.
   ================================================================ */

import {
  LUDO_BOT_MOVE_MIN,
  LUDO_BOT_MOVE_VAR,
  LUDO_BOT_ROLL_MIN,
  LUDO_BOT_ROLL_VAR,
  LUDO_COLUMN_START,
  LUDO_GAME_SLUG,
  LUDO_HOME_STEP,
  LUDO_MOVE_MS,
  LUDO_PIECES,
  LUDO_START_ABS,
  LUDO_START_DELAY_MS,
  LUDO_SURPRISE_ALL,
  LUDO_SURPRISE_COUNT,
  LUDO_SURPRISE_LABEL,
  LUDO_SURPRISE_POOL,
  LUDO_TURN_MS,
  ludoAbsCellOf,
  ludoActionsFor,
  ludoColorsFor,
  ludoIsStartCell,
  ludoPiecesHome,
  ludoTotalSteps,
  type LudoAction,
  type LudoColor,
  type LudoRoomState,
  type LudoSurpriseKind,
  type LudoView,
} from "@/lib/ludo-shared";
import { isBotId } from "@/lib/arena-registry";

/* ---------- ابزارهای محلی ---------- */

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function colorMap(st: LudoRoomState): Record<string, LudoColor> {
  return Object.fromEntries(Object.entries(st.players).map(([id, p]) => [id, p.color]));
}

/* ---------- ساخت وضعیت شروع ---------- */

export function createLudoState(members: { id: string; name: string }[]): LudoRoomState {
  const colors = ludoColorsFor(Math.min(4, members.length));
  const players: Record<string, LudoRoomState["players"][string]> = {};
  const pieces: Record<string, number[]> = {};
  members.slice(0, 4).forEach((m, i) => {
    players[m.id] = { id: m.id, name: m.name, color: colors[i] };
    pieces[m.id] = Array.from({ length: LUDO_PIECES }, () => -1);
  });
  const order = members.slice(0, 4).map((m) => m.id);

  /* ۵ خانهٔ سورپرایز با جای و اثر تصادفی — برای همهٔ بازیکنان همین مسابقه یکی */
  const cells = shuffle([...LUDO_SURPRISE_POOL]).slice(0, LUDO_SURPRISE_COUNT);
  const kinds = shuffle([...LUDO_SURPRISE_ALL]);
  const surpriseKind: Record<number, LudoSurpriseKind> = {};
  cells.forEach((cell, i) => {
    surpriseKind[cell] = kinds[i];
  });

  const now = Date.now();
  return {
    game: LUDO_GAME_SLUG,
    startedAtMs: now + LUDO_START_DELAY_MS,
    seq: 1,
    order,
    players,
    pieces,
    finishedAt: {},
    turnId: order[0] ?? "",
    dice: null,
    rolls: 0,
    skipNext: {},
    surprise: cells,
    surpriseKind,
    deadline: now + LUDO_START_DELAY_MS,
    result: null,
  };
}

/* ---------- خواندن وضعیت از JSON خام ---------- */

export function parseLudoState(raw: string): LudoRoomState | null {
  try {
    const d = JSON.parse(raw) as LudoRoomState & {
      dice?: { v?: unknown; a?: unknown; b?: unknown } | null;
    };
    /* مهاجرت از حالت قدیمی دو‌تاس ({a,b}) به یک‌تاس ({v}) — جمع دو تاس */
    if (d.dice !== null && d.dice !== undefined) {
      if (typeof d.dice.v === "number") {
        d.dice = { v: Math.max(1, Math.min(6, Math.round(d.dice.v))) };
      } else if (typeof d.dice.a === "number" && typeof d.dice.b === "number") {
        d.dice = { v: Math.max(2, Math.min(12, d.dice.a + d.dice.b)) };
      } else {
        d.dice = null;
      }
    }
    if (
      d &&
      d.game === LUDO_GAME_SLUG &&
      typeof d.startedAtMs === "number" &&
      typeof d.seq === "number" &&
      Array.isArray(d.order) &&
      d.order.length <= 4 &&
      d.players &&
      typeof d.players === "object" &&
      d.pieces &&
      typeof d.turnId === "string" &&
      Array.isArray(d.surprise) &&
      d.surprise.length === LUDO_SURPRISE_COUNT &&
      d.surpriseKind &&
      (d.result === null || Array.isArray(d.result))
    ) {
      return d;
    }
  } catch {
    /* خراب — حالت خالی */
  }
  return null;
}

/* ---------- تاس ---------- */

export function rollDice(): { v: number } {
  return { v: 1 + Math.floor(Math.random() * 6) };
}

/* ---------- رخدادها برای چت سیستمی ---------- */

export type LudoEvent =
  | { kind: "capture"; actor: string; victim: string }
  | { kind: "surprise"; actor: string; surprise: LudoSurpriseKind }
  | { kind: "finished"; actor: string };

/** متن پیام سیستمی چت برای رخدادها — فارسی، مثل بقیهٔ بازی‌ها */
export function ludoEventTexts(events: LudoEvent[], names: Record<string, string>): string[] {
  const name = (id: string) => names[id] ?? "بازیکن";
  const texts: string[] = [];
  for (const ev of events) {
    if (ev.kind === "capture") {
      texts.push(`${name(ev.actor)} مهرهٔ ${name(ev.victim)} را زد! مهره به پایگاه برمی‌گردد.`);
    } else if (ev.kind === "surprise") {
      texts.push(`${name(ev.actor)}: ${LUDO_SURPRISE_LABEL[ev.surprise]}`);
    } else if (ev.kind === "finished") {
      texts.push(`${name(ev.actor)} هر ۴ مهره را به خانه رساند!`);
    }
  }
  return texts;
}

export type LudoOutcome = {
  ok: boolean;
  reason?: "illegal" | "not-turn" | "no-dice" | "gone";
  captured?: string;
  surprise?: LudoSurpriseKind;
  extraRoll: boolean;
  finishedPlayer?: string;
  settled: boolean;
  events: LudoEvent[];
};

/* ---------- اجزای قوانین سمت سرور (منبع حقیقت: ludoActionsFor) ---------- */

/** آیا فرود روی خانهٔ مطلق abs برای این بازیکن بسته است؟ */
function blockedAt(st: LudoRoomState, playerId: string, abs: number): boolean {
  const myColor = st.players[playerId]?.color;
  if (myColor === undefined) return true;
  const owner = LUDO_START_ABS.includes(abs)
    ? (LUDO_START_ABS.indexOf(abs) as LudoColor)
    : null;
  for (const [id, steps] of Object.entries(st.pieces)) {
    const oc = st.players[id]?.color;
    if (oc === undefined) continue;
    for (const s of steps) {
      if (s < 0 || s >= LUDO_HOME_STEP) continue;
      if (ludoAbsCellOf(oc, s) !== abs) continue;
      if (oc === myColor) return true; // خانهٔ مقصد با مهرهٔ خودمان پر است
      if (owner !== null && oc === owner) return true; // خانهٔ شروعِ صاحب‌دار
    }
  }
  return false;
}

/** مهرهٔ قربانی در خانهٔ مطلق — تک‌مهره (بیشترین پیشرفت) زده می‌شود.
    state را درجا تغییر می‌دهد و صاحب مهرهٔ زده‌شده را برمی‌گرداند. */
function captureAtCell(st: LudoRoomState, playerId: string, abs: number): string | null {
  if (ludoIsStartCell(abs)) return null; // خانهٔ امن — زدن ممنوع
  const myColor = st.players[playerId]?.color;
  if (myColor === undefined) return null;
  let best: { id: string; step: number } | null = null;
  for (const [id, steps] of Object.entries(st.pieces)) {
    if (id === playerId) continue;
    const oc = st.players[id]?.color;
    if (oc === undefined) continue;
    for (const s of steps) {
      if (s < 0 || s >= LUDO_HOME_STEP) continue;
      if (ludoAbsCellOf(oc, s) !== abs) continue;
      if (!best || s > best.step) best = { id, step: s };
    }
  }
  if (!best) return null;
  const victimSteps = st.pieces[best.id];
  if (!victimSteps) return null;
  const idx = victimSteps.indexOf(best.step);
  victimSteps[idx >= 0 ? idx : 0] = -1;
  return best.id;
}

/* ---------- نوبت‌ها ---------- */

function botDelay(st: LudoRoomState, min: number, varMs: number): number {
  return min + ((st.seq * 53 + st.deadline) % varMs);
}

function botDeadline(st: LudoRoomState, now: number): number {
  return isBotId(st.turnId)
    ? now + botDelay(st, LUDO_BOT_ROLL_MIN, LUDO_BOT_ROLL_VAR)
    : now + LUDO_TURN_MS;
}

/** مهلت نوبتِ بازیکنِ نوبت‌دار فعلی — بعد از هر جابه‌جایی نوبت صدا زده شود
    (بعد از اتمام کار بازیکن یا خروج او، نوبتِ بعدیِ انسان مهلت کامل می‌گیرد،
    نه چند میلی‌ثانیه — وگرنه تاسش بی‌درنگ خودکار پرتاب می‌شود و نوبت می‌پرد) */
export function ludoTurnDeadline(st: LudoRoomState, now: number): number {
  return botDeadline(st, now);
}

/** نوبت به بازیکن بعدی — پرچم «یک دور بدون تاس» در راه مصرف می‌شود */
function advanceTurn(st: LudoRoomState, now: number): void {
  if (st.order.length === 0) {
    st.turnId = "";
    st.dice = null;
    st.rolls = 0;
    return;
  }
  const curIdx = st.order.indexOf(st.turnId);
  for (let i = 1; i <= st.order.length; i++) {
    const idx = ((curIdx < 0 ? -1 : curIdx) + i) % st.order.length;
    const id = st.order[idx];
    if (st.skipNext[id]) {
      delete st.skipNext[id]; // حق یک دور پرتاب از او گرفته شد — همین‌جا مصرف می‌شود
      continue;
    }
    st.turnId = id;
    st.dice = null;
    st.rolls = 0;
    st.deadline = botDeadline(st, now);
    return;
  }
  /* همه پرچم داشتند — نوبت به اولین نفر برمی‌گردد */
  st.turnId = st.order[0];
  st.dice = null;
  st.rolls = 0;
  st.deadline = botDeadline(st, now);
}

/** نتیجهٔ نهایی — وقتی هیچ بازیکن در-جریانی نمانده باشد (همه رسیده‌اند یا رفته‌اند) */
export function maybeFinish(st: LudoRoomState, now: number): boolean {
  if (st.result || st.order.length > 0) return false;
  const rows = Object.keys(st.players).map((id) => {
    const steps = st.pieces[id] ?? [];
    return {
      id,
      finishedAt: st.finishedAt[id] ?? 0,
      home: ludoPiecesHome(steps),
      steps: ludoTotalSteps(steps),
    };
  });
  rows.sort((a, b) => {
    if (a.finishedAt && b.finishedAt) return a.finishedAt - b.finishedAt;
    if (a.finishedAt) return -1;
    if (b.finishedAt) return 1;
    return b.home * 1000 + b.steps - (a.home * 1000 + a.steps);
  });
  st.result = rows.map((r) => ({ id: r.id, rank: 0, home: r.home, steps: r.steps }));
  st.result.forEach((r, i) => {
    r.rank = i + 1;
  });
  st.deadline = now;
  return true;
}

/* ---------- اعمال اکشن ---------- */

/** اجرای اکشن اعتبارسنجی‌شده — state را درجا تغییر می‌دهد */
function applyAction(
  st: LudoRoomState,
  playerId: string,
  action: LudoAction,
  now: number,
): LudoOutcome {
  const events: LudoEvent[] = [];
  const steps = st.pieces[playerId]!;
  steps[action.piece] = action.newStep;

  let captured: string | undefined;
  let surprise: LudoSurpriseKind | undefined;
  const dice = st.dice!;
  let extraRoll = dice.v === 6; // با هر ۶ پرتاب دوباره

  /* زدن مهرهٔ حریف در مقصد اصلی */
  if (action.abs !== null) {
    const cap = captureAtCell(st, playerId, action.abs);
    if (cap) {
      captured = cap;
      events.push({ kind: "capture", actor: playerId, victim: cap });
    }
  }

  /* سورپرایز خانهٔ مقصد — فقط روی مسیر اصلی و بدون زنجیره */
  if (action.abs !== null && st.surprise.includes(action.abs)) {
    const kind = st.surpriseKind[action.abs];
    surprise = kind;
    events.push({ kind: "surprise", actor: playerId, surprise: kind });
    if (kind === "again") {
      extraRoll = true;
    } else {
      const delta = kind === "fwd4" ? 4 : kind === "fwd3" ? 3 : kind === "back4" ? -4 : -3;
      let s2 = steps[action.piece] + delta;
      if (s2 > LUDO_HOME_STEP) {
        /* رسیدن به خانه باید دقیق باشد — سورپرایزی که از خانه رد شود بی‌اثر است؛
           در این بازی حرکت رو به عقب و فنر نداریم */
      } else {
        if (s2 < 0) s2 = 0; // سازگاری با خانه‌های عقب‌رؤ مسابقه‌های قدیمی
        if (s2 < LUDO_COLUMN_START) {
          const abs2 = ludoAbsCellOf(st.players[playerId]!.color, s2)!;
          if (!blockedAt(st, playerId, abs2)) {
            steps[action.piece] = s2;
            const cap2 = captureAtCell(st, playerId, abs2);
            if (cap2) {
              captured = cap2;
              events.push({ kind: "capture", actor: playerId, victim: cap2 });
            }
          }
          /* مقصد سورپرایز بسته بود — اثر بی‌اثر، مهره می‌ماند */
        } else {
          steps[action.piece] = s2; // سورپرایز جلو می‌تواند مستقیم به ستون خانه‌ها برساند
        }
      }
    }
  }

  st.seq += 1;

  /* پایان کار این بازیکن — هر ۴ مهره رسیده باشد */
  let finishedPlayer: string | undefined;
  if (steps.every((s) => s === LUDO_HOME_STEP)) {
    st.finishedAt[playerId] = now;
    st.order = st.order.filter((id) => id !== playerId);
    finishedPlayer = playerId;
    events.push({ kind: "finished", actor: playerId });
  }

  /* نوبت بعد یا پرتاب دوباره */
  if (finishedPlayer) {
    st.turnId = st.order[0] ?? "";
    st.dice = null;
    st.rolls = 0;
    /* مهلت کامل برای بازیکن بعد — مهلت کوتاه باعث پرش نوبت می‌شد */
    st.deadline = botDeadline(st, now);
  } else if (extraRoll) {
    st.dice = null;
    st.rolls += 1;
    st.deadline = isBotId(playerId)
      ? now + botDelay(st, LUDO_BOT_ROLL_MIN, LUDO_BOT_ROLL_VAR)
      : now + LUDO_TURN_MS;
  } else {
    advanceTurn(st, now);
  }

  const settled = maybeFinish(st, now);
  return { ok: true, captured, surprise, extraRoll, finishedPlayer, settled, events };
}

const deniedOutcome = (reason: NonNullable<LudoOutcome["reason"]>): LudoOutcome => ({
  ok: false,
  reason,
  extraRoll: false,
  settled: false,
  events: [],
});

/** اکشن بازیکن: ورود یا حرکت مهره — با اعتبارسنجی کامل قوانین */
export function ludoApplyPlayerAction(
  st: LudoRoomState,
  playerId: string,
  piece: number,
  now: number,
): LudoOutcome {
  if (st.result) return deniedOutcome("gone");
  if (st.turnId !== playerId) return deniedOutcome("not-turn");
  if (!st.dice) return deniedOutcome("no-dice");
  const legal = ludoActionsFor({
    me: playerId,
    colorOf: colorMap(st),
    pieces: st.pieces,
    dice: st.dice,
    surprise: st.surprise,
  });
  const action = legal.find((a) => a.piece === piece);
  if (!action) return deniedOutcome("illegal");
  return applyAction(st, playerId, action, now);
}

/** پاس — فقط وقتی هیچ اکشن مجازی وجود ندارد */
export function ludoApplyPass(st: LudoRoomState, playerId: string, now: number): LudoOutcome {
  if (st.result) return deniedOutcome("gone");
  if (st.turnId !== playerId) return deniedOutcome("not-turn");
  if (!st.dice) return deniedOutcome("no-dice");
  const legal = ludoActionsFor({
    me: playerId,
    colorOf: colorMap(st),
    pieces: st.pieces,
    dice: st.dice,
    surprise: st.surprise,
  });
  if (legal.length > 0) return deniedOutcome("illegal");
  advanceTurn(st, now);
  st.seq += 1;
  const settled = maybeFinish(st, now);
  return { ok: true, extraRoll: false, settled, events: [] };
}

/* ---------- انتخاب هوشمند ربات و حرکت خودکار ---------- */

/** بهترین اکشن برای ربات (یا بازیکن مهلت‌خورده) — null یعنی پاس */
export function ludoBestAction(st: LudoRoomState, playerId: string): LudoAction | null {
  if (!st.dice) return null;
  const legal = ludoActionsFor({
    me: playerId,
    colorOf: colorMap(st),
    pieces: st.pieces,
    dice: st.dice,
    surprise: st.surprise,
  });
  if (legal.length === 0) return null;
  const steps = st.pieces[playerId] ?? [];
  let best: { action: LudoAction; score: number } | null = null;
  for (const a of legal) {
    let score = a.newStep;
    if (a.kind === "enter") score = 70; // ورود با ۶ تقریباً همیشه بهترین است
    if (a.captureOf) score = 200; // زدن مهرهٔ حریف اولویت اول
    if (a.newStep === LUDO_HOME_STEP) score = Math.max(score, 150); // رساندن مهره به خانه
    if (a.abs !== null && st.surprise.includes(a.abs)) {
      const k = st.surpriseKind[a.abs];
      if (k === "back4" || k === "back3") score -= 120; // سورپرایز بد را اگر می‌شود نپر
      if (k === "fwd4" || k === "fwd3" || k === "again") score += 40;
    }
    /* مهرهٔ جلوتر را زودتر به خانه برسان — کمی هم تصادفی برای تنوع */
    score += (steps[a.piece] ?? 0) * 0.1 + ((st.seq * 31 + a.piece * 7) % 9);
    if (!best || score > best.score) best = { action: a, score };
  }
  return best ? best.action : null;
}

/* ---------- تیک خودکار — مهلت‌ها و ربات‌ها ---------- */

/** یک دور تیک: حذف غایب‌ها، اجرای ربات‌ها و مهلت‌خورده‌ها.
    state را درجا تغییر می‌دهد؛ رخدادهای رخ‌داده را هم برمی‌گرداند. */
export function ludoTick(
  st: LudoRoomState,
  opts: { now: number; memberIds: Set<string> },
): { mutated: boolean; events: LudoEvent[] } {
  let mutated = false;
  const events: LudoEvent[] = [];
  const { now, memberIds } = opts;

  /* ۱) بازیکنانی که دیگر عضو اتاق نیستند (خروج یا پاک‌سازی بی‌حضوری) */
  const before = st.order.length;
  st.order = st.order.filter((id) => memberIds.has(id));
  if (st.order.length !== before) {
    mutated = true;
    st.seq += 1;
    if (!memberIds.has(st.turnId)) {
      st.turnId = st.order[0] ?? "";
      st.dice = null;
      st.rolls = 0;
      st.deadline = botDeadline(st, now);
    }
    if (maybeFinish(st, now)) return { mutated: true, events };
  }

  /* ۲) شمارش معکوس شروع */
  if (now < st.startedAtMs) return { mutated, events };

  /* ۳) حلقهٔ مهلت‌ها — ربات و بازیکن مهلت‌خورده خودکار بازی می‌شوند */
  for (let i = 0; i < 8 && !st.result; i++) {
    if (st.order.length === 0) {
      if (maybeFinish(st, now)) return { mutated: true, events };
      break;
    }
    if (now < st.deadline) break;
    if (!st.order.includes(st.turnId)) {
      st.turnId = st.order[0];
      st.dice = null;
      st.rolls = 0;
      st.deadline = botDeadline(st, now);
      mutated = true;
      continue;
    }
    if (!st.dice) {
      /* پرتاب تاس خودکار (مهلت انسان تمام شده یا نوبت ربات است) */
      st.dice = rollDice();
      st.rolls += 1;
      st.deadline = isBotId(st.turnId)
        ? now + botDelay(st, LUDO_BOT_MOVE_MIN, LUDO_BOT_MOVE_VAR)
        : now + LUDO_MOVE_MS;
      st.seq += 1;
      mutated = true;
      continue;
    }
    /* حرکت خودکار — بهترین اکشن یا پاس */
    const best = ludoBestAction(st, st.turnId);
    if (!best) {
      advanceTurn(st, now);
      st.seq += 1;
    } else {
      const outcome = applyAction(st, st.turnId, best, now);
      events.push(...outcome.events);
    }
    mutated = true;
  }
  return { mutated, events };
}

/* ---------- نمای هر عضو ---------- */

export function buildLudoView(
  st: LudoRoomState,
  memberId: string,
  names: Record<string, string>,
  now: number,
  onlineIds: Set<string>,
): LudoView {
  const players = Object.values(st.players).map((p) => {
    const steps = st.pieces[p.id] ?? [];
    return {
      id: p.id,
      name: names[p.id] ?? p.name,
      color: p.color,
      bot: isBotId(p.id),
      online: isBotId(p.id) || onlineIds.has(p.id),
      inRoom: st.order.includes(p.id) || Boolean(st.finishedAt[p.id]),
      finished: Boolean(st.finishedAt[p.id]),
      home: ludoPiecesHome(steps),
    };
  });
  return {
    startedAtMs: st.startedAtMs,
    now,
    seq: st.seq,
    turnId: st.turnId,
    myTurn: !st.result && st.turnId === memberId && now >= st.startedAtMs,
    dice: st.dice,
    deadline: st.deadline,
    players,
    pieces: st.pieces,
    surprise: st.surprise.map((cell) => ({ cell, kind: st.surpriseKind[cell] })),
    finished: Boolean(st.result),
    result: st.result,
  };
}
