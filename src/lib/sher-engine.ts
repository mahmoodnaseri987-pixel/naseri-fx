/* ================================================================
   بازی گروهی «شعر یادت نره» — مغز سمت سرور
   ================================================================
   هر دور: کلیپ ۱۰ثانیه‌ای پخش می‌شود (فاز listen) و ناگهان قطع می‌شود؛
   در فاز guess هر بازیکن یک‌بار «بیت بعدی» را حدس می‌زند — با یکی از
   چهار سطح کمک (۲۵/۱۵/۱۰/۵ امتیاز)؛ فاز reveal پاسخ درست را نشان می‌دهد
   و بعد دور بعدی شروع می‌شود. آهنگ‌ها بدون تکرار و به تعداد سقف دور.
   وضعیت مسابقه در ستون state اتاق ذخیره می‌شود؛ همهٔ تغییرها با «seq»
   رو به جلو شماره‌گذاری شده‌اند تا روی serverless هیچ نوشتهٔ کهنه‌ای روی
   پایهٔ تازه‌تر بازنویسی نشود (الگوی منچ). نوشتن در دیتابیس با arena-live
   و مسیر action انجام می‌شود؛ تصمیم‌های ربات قطعی (hash) هستند تا بین
   تیک‌ها نپرند و state خالص بماند.
   ================================================================ */

import {
  SHER_GAME_SLUG,
  SHER_GUESS_MS,
  SHER_LEVEL_POINTS,
  SHER_LISTEN_MS,
  SHER_MAX_ROUNDS,
  SHER_REVEAL_MS,
  SHER_START_DELAY_MS,
  buildSherOptions,
  sherFuzzyMatch,
  sherParseLines,
  sherTeamCount,
  sherTeamsOf,
  type SherAnswerRecord,
  type SherLevel,
  type SherMode,
  type SherResult,
  type SherRoomState,
  type SherRoundSong,
  type SherSongData,
  type SherView,
} from "@/lib/sher-shared";
import { hash32, isBotId } from "@/lib/arena-registry";

/* ---------- ردیف خام SherSong دیتابیس — فقط فیلدهای لازم ---------- */

export type SherSongRow = {
  filename: string;
  title: string;
  artist: string;
  clipStart: number;
  answerLine: string;
  contextLines: string; // JSON-رشته: ۱ تا ۳ مصرع قبل
  extraLines: string; // JSON-رشته: مصرع‌های دیگر آهنگ
  active: boolean;
};

/* ---------- استخر آهنگ‌ها از دیتابیس ---------- */

/** رکوردهای فعال SherSong را به دادهٔ تمیز مسابقه تبدیل می‌کند —
    فیلدهای JSON-رشته با sherParseLines پارس و ردیف‌های ناقص حذف می‌شوند */
export function createSherSongsPool(rows: SherSongRow[]): SherSongData[] {
  return rows
    .filter((r) => r.active && Boolean(r.filename) && Boolean(r.answerLine.trim()))
    .map((r) => ({
      filename: r.filename,
      title: r.title ?? "",
      artist: r.artist ?? "",
      clipStart: Number.isFinite(r.clipStart) && r.clipStart > 0 ? r.clipStart : 0,
      answerLine: r.answerLine.trim(),
      contextLines: sherParseLines(r.contextLines),
      extraLines: sherParseLines(r.extraLines),
    }));
}

/* ---------- ابزارهای محلی ---------- */

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** آهنگ دور جاری با گزینه‌های سطح ۴ — انحرافی‌ها از مصرع‌های اضافهٔ خودش
    و خط‌های جواب بقیهٔ آهنگ‌های همان مسابقه ساخته می‌شود */
function makeRoundSong(song: SherSongData, all: SherSongData[]): SherRoundSong {
  const pool = all.filter((o) => o.filename !== song.filename).map((o) => o.answerLine);
  const { options, answerIndex } = buildSherOptions(song.answerLine, song.extraLines, pool);
  return { ...song, options, answerIndex };
}

/* ---------- ساخت وضعیت شروع ---------- */

/** آهنگ‌ها خالی → null (تماس‌گیرنده خطا می‌دهد)؛ players به‌ترتیب ورود
    تیم‌بندی می‌شوند؛ شمارش معکوس شروع، بعد اولین فاز listen */
export function createSherState(
  mode: SherMode,
  players: { id: string; name: string }[],
  songs: SherSongData[],
  now: number,
): SherRoomState | null {
  const clean = players.filter((p) => p.id && p.name);
  const pool = songs.filter((s) => s.filename && s.answerLine.trim());
  if (clean.length === 0 || pool.length === 0) return null;
  const shuffled = shuffle(pool);
  const totalRounds = Math.min(SHER_MAX_ROUNDS, shuffled.length);
  const teams = sherTeamsOf(mode, clean.map((p) => p.id));
  const answers: Record<string, SherAnswerRecord | null> = {};
  const scores: Record<string, number> = {};
  clean.forEach((p) => {
    answers[p.id] = null;
    scores[p.id] = 0;
  });
  const startedAtMs = now + SHER_START_DELAY_MS;
  return {
    game: SHER_GAME_SLUG,
    startedAtMs,
    seq: 1,
    mode,
    players: clean.map((p, i) => ({ id: p.id, name: p.name, team: teams[i] ?? -1 })),
    round: 1,
    totalRounds,
    phase: "listen",
    phaseEnds: startedAtMs + SHER_LISTEN_MS,
    songs: shuffled,
    song: makeRoundSong(shuffled[0], shuffled),
    answers,
    scores,
    result: null,
  };
}

/* ---------- داوری پاسخ — یک منبع واحد برای انسان و ربات ---------- */

function judgeSher(level: SherLevel, payload: string, song: SherRoundSong): boolean {
  if (level === 4) {
    const idx = Number(payload);
    return Number.isInteger(idx) && idx >= 0 && idx < song.options.length && idx === song.answerIndex;
  }
  return sherFuzzyMatch(payload, song.answerLine);
}

export type SherAnswerOutcome = {
  ok: boolean;
  reason?: "phase" | "answered" | "unknown" | "bad-level" | "bad-payload";
};

/** ثبت حدس بازیکن — فقط در فاز guess و فقط یک‌بار در هر دور.
    سطح ۱/۲/۳: payload متن است و با تطبیق فازی داوری می‌شود؛
    سطح ۴: payload اندیس گزینه به‌صورت رشته. بعد از ثبت، seq جلو می‌رود. */
export function sherAnswer(
  st: SherRoomState,
  playerId: string,
  level: number,
  payload: string,
): SherAnswerOutcome {
  if (st.phase !== "guess" || !st.song) return { ok: false, reason: "phase" };
  if (!st.players.some((p) => p.id === playerId)) return { ok: false, reason: "unknown" };
  if (st.answers[playerId]) return { ok: false, reason: "answered" };
  const lvl = Number(level);
  if (lvl !== 1 && lvl !== 2 && lvl !== 3 && lvl !== 4) return { ok: false, reason: "bad-level" };
  const text = typeof payload === "string" ? payload.trim().slice(0, 200) : "";
  if (!text) return { ok: false, reason: "bad-payload" };
  if (lvl === 4) {
    const idx = Number(text);
    if (!Number.isInteger(idx) || idx < 0 || idx >= st.song.options.length) {
      return { ok: false, reason: "bad-payload" };
    }
  }
  const correct = judgeSher(lvl as SherLevel, text, st.song);
  st.answers[playerId] = { level: lvl as SherLevel, correct, payload: text };
  if (correct) st.scores[playerId] = (st.scores[playerId] ?? 0) + SHER_LEVEL_POINTS[lvl as SherLevel];
  st.seq += 1;
  return { ok: true };
}

/* ---------- ربات‌ها — تصمیم‌های قطعی از hash تا state خالص بماند ---------- */

/** سطح انتخابی ربات — سطح ۴ با وزن ۰٫۵۵؛ سه سطح دیگر مساوی (۰٫۱۵ هرکدام) */
function botLevel(botId: string, st: SherRoomState): SherLevel {
  const roll = hash32(`sher-lvl:${botId}:${st.round}:${st.startedAtMs}`) % 100;
  if (roll < 55) return 4;
  return (1 + (roll % 3)) as SherLevel; // ۱، ۲ یا ۳ — هرکدام ~۱۵٪
}

/** احتمال دانستن جواب در این دور — بازهٔ ۰٫۳۰ تا ۰٫۶۰ */
function botKnows(botId: string, st: SherRoomState): boolean {
  const p = 30 + (hash32(`sher-acc:${botId}:${st.round}:${st.startedAtMs}`) % 31);
  return hash32(`sher-roll:${botId}:${st.round}:${st.startedAtMs}`) % 100 < p;
}

/** تأخیر پاسخ ربات از شروع فاز guess — ۴ تا ۱۵ ثانیه، قطعی برای هر (ربات، دور) */
function botDelayMs(botId: string, st: SherRoomState): number {
  return 4_000 + (hash32(`sher-delay:${botId}:${st.round}:${st.startedAtMs}`) % 11_000);
}

/** متن/اندیس پاسخ ربات — اگر «بداند» جواب درست، وگرنه یکی از انحرافی‌ها */
function botPayload(st: SherRoomState, botId: string, level: SherLevel, knows: boolean): string {
  const song = st.song!;
  const options = song.options;
  if (knows || options.length < 2) {
    return level === 4 ? String(song.answerIndex) : song.answerLine;
  }
  const wrongIdx =
    (song.answerIndex + 1 + (hash32(`sher-wrong:${botId}:${st.round}:${st.startedAtMs}`) % (options.length - 1))) %
    options.length;
  return level === 4 ? String(wrongIdx) : (options[wrongIdx] ?? song.answerLine);
}

/* ---------- نتیجهٔ نهایی ---------- */

/** رتبهٔ انفرادی با تساویِ مشترک (rank یکسان، بعدی پرش می‌خورد) +
    جمع تیمی وقتی mode ≠ ffa — تیم‌های بدون عضو نمی‌آیند */
function buildSherResult(st: SherRoomState): SherResult {
  const rows = st.players.map((p) => ({ id: p.id, score: st.scores[p.id] ?? 0, rank: 0 }));
  rows.sort((a, b) => b.score - a.score);
  let prevScore = -1;
  let prevRank = 0;
  rows.forEach((r, i) => {
    if (i > 0 && r.score === prevScore) {
      r.rank = prevRank;
    } else {
      r.rank = i + 1;
      prevRank = r.rank;
    }
    prevScore = r.score;
  });
  const teams: SherResult["teams"] = [];
  const teamCount = sherTeamCount(st.mode);
  if (teamCount > 0) {
    for (let t = 0; t < teamCount; t++) {
      const members = st.players.filter((p) => p.team === t);
      if (members.length === 0) continue;
      teams.push({ team: t, score: members.reduce((acc, p) => acc + (st.scores[p.id] ?? 0), 0) });
    }
    teams.sort((a, b) => b.score - a.score);
  }
  return { rows, teams };
}

/* ---------- تیک خودکار — گذر فازها، ربات‌ها و ساخت نتیجه ---------- */

/** یک دور تیک: فاز عقب‌افتاده را جلو می‌برد (زمان‌بندی فازها زنجیره‌ای و
    قطعی است — فاز بعدی از پایان زمان‌بندی‌شدهٔ فاز فعلی شروع می‌شود) و
    در فاز guess ربات‌های رسیده‌به‌نوبت را جواب می‌دهد. state درجا تغییر
    می‌کند؛ mutated یعنی باید با گارد seq ذخیره شود.
    memberIds اعضای فعلی اتاق است — ربات‌ها مثل منچ با isBotId شناسایی
    می‌شوند و اعضای رفته وسط مسابقه امتیازشان در نتیجه می‌ماند. */
export function sherTick(
  st: SherRoomState,
  opts: { now: number; memberIds?: Set<string> },
): { mutated: boolean } {
  if (st.phase === "done") return { mutated: false };
  const { now } = opts;
  if (now < st.startedAtMs) return { mutated: false }; // شمارش معکوس شروع
  let mutated = false;
  /* سقف حلقه — عقب‌افتادگی چند فاز در هر تیک جبران می‌شود؛ بقیه با تیک بعدی
     (تنها‌جا فاز done ساخته می‌شود و همان‌جا از حلقه بیرون می‌آید) */
  for (let i = 0; i < 48; i++) {
    if (st.phase === "listen") {
      if (now < st.phaseEnds) break;
      st.phase = "guess";
      st.phaseEnds = st.phaseEnds + SHER_GUESS_MS; // پاک‌کردن answers لازم نیست — آهنگ جدید answers را صفر می‌کند
      st.seq += 1;
      mutated = true;
      continue;
    }
    if (st.phase === "guess") {
      /* ربات‌ها — تأخیر قطعی از شروع زمان‌بندی‌شدهٔ فاز guess */
      if (st.song) {
        const elapsed = now - (st.phaseEnds - SHER_GUESS_MS);
        for (const p of st.players) {
          if (!isBotId(p.id)) continue;
          if (st.answers[p.id]) continue;
          if (elapsed < botDelayMs(p.id, st)) continue;
          const level = botLevel(p.id, st);
          const knows = botKnows(p.id, st);
          const payload = botPayload(st, p.id, level, knows);
          const correct = judgeSher(level, payload, st.song);
          st.answers[p.id] = { level, correct, payload };
          if (correct) st.scores[p.id] = (st.scores[p.id] ?? 0) + SHER_LEVEL_POINTS[level];
          st.seq += 1;
          mutated = true;
        }
      }
      if (now < st.phaseEnds) break;
      st.phase = "reveal";
      st.phaseEnds = st.phaseEnds + SHER_REVEAL_MS;
      st.seq += 1;
      mutated = true;
      continue;
    }
    /* reveal → دور بعد یا پایان مسابقه */
    if (now < st.phaseEnds) break;
    if (st.round >= st.totalRounds) {
      st.phase = "done";
      st.result = buildSherResult(st);
      st.seq += 1;
      mutated = true;
      break;
    }
    st.round += 1;
    const next = st.songs[st.round - 1];
    st.song = next ? makeRoundSong(next, st.songs) : null;
    st.answers = Object.fromEntries(st.players.map((p) => [p.id, null])); // پاسخ‌های دور جدید صفر
    st.phase = "listen";
    st.phaseEnds = st.phaseEnds + SHER_LISTEN_MS;
    st.seq += 1;
    mutated = true;
  }
  return { mutated };
}

/* ---------- نمای هر عضو ---------- */

/** نمای اختصاصی هر عضو — حیاتی: answerLine/answerIndex هرگز در فازهای
    listen/guess بیرون نمی‌رود؛ myAnswer بدون درستی (تا reveal پنهان می‌ماند)؛
    hintFirst/hintLast فقط در guess. کلاینت هیچ محاسبهٔ قانونی ندارد. */
export function buildSherView(
  st: SherRoomState,
  memberId: string,
  members: { id: string; name: string; bot: boolean; online: boolean }[],
  now: number,
): SherView {
  const reveal = st.phase === "reveal" || st.phase === "done";
  const infoOf = (id: string) => members.find((m) => m.id === id);
  const players = st.players.map((p) => {
    const info = infoOf(p.id);
    return {
      id: p.id,
      name: info?.name ?? p.name,
      team: p.team,
      bot: info?.bot ?? isBotId(p.id),
      online: info?.online ?? isBotId(p.id),
    };
  });
  const song = st.song;
  const words = song ? song.answerLine.trim().split(/\s+/).filter(Boolean) : [];
  const myRecord = st.answers[memberId] ?? null;
  const answeredCount = st.players.filter((p) => st.answers[p.id]).length;
  return {
    startedAtMs: st.startedAtMs,
    now,
    seq: st.seq,
    mode: st.mode,
    round: st.round,
    totalRounds: st.totalRounds,
    phase: st.phase,
    phaseEnds: st.phaseEnds,
    song: song
      ? {
          filename: song.filename,
          title: song.title,
          artist: song.artist,
          clipStart: song.clipStart,
          contextLines: song.contextLines,
          options: song.options, // در listen هم می‌رود — نفی امن؛ نمایش با فاز guess است
          answerLine: reveal ? song.answerLine : null,
          answerIndex: reveal ? song.answerIndex : null,
        }
      : null,
    players,
    myAnswer: myRecord ? { level: myRecord.level, payload: myRecord.payload } : null,
    revealed: reveal ? st.answers : null,
    answeredCount,
    hintFirst: st.phase === "guess" && words.length > 0 ? (words[0] ?? null) : null,
    hintLast:
      st.phase === "guess" && words.length > 0 ? (words[words.length - 1] ?? null) : null,
    scores: st.scores,
    finished: st.phase === "done",
    result: st.result,
  };
}
