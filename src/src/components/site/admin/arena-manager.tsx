"use client";

/* مدیریت آرنا — جابجایی و حذف بازی‌ها از لابی + حذف اتاق‌های فعال */

import { useCallback, useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Flame,
  Grid3x3,
  Image as ImageIcon,
  Loader2,
  MessagesSquare,
  RefreshCw,
  RotateCcw,
  Swords,
  Trash2,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import type { AdminArenaGame, AdminArenaRoom } from "@/lib/types";

function faDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("fa-IR", {
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

const numFa = (n: number) => new Intl.NumberFormat("fa-IR").format(n);

function GameIcon({ icon }: { icon: AdminArenaGame["icon"] }) {
  if (icon === "zap") return <Zap className="h-4 w-4" aria-hidden="true" />;
  if (icon === "grid") return <Grid3x3 className="h-4 w-4" aria-hidden="true" />;
  if (icon === "image") return <ImageIcon className="h-4 w-4" aria-hidden="true" />;
  if (icon === "flame") return <Flame className="h-4 w-4" aria-hidden="true" />;
  return <Swords className="h-4 w-4" aria-hidden="true" />;
}

export function ArenaManager() {
  const { toast } = useToast();
  const [games, setGames] = useState<AdminArenaGame[]>([]);
  const [rooms, setRooms] = useState<AdminArenaRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [removingGame, setRemovingGame] = useState<AdminArenaGame | null>(null);
  const [removingRoom, setRemovingRoom] = useState<AdminArenaRoom | null>(null);
  const [removingRoomBusy, setRemovingRoomBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/arena", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setGames(data.games ?? []);
      setRooms(data.rooms ?? []);
    } catch {
      toast({ title: "دریافت اطلاعات آرنا ناموفق بود.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  /* ذخیرهٔ فهرست بازی‌ها — آرایه به‌ترتیب نمایشی؛ enabled وضعیت هر بازی */
  async function saveGames(next: AdminArenaGame[]) {
    setBusy(true);
    setGames(next); // بهینه‌بینانه
    try {
      const res = await fetch("/api/admin/arena", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ games: next.map((g) => ({ slug: g.slug, enabled: g.enabled })) }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setGames(data.games ?? next);
    } catch {
      toast({ title: "ذخیرهٔ تغییرات ناموفق بود.", variant: "destructive" });
      await load();
    } finally {
      setBusy(false);
    }
  }

  function move(index: number, dir: -1 | 1) {
    if (busy) return;
    const target = index + dir;
    if (target < 0 || target >= games.length) return;
    const next = [...games];
    [next[index], next[target]] = [next[target], next[index]];
    saveGames(next);
  }

  function toggleGame(game: AdminArenaGame, enabled: boolean) {
    if (busy) return;
    saveGames(games.map((g) => (g.slug === game.slug ? { ...g, enabled } : g)));
  }

  async function confirmRemoveGame() {
    if (!removingGame) return;
    toggleGame(removingGame, false);
    toast({
      title: `«${removingGame.titleFa}» از آرنا حذف شد.`,
      description: "از بخش بازیابی همین لیست می‌توانید برگردانید.",
    });
    setRemovingGame(null);
  }

  async function confirmRemoveRoom() {
    if (!removingRoom) return;
    setRemovingRoomBusy(true);
    try {
      const res = await fetch(`/api/admin/arena/rooms/${removingRoom.code}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast({ title: `اتاق ${removingRoom.code} حذف شد.`, description: "بازیکنانش به لابی برمی‌گردند." });
      setRemovingRoom(null);
      await load();
    } catch {
      toast({ title: "حذف اتاق ناموفق بود.", variant: "destructive" });
    } finally {
      setRemovingRoomBusy(false);
    }
  }

  const gameTitle = (slug: string) => games.find((g) => g.slug === slug)?.titleFa ?? slug;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12" dir="rtl">
        <Loader2 className="h-6 w-6 animate-spin text-emerald-400" aria-hidden="true" />
      </div>
    );
  }

  return (
    <div dir="rtl" className="space-y-8">
      {/* ─── بازی‌های آرنا ─── */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-zinc-50">بازی‌های آرنا</h2>
            <p className="mt-1 text-xs leading-6 text-zinc-500">
              ترتیب کارت‌های «ساخت اتاق» در لابی همین ترتیب این‌جاست. «حذف» یعنی بازی از فهرست
              لابی برمی‌دارد؛ اتاق‌های بازِ همان بازی تا پایان مسابقه کار می‌کنند و با
              «بازگردانی» دوباره برمی‌گردد.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={load}
            className="h-9 rounded-lg border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            به‌روزرسانی
          </Button>
        </div>

        <div className="space-y-3">
          {games.map((g, i) => (
            <div
              key={g.slug}
              className={`flex flex-wrap items-center gap-3 rounded-2xl border p-4 transition-colors ${
                g.enabled
                  ? "border-zinc-800 bg-zinc-900/60"
                  : "border-zinc-800/60 bg-zinc-900/30 opacity-75"
              }`}
            >
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() => move(i, -1)}
                  disabled={i === 0 || busy}
                  aria-label="جابجایی به بالا"
                  className="rounded-md p-1 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-30"
                >
                  <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === games.length - 1 || busy}
                  aria-label="جابجایی به پایین"
                  className="rounded-md p-1 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-30"
                >
                  <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>

              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-violet-500/30 bg-violet-500/10 text-violet-300">
                <GameIcon icon={g.icon} />
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className={`font-bold ${g.enabled ? "text-zinc-100" : "text-zinc-400"}`}>
                    {g.titleFa}
                  </p>
                  <span className="text-[10px] text-zinc-600" dir="ltr">
                    {g.titleEn}
                  </span>
                  {g.kind === "banner" && (
                    <Badge className="border-orange-500/40 bg-orange-500/10 text-[10px] text-orange-300">
                      کارت لابی
                    </Badge>
                  )}
                  {g.enabled ? (
                    <Badge className="border-emerald-500/40 bg-emerald-500/10 text-[10px] text-emerald-300">
                      فعال
                    </Badge>
                  ) : (
                    <Badge className="border-rose-500/40 bg-rose-500/10 text-[10px] text-rose-300">
                      حذف‌شده
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-xs leading-5 text-zinc-500">{g.descFa}</p>
                {g.kind === "room" && g.activeRooms > 0 && (
                  <p className="mt-0.5 text-[11px] text-amber-300/80">
                    {numFa(g.activeRooms)} اتاق فعال همین بازی باز است.
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2">
                {g.enabled ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setRemovingGame(g)}
                    disabled={busy}
                    className="h-8 rounded-lg border-zinc-700 bg-transparent text-xs text-zinc-400 hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-300"
                  >
                    <Trash2 className="h-3 w-3" aria-hidden="true" />
                    حذف از آرنا
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleGame(g, true)}
                    disabled={busy}
                    className="h-8 rounded-lg border-emerald-500/40 bg-transparent text-xs text-emerald-300 hover:bg-emerald-500/10"
                  >
                    <RotateCcw className="h-3 w-3" aria-hidden="true" />
                    بازگردانی
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── اتاق‌های فعال ─── */}
      <section className="space-y-4">
        <div>
          <h2 className="text-base font-bold text-zinc-50">اتاق‌های فعال آرنا</h2>
          <p className="mt-1 text-xs leading-6 text-zinc-500">
            با حذف اتاق، همهٔ بازیکنانش بی‌درنگ به لابی برمی‌گردند (اتاق از دیدشان «پیدا نشد»
            می‌شود). اتاق‌های بی‌تحرک هم خودکار ۴۵ دقیقه‌ای پاک می‌شوند.
          </p>
        </div>

        {rooms.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/30 p-8 text-center">
            <MessagesSquare className="mx-auto h-6 w-6 text-zinc-600" aria-hidden="true" />
            <p className="mt-2 text-sm leading-7 text-zinc-400">
              فعلاً اتاق بازی‌ای باز نیست — لیست با ساخت هر اتاق تازه به‌روز می‌شود.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {rooms.map((room) => {
              const playing = room.status === "playing";
              return (
                <div
                  key={room.code}
                  className="flex flex-wrap items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4"
                >
                  <span className="rounded-md bg-violet-500/10 px-2 py-0.5 text-[11px] font-black text-violet-300">
                    اتاق {numFa(room.roomNumber)}
                  </span>
                  <span dir="ltr" className="text-sm font-extrabold tracking-widest text-zinc-200">
                    {room.code}
                  </span>
                  <Badge
                    className={
                      playing
                        ? "border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-300"
                        : "border-emerald-500/40 bg-emerald-500/10 text-[10px] text-emerald-300"
                    }
                  >
                    {playing ? "در حال مسابقه" : "در انتظار بازیکن"}
                  </Badge>

                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-zinc-300">{gameTitle(room.gameSlug)}</p>
                    <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-zinc-500">
                      <span>میزبان: {room.hostName || "—"}</span>
                      <span>
                        بازیکن: {numFa(room.memberCount)}/{numFa(room.maxPlayers)}
                      </span>
                      <span>ساخت: {faDateTime(room.createdAt)}</span>
                    </p>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setRemovingRoom(room)}
                    className="h-8 rounded-lg border-zinc-700 bg-transparent text-xs text-zinc-400 hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-300"
                  >
                    <Trash2 className="h-3 w-3" aria-hidden="true" />
                    حذف اتاق
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* دیالوگ تأیید حذف بازی */}
      <AlertDialog open={Boolean(removingGame)} onOpenChange={(v) => !v && setRemovingGame(null)}>
        <AlertDialogContent dir="rtl" className="border-zinc-800 bg-zinc-900">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-zinc-50">
              حذف «{removingGame?.titleFa}» از آرنا؟
            </AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              بازی از فهرست ساخت اتاق در لابی حذف می‌شود؛ اتاق‌های بازِ همین بازی تا پایان
              مسابقه کار می‌کنند. هر وقت بخواهید با «بازگردانی» برمی‌گردد.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800">
              انصراف
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmRemoveGame();
              }}
              className="bg-rose-600 text-white hover:bg-rose-500"
            >
              حذف از آرنا
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* دیالوگ تأیید حذف اتاق */}
      <AlertDialog open={Boolean(removingRoom)} onOpenChange={(v) => !v && setRemovingRoom(null)}>
        <AlertDialogContent dir="rtl" className="border-zinc-800 bg-zinc-900">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-zinc-50">
              حذف اتاق {removingRoom?.code}؟
            </AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              اتاق و همهٔ بازیکنانش حذف می‌شوند و بازیکنان به لابی برمی‌گردند. این کار برگشت‌پذیر
              نیست.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800">
              انصراف
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmRemoveRoom();
              }}
              className="bg-rose-600 text-white hover:bg-rose-500"
            >
              {removingRoomBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "حذف کن"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
