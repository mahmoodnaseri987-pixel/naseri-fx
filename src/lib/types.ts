/* اشتراکی بین سرور و کلاینت */

export type PublicApp = {
  id: string;
  nameFa: string;
  nameEn: string;
  categoryFa: string;
  categoryEn: string;
  descFa: string;
  descEn: string;
  icon: string;
  color: string;
  installsFa: string;
  installsEn: string;
  rating: string;
  bazaarUrl: string | null;
  playUrl: string | null;
  sortOrder: number;
};

export type AdminApp = PublicApp & {
  published: boolean;
};

export type ContactInfo = {
  telegram: string;
  whatsapp: string;
  email: string;
  instagram: string;
};

/* اطلاعات ظاهری سایت (لوگو، بنر، موشن گرافیک) */
export type SiteAppearance = {
  logoUrl: string;
  bannerUrl: string;
  aboutImageUrl: string;
  motionUrl: string;
  motionTitleFa: string;
  motionTitleEn: string;
};

export type ContactInfoWithAppearance = ContactInfo & SiteAppearance;

/* نقشه متن‌های قابل ویرایش: کلید → مقدار؛ کلید‌های خالی/نبوده = مقدار پیش‌فرض دیکشنری */
export type SiteContentMap = Record<string, string>;

/* باکس محتوایی برای نمایش عمومی */
export type PublicBox = {
  id: string;
  titleFa: string;
  titleEn: string;
  bodyFa: string;
  bodyEn: string;
  icon: string;
  color: string;
  imageUrl: string;
  videoUrl: string;
  linkUrl: string | null;
  linkLabelFa: string;
  linkLabelEn: string;
  sortOrder: number;
};

/* متادیتای رسانه (بدون محتوا) */
export type MediaMeta = {
  id: string;
  name: string;
  mime: string;
  kind: string;
  size: number;
  createdAt: string;
};

/* بازی برای نمایش عمومی (بدون محتوای HTML) */
export type PublicGame = {
  id: string;
  slug: string;
  titleFa: string;
  titleEn: string;
  descFa: string;
  descEn: string;
  icon: string;
  color: string;
  coverUrl: string;
  plays: number;
  sortOrder: number;
};

/* بازی در پنل مدیریت */
export type AdminGame = PublicGame & {
  published: boolean;
  sizeBytes: number;
  hasFile: boolean;
  createdAt: string;
};

/* اطلاعات عضو (بدون هش رمز) */
export type MemberInfo = {
  id: string;
  name: string;
  username: string;
  avatarUrl: string; // "" یعنی هنوز عکس پروفایل نگذاشته
  createdAt: string;
};

/* عضو در پنل مدیریت */
export type AdminMember = MemberInfo & {
  blocked: boolean;
  lastLoginAt: string | null;
  playCount: number;
  online: boolean; // heartbeat کمتر از ۹۰ ثانیه پیش — همان تعریف پنجرهٔ آنلاین‌ها
};

/* ---------- آرنا: مدیریت بازی‌ها و اتاق‌ها (پنل) ---------- */

export type ArenaGameConfigView = {
  slug: string;
  enabled: boolean;
};

export type AdminArenaGame = {
  slug: string;
  kind: "room" | "banner";
  titleFa: string;
  titleEn: string;
  descFa: string;
  descEn: string;
  icon: "swords" | "zap" | "grid" | "image" | "flame" | "dice" | "music" | "shapes";
  enabled: boolean;
  activeRooms: number;
};

export type AdminArenaRoom = {
  code: string;
  gameSlug: string;
  roomNumber: number;
  status: string;
  memberCount: number;
  maxPlayers: number;
  hostName: string;
  createdAt: string;
  lastActivity: string;
};

/* ---------- بازیابی رمز عبور ---------- */

export type AdminPasswordReset = {
  id: string;
  name: string;
  username: string;
  channel: "sms" | "email" | "admin";
  code: string;
  createdAt: string;
  expiresAt: string;
};

/* ---------- آرنا (اتاق‌های رقابتی) ---------- */

export type ArenaRoomSummary = {
  code: string;
  gameSlug: string;
  roomNumber: number; // شماره نمایشی ۱ تا ۳۰
  status: string; // lobby | playing | finished
  memberCount: number;
  maxPlayers: number;
  hostName: string;
  createdAt: string;
};

export type ArenaMemberView = {
  id: string; // memberId
  name: string;
  isHost: boolean;
  isReady: boolean;
  score: number;
  online: boolean;
  answered: boolean; // در سؤال جواب داده؟
};

export type ArenaGameView = {
  round: number; // سؤال فعلی (از ۰)
  rounds: number;
  phase: "answer" | "reveal";
  endsInMs: number;
  question: { q: string; o: string[]; correctIndex: number | null; cat?: string };
  myChoice: number | null; // پاسخ من به سؤال جاری
};

/* بستهٔ سیگنالینگ WebRTC خطاب‌شده به «من» — برای پیوند مستقیم DataChannel */
export type NabardSigView = {
  i: string; // شناسهٔ یکتا
  f: string; // فرستنده
  to: string;
  k: "offer" | "answer" | "ice";
  sdp?: string;
  cs?: { candidate: string; sdpMid?: string | null; sdpMLineIndex?: number | null }[];
};

/* بازی «نبرد دایره‌ها» در اتاق — داده شبیه‌سازی قطعی مشترک همه بازیکنان */
export type NabardView = {
  startedAtMs: number;
  seed: number;
  players: { id: string; name: string }[];
  snap: {
    t: number;
    el: number;
    cs: [string, number, number, number, number, number, number, number][];
  } | null;
  bq: { id: string; t: number; n?: string }[]; // صف شتاب‌ها — n: ضدتکرار با مسیر مستقیم
  sig: NabardSigView[]; // سیگنالینگ WebRTC خطاب به من
  isHost: boolean; // من میزبانم؟ (فرستنده اسنپ‌شات)
};

/* بازی «میدان آتش» در اتاق — اسنپ‌شات فشرده شبیه‌سازی سمت سرور */
export type FireView = {
  startedAtMs: number;
  simMs: number;
  rage: boolean;
  matchMs: number;
  ps: [string, number, number, number, number, number, number, number][];
  bs: [number, number, number][];
  pl: [number, number][];
  ev: { k: string; a: string; v: string; t: number }[];
  result: { id: string; rank: number; score: number; kills: number; deaths: number }[] | null;
};

/* بازی «رقابت جدول» در اتاق — نمای اختصاصی هر عضو (پاسخ‌ها هرگز ارسال نمی‌شود) */
export type JadvalViewType = import("@/lib/jadval-shared").JadvalView;

/* بازی «حدس تصویر» — پاسخ دور جاری فقط در فاز نمایش می‌آید */
export type PicViewType = import("@/lib/pic-shared").PicView;

/* بازی «منچ» — تختهٔ گروهی؛ همه چیز بازی برای همه دیده می‌شود */
export type LudoViewType = import("@/lib/ludo-shared").LudoView;

/* بازی «شعر یادت نره» — جواب دور در فازهای listen/guess مخفی است */
export type SherViewType = import("@/lib/sher-shared").SherView;

/* بازی «صحنه‌گردان» — واژهٔ مخفی فقط برای کارگردان دور در فاز چیدمان می‌آید */
export type SceneViewType = import("@/lib/scene-shared").SceneView;
export type PcViewType = import("@/lib/proverb-shared").PcView;

export type ArenaStateResponse = {
  now: number;
  me: string;
  room: {
    code: string;
    gameSlug: string;
    roomNumber: number;
    status: string;
    hostId: string;
    maxPlayers: number;
    ageGroup: string; // گروه سنی اتاق — سؤال‌ها متناسب با آن
    ludoTeams: boolean; // منچ — بازی تیمی ۲به۲ (انتخاب میزبان)
  };
  members: ArenaMemberView[];
  game: ArenaGameView | null;
  nabard: NabardView | null;
  fire: FireView | null;
  jadval: JadvalViewType | null;
  pic: PicViewType | null;
  ludo: LudoViewType | null;
  sher: SherViewType | null;
  scene: SceneViewType | null;
  proverb: PcViewType | null;
};

/* ---------- چت (لابی عمومی و داخل اتاق) ---------- */

export type ChatMsgView = {
  id: number;
  memberId: string;
  name: string;
  content: string; // در اعلان سیستمی خالی است
  kind: "user" | "system";
  roomCode: string | null; // اتاق مقصد در اعلان ساخت اتاق
  roomNumber: number; // شماره اتاق در اعلان
  gameSlug: string | null; // بازی اتاق در اعلان
  createdAt: string;
};

export type ChatGetResponse = {
  me: string;
  messages: ChatMsgView[]; // صعودی بر اساس id
  codes: string[]; // کدهای اتاق‌های باز — برای چسب «پیوستن» در متن پیام‌ها
  serverNow: number;
};
