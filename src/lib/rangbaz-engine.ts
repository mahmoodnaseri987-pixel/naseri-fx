/* ================================================================
   رنگ‌باز — موتور بازی (بدون وابستگی به DB؛ state خالص JSON)
   هم سولوی آفلاین و هم اتاق آنلاین از همین توابع استفاده می‌کنند.
   ================================================================ */

import {
  RB_CALL_WINDOW_MS,
  RB_COLORS,
  RB_TURN_MS_DEFAULT,
  rbBuildDeck,
  rbCardValue,
  rbIsColor,
  rbSeededShuffle,
  rbShuffle,
  type RbCard,
  type RbColor,
  type RbPlayer,
  type RbResult,
  type RbSettings,
  type RbState,
  type RbView,
  type RbViewPlayer,
} from "@/lib/rangbaz-shared";

type Ctx = { now: number };

const LOG_MAX = 14;

function pushLog(st: RbState, text: string) {
  st.log.push(text);
  if (st.log.length > LOG_MAX) st.log.splice(0, st.log.length - LOG_MAX);
}

/* ---------- ساخت وضعیت ---------- */

export function rbCreateState(
  players: { id: string; name: string; bot: 0 | 1 | 2 | 3; persona?: RbPlayer["persona"] }[],
  settings: RbSettings,
  now: number,
  seed?: number,
): RbState | null {
  const ps: RbPlayer[] = players
    .filter((p) => p.id && p.name)
    .map((p) => ({ id: p.id, name: p.name, hand: [], score: 0, bot: p.bot, persona: p.persona }));
  if (ps.length < 2) return null;

  const deck0 = rbBuildDeck(settings.custom);
  const deck = (seed !== undefined ? rbSeededShuffle(deck0, seed) : rbShuffle(deck0)).map((c) => ({ ...c }));

  const st: RbState = {
    v: 1,
    seq: 0,
    s: settings,
    ps,
    deck,
    pile: [],
    color: "red",
    cur: 0,
    dir: 1,
    pend: 0,
    pendK: null,
    drew: false,
    drewId: null,
    callOpen: null,
    called: {},
    lastPlay: null,
    fogBy: null,
    fogUntilTurn: null,
    turn: 1,
    tStart: now,
    phase: "play",
    result: null,
    log: [],
  };

  for (let i = 0; i < settings.handSize; i++) {
    for (const p of ps) {
      const c = st.deck.pop();
      if (c) p.hand.push(c);
    }
  }
  /* کارت شروع: یک کارت عددی روی پشته تا رنگ فعال از اول روشن باشد */
  for (let i = st.deck.length - 1; i >= 0; i--) {
    if (st.deck[i].k === "num") {
      const first = st.deck.splice(i, 1)[0];
      st.pile.push(first);
      st.color = first.c as RbColor;
      break;
    }
  }
  if (st.pile.length === 0) {
    const first = st.deck.pop();
    if (first) {
      st.pile.push(first);
      if (first.c) st.color = first.c;
    }
  }
  pushLog(st, "بازی شروع شد — موفق باشی!");
  return st;
}

/* ---------- کمکی‌های نوبت ---------- */

function stepsTo(st: RbState, steps: number): number {
  const n = st.ps.length;
  return (st.cur + steps * st.dir + n * 8) % n;
}

function advance(st: RbState, steps: number, ctx: Ctx) {
  st.cur = stepsTo(st, steps);
  st.turn += 1;
  st.tStart = ctx.now;
  st.drew = false;
  st.drewId = null;
}

function drawOne(st: RbState): RbCard {
  if (st.deck.length === 0) {
    /* بازسازی دک از دورریز — کارت رو می‌ماند */
    const top = st.pile.pop();
    st.deck = rbShuffle(st.pile);
    st.pile = top ? [top] : [];
  }
  return st.deck.pop() as RbCard;
}

function topOf(st: RbState): RbCard | null {
  return st.pile.length ? st.pile[st.pile.length - 1] : null;
}

/* آیا این کارت الان قابل بازی است؟ */
export function rbPlayable(card: RbCard, st: RbState): boolean {
  const top = topOf(st);
  if (!top) return true;
  if (st.pend > 0) {
    /* جریمهٔ در انتظار فقط با کارت جریمهٔ هم‌خانواده پوشانده می‌شود */
    if (st.pendK === "draw2") return card.k === "draw2" || card.k === "wild4";
    return card.k === "wild4";
  }
  if (card.k === "wild" || card.k === "wild4" || card.k === "mirror" || card.k === "swap" || card.k === "fog") {
    return true;
  }
  if (card.c && card.c === st.color) return true;
  if (card.k === top.k && card.k !== "num") return true; // ممنوع↔ممنوع، برگشت↔برگشت، +۲↔+۲
  if (card.k === "num" && top.k === "num" && card.n === top.n) return true;
  return false;
}

function handOf(st: RbState, id: string): RbPlayer | null {
  return st.ps.find((p) => p.id === id) ?? null;
}

/* ---------- پایان دست ---------- */

function finish(st: RbState, winnerId: string) {
  st.phase = "done";
  const winner = handOf(st, winnerId);
  let pot = 0;
  for (const p of st.ps) {
    if (p.id === winnerId) continue;
    pot += p.hand.reduce((a, c) => a + rbCardValue(c), 0);
  }
  if (winner) winner.score += pot;
  const rows: RbResult["rows"] = st.ps
    .map((p) => ({ id: p.id, name: p.name, score: p.score, cards: p.hand.length }))
    .sort((a, b) => b.score - a.score);
  st.result = { rows };
  if (winner) pushLog(st, `🏆 ${winner.name} برنده شد و ${pot} امتیاز گرفت!`);
}

/* ---------- اکشن: بازی کردن کارت ---------- */

export function rbPlay(
  st: RbState,
  playerId: string,
  cardId: string,
  opts: { color?: string; targetId?: string; call?: boolean },
  ctx: Ctx,
): { ok: boolean; reason?: string } {
  if (st.phase !== "play") return { ok: false, reason: "done" };
  const p = handOf(st, playerId);
  if (!p) return { ok: false, reason: "no-player" };
  if (st.ps[st.cur]?.id !== playerId) return { ok: false, reason: "not-turn" };
  const idx = p.hand.findIndex((c) => c.id === cardId);
  if (idx < 0) return { ok: false, reason: "no-card" };
  const card = p.hand[idx];
  if (!rbPlayable(card, st)) return { ok: false, reason: "not-playable" };

  const prevPlay = st.lastPlay; // صاحب کارت قبلی پشته — کارت آینه لازمش دارد
  p.hand.splice(idx, 1);
  st.pile.push(card);
  st.lastPlay = { id: playerId, cardId };
  st.callOpen = null;

  const nameOf = (id: string) => handOf(st, id)?.name ?? "؟";

  /* انتخاب رنگ برای کارت‌های بی‌رنگِ رنگ‌ساز */
  if (card.k === "wild" || card.k === "wild4") {
    const color = rbIsColor(opts.color) ? opts.color : (p.hand.find((c) => c.c)?.c ?? RB_COLORS[0]);
    st.color = color;
    pushLog(st, `${p.name} رنگ را به «${colorFa(color)}» تغییر داد`);
  }

  switch (card.k) {
    case "skip": {
      pushLog(st, `⛔ ${nameOf(stepsTo(st, 1))} نوبتش سوخت`);
      advance(st, 2, ctx);
      break;
    }
    case "reverse": {
      st.dir = st.dir === 1 ? -1 : 1;
      pushLog(st, "🔁 جهت بازی عوض شد");
      advance(st, st.ps.length === 2 ? 2 : 1, ctx); // در دو نفره مثل ممنوع
      break;
    }
    case "draw2": {
      if (st.s.stacking) {
        st.pend += 2;
        st.pendK = "draw2";
        pushLog(st, `➕ جریمه روی میز: ${st.pend} کارت`);
        advance(st, 1, ctx);
      } else {
        const victim = st.ps[stepsTo(st, 1)];
        for (let i = 0; i < 2; i++) victim.hand.push(drawOne(st));
        pushLog(st, `➕ ${victim.name} دو کارت جریمه گرفت و نوبتش سوخت`);
        advance(st, 2, ctx);
      }
      break;
    }
    case "wild4": {
      if (st.s.stacking) {
        st.pend += 4;
        st.pendK = "wild4";
        pushLog(st, `➕ جریمه روی میز: ${st.pend} کارت`);
        advance(st, 1, ctx);
      } else {
        const victim = st.ps[stepsTo(st, 1)];
        for (let i = 0; i < 4; i++) victim.hand.push(drawOne(st));
        pushLog(st, `➕ ${victim.name} چهار کارت جریمه گرفت`);
        advance(st, 2, ctx);
      }
      break;
    }
    case "mirror": {
      /* کارت قبلی پشته به دستِ اندازنده‌اش برمی‌گردد */
      if (st.pile.length >= 2 && prevPlay && prevPlay.id !== playerId) {
        const prev = st.pile[st.pile.length - 2];
        const owner = prevPlay.id;
        st.pile.splice(st.pile.length - 2, 1);
        handOf(st, owner)?.hand.push(prev);
        const newTop = topOf(st);
        if (newTop?.c) st.color = newTop.c;
        pushLog(st, `🪞 ${p.name} کارت آخر را به دستِ ${nameOf(owner)} برگرداند`);
      } else {
        pushLog(st, `🪞 ${p.name} کارت آینه انداخت`);
      }
      advance(st, 1, ctx);
      break;
    }
    case "swap": {
      const target = opts.targetId && opts.targetId !== playerId ? handOf(st, opts.targetId) : null;
      if (target) {
        const mine = [...p.hand];
        p.hand = [...target.hand];
        target.hand = mine;
        pushLog(st, `🤝 ${p.name} دستش را با ${target.name} عوض کرد`);
      } else {
        pushLog(st, `🤝 ${p.name} کارت تعویض دست انداخت`);
      }
      advance(st, 1, ctx);
      break;
    }
    case "fog": {
      st.fogBy = playerId;
      st.fogUntilTurn = st.turn + st.ps.length; // یک دور کامل
      pushLog(st, `🌫 ${p.name} مه انداخت — تعداد کارت‌ها تا یک دور پنهان است`);
      advance(st, 1, ctx);
      break;
    }
    default: {
      advance(st, 1, ctx);
      break;
    }
  }

  /* پایان دست یا اعلام رنگ‌باز */
  if (p.hand.length === 0) {
    finish(st, playerId);
    return { ok: true };
  }
  if (p.hand.length === 1) {
    if (opts.call) {
      st.called[playerId] = st.turn;
      pushLog(st, `🔔 ${p.name} گفت: رنگ‌باز!`);
    } else {
      st.callOpen = { id: playerId, until: ctx.now + RB_CALL_WINDOW_MS };
      pushLog(st, `🤫 ${p.name} رنگ‌باز نگفت — می‌شود لو داد!`);
    }
  }
  return { ok: true };
}

function colorFa(c: RbColor): string {
  return c === "red" ? "قرمز" : c === "blue" ? "آبی" : c === "green" ? "سبز" : "زرد";
}

/* ---------- اکشن: کشیدن کارت / گذر ---------- */

export function rbDrawOrPass(st: RbState, playerId: string, ctx: Ctx): { ok: boolean; reason?: string } {
  if (st.phase !== "play") return { ok: false, reason: "done" };
  const p = handOf(st, playerId);
  if (!p) return { ok: false, reason: "no-player" };
  if (st.ps[st.cur]?.id !== playerId) return { ok: false, reason: "not-turn" };

  if (st.pend > 0) {
    /* گرفتن جریمهٔ جمع‌شده */
    for (let i = 0; i < st.pend; i++) p.hand.push(drawOne(st));
    pushLog(st, `📤 ${p.name} ${st.pend} کارت جریمه گرفت`);
    st.pend = 0;
    st.pendK = null;
    advance(st, 1, ctx);
    return { ok: true };
  }

  if (!st.drew) {
    const card = drawOne(st);
    p.hand.push(card);
    pushLog(st, `🃏 ${p.name} کارت کشید`);
    if (rbPlayable(card, st)) {
      st.drew = true;
      st.drewId = card.id;
      return { ok: true };
    }
    advance(st, 1, ctx);
    return { ok: true };
  }

  /* گذر */
  pushLog(st, `⏭ ${p.name} گذر کرد`);
  advance(st, 1, ctx);
  return { ok: true };
}

/* ---------- اکشن: گفتن «رنگ‌باز» ---------- */

export function rbCall(st: RbState, playerId: string, ctx: Ctx): { ok: boolean; reason?: string } {
  const p = handOf(st, playerId);
  if (!p || p.hand.length !== 1) return { ok: false, reason: "need-one-card" };
  if (st.callOpen?.id !== playerId) {
    st.called[playerId] = st.turn;
    pushLog(st, `🔔 ${p.name} گفت: رنگ‌باز!`);
    return { ok: true };
  }
  return { ok: false, reason: "too-late" };
}

/* ---------- اکشن: لو دادن ---------- */

export function rbCatch(st: RbState, catcherId: string, ctx: Ctx): { ok: boolean; reason?: string } {
  if (!st.callOpen) return { ok: false, reason: "no-window" };
  if (ctx.now > st.callOpen.until) {
    st.callOpen = null;
    return { ok: false, reason: "expired" };
  }
  const target = st.callOpen.id;
  if (catcherId === target) return { ok: false, reason: "self" };
  const catcher = handOf(st, catcherId);
  const victim = handOf(st, target);
  if (!catcher || !victim) return { ok: false, reason: "no-player" };
  for (let i = 0; i < 2; i++) victim.hand.push(drawOne(st));
  st.callOpen = null;
  pushLog(st, `📢 ${catcher.name} ${victim.name} را لو داد — دو کارت جریمه!`);
  return { ok: true };
}

/* ---------- تیک خودکار (تایم‌اوت نوبت و انقضای پنجره‌ها) ---------- */

export function rbTick(st: RbState, ctx: Ctx): { mutated: boolean } {
  let mutated = false;
  if (st.phase !== "play") return { mutated: false };

  if (st.callOpen && ctx.now > st.callOpen.until) {
    st.callOpen = null;
    mutated = true;
  }
  if (st.fogUntilTurn !== null && st.turn >= st.fogUntilTurn) {
    st.fogBy = null;
    st.fogUntilTurn = null;
    mutated = true;
  }
  if (st.s.turnMs > 0 && ctx.now - st.tStart > st.s.turnMs) {
    const p = st.ps[st.cur];
    if (p) {
      if (st.pend > 0 || !st.drew) {
        rbDrawOrPass(st, p.id, ctx);
        if (st.phase !== "play") return { mutated: true };
        /* اگر کارت کشیده‌شده قابل بازی بود، برای جلوگیری از سرکشی، خودکار گذر می‌شود */
        if (st.drew) {
          pushLog(st, `⏱ مهلت نوبت ${p.name} تمام شد`);
          advance(st, 1, ctx);
        } else {
          pushLog(st, `⏱ مهلت نوبت ${p.name} تمام شد`);
        }
      } else {
        advance(st, 1, ctx);
        pushLog(st, `⏱ مهلت نوبت ${p.name} تمام شد`);
      }
      mutated = true;
    }
  }
  return { mutated };
}

/* ---------- ربات‌ها (سولوی آفلاین) ---------- */

function countColor(hand: RbCard[], color: RbColor): number {
  return hand.filter((c) => c.c === color).length;
}

function majorityColor(hand: RbCard[]): RbColor {
  let best = RB_COLORS[0];
  let bestN = -1;
  for (const c of RB_COLORS) {
    const n = countColor(hand, c);
    if (n > bestN) {
      bestN = n;
      best = c;
    }
  }
  return best;
}

function weakestColor(hand: RbCard[]): RbColor {
  let best = RB_COLORS[0];
  let bestN = 99;
  for (const c of RB_COLORS) {
    const n = countColor(hand, c);
    if (n < bestN) {
      bestN = n;
      best = c;
    }
  }
  return best;
}

export function rbBotMove(st: RbState, botId: string, ctx: Ctx): { acted: boolean } {
  if (st.phase !== "play") return { acted: false };
  const bot = handOf(st, botId);
  if (!bot || bot.bot === 0) return { acted: false };
  if (st.ps[st.cur]?.id !== botId) return { acted: false };
  const d = bot.bot;
  const persona = bot.persona;
  const aggressive = persona === "shahin";
  const cautious = persona === "negar";
  const bluffer = persona === "babak";

  /* پوشاندن جریمه یا گرفتنش */
  if (st.pend > 0) {
    const cover = bot.hand.find((c) => rbPlayable(c, st));
    const wantCover = cover && (d >= 2 || aggressive) && bot.hand.length > 3;
    if (cover && wantCover) {
      return { acted: applyBotPlay(st, botId, cover.id, ctx) };
    }
    rbDrawOrPass(st, botId, ctx);
    return { acted: true };
  }

  /* لو دادن بازیکنی که رنگ‌باز نگفته */
  if (st.callOpen && st.callOpen.id !== botId && ctx.now < st.callOpen.until) {
    const chance = d === 3 ? 0.95 : d === 2 ? 0.7 : 0.35;
    if (Math.random() < chance || aggressive) {
      rbCatch(st, botId, ctx);
      return { acted: true };
    }
  }

  const playable = bot.hand.filter((c) => rbPlayable(c, st));
  if (playable.length === 0) {
    rbDrawOrPass(st, botId, ctx);
    if (st.drew && st.drewId) {
      const dc = bot.hand.find((c) => c.id === st.drewId);
      if (dc && (d >= 2 || Math.random() < 0.5)) {
        return { acted: applyBotPlay(st, botId, dc.id, ctx) };
      }
      rbDrawOrPass(st, botId, ctx); // گذر
    }
    return { acted: true };
  }

  /* انتخاب کارت با توجه به سطح و شخصیت */
  const nextP = st.ps[stepsTo(st, 1)];
  const nextFew = nextP ? nextP.hand.length : 99;
  const holdSpecial = cautious && bot.hand.length > 3;
  let pick: RbCard | null = null;

  const customs = playable.filter((c) => c.k === "mirror" || c.k === "swap" || c.k === "fog");
  const penalties = playable.filter((c) => c.k === "draw2" || c.k === "wild4" || c.k === "skip");
  const reverses = playable.filter((c) => c.k === "reverse");
  const nums = playable.filter((c) => c.k === "num");
  const wilds = playable.filter((c) => c.k === "wild" || c.k === "wild4");

  if (aggressive) {
    pick = penalties[0] ?? customs[0] ?? nums[0] ?? reverses[0] ?? wilds[0] ?? null;
  } else if (cautious) {
    pick = nums[0] ?? reverses[0] ?? (bot.hand.length <= 3 ? penalties[0] ?? wilds[0] ?? customs[0] : null) ?? null;
  } else if (d === 3) {
    /* استاد: وقتی حریف بعدی کم کارت دارد، جریمه؛ آینه وقتی کارت زیادی دارد */
    if (nextFew <= 2 && penalties.length) pick = penalties[0];
    else if (customs.length && bot.hand.length >= 6) pick = customs[0];
    else pick = nums[0] ?? reverses[0] ?? penalties[0] ?? wilds[0] ?? null;
  } else if (d === 2) {
    pick = nums[0] ?? reverses[0] ?? penalties[0] ?? (Math.random() < 0.3 ? customs[0] : null) ?? wilds[0] ?? null;
  } else {
    pick = playable[Math.floor(Math.random() * playable.length)];
  }
  if (holdSpecial && (pick?.k === "wild" || pick?.k === "wild4") && (nums.length || reverses.length)) {
    pick = nums[0] ?? reverses[0] ?? pick;
  }
  if (!pick) pick = playable[0];

  const color =
    bluffer && (pick.k === "wild" || pick.k === "wild4")
      ? Math.random() < 0.5
        ? weakestColor(bot.hand)
        : majorityColor(bot.hand)
      : d >= 2
        ? majorityColor(bot.hand)
        : weakestColor(bot.hand);

  let targetId: string | undefined;
  if (pick.k === "swap") {
    const others = st.ps.filter((p) => p.id !== botId);
    others.sort((a, b) => a.hand.length - b.hand.length);
    targetId = others[0]?.id;
  }

  /* فراموشی رنگ‌باز بسته به سطح */
  const call = !(Math.random() < (d === 3 ? 0.03 : d === 2 ? 0.12 : 0.4));
  return { acted: applyBotPlay(st, botId, pick.id, ctx, { color, targetId, call }) };
}

function applyBotPlay(
  st: RbState,
  botId: string,
  cardId: string,
  ctx: Ctx,
  opts: { color?: string; targetId?: string; call?: boolean } = {},
): boolean {
  const res = rbPlay(st, botId, cardId, opts, ctx);
  return res.ok;
}

/* ---------- نمای UI ---------- */

export function buildRbView(
  st: RbState,
  meId: string,
  members: { id: string; name: string; bot?: boolean; online?: boolean }[],
  now: number,
): RbView {
  const fogActive = st.fogUntilTurn !== null && st.turn < (st.fogUntilTurn ?? 0);
  const me = st.ps.find((p) => p.id === meId);
  const memberMap = new Map(members.map((m) => [m.id, m]));

  const players: RbViewPlayer[] = st.ps.map((p) => {
    const m = memberMap.get(p.id);
    const hide = fogActive && st.fogBy !== meId && p.id !== meId;
    return {
      id: p.id,
      name: m?.name ?? p.name,
      bot: (m?.bot ?? p.bot !== 0) === true,
      online: m?.online ?? true,
      count: hide ? null : p.hand.length,
      score: p.score,
    };
  });

  const playableIds = me && st.phase === "play" && st.ps[st.cur]?.id === meId
    ? me.hand.filter((c) => rbPlayable(c, st)).map((c) => c.id)
    : [];

  const caller = st.callOpen ? memberMap.get(st.callOpen.id) : null;

  return {
    me: meId,
    myHand: me ? me.hand : [],
    playableIds,
    players,
    top: topOf(st),
    color: st.color,
    cur: st.ps[st.cur]?.id ?? "",
    dir: st.dir,
    pend: st.pend,
    pendK: st.pendK,
    myTurn: st.phase === "play" && st.ps[st.cur]?.id === meId,
    drew: st.drew,
    drewPlayable: st.drewId !== null && playableIds.includes(st.drewId),
    callOpen: st.callOpen && caller ? { id: st.callOpen.id, name: caller.name, until: st.callOpen.until } : null,
    fogActive,
    settings: st.s,
    phase: st.phase,
    result: st.result,
    log: st.log,
    turnRemainMs: st.s.turnMs > 0 ? Math.max(0, st.s.turnMs - (now - st.tStart)) : 0,
    turn: st.turn,
  };
}

export function rbDefaultSettings(partial: Partial<RbSettings> = {}): RbSettings {
  return {
    handSize: partial.handSize === 5 ? 5 : 7,
    stacking: partial.stacking ?? true,
    custom: partial.custom ?? true,
    turnMs: partial.turnMs ?? RB_TURN_MS_DEFAULT,
  };
}
