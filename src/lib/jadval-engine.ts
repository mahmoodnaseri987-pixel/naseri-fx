/* بازی «رقابت جدول» — مغز سمت سرور.
   ⚠️ فقط در مسیرهای سرور ایمپورت شود: این ماژول پاسخ‌های جدول را می‌داند
   و نباید هیچ‌گاه در بستهٔ کلاینت ظاهر شود. کلاینت فقط jadval-shared.ts. */

import puzzleData from "@/data/jadval-puzzles.json";
import { type AgeGroup, normalizeAgeGroup } from "@/lib/arena-game";
import {
  JADVAL_DRAW_BONUS,
  JADVAL_LOSE_BONUS,
  JADVAL_MATCH_MS,
  JADVAL_START_DELAY_MS,
  JADVAL_TEAM_A,
  JADVAL_TEAM_B,
  JADVAL_WIN_BONUS,
  type JadvalRoomState,
  type JadvalResult,
  type JadvalTeam,
  type JadvalView,
  normalizeFa,
} from "@/lib/jadval-shared";

type RawPuzzleWord = {
  i: number;
  r: number;
  c: number;
  d: "h" | "v";
  len: number;
  num: number;
  clue: string;
  ans: string;
};

type RawPuzzle = {
  id: string;
  title: string;
  size: number;
  rows: string[];
  words: RawPuzzleWord[];
};

const PUZZLES = puzzleData.puzzles as unknown as RawPuzzle[];

const puzzleById = new Map(PUZZLES.map((p) => [p.id, p]));

export function jadvalPuzzleCount(): number {
  return PUZZLES.length;
}

/**
 * جدول تصادفی — تا می‌تواند همان جدول قبلی اتاق را تکرار نکند.
 * متناسب با گروه سنی: کودکان ← جدول‌های سبک‌تر (واژه‌های کمتر)،
 * حرفه‌ای‌ها ← جدول‌های سنگین‌تر (واژه‌های بیشتر)، بزرگسالان ← همه.
 */
export function pickJadvalPuzzle(excludeId?: string, age: AgeGroup = "adult"): RawPuzzle {
  let pool: RawPuzzle[] = PUZZLES;
  if (age !== "adult") {
    const sorted = [...PUZZLES].sort((a, b) => a.words.length - b.words.length);
    const third = Math.max(1, Math.floor(sorted.length / 3));
    pool = age === "kid" ? sorted.slice(0, third) : sorted.slice(-third);
  }
  if (pool.length > 1 && excludeId) pool = pool.filter((p) => p.id !== excludeId);
  return pool[Math.floor(Math.random() * pool.length)];
}

function getPuzzle(id: string): RawPuzzle | null {
  return puzzleById.get(id) ?? null;
}

/* ---------- ساخت وضعیت شروع ---------- */

export function createJadvalState(
  members: { memberId: string; name: string }[],
  ageRaw: unknown = "adult",
): JadvalRoomState {
  const age: AgeGroup = normalizeAgeGroup(ageRaw);
  /* تیم‌بندی متوازن: به ترتیب ورود، یکی‌درمیان */
  const teams: Record<string, JadvalTeam> = {};
  const ordered = [...members].sort((a, b) => a.memberId.localeCompare(b.memberId));
  ordered.forEach((m, idx) => {
    teams[m.memberId] = idx % 2 === 0 ? JADVAL_TEAM_A : JADVAL_TEAM_B;
  });
  const puzzle = pickJadvalPuzzle(undefined, age);
  return {
    game: "jadval-race",
    startedAtMs: Date.now() + JADVAL_START_DELAY_MS,
    matchMs: JADVAL_MATCH_MS,
    puzzleId: puzzle.id,
    teams,
    solved: { A: [], B: [] },
    wrongs: { A: 0, B: 0 },
    lockUntil: { A: 0, B: 0 },
    result: null,
  };
}

export function parseJadvalState(raw: string): JadvalRoomState | null {
  try {
    const data = JSON.parse(raw) as JadvalRoomState;
    if (
      data &&
      data.game === "jadval-race" &&
      typeof data.startedAtMs === "number" &&
      typeof data.puzzleId === "string" &&
      data.teams &&
      data.solved &&
      Array.isArray(data.solved.A) &&
      Array.isArray(data.solved.B) &&
      data.lockUntil
    ) {
      return data;
    }
  } catch {
    /* خراب — حالت خالی */
  }
  return null;
}

/** تیم عضو از JSON خام — سبک، برای استریم و چت */
export function jadvalTeamOfRaw(raw: string, memberId: string): JadvalTeam | null {
  try {
    const data = JSON.parse(raw) as JadvalRoomState;
    return data?.game === "jadval-race" ? (data.teams?.[memberId] ?? null) : null;
  } catch {
    return null;
  }
}

/* ---------- بررسی پاسخ ---------- */

export function jadvalWordTotal(state: JadvalRoomState): number {
  return getPuzzle(state.puzzleId)?.words.length ?? 0;
}

export function isJadvalWordSolved(state: JadvalRoomState, team: JadvalTeam, wordIdx: number): boolean {
  return state.solved[team].includes(wordIdx);
}

/** نتیجهٔ بررسی یک پاسخ — true یعنی درست بود و باید ثبت شود */
export function isJadvalAnswerCorrect(state: JadvalRoomState, wordIdx: number, text: string): boolean {
  const puzzle = getPuzzle(state.puzzleId);
  if (!puzzle) return false;
  const word = puzzle.words[wordIdx];
  if (!word) return false;
  return normalizeFa(text) === normalizeFa(word.ans);
}

/** املای رسمی واژه — برای پیام چت تیمی پس از پاسخ درست */
export function getJadvalWordAnswer(state: JadvalRoomState, wordIdx: number): string | null {
  return getPuzzle(state.puzzleId)?.words[wordIdx]?.ans ?? null;
}

/* ---------- امتیاز و نتیجه ---------- */

export function jadvalBonusFor(winner: JadvalTeam | null, team: JadvalTeam): number {
  if (winner === null) return JADVAL_DRAW_BONUS;
  return winner === team ? JADVAL_WIN_BONUS : JADVAL_LOSE_BONUS;
}

export function buildJadvalResult(
  state: JadvalRoomState,
  members: { memberId: string; name: string }[],
): JadvalResult {
  const total = jadvalWordTotal(state);
  const solvedA = state.solved.A.length;
  const solvedB = state.solved.B.length;
  const winner: JadvalTeam | null = solvedA === solvedB ? null : solvedA > solvedB ? JADVAL_TEAM_A : JADVAL_TEAM_B;
  return {
    winner,
    teams: [
      { id: JADVAL_TEAM_A, solved: solvedA, total },
      { id: JADVAL_TEAM_B, solved: solvedB, total },
    ],
    members: members.map((m) => {
      const team = state.teams[m.memberId] ?? JADVAL_TEAM_A;
      return { id: m.memberId, name: m.name, team, bonus: jadvalBonusFor(winner, team) };
    }),
  };
}

/* ---------- نمای اختصاصی هر عضو ---------- */

export function buildJadvalView(state: JadvalRoomState, memberId: string, now: number): JadvalView | null {
  const puzzle = getPuzzle(state.puzzleId);
  if (!puzzle) return null;

  const team = state.teams[memberId] ?? JADVAL_TEAM_A;
  const rival: JadvalTeam = team === JADVAL_TEAM_A ? JADVAL_TEAM_B : JADVAL_TEAM_A;
  const total = puzzle.words.length;

  const putWord = (target: string[], w: RawPuzzleWord) => {
    for (let k = 0; k < w.len; k++) {
      const r = w.r + (w.d === "v" ? k : 0);
      const c = w.c + (w.d === "h" ? k : 0);
      target[r * puzzle.size + c] = w.ans[k] ?? "";
    }
  };

  /* حروف تیم من + واژه‌های خط‌خوردهٔ رقیب.
     هر واژه فقط یک‌بار رقابت‌پذیر است: هر تیمی زودتر بزند مال خودش می‌شود،
     ولی حروفش برای هر دو تیم آشکار می‌شود — «هر جواب راهنمای سؤال‌های بعدی». */
  const cells: string[] = new Array(puzzle.size * puzzle.size).fill("");
  for (const idx of state.solved[team]) {
    const w = puzzle.words[idx];
    if (w) putWord(cells, w);
  }
  const lost = [...state.solved[rival]].sort((a, b) => a - b);
  for (const idx of lost) {
    const w = puzzle.words[idx];
    if (w) putWord(cells, w);
  }

  /* نوار پیشرفت هر دو تیم — تیم خودم اول */
  const teamsProgress = [
    { id: JADVAL_TEAM_A, solved: state.solved.A.length, total },
    { id: JADVAL_TEAM_B, solved: state.solved.B.length, total },
  ].sort((a, b) => (a.id === team ? -1 : b.id === team ? 1 : 0));

  /* بعد از پایان مسابقه: جدول کامل آشکار می‌شود */
  let solution: string[] | null = null;
  if (state.result) {
    solution = new Array(puzzle.size * puzzle.size).fill("");
    for (const w of puzzle.words) putWord(solution, w);
  }

  return {
    startedAtMs: state.startedAtMs,
    matchMs: state.matchMs,
    endsInMs: Math.max(0, state.startedAtMs + state.matchMs - now),
    puzzle: {
      id: puzzle.id,
      title: puzzle.title,
      size: puzzle.size,
      rows: puzzle.rows,
      words: puzzle.words.map((w) => ({
        i: w.i,
        r: w.r,
        c: w.c,
        d: w.d,
        len: w.len,
        num: w.num,
        clue: w.clue,
      })),
    },
    myTeam: team,
    teams: teamsProgress,
    cells,
    solved: [...state.solved[team]].sort((a, b) => a - b),
    lost,
    wrongs: state.wrongs[team],
    lockUntilMs: state.lockUntil[team] > now ? state.lockUntil[team] : 0,
    result: state.result,
    solution,
  };
}
