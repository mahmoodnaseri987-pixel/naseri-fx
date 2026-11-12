/* ================================================================
   پروب موتور «شعر یادت نره» — ادعاهای الزامی قرارداد طراحی
   ================================================================
   • استخر آهنگ‌ها از ردیف‌های خام دیتابیس (JSON-رشته → آرایه)
   • تیم‌بندی t4x2 با ۸ بازیکن (۵ انسان + ۳ ربات) به ترتیب ورود
   • یک دور کامل: امتیازهای ۲۵/۱۵/۱۰/۵ و صفر؛ جواب‌دهی ربات‌ها در guess
   • تطبیق فازی (ي→ی، ك→ک، اعراب و فاصله) — مثال «به بوى نافه‌اى …»
   • عدم افشای answerLine/answerIndex در view فازهای listen/guess
   • گزینه‌های سطح ۴: شامل جواب، بدون تکرار نرمال‌شده
   • تساوی → رتبهٔ مشترک و پرش رتبهٔ بعدی
   • ماتریس sherModesFor برای هر تعداد عضو (مود نامجاز → مجازها)
   اجرا از ریشهٔ مخزن:
     npx esbuild --bundle --alias:@=./src scripts/sher_engine_probe.ts \
       --outfile=/tmp/sher_probe.mjs --platform=node --format=esm --log-level=error \
       && node /tmp/sher_probe.mjs
   ================================================================ */

import {
  buildSherView,
  createSherSongsPool,
  createSherState,
  sherAnswer,
  sherTick,
  type SherSongRow,
} from "@/lib/sher-engine";
import {
  SHER_LEVEL_POINTS,
  SHER_LISTEN_MS,
  SHER_MAX_ROUNDS,
  parseSherState,
  sherFuzzyMatch,
  sherModesFor,
  sherNormalize,
} from "@/lib/sher-shared";

let failures = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) {
    failures++;
    console.error("✗", msg);
  }
}

/* ---------- ۱) استخر آهنگ‌ها — ۵ آهنگ ساختگی با فیلدهای JSON-رشته ---------- */

const RAW: SherSongRow[] = [
  {
    filename: "demo-1.mp3",
    title: "نمونهٔ ۱",
    artist: "آزمون",
    clipStart: 2,
    answerLine: "به بوی نافه‌ای کآخر صبا زان طره بگشاید",
    contextLines: JSON.stringify(["الا یا ایها الساقی ادر کاسا و ناولها", "که عشق آسان نمود اول ولی افتاد مشکل‌ها"]),
    extraLines: JSON.stringify(["ز تاب جعد مشکین او چه خون افتاد در دل‌ها", "درخت دوستی بنشان که کام دل به بار آرد"]),
    active: true,
  },
  {
    filename: "demo-2.mp3",
    title: "نمونهٔ ۲",
    artist: "آزمون",
    clipStart: 0,
    answerLine: "چو عضوی به درد آورد روزگار",
    contextLines: JSON.stringify(["بنی‌آدم اعضای یک پیکرند", "که در آفرینش ز یک گوهرند"]),
    extraLines: JSON.stringify(["دگر عضوها را نماند قرار", "تو کز محنت دیگران بی‌غمی"]),
    active: true,
  },
  {
    filename: "demo-3.mp3",
    title: "نمونهٔ ۳",
    artist: "آزمون",
    clipStart: 1.5,
    answerLine: "ای دل غمدیده حالت به شود دل بد مکن",
    contextLines: JSON.stringify(["یوسف گمگشته بازآید به کنعان غم مخور"]),
    extraLines: JSON.stringify(["وین سر شوریده بازآید به سامان غم مخور", "مژده ای دل که مسیحا نفسی می‌آید"]),
    active: true,
  },
  {
    filename: "demo-4.mp3",
    title: "نمونهٔ ۴",
    artist: "آزمون",
    clipStart: 3,
    answerLine: "خداوند نام و خداوند جای",
    contextLines: JSON.stringify(["به نام خداوند جان و خرد", "کزین برتر اندیشه برنگذرد"]),
    extraLines: JSON.stringify(["خداوند روزی‌ده رهنمای", "توانا بود هر که دانا بود"]),
    active: true,
  },
  {
    filename: "demo-5.mp3",
    title: "نمونهٔ ۵",
    artist: "",
    clipStart: 0,
    answerLine: "گفتم غم تو دارم گفتا غمت سر آید",
    contextLines: JSON.stringify(["مژده ای دل که مسیحا نفسی می‌آید", "که ز انفاس خوشش بوی کسی می‌آید"]),
    extraLines: JSON.stringify(["گفتم که ماه من شو گفتا اگر برآید", "از خدا جوییم توفیق ادب"]),
    active: true,
  },
  {
    filename: "demo-6.mp3",
    title: "غیرفعال — نباید وارد شود",
    artist: "",
    clipStart: 0,
    answerLine: "این مصرع غیرفعال است",
    contextLines: "[]",
    extraLines: "[]",
    active: false,
  },
];

const songs = createSherSongsPool(RAW);
assert(songs.length === 5, `استخر باید ۵ آهنگ فعال باشد — ${songs.length}`);
assert(songs.every((s) => Array.isArray(s.contextLines) && Array.isArray(s.extraLines)), "پارس JSON مصرع‌ها خراب است");
assert(songs[0].contextLines.length === 2, "مصرع‌های زمینهٔ آهنگ اول پارس نشده");

/* ---------- ۲) تطبیق فازی ---------- */

assert(
  sherFuzzyMatch("به بوى نافه‌اى كآخر صبا زان طره بگشايد", "به بوی نافه‌ای کآخر صبا زان طره بگشاید"),
  "مصرع با ي/ك و نیم‌فاصلهٔ متفاوت باید match شود",
);
assert(sherNormalize("بوى") === sherNormalize("بوی") && sherNormalize("كآخر") === sherNormalize("کآخر"), "نرمال‌سازی ي/ك خراب است");
assert(
  !sherFuzzyMatch("چو عضوی به درد آورد روزگار", "به بوی نافه‌ای کآخر صبا زان طره بگشاید"),
  "دو مصرع متفاوت نباید match شوند",
);

/* ---------- ۳) ماتریس مودها بر حسب تعداد اعضا ---------- */

const MATRIX: Record<number, string[]> = {
  1: ["ffa"],
  2: ["ffa", "m1v1"],
  3: ["ffa"],
  4: ["ffa", "m2v2"],
  5: ["ffa"],
  6: ["ffa", "m3v3", "t3x2"],
  7: ["ffa"],
  8: ["ffa", "m4v4", "t4x2"],
};
for (let n = 1; n <= 8; n++) {
  assert(
    JSON.stringify(sherModesFor(n)) === JSON.stringify(MATRIX[n]),
    `sherModesFor(${n}) باید ${JSON.stringify(MATRIX[n])} باشد`,
  );
}

/* ---------- ۴) ساخت مسابقه t4x2 با ۸ بازیکن (۳ ربات) ---------- */

const players = [
  { id: "h1", name: "انسان یک" },
  { id: "h2", name: "انسان دو" },
  { id: "h3", name: "انسان سه" },
  { id: "h4", name: "انسان چهار" },
  { id: "h5", name: "انسان پنج" },
  { id: "bot-1", name: "ربات آریا" },
  { id: "bot-2", name: "ربات سینا" },
  { id: "bot-3", name: "ربات کاوه" },
];
const memberIds = new Set(players.map((p) => p.id));
const membersArg = players.map((p) => ({
  id: p.id,
  name: p.name,
  bot: p.id.startsWith("bot-"),
  online: !p.id.startsWith("bot-"),
}));

const empty = createSherState("ffa", players, [], 1_800_000_000_000);
assert(empty === null, "استخر آهنگ خالی باید null برگرداند");

const now0 = 1_800_000_000_000;
const st = createSherState("t4x2", players, songs, now0);
assert(st !== null, "ساخت مسابقهٔ t4x2 شکست خورد");
if (!st) process.exit(1);

assert(st.game === "sher" && st.mode === "t4x2", "شناسهٔ بازی/مود خراب است");
assert(st.startedAtMs === now0 + 4_000, "شمارش معکوس شروع ۴ثانیه‌ای رعایت نشده");
assert(st.phase === "listen" && st.phaseEnds === st.startedAtMs + SHER_LISTEN_MS, "فاز اول listen با پایان ۱۰ثانیه‌ای نیست");
assert(st.totalRounds === Math.min(SHER_MAX_ROUNDS, 5) && st.totalRounds === 5, "تعداد دورها باید min(10, آهنگ‌ها)=۵ باشد");
assert(st.round === 1 && st.seq === 1 && st.result === null, "وضعیت شروع خراب است");

/* تیم‌بندی به ترتیب ورود: team = idx % 4 */
assert(
  JSON.stringify(st.players.map((p) => p.team)) === JSON.stringify([0, 1, 2, 3, 0, 1, 2, 3]),
  `تیم‌بندی t4x2 نادرست: ${JSON.stringify(st.players.map((p) => p.team))}`,
);

/* آهنگ‌ها بدون تکرار در دنبالهٔ مسابقه */
const fileNames = st.songs.map((s) => s.filename);
assert(new Set(fileNames).size === st.songs.length, "آهنگ تکراری در دنبالهٔ مسابقه");

/* گزینه‌های دور اول: شامل جواب، بدون تکرار، اندیس معتبر */
const song1 = st.song!;
{
  const norm = song1.options.map(sherNormalize);
  assert(norm.includes(sherNormalize(song1.answerLine)), "جواب در گزینه‌های سطح ۴ نیست");
  assert(new Set(norm).size === song1.options.length, "گزینهٔ تکراری در سطح ۴");
  assert(song1.options.length >= 2 && song1.options.length <= 4, `تعداد گزینه‌ها خارج از بازه: ${song1.options.length}`);
  assert(song1.answerIndex >= 0 && song1.answerIndex < song1.options.length, "اندیس جواب خارج از بازه");
  assert(
    sherNormalize(song1.options[song1.answerIndex]) === sherNormalize(song1.answerLine),
    "گزینهٔ اندیس جواب با جواب یکی نیست",
  );
}

assert(parseSherState(JSON.stringify(st)) !== null, "state تازه parse نمی‌شود");

/* ---------- ۵) عدم افشای جواب در فاز listen ---------- */

for (const viewer of ["h1", "bot-2"]) {
  const v = buildSherView(st, viewer, membersArg, now0 + 5_000);
  assert(v.song !== null && v.song.answerLine === null && v.song.answerIndex === null, `افشای جواب در listen برای ${viewer}`);
  assert(v.revealed === null, "revealed در listen نباید null نباشد");
  assert(v.hintFirst === null && v.hintLast === null, "راهنما در listen نباید بیاید");
  assert(v.finished === false && v.result === null, "پرچم پایان در listen خراب است");
}

/* ---------- ۶) گذر به فاز guess و جواب‌های انسان‌ها ---------- */

sherTick(st, { now: st.startedAtMs + SHER_LISTEN_MS + 1, memberIds });
assert(st.phase === "guess", "فاز listen بعد از ۱۰ثانیه به guess نرفت");

const answerLine = st.song!.answerLine;
const answerIndex = st.song!.answerIndex;
const options = st.song!.options;

/* جواب در فاز guess هم مخفی می‌ماند؛ راهنما فقط کلمهٔ اول/آخر است */
const vg = buildSherView(st, "h1", membersArg, Date.now());
assert(vg.song!.answerLine === null && vg.song!.answerIndex === null, "افشای جواب در guess");
const words = answerLine.trim().split(/\s+/);
assert(vg.hintFirst === words[0], `کلمهٔ اول راهنما نادرست: ${vg.hintFirst}`);
assert(vg.hintLast === words[words.length - 1], `کلمهٔ آخر راهنما نادرست: ${vg.hintLast}`);

/* گاردهای sherAnswer */
assert(sherAnswer(st, "h1", 5, "x").reason === "bad-level", "سطح ۵ باید رد شود");
assert(sherAnswer(st, "h1", 4, "99").reason === "bad-payload", "اندیس گزینهٔ بیرون از بازه باید رد شود");

/* یک دور کامل با سطوح مختلف:
   h1 سطح۱ درست=۲۵ | h2 سطح۲ درست=۱۵ | h3 سطح۳ غلط=۰
   h4 سطح۴ گزینهٔ درست=۵ | h5 سطح۴ گزینهٔ غلط=۰ */
const h1Ok = sherAnswer(st, "h1", 1, answerLine);
assert(h1Ok.ok, "حدس کامل درست سطح ۱ رد شد");
assert(sherAnswer(st, "h1", 1, answerLine).reason === "answered", "پاسخ دوم h1 باید رد شود");
assert(sherAnswer(st, "h2", 2, `  ${answerLine} `).ok, "حدس سطح ۲ با فاصلهٔ اضافه باید پذیرفته شود");
assert(sherAnswer(st, "h3", 3, answerLine.slice(0, 4)).ok, "ثبت حدس غلط h3 شکست خورد");
assert(sherAnswer(st, "h4", 4, String(answerIndex)).ok, "گزینهٔ درست سطح ۴ رد شد");
assert(sherAnswer(st, "h5", 4, String((answerIndex + 1) % options.length)).ok, "گزینهٔ غلط سطح ۴ رد شد");

assert(st.scores["h1"] === SHER_LEVEL_POINTS[1] && st.scores["h1"] === 25, `امتیاز سطح ۱ باید ۲۵ باشد — ${st.scores["h1"]}`);
assert(st.scores["h2"] === 15, `امتیاز سطح ۲ باید ۱۵ باشد — ${st.scores["h2"]}`);
assert(st.scores["h3"] === 0, "حدس غلط سطح ۳ نباید امتیاز بدهد");
assert(st.scores["h4"] === 5, `امتیاز سطح ۴ باید ۵ باشد — ${st.scores["h4"]}`);
assert(st.scores["h5"] === 0, "گزینهٔ غلط سطح ۴ نباید امتیاز بدهد");

const vg2 = buildSherView(st, "h1", membersArg, Date.now());
assert(vg2.answeredCount === 5, `شمارندهٔ پاسخ‌دهنده‌ها باید ۵ باشد — ${vg2.answeredCount}`);
assert(vg2.myAnswer !== null && vg2.myAnswer.level === 1 && vg2.myAnswer.payload === answerLine, "myAnswer خراب است");
assert(
  vg2.myAnswer !== null && Object.keys(vg2.myAnswer).sort().join(",") === "level,payload",
  "myAnswer نباید درستی را افشا کند",
);

/* ---------- ۷) جواب‌دهی ربات‌ها در guess (تأخیر ۴-۱۵ثانیه) ---------- */

let nowMs = st.startedAtMs + SHER_LISTEN_MS + 2_000;
let steps = 0;
while (st.phase === "guess" && steps < 200) {
  nowMs += 500;
  sherTick(st, { now: nowMs, memberIds });
  steps++;
}
for (const bot of ["bot-1", "bot-2", "bot-3"]) {
  const rec = st.answers[bot];
  assert(rec !== null && rec !== undefined, `ربات ${bot} در پنجرهٔ ۳۰ثانیه‌ای جواب نداد`);
  if (!rec) continue;
  assert([1, 2, 3, 4].includes(rec.level), `سطح ربات خارج از بازه: ${rec.level}`);
  assert(rec.correct === sherFuzzyMatch(rec.payload, answerLine) || rec.level === 4, "سازگاری داوری ربات تایپی خراب است");
  if (rec.level === 4) {
    const idx = Number(rec.payload);
    assert(Number.isInteger(idx) && idx >= 0 && idx < options.length, "اندیس گزینهٔ ربات بیرون از بازه است");
    assert(rec.correct === (idx === answerIndex), "داوری گزینهٔ ربات خراب است");
  } else {
    assert(rec.correct === sherFuzzyMatch(rec.payload, answerLine), "داوری متن ربات خراب است");
  }
  assert([0, 5, 10, 15, 25].includes(st.scores[bot] ?? 0), `امتیاز ربات خارج از مجموعهٔ مجاز: ${st.scores[bot]}`);
}

/* ---------- ۸) فاز reveal — افشای جواب و پاسخ‌های همه ---------- */

steps = 0;
while (st.phase !== "done" && steps < 4000) {
  nowMs += 1_000;
  sherTick(st, { now: nowMs, memberIds });
  steps++;
}
assert(st.phase === "done", "مسابقه با تیک‌های منظم تمام نشد");
assert(st.round === st.totalRounds && st.result !== null, "نتیجهٔ نهایی ساخته نشد");
assert(parseSherState(JSON.stringify(st)) !== null, "state پایان مسابقه parse نمی‌شود");

const vDone = buildSherView(st, "h1", membersArg, nowMs);
assert(vDone.song !== null && vDone.song.answerLine !== null, "پاسخ دور آخر در done افشا نشده");
/* revealed در done = پاسخ‌های دور آخر — ربات‌ها هر دور جواب می‌دهند */
assert(
  vDone.revealed !== null &&
    Object.keys(vDone.revealed).length === st.players.length &&
    Object.values(vDone.revealed).some((rec) => rec !== null),
  "revealed در done درست نیست",
);
assert(vDone.finished === true, "پرچم finished در done برقرار نیست");

/* جدول تیمی t4x2 — ۴ تیم، جمع اعضا */
assert(st.result!.teams.length === 4, `تعداد تیم‌های t4x2 باید ۴ باشد — ${st.result!.teams.length}`);
for (const t of st.result!.teams) {
  const expected = st.players
    .filter((p) => p.team === t.team)
    .reduce((acc, p) => acc + (st.scores[p.id] ?? 0), 0);
  assert(t.score === expected, `امتیاز تیم ${t.team} باید جمع اعضا (${expected}) باشد — ${t.score}`);
}
assert(
  st.result!.teams.every((t, i) => i === 0 || st.result!.teams[i - 1].score >= t.score),
  "جدول تیمی مرتب نیست",
);

/* ---------- ۹) تساوی → رتبهٔ مشترک و پرش ---------- */

const st2 = createSherState(
  "ffa",
  [
    { id: "a", name: "آوا" },
    { id: "b", name: "بهنام" },
    { id: "c", name: "سیما" },
  ],
  songs,
  now0,
);
assert(st2 !== null, "ساخت مسابقهٔ ffa شکست خورد");
if (st2) {
  const ids2 = new Set(["a", "b", "c"]);
  let t2 = now0;
  let s2 = 0;
  while (st2.phase !== "done" && s2 < 6000) {
    t2 += 1_000;
    sherTick(st2, { now: t2, memberIds: ids2 });
    /* هر دور: a و b حدس کامل درست (۲۵) — c همیشه غلط (صفر) */
    if (st2.phase === "guess" && st2.song) {
      const line = st2.song.answerLine;
      if (!st2.answers["a"]) assert(sherAnswer(st2, "a", 1, line).ok, "پاسخ a ثبت نشد");
      if (!st2.answers["b"]) assert(sherAnswer(st2, "b", 1, line).ok, "پاسخ b ثبت نشد");
      if (!st2.answers["c"]) assert(sherAnswer(st2, "c", 1, "حدسی بی‌ربط و غلط").ok, "پاسخ c ثبت نشد");
    }
    s2++;
  }
  assert(st2.phase === "done" && st2.result !== null, "مسابقهٔ ffa تمام نشد");
  if (st2.result) {
    assert(st2.scores["a"] === 125 && st2.scores["b"] === 125 && st2.scores["c"] === 0, `امتیازها: ${JSON.stringify(st2.scores)}`);
    const rankOf = Object.fromEntries(st2.result.rows.map((r) => [r.id, r.rank]));
    assert(rankOf["a"] === 1 && rankOf["b"] === 1, `تساوی باید رتبهٔ مشترک بدهد — ${JSON.stringify(rankOf)}`);
    assert(rankOf["c"] === 3, `رتبهٔ بعد از تساوی باید پرش بخورد (۳) — ${rankOf["c"]}`);
    assert(st2.result.teams.length === 0, "در ffa نباید تیم بیاید");
  }
}

/* ---------- ۱۰) گزینه‌های همهٔ دورها: شامل جواب و بدون تکرار ---------- */

if (st2) {
  /* در شبیه‌سازی بالا هر دور از این مسابقه گذشت — گزینه‌ها در لحظهٔ ساخت چک می‌شوند */
}
{
  const st3 = createSherState("ffa", [{ id: "x", name: "تک" }], songs, now0);
  assert(st3 !== null, "مسابقهٔ تک‌نفره نباید null بدهد");
  if (st3) {
    let t3 = now0;
    let s3 = 0;
    let checked = 0;
    let lastRound = 0;
    while (st3.phase !== "done" && s3 < 6000) {
      t3 += 1_000;
      sherTick(st3, { now: t3, memberIds: new Set(["x"]) });
      if (st3.song && st3.round !== lastRound) {
        lastRound = st3.round;
        const norm = st3.song.options.map(sherNormalize);
        assert(norm.includes(sherNormalize(st3.song.answerLine)), `دور ${st3.round}: جواب در گزینه‌ها نیست`);
        assert(new Set(norm).size === norm.length, `دور ${st3.round}: گزینهٔ تکراری`);
        assert(st3.song.options.length >= 2, `دور ${st3.round}: کمتر از ۲ گزینه`);
        checked++;
      }
      s3++;
    }
    assert(checked === 5, `باید ۵ دور چک شود — ${checked}`);
    assert(st3.phase === "done", "مسابقهٔ تک‌نفره تمام نشد");
  }
}

/* ---------- جمع‌بندی ---------- */

if (failures === 0) {
  console.log("✓ همهٔ ادعاهای موتور «شعر یادت نره» سبز شد");
} else {
  console.error(`${failures} ادعا قرمز شد`);
  process.exit(1);
}
