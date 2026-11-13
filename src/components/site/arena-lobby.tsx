"use client";

/* لابی آرنا — ساخت اتاق، ورود با کد، چت عمومی و فهرست ۳۰ اتاق شماره‌دار.
   کد هر اتاق در چت کلیک‌پذیر است؛ با ساخت اتاق هم اعلان خودکار در چت می‌رود. */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Ban,
  BookOpenText,
  Camera,
  Crown,
  Dices,
  Film,
  Flame,
  Grid3x3,
  Image as ImageIcon,
  LayoutGrid,
  Loader2,
  LogIn,
  MessagesSquare,
  Music,
  Plus,
  RefreshCw,
  Shapes,
  Swords,
  Users,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FadeIn } from "@/components/site/fade-in";
import { useLang } from "@/components/site/language-provider";
import { MemberAvatar } from "@/components/site/member-avatar";
import { AvatarPicker } from "@/components/site/avatar-picker";
import { ChatPanel } from "@/components/site/chat-panel";
import { subscribeStream } from "@/lib/realtime";
import { ARENA_GAME_SLUG, AGE_GROUPS, MAX_PLAYERS, MIN_PLAYERS, type AgeGroup } from "@/lib/arena-game";
import { NABARD_GAME_SLUG } from "@/lib/nabard-engine";
import { JADVAL_GAME_SLUG } from "@/lib/jadval-shared";
import { PIC_GAME_SLUG } from "@/lib/pic-shared";
import { LUDO_GAME_SLUG, LUDO_MAX_PLAYERS } from "@/lib/ludo-shared";
import { SHER_CATEGORIES, SHER_GAME_SLUG, type SherCategory } from "@/lib/sher-shared";
import { SCENE_DIFF_FIRST_POINTS, SCENE_DIFFS, SCENE_GAME_SLUG, SCENE_MODES, type SceneDifficulty, type SceneMode } from "@/lib/scene-shared";
import type { ArenaGameConfigView, ArenaRoomSummary, MemberInfo } from "@/lib/types";

/* کارت ویژهٔ «میدان آتش آفلاین» که از پنل هم قابل حذف است */
const FIRE_BANNER_SLUG = "fire-offline";

type LobbyGame = {
  slug: string;
  title: string;
  desc: string;
  icon: "swords" | "zap" | "grid" | "image" | "dice" | "music" | "shapes";
};

export function ArenaLobby({ member }: { member: MemberInfo }) {
  const { t, lang } = useLang();
  const a = t.arena;
  const r = a.room;
  const router = useRouter();

  const [rooms, setRooms] = useState<ArenaRoomSummary[] | null>(null);
  const [gamesCfg, setGamesCfg] = useState<ArenaGameConfigView[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [gameSlug, setGameSlug] = useState<string>(ARENA_GAME_SLUG);
  const [playerCount, setPlayerCount] = useState<number>(MAX_PLAYERS);
  const [ageGroup, setAgeGroup] = useState<AgeGroup>("adult");
  const [sherCategory, setSherCategory] = useState<SherCategory>("nostalgia"); // بخش آهنگ‌های «شعر یادت نره»
  const [sherMode, setSherMode] = useState(false); // جدول: حالت شرح‌در‌متن
  const [sceneMode, setSceneMode] = useState<SceneMode>("classic"); // صحنه‌گردان: حالت بازی
  const [sceneDifficulty, setSceneDifficulty] = useState<SceneDifficulty>("easy"); // صحنه‌گردان: سختی و امتیاز

  /* ظرفیت مجاز بازی انتخابی — منچ حداکثر ۴ نفر (چهار رنگ) */
  const capacityMax = gameSlug === LUDO_GAME_SLUG ? LUDO_MAX_PLAYERS : MAX_PLAYERS;
  const isJadval = gameSlug === JADVAL_GAME_SLUG;
  const isScene = gameSlug === SCENE_GAME_SLUG;
  useEffect(() => {
    if (playerCount > capacityMax) setPlayerCount(capacityMax);
  }, [capacityMax, playerCount]);
  /* تغییر بازی — حالت‌های اختصاصی هر بازی فقط برای همان بازی می‌مانند */
  useEffect(() => {
    if (!isJadval) setSherMode(false);
  }, [isJadval]);
  useEffect(() => {
    if (!isScene) {
      setSceneMode("classic");
      setSceneDifficulty("easy");
    }
  }, [isScene]);

  const numFmt = useCallback(
    (n: number) => new Intl.NumberFormat(lang === "fa" ? "fa-IR" : "en-US").format(n),
    [lang],
  );

  const loadRooms = useCallback(async () => {
    try {
      const res = await fetch("/api/arena/rooms", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setRooms(data.rooms ?? []);
      if (Array.isArray(data.games)) setGamesCfg(data.games);
    } catch {
      /* بی‌صدا — دفعه بعد */
    }
  }, []);

  useEffect(() => {
    loadRooms();
    /* فهرست اتاق‌ها زنده از استریم می‌آید؛ پایش ۸ ثانیه‌ای فقط پشتیبان است */
    const unsub = subscribeStream("lobby", "", {
      onRooms: (list) => setRooms(list),
    });
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void loadRooms();
    }, 8000);
    return () => {
      clearInterval(id);
      unsub();
    };
  }, [loadRooms]);

  function joinError(status: number, code = ""): string {
    if (status === 404) return r.notFound;
    if (status === 403 && code === "game-disabled") return a.gameDisabled;
    if (status === 409) return r.joinPlaying;
    if (status === 429) return code === "rooms-full" ? a.roomsFull : r.joinFull;
    return r.joinBad;
  }

  async function createRoom() {
    if (creating) return;
    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/arena/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // بخش آهنگ‌ها فقط برای «شعر یادت نره» فرستاده می‌شود — بقیهٔ بازی‌ها بدون آن
        body: JSON.stringify({
          gameSlug,
          maxPlayers: playerCount,
          ageGroup,
          ...(gameSlug === SHER_GAME_SLUG ? { sherCategory } : {}),
          jadvalSher: sherMode, // جدول: حالت شرح‌در‌متن
          sceneMode, // صحنه‌گردان: کلاسیک / ۳کادری / حذفی‌ها
          sceneDifficulty, // صحنه‌گردان: سختی و امتیاز حدس
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.code) {
        router.push(`/room/${data.code}`);
        return;
      }
      setError(joinError(res.status, data.error));
    } catch {
      setError(r.connectionLost);
    } finally {
      setCreating(false);
    }
  }

  async function joinByCode(e: React.FormEvent) {
    e.preventDefault();
    const clean = code.trim().toUpperCase();
    if (clean.length < 4) {
      setError(r.joinBad);
      return;
    }
    setJoining(clean);
    setError("");
    try {
      const res = await fetch("/api/arena/rooms/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: clean }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.code) {
        router.push(`/room/${data.code}`);
        return;
      }
      setError(joinError(res.status, data.error));
    } catch {
      setError(r.connectionLost);
    } finally {
      setJoining("");
    }
  }

  async function joinRoom(code: string) {
    if (joining) return;
    setJoining(code);
    setError("");
    try {
      const res = await fetch("/api/arena/rooms/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (res.ok) {
        router.push(`/room/${code}`);
        return;
      }
      setError(joinError(res.status));
    } catch {
      setError(r.connectionLost);
    } finally {
      setJoining("");
    }
  }

  /* بازی‌های قابل ساخت در لابی — ترتیب و وضعیت از تنظیمات مدیر می‌آید */
  const gameList = useMemo<LobbyGame[]>(() => {
    const all: LobbyGame[] = [
      { slug: ARENA_GAME_SLUG, title: a.gameQuiz, desc: a.gameQuizDesc, icon: "swords" },
      { slug: NABARD_GAME_SLUG, title: a.gameNabard, desc: a.gameNabardDesc, icon: "zap" },
      { slug: JADVAL_GAME_SLUG, title: a.gameJadval, desc: a.gameJadvalDesc, icon: "grid" },
      { slug: PIC_GAME_SLUG, title: a.gamePic, desc: a.gamePicDesc, icon: "image" },
      { slug: LUDO_GAME_SLUG, title: a.gameLudo, desc: a.gameLudoDesc, icon: "dice" },
      { slug: SHER_GAME_SLUG, title: a.gameSher, desc: a.gameSherDesc, icon: "music" },
      { slug: SCENE_GAME_SLUG, title: a.gameScene, desc: a.gameSceneDesc, icon: "shapes" },
    ];
    if (!gamesCfg) return all;
    const order = new Map(gamesCfg.map((g, i) => [g.slug, i]));
    return all
      .filter((g) => gamesCfg.find((c) => c.slug === g.slug)?.enabled ?? true)
      .sort((x, y) => (order.get(x.slug) ?? 99) - (order.get(y.slug) ?? 99));
  }, [gamesCfg, a]);

  const fireBannerOn = gamesCfg
    ? (gamesCfg.find((c) => c.slug === FIRE_BANNER_SLUG)?.enabled ?? true)
    : true;

  /* برچسب فارسی/انگلیسی بخش‌های آهنگ — از i18n */
  const sherCatLabel: Record<SherCategory, string> = {
    nostalgia: a.sher.catNostalgia,
    rap: a.sher.catRap,
    traditional: a.sher.catTraditional,
    modern: a.sher.catModern,
  };

  /* اگر بازی انتخابی توسط مدیر حذف شده، اولین بازی فعال انتخاب می‌شود */
  useEffect(() => {
    if (gameList.length === 0) return;
    if (!gameList.some((g) => g.slug === gameSlug)) {
      setGameSlug(gameList[0].slug);
    }
  }, [gameList, gameSlug]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
      <FadeIn className="text-center">
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-violet-400">
          <Swords className="h-4 w-4" aria-hidden="true" />
          {a.badge}
        </span>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-zinc-50 sm:text-4xl">
          {a.title}
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base leading-8 text-zinc-400">{a.subtitle}</p>
        <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/70 py-1.5 pe-4 ps-1.5 text-sm text-zinc-400">
          <MemberAvatar
            memberId={member.id}
            name={member.name}
            size={28}
            hasAvatar={Boolean(member.avatarUrl)}
          />
          {lang === "fa" ? "خوش آمدی" : "Welcome"}، <b className="text-zinc-200">{member.name}</b>
        </p>
      </FadeIn>

      {/* بنر عکس پروفایل اجباری برای اعضای قدیمی بدون عکس */}
      {!member.avatarUrl && (
        <FadeIn delay={0.02}>
          <section className="mt-8 flex flex-col items-center gap-4 rounded-2xl border border-amber-500/40 bg-amber-500/[0.07] p-5 sm:flex-row">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/15">
              <Camera className="h-5 w-5 text-amber-300" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1 text-center sm:text-start">
              <p className="text-sm font-bold text-amber-200">{a.avatarRequiredTitle}</p>
              <p className="mt-1 text-xs leading-6 text-zinc-400">{a.avatarRequiredDesc}</p>
            </div>
            <AvatarPicker variant="upload" onDone={() => router.refresh()} />
          </section>
        </FadeIn>
      )}

      {/* میدان آتش — نسخه آفلاین تک‌نفره (از پنل قابل حذف) */}
      {fireBannerOn && (
      <FadeIn delay={0.03} className="mt-8">
        <a
          href="/fire"
          className="group flex flex-col items-start gap-3 rounded-2xl border border-orange-500/40 bg-gradient-to-l from-orange-500/10 via-transparent to-transparent p-5 transition-colors hover:border-orange-500/70 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-3.5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-500/15">
              <Flame className="h-5 w-5 text-orange-300" aria-hidden="true" />
            </span>
            <div>
              <p className="flex flex-wrap items-center gap-2 text-base font-bold text-orange-200">
                {t.fireOffline.menuTitle}
                <span className="rounded-full bg-orange-500/15 px-2 py-0.5 text-[10px] font-bold text-orange-300">
                  {t.fireOffline.cardTag}
                </span>
              </p>
              <p className="mt-1 max-w-xl text-xs leading-6 text-zinc-400">{t.fireOffline.menuSub}</p>
            </div>
          </div>
          <span className="rounded-full bg-orange-500 px-5 py-2.5 text-sm font-bold text-zinc-950 transition-colors group-hover:bg-orange-400">
            {t.fireOffline.startCta}
          </span>
        </a>
      </FadeIn>
      )}

      <div className="mt-10 grid gap-5 lg:grid-cols-2">
        {/* ساخت اتاق */}
        <FadeIn delay={0.05}>
          <section className="flex h-full flex-col rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 sm:p-8">
            <h2 className="text-lg font-bold text-zinc-50">{a.createCta}</h2>
            <p className="mt-2 text-sm leading-7 text-zinc-400">{a.createHint}</p>

            {/* انتخاب بازی — ترتیب و وضعیت از پنل مدیریت */}
            {gameList.length === 0 ? (
              <p className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs leading-6 text-amber-300">
                {a.noGames}
              </p>
            ) : (
            <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
              {gameList.map((g) => (
                <button
                  key={g.slug}
                  type="button"
                  onClick={() => setGameSlug(g.slug)}
                  aria-pressed={g.slug === gameSlug}
                  className={`rounded-xl border p-3.5 text-start transition-colors ${
                    g.slug === gameSlug
                      ? "border-violet-500/60 bg-violet-500/10"
                      : "border-zinc-800 bg-zinc-950/40 hover:border-zinc-700"
                  }`}
                >
                  <span
                    className={`flex items-center gap-1.5 text-sm font-bold ${
                      g.slug === gameSlug ? "text-violet-300" : "text-zinc-300"
                    }`}
                  >
                    {g.icon === "zap" ? (
                      <Zap className="h-4 w-4" aria-hidden="true" />
                    ) : g.icon === "grid" ? (
                      <Grid3x3 className="h-4 w-4" aria-hidden="true" />
                    ) : g.icon === "image" ? (
                      <ImageIcon className="h-4 w-4" aria-hidden="true" />
                    ) : g.icon === "dice" ? (
                      <Dices className="h-4 w-4" aria-hidden="true" />
                    ) : g.icon === "music" ? (
                      <Music className="h-4 w-4" aria-hidden="true" />
                    ) : g.icon === "shapes" ? (
                      <Shapes className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Swords className="h-4 w-4" aria-hidden="true" />
                    )}
                    {g.title}
                  </span>
                  <span className="mt-1 block text-[11px] leading-5 text-zinc-500">{g.desc}</span>
                </button>
              ))}
            </div>
            )}

            {/* بخش آهنگ‌های «شعر یادت نره» — فقط وقتی همین بازی انتخاب است؛
                استخر مسابقه هنگام شروع فقط از همین بخش ساخته می‌شود */}
            {gameSlug === SHER_GAME_SLUG && (
              <div className="mt-4">
                <p className="text-xs font-bold text-zinc-400">{a.sher.catLabel}</p>
                <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label={a.sher.catLabel}>
                  {SHER_CATEGORIES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      role="radio"
                      aria-checked={c === sherCategory}
                      onClick={() => setSherCategory(c)}
                      className={`rounded-full border px-3.5 py-2 text-xs font-bold transition-colors ${
                        c === sherCategory
                          ? "border-violet-500/60 bg-violet-500/15 text-violet-200"
                          : "border-zinc-800 bg-zinc-950/40 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                      }`}
                    >
                      {sherCatLabel[c]}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* دعوت‌نامه — تعداد بازیکنان اتاق؛ از ۲ تا ۸ */}
            <div className="mt-4">
              <p className="text-xs font-bold text-zinc-400">{a.playersLabel}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {Array.from({ length: capacityMax - MIN_PLAYERS + 1 }, (_, i) => MIN_PLAYERS + i).map(
                  (n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setPlayerCount(n)}
                      aria-pressed={n === playerCount}
                      className={`h-9 w-9 rounded-lg border text-sm font-black transition-colors ${
                        n === playerCount
                          ? "border-violet-500/60 bg-violet-500/15 text-violet-200"
                          : "border-zinc-800 bg-zinc-950/40 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
                      }`}
                    >
                      {numFmt(n)}
                    </button>
                  ),
                )}
              </div>
              <p className="mt-2 text-[11px] leading-5 text-zinc-500">{a.playersHint}</p>
            </div>

            {/* حالت رقابت جدول — کلاسیک یا شرح‌در‌متن */}
            {isJadval && (
              <div className="mt-4">
                <p className="text-xs font-bold text-zinc-400">{a.modeLabel}</p>
                <div className="mt-2 grid grid-cols-2 gap-1.5" role="radiogroup" aria-label={a.modeLabel}>
                  {[false, true].map((sher) => {
                    const active = sher === sherMode;
                    const Icon = sher ? BookOpenText : LayoutGrid;
                    return (
                      <button
                        key={String(sher)}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => setSherMode(sher)}
                        className={`flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm font-bold transition-colors ${
                          active
                            ? "border-sky-500/60 bg-sky-500/10 text-sky-200"
                            : "border-zinc-800 bg-zinc-950/40 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                        }`}
                      >
                        <Icon className="h-4 w-4" aria-hidden="true" />
                        {sher ? a.modeSher : a.modeClassic}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 text-[11px] leading-5 text-zinc-500">
                  {sherMode ? a.modeSherHint : a.modeClassicHint}
                </p>
              </div>
            )}

            {/* حالت بازی صحنه‌گردان — کلاسیک، ۳کادری، حذفی‌ها */}
            {isScene && (
              <div className="mt-4">
                <p className="text-xs font-bold text-zinc-400">{a.scene.modeLabel}</p>
                <div className="mt-2 grid grid-cols-3 gap-1.5" role="radiogroup" aria-label={a.scene.modeLabel}>
                  {SCENE_MODES.map((m) => {
                    const active = m === sceneMode;
                    const Icon = m === "frames" ? Film : m === "limited" ? Ban : LayoutGrid;
                    return (
                      <button
                        key={m}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => setSceneMode(m)}
                        className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-xs font-bold transition-colors ${
                          active
                            ? "border-fuchsia-500/60 bg-fuchsia-500/10 text-fuchsia-200"
                            : "border-zinc-800 bg-zinc-950/40 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                        }`}
                      >
                        <Icon className="h-4 w-4" aria-hidden="true" />
                        {m === "frames" ? a.scene.modeFrames : m === "limited" ? a.scene.modeLimited : a.scene.modeClassic}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 text-[11px] leading-5 text-zinc-500">
                  {sceneMode === "frames" ? a.scene.modeFramesHint : sceneMode === "limited" ? a.scene.modeLimitedHint : a.scene.modeClassicHint}
                </p>
              </div>
            )}

            {/* سختی صحنه‌گردان — به انتخاب گروه؛ ارزش امتیاز حدس را تعیین می‌کند */}
            {isScene && (
              <div className="mt-4">
                <p className="text-xs font-bold text-zinc-400">{a.scene.diffLabel}</p>
                <div className="mt-2 grid grid-cols-4 gap-1.5" role="radiogroup" aria-label={a.scene.diffLabel}>
                  {SCENE_DIFFS.map((d) => {
                    const active = d === sceneDifficulty;
                    return (
                      <button
                        key={d}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => setSceneDifficulty(d)}
                        className={`flex flex-col items-center gap-0.5 rounded-xl border px-1.5 py-2 text-[11px] font-bold transition-colors ${
                          active
                            ? "border-amber-500/60 bg-amber-500/10 text-amber-200"
                            : "border-zinc-800 bg-zinc-950/40 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                        }`}
                      >
                        <span>{d === "easiest" ? a.scene.diffEasiest : d === "easy" ? a.scene.diffEasy : d === "hard" ? a.scene.diffHard : a.scene.diffHardest}</span>
                        <span className={`text-[10px] font-black ${active ? "text-amber-300" : "text-zinc-500"}`} dir="ltr">
                          {numFmt(SCENE_DIFF_FIRST_POINTS[d])}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 text-[11px] leading-5 text-zinc-500">
                  {sceneDifficulty === "hardest" ? a.scene.diffHardestHint : sceneDifficulty === "hard" ? a.scene.diffHardHint : sceneDifficulty === "easiest" ? a.scene.diffEasiestHint : a.scene.diffEasyHint}
                </p>
              </div>
            )}

            {/* گروه سنی / سطح جدول — سؤال‌های چالش سرعتی و جدول متناسب با انتخاب تنظیم می‌شوند */}
            <div className="mt-4">
              <p className="text-xs font-bold text-zinc-400">{isJadval ? a.diffLabel : a.ageLabel}</p>
              <div className="mt-2 grid gap-1.5 sm:grid-cols-3" role="radiogroup" aria-label={isJadval ? a.diffLabel : a.ageLabel}>
                {AGE_GROUPS.map((g) => {
                  const label = g === "kid" ? (isJadval ? a.diffEasy : a.ageKid) : g === "pro" ? (isJadval ? a.diffPro : a.agePro) : isJadval ? a.diffHard : a.ageAdult;
                  return (
                    <button
                      key={g}
                      type="button"
                      role="radio"
                      aria-checked={g === ageGroup}
                      onClick={() => setAgeGroup(g)}
                      className={`rounded-xl border px-3 py-2.5 text-sm font-bold transition-colors ${
                        g === ageGroup
                          ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-200"
                          : "border-zinc-800 bg-zinc-950/40 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-[11px] leading-5 text-zinc-500">{isJadval ? a.diffHint : a.ageHint}</p>
            </div>

            <Button
              onClick={createRoom}
              disabled={creating || gameList.length === 0}
              className="mt-5 h-12 rounded-xl bg-violet-500 text-base font-bold text-zinc-950 hover:bg-violet-400 disabled:opacity-60"
            >
              {creating ? (
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
              ) : (
                <Plus className="h-5 w-5" aria-hidden="true" />
              )}
              {creating ? a.creating : a.createCta}
            </Button>
          </section>
        </FadeIn>

        {/* ورود با کد */}
        <FadeIn delay={0.1}>
          <section className="flex h-full flex-col rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 sm:p-8">
            <h2 className="text-lg font-bold text-zinc-50">{a.joinLabel}</h2>
            <p className="mt-2 flex-1 text-sm leading-7 text-zinc-400">{a.joinHint}</p>
            <form onSubmit={joinByCode} className="mt-5 flex gap-2">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder={a.joinPh}
                maxLength={8}
                dir="ltr"
                className="h-12 flex-1 rounded-xl border border-zinc-700 bg-zinc-950 px-4 text-center text-lg font-bold tracking-[0.3em] text-zinc-100 outline-none transition-colors placeholder:tracking-normal placeholder:text-zinc-600 focus:border-violet-500/60"
              />
              <Button
                type="submit"
                disabled={Boolean(joining)}
                className="h-12 rounded-xl bg-zinc-100 px-5 text-sm font-bold text-zinc-950 hover:bg-zinc-300 disabled:opacity-60"
              >
                {joining === code.trim().toUpperCase() && code.trim().length >= 4 ? (
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                ) : (
                  <LogIn className="h-5 w-5" aria-hidden="true" />
                )}
                {a.joinCta}
              </Button>
            </form>
          </section>
        </FadeIn>
      </div>

      {error && (
        <p className="mt-5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-center text-sm font-semibold text-rose-300">
          {error}
        </p>
      )}

      {/* چت عمومی + اتاق‌های باز */}
      <div className="mt-10 grid gap-5 lg:grid-cols-5">
        <FadeIn delay={0.12} className="lg:col-span-3">
          <section className="flex h-[560px] flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60">
            <ChatPanel scope="lobby" className="h-full" />
          </section>
        </FadeIn>

        <FadeIn delay={0.16} className="lg:col-span-2">
          <section className="flex h-[560px] flex-col rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-bold text-zinc-100">
                <MessagesSquare className="h-4 w-4 text-violet-400" aria-hidden="true" />
                {a.openRooms}
              </h2>
              <Button
                onClick={loadRooms}
                variant="ghost"
                size="icon"
                aria-label="refresh"
                className="h-8 w-8 rounded-full text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>

            <div className="mt-4 min-h-0 flex-1 space-y-2.5 overflow-y-auto pe-1">
              {rooms === null ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-5 w-5 animate-spin text-zinc-600" aria-hidden="true" />
                </div>
              ) : rooms.length === 0 ? (
                <p className="rounded-xl border border-dashed border-zinc-800 px-4 py-10 text-center text-xs leading-6 text-zinc-500">
                  {a.emptyRooms}
                </p>
              ) : (
                rooms.map((room) => {
                  const full = room.memberCount >= room.maxPlayers;
                  const playing = room.status === "playing";
                  const canJoin = !full && !playing;
                  return (
                    <div
                      key={room.code}
                      className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-950/50 px-3.5 py-3 transition-colors hover:border-zinc-700"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-md bg-violet-500/10 px-2 py-0.5 text-[11px] font-black text-violet-300">
                            {a.roomN.replace("{n}", numFmt(room.roomNumber))}
                          </span>
                          <span dir="ltr" className="text-sm font-extrabold tracking-widest text-zinc-300">
                            {room.code}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              playing
                                ? "bg-amber-500/10 text-amber-300"
                                : "bg-emerald-500/10 text-emerald-300"
                            }`}
                          >
                            {playing ? a.statusPlaying : a.statusLobby}
                          </span>
                          {room.gameSlug === NABARD_GAME_SLUG && (
                            <span className="rounded-full bg-lime-500/10 px-2 py-0.5 text-[10px] font-bold text-lime-300">
                              {a.gameNabard}
                            </span>
                          )}
                          {room.gameSlug === LUDO_GAME_SLUG && (
                            <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] font-bold text-sky-300">
                              {a.gameLudo}
                            </span>
                          )}
                          {room.gameSlug === ARENA_GAME_SLUG && (
                            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                              {a.gameQuiz}
                            </span>
                          )}
                          {room.gameSlug === JADVAL_GAME_SLUG && (
                            <span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-bold text-violet-300">
                              {a.gameJadval}
                            </span>
                          )}
                          {room.gameSlug === PIC_GAME_SLUG && (
                            <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] font-bold text-sky-300">
                              {a.gamePic}
                            </span>
                          )}
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2.5 text-[11px] text-zinc-500">
                          <span className="flex items-center gap-1">
                            <Crown className="h-3 w-3" aria-hidden="true" />
                            {room.hostName}
                          </span>
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" aria-hidden="true" />
                            {numFmt(room.memberCount)}/{numFmt(room.maxPlayers)}
                          </span>
                        </div>
                      </div>
                      {canJoin ? (
                        <Button
                          onClick={() => joinRoom(room.code)}
                          disabled={Boolean(joining)}
                          size="sm"
                          className="shrink-0 rounded-lg bg-violet-500 text-xs font-bold text-zinc-950 hover:bg-violet-400"
                        >
                          {joining === room.code ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                          ) : (
                            <LogIn className="h-3.5 w-3.5" aria-hidden="true" />
                          )}
                          {a.join}
                        </Button>
                      ) : (
                        <span className="shrink-0 rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-bold text-zinc-500">
                          {full ? a.fullRoom : a.statusPlaying}
                        </span>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <p className="mt-3 border-t border-zinc-800 pt-3 text-center text-[11px] text-zinc-600">
              {a.roomsCount.replace("{n}", numFmt(rooms?.length ?? 0))}
            </p>
          </section>
        </FadeIn>
      </div>
    </div>
  );
}
