/* ================================================================
   بازی گروهی «صحنه‌گردان» — پانتومیم کارتی بدون دوربین
   اجزای مشترک کلاینت/سرور: کاتالوگ کارت‌ها، ثابت‌ها و تایپ‌ها.
   هیچ واژهٔ مخفی اینجا نیست — واژه‌ها فقط در scene-engine.ts (سمت سرور)
   زندگی می‌کنند و فقط به خودِ کارگردان می‌رسند.
   همگام‌سازی: فقط مختصات و کلید کارت‌ها رد و بدل می‌شود — چند صد بایت.
   ================================================================ */

export const SCENE_GAME_SLUG = "scene-director";

/* ---------- ثابت‌های زمان و امتیاز ---------- */

export const SCENE_START_DELAY_MS = 5_000; // شمارش معکوس شروع
export const SCENE_BUILD_MS = 90_000; // زمان چیدن صحنه — کلاسیک و حذفی‌ها
export const SCENE_BUILD_MS_FRAMES = 120_000; // سه‌کادری — سه کادر بیشتر وقت می‌خواهد
export const SCENE_REVEAL_MS = 14_000; // افشای واژه + تایم‌لپس بین دورها
export const SCENE_MAX_CARDS = 12; // سقف کارت — فشار خلاقیت
export const SCENE_MAX_CARDS_PER_FRAME = 8; // سه‌کادری — هر کادر
export const SCENE_LIMITED_TOOLBOX = 8; // حذفی‌ها — جعبه‌ابزار تصادفی ۸ کارتی
export const SCENE_MAX_ROUNDS = 6; // هر بازیکن یک نوبت کارگردانی (سقف)
export const SCENE_HISTORY_CAP = 24; // حداکثر اسنپ‌شات تایم‌لپس هر دور

export const SCENE_POINTS_FIRST = 10; // حدس درست اول
export const SCENE_POINTS_LATER = 5; // حدس درست بعدی‌ها
export const SCENE_POINTS_DIRECTOR = 3; // کارگردان به‌ازای هر حدس‌زن
export const SCENE_MINIMALIST_CARDS = 5; // جایزهٔ مینیمالیست: صحنه با حداکثر این تعداد کارت
export const SCENE_POINTS_MINIMALIST = 2; // امتیاز جایزهٔ مینیمالیست برای کارگردان

export const SCENE_MODES = ["classic", "frames", "limited"] as const;
export type SceneMode = (typeof SCENE_MODES)[number];

export const SCENE_MODE_LABELS: Record<SceneMode, { fa: string; en: string }> = {
  classic: { fa: "کلاسیک", en: "Classic" },
  frames: { fa: "فیلم‌ساز ۳کادری", en: "3-Frame Film" },
  limited: { fa: "حذفی‌ها", en: "Limited Cards" },
};

export const SCENE_FRAME_TITLES: Record<SceneMode, readonly string[]> = {
  classic: ["صحنه"],
  frames: ["کادر ۱ — شروع", "کادر ۲ — اتفاق", "کادر ۳ — پایان"],
  limited: ["صحنه"],
};

/* ---------- کاتالوگ کارت‌ها — ایموجی فرهنگ‌محور، بدون واژهٔ مخفی ---------- */

export type SceneCardCat = "actor" | "obj" | "feel" | "shape" | "bg";

export type SceneCardDef = {
  k: string; // کلید یکتا — در state فقط همین می‌آید
  e: string; // ایموجی
  fa: string;
  en: string;
  cat: SceneCardCat;
};

export const SCENE_CARDS: readonly SceneCardDef[] = [
  /* بازیگرها */
  { k: "a.man", e: "🧍", fa: "آدم", en: "Person", cat: "actor" },
  { k: "a.kid", e: "🧒", fa: "کودک", en: "Kid", cat: "actor" },
  { k: "a.woman", e: "👩", fa: "زن", en: "Woman", cat: "actor" },
  { k: "a.grandpa", e: "👴", fa: "پیرمرد", en: "Grandpa", cat: "actor" },
  { k: "a.grandma", e: "👵", fa: "پیرزن", en: "Grandma", cat: "actor" },
  { k: "a.cat", e: "🐈", fa: "گربه", en: "Cat", cat: "actor" },
  { k: "a.dog", e: "🐕", fa: "سگ", en: "Dog", cat: "actor" },
  { k: "a.bird", e: "🐦", fa: "پرنده", en: "Bird", cat: "actor" },
  { k: "a.fish", e: "🐟", fa: "ماهی", en: "Fish", cat: "actor" },
  { k: "a.chicken", e: "🐔", fa: "مرغ", en: "Chicken", cat: "actor" },
  { k: "a.horse", e: "🐎", fa: "اسب", en: "Horse", cat: "actor" },
  { k: "a.cow", e: "🐄", fa: "گاو", en: "Cow", cat: "actor" },
  { k: "a.ghost", e: "👻", fa: "روح", en: "Ghost", cat: "actor" },
  { k: "a.robot", e: "🤖", fa: "ربات", en: "Robot", cat: "actor" },
  /* اشیا */
  { k: "o.chair", e: "🪑", fa: "صندلی", en: "Chair", cat: "obj" },
  { k: "o.door", e: "🚪", fa: "در", en: "Door", cat: "obj" },
  { k: "o.phone", e: "☎️", fa: "تلفن", en: "Phone", cat: "obj" },
  { k: "o.ball", e: "⚽", fa: "توپ", en: "Ball", cat: "obj" },
  { k: "o.fire", e: "🔥", fa: "آتش", en: "Fire", cat: "obj" },
  { k: "o.water", e: "💧", fa: "آب", en: "Water", cat: "obj" },
  { k: "o.car", e: "🚗", fa: "ماشین", en: "Car", cat: "obj" },
  { k: "o.food", e: "🍚", fa: "غذا", en: "Food", cat: "obj" },
  { k: "o.tea", e: "☕", fa: "چای", en: "Tea", cat: "obj" },
  { k: "o.samovar", e: "🫖", fa: "سماور", en: "Samovar", cat: "obj" },
  { k: "o.tv", e: "📺", fa: "تلویزیون", en: "TV", cat: "obj" },
  { k: "o.bike", e: "🚲", fa: "دوچرخه", en: "Bike", cat: "obj" },
  { k: "o.umbrella", e: "☂️", fa: "چتر", en: "Umbrella", cat: "obj" },
  { k: "o.key", e: "🔑", fa: "کلید", en: "Key", cat: "obj" },
  { k: "o.book", e: "📚", fa: "کتاب", en: "Book", cat: "obj" },
  { k: "o.bed", e: "🛏️", fa: "تخت", en: "Bed", cat: "obj" },
  { k: "o.window", e: "🪟", fa: "پنجره", en: "Window", cat: "obj" },
  { k: "o.lamp", e: "💡", fa: "چراغ", en: "Lamp", cat: "obj" },
  { k: "o.gift", e: "🎁", fa: "هدیه", en: "Gift", cat: "obj" },
  { k: "o.clock", e: "⏰", fa: "ساعت", en: "Clock", cat: "obj" },
  { k: "o.apple", e: "🍎", fa: "سیب", en: "Apple", cat: "obj" },
  { k: "o.bread", e: "🫓", fa: "نان", en: "Bread", cat: "obj" },
  { k: "o.medicine", e: "💊", fa: "دارو", en: "Medicine", cat: "obj" },
  { k: "o.basket", e: "🧺", fa: "سبد", en: "Basket", cat: "obj" },
  { k: "o.broom", e: "🧹", fa: "جارو", en: "Broom", cat: "obj" },
  { k: "o.ladder", e: "🪜", fa: "نردبان", en: "Ladder", cat: "obj" },
  { k: "o.boat", e: "🛶", fa: "قایق", en: "Boat", cat: "obj" },
  { k: "o.balloon", e: "🎈", fa: "بادکنک", en: "Balloon", cat: "obj" },
  { k: "o.cake", e: "🎂", fa: "کیک", en: "Cake", cat: "obj" },
  { k: "o.flower", e: "🌸", fa: "گل", en: "Flower", cat: "obj" },
  { k: "o.tree", e: "🌳", fa: "درخت", en: "Tree", cat: "obj" },
  /* حس و حرکت */
  { k: "e.arrow", e: "➡️", fa: "فلش", en: "Arrow", cat: "feel" },
  { k: "e.speed", e: "💨", fa: "سرعت", en: "Speed", cat: "feel" },
  { k: "e.wow", e: "❗", fa: "تعجب", en: "Wow", cat: "feel" },
  { k: "e.heart", e: "❤️", fa: "قلب", en: "Heart", cat: "feel" },
  { k: "e.think", e: "💭", fa: "ابر فکر", en: "Thought", cat: "feel" },
  { k: "e.sweat", e: "💦", fa: "عرق", en: "Sweat", cat: "feel" },
  { k: "e.scared", e: "😨", fa: "ترس", en: "Scared", cat: "feel" },
  { k: "e.happy", e: "😄", fa: "شادی", en: "Happy", cat: "feel" },
  { k: "e.cry", e: "😢", fa: "گریه", en: "Cry", cat: "feel" },
  { k: "e.angry", e: "😠", fa: "خشم", en: "Angry", cat: "feel" },
  { k: "e.sleep", e: "💤", fa: "خواب", en: "Sleep", cat: "feel" },
  { k: "e.sick", e: "🤒", fa: "بیماری", en: "Sick", cat: "feel" },
  { k: "e.cold", e: "❄️", fa: "سرما", en: "Cold", cat: "feel" },
  { k: "e.hot", e: "🥵", fa: "گرما", en: "Hot", cat: "feel" },
  { k: "e.dizzy", e: "💫", fa: "گیجی", en: "Dizzy", cat: "feel" },
  { k: "e.music", e: "🎵", fa: "موسیقی", en: "Music", cat: "feel" },
  { k: "e.talk", e: "💬", fa: "حرف", en: "Talk", cat: "feel" },
  { k: "e.question", e: "❓", fa: "سؤال", en: "Question", cat: "feel" },
  { k: "e.x", e: "❌", fa: "نفی", en: "No", cat: "feel" },
  { k: "e.check", e: "✅", fa: "تأیید", en: "Yes", cat: "feel" },
  { k: "e.star", e: "⭐", fa: "ستاره", en: "Star", cat: "feel" },
  /* شکل‌های پایه */
  { k: "s.circle", e: "⚪", fa: "دایره", en: "Circle", cat: "shape" },
  { k: "s.square", e: "⬜", fa: "مربع", en: "Square", cat: "shape" },
  { k: "s.triangle", e: "🔺", fa: "مثلث", en: "Triangle", cat: "shape" },
  { k: "s.line", e: "➖", fa: "خط", en: "Line", cat: "shape" },
  { k: "s.cross", e: "➕", fa: "صلیب", en: "Cross", cat: "shape" },
  /* پس‌زمینه‌ها — حداکثر یکی روی صحنه */
  { k: "bg.night", e: "🌃", fa: "شب", en: "Night", cat: "bg" },
  { k: "bg.rain", e: "🌧️", fa: "باران", en: "Rain", cat: "bg" },
  { k: "bg.sea", e: "🌊", fa: "دریا", en: "Sea", cat: "bg" },
  { k: "bg.street", e: "🛣️", fa: "خیابان", en: "Street", cat: "bg" },
  { k: "bg.kitchen", e: "🍳", fa: "آشپزخانه", en: "Kitchen", cat: "bg" },
  { k: "bg.mountain", e: "⛰️", fa: "کوهستان", en: "Mountain", cat: "bg" },
  { k: "bg.forest", e: "🌲", fa: "جنگل", en: "Forest", cat: "bg" },
  { k: "bg.home", e: "🏠", fa: "خانه", en: "Home", cat: "bg" },
  { k: "bg.day", e: "☀️", fa: "روز", en: "Day", cat: "bg" },
  { k: "bg.desert", e: "🏜️", fa: "کویر", en: "Desert", cat: "bg" },
  { k: "bg.hospital", e: "🏥", fa: "بیمارستان", en: "Hospital", cat: "bg" },
  { k: "bg.party", e: "🎉", fa: "جشن", en: "Party", cat: "bg" },
];

export const SCENE_CARD_MAP: ReadonlyMap<string, SceneCardDef> = new Map(
  SCENE_CARDS.map((c) => [c.k, c]),
);

/** رنگ تُن پس‌زمینهٔ صحنه برای هر کارت پس‌زمینه — دسترسی‌پذیر و کنتراست بالا */
export const SCENE_BG_TONES: Record<string, string> = {
  "": "bg-gradient-to-b from-zinc-800/80 to-zinc-900",
  "bg.night": "bg-gradient-to-b from-indigo-950 to-slate-900",
  "bg.rain": "bg-gradient-to-b from-slate-700 to-slate-900",
  "bg.sea": "bg-gradient-to-b from-sky-800 to-sky-950",
  "bg.street": "bg-gradient-to-b from-zinc-700 to-zinc-900",
  "bg.kitchen": "bg-gradient-to-b from-amber-900/80 to-zinc-900",
  "bg.mountain": "bg-gradient-to-b from-slate-600 to-slate-900",
  "bg.forest": "bg-gradient-to-b from-emerald-900 to-emerald-950",
  "bg.home": "bg-gradient-to-b from-orange-900/70 to-zinc-900",
  "bg.day": "bg-gradient-to-b from-sky-600 to-sky-800",
  "bg.desert": "bg-gradient-to-b from-amber-700 to-amber-950",
  "bg.hospital": "bg-gradient-to-b from-cyan-900 to-slate-900",
  "bg.party": "bg-gradient-to-b from-fuchsia-900 to-zinc-900",
};

/* ---------- انواع دادهٔ وضعیت سرور (Room.state) ---------- */

/** یک کارت روی صحنه — فقط کلید و مختصات؛ همگام‌سازی سبک */
export type ScenePlaced = {
  k: string; // کلید کارت از کاتالوگ
  x: number; // ۰ تا ۱۰۰
  y: number; // ۰ تا ۱۰۰
  r: number; // چرخش (درجه)
  f?: boolean; // آینه‌شده
  s?: number; // مقیاس ۱ | ۱٫۵ | ۲
};

export type SceneBoard = { bg: string; frames: ScenePlaced[][] }; // کادرهای ۱ یا ۳تایی

export type SceneGuess = { id: string; name: string; text: string; atMs: number };

export type SceneScorer = { id: string; name: string; points: number; atMs: number };

export type SceneRound = {
  word: string; // واژهٔ مخفی — فقط برای کارگردان در فاز build
  directorId: string;
  directorName: string;
  board: SceneBoard; // صحنهٔ جاری — خالی تا کارگردان بچیند
  history: SceneBoard[]; // تایم‌لپس — اسنپ‌شات‌های چیدمان
  guesses: SceneGuess[]; // فید حدس‌ها (همه می‌بینند)
  scorers: SceneScorer[]; // حدس‌زن‌های درست این دور
  toolbox: string[] | null; // حذفی‌ها: کلیدهای مجاز؛ null یعنی همه
};

export type ScenePlayer = { id: string; name: string };

export type SceneResult = {
  rows: { id: string; name: string; score: number; rank: number }[];
  awards: {
    oscar?: { id: string; name: string; detail: string }; // کارگردان اسکار — بیشترین امتیاز کارگردانی
    eagle?: { id: string; name: string; detail: string }; // سریع‌ترین چشم — بیشترین حدس اول
    mini?: { id: string; name: string; detail: string }; // مینیمالیست — صحنهٔ درست با کمترین کارت
  };
};

export type SceneRoomState = {
  game: typeof SCENE_GAME_SLUG;
  startedAtMs: number;
  seq: number; // گارد نوشتن — فقط رو به جلو
  mode: SceneMode;
  players: ScenePlayer[];
  round: number; // ۱ تا totalRounds
  totalRounds: number;
  phase: "build" | "reveal" | "done";
  phaseEnds: number; // epoch ms
  rounds: SceneRound[]; // همهٔ دورها از قبل ساخته شده‌اند (واژه + کارگردان)
  scores: Record<string, number>;
  result: SceneResult | null;
};

/* ---------- نمای کلاینت ---------- */

export type SceneView = {
  startedAtMs: number;
  now: number;
  seq: number;
  mode: SceneMode;
  round: number;
  totalRounds: number;
  phase: "build" | "reveal" | "done";
  phaseEnds: number;
  players: { id: string; name: string; bot: boolean; online: boolean; score: number }[];
  directorId: string;
  directorName: string;
  isMyTurn: boolean; // کارگردانِ دور جاری من هستم
  word: string | null; // فقط کارگردان در فاز build یا همه در فاز reveal
  toolbox: string[] | null; // سقف ابزار دور جاری — فقط برای کارگردان معنا دارد
  frameCount: number; // ۱ یا ۳
  board: SceneBoard | null;
  history: SceneBoard[] | null; // فقط در reveal/done — برای پخش تایم‌لپس
  cardCount: number; // تعداد کارت‌های به‌کاررفتهٔ دور جاری
  maxCards: number; // سقف کارت دور جاری
  guesses: SceneGuess[];
  solvedCount: number;
  scores: Record<string, number>;
  finished: boolean;
  result: SceneResult | null;
  lobbyHint?: boolean;
}

/* خواندن امن حالت انتخابی میزبان از JSON خام state لابی — الگوی sherLobbyMode */
export function sceneLobbyMode(raw: string): SceneMode | null {
  try {
    const d = JSON.parse(raw) as { sceneMode?: unknown };
    if (typeof d.sceneMode === "string" && (SCENE_MODES as readonly string[]).includes(d.sceneMode)) {
      return d.sceneMode as SceneMode;
    }
  } catch {
    /* خراب — پیش‌فرض */
  }
  return null;
};
