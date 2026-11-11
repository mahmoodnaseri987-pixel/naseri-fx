"use client";

/* پاک‌سازی اتاق‌های چت از پنل — آمار پیام‌ها و حذف دستی/کامل.
   پاک‌سازی خودکار پایان هر روز هم با /api/cron/cleanup انجام می‌شود (۰۰:۳۰ تهران). */

import { useCallback, useEffect, useState } from "react";
import { Eraser, Loader2, MessagesSquare, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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

const numFa = (n: number) => new Intl.NumberFormat("fa-IR").format(n);

type ChatStats = {
  total: number;
  oldestAt: string | null;
  scopes: { scope: string; count: number }[];
};

function faDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("fa-IR", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function scopeLabel(scope: string): string {
  if (scope === "lobby") return "چت عمومی لابی";
  if (scope.endsWith("A") || scope.endsWith("B")) {
    return `چت تیمی اتاق ${scope.slice(0, -1)}`;
  }
  return `اتاق ${scope}`;
}

export function ChatCleanupManager() {
  const { toast } = useToast();
  const [stats, setStats] = useState<ChatStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [wipeAll, setWipeAll] = useState(false);
  const [wipeScope, setWipeScope] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/chat/cleanup", { cache: "no-store" });
      if (!res.ok) throw new Error();
      setStats(await res.json());
    } catch {
      toast({ title: "دریافت آمار چت‌ها ناموفق بود.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  async function wipe(scope: string | "all") {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/chat/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      toast({
        title: scope === "all" ? "همهٔ پیام‌های چت پاک شدند." : "پیام‌های این اتاق پاک شد.",
        description: `${numFa(data.deleted ?? 0)} پیام حذف شد.`,
      });
      setWipeAll(false);
      setWipeScope(null);
      await load();
    } catch {
      toast({ title: "پاک‌سازی ناموفق بود.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12" dir="rtl">
        <Loader2 className="h-6 w-6 animate-spin text-emerald-400" aria-hidden="true" />
      </div>
    );
  }

  return (
    <div dir="rtl" className="space-y-6">
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-zinc-50">پاک‌سازی اتاق‌های چت</h2>
            <p className="mt-1 max-w-2xl text-xs leading-6 text-zinc-500">
              پیام‌های چت لابی و اتاق‌ها این‌جا مدیریت می‌شوند تا فضا پر نشود. پاک‌سازی خودکار
              پایان هر روز (۰۰:۳۰ تهران) همهٔ پیام‌ها را حذف می‌کند؛ این بخش برای پاک‌سازی دستی
              و لحظه‌ای است.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={load}
              className="h-9 rounded-lg border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              به‌روزرسانی
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={busy || (stats?.total ?? 0) === 0}
              onClick={() => setWipeAll(true)}
              className="h-9 rounded-lg border-rose-500/40 bg-transparent text-xs text-rose-300 hover:bg-rose-500/10"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              پاک‌سازی همهٔ چت‌ها
            </Button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
            <p className="text-xs text-zinc-500">کل پیام‌های فعلی</p>
            <p className="mt-1 text-2xl font-black text-zinc-100">{numFa(stats?.total ?? 0)}</p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
            <p className="text-xs text-zinc-500">قدیمی‌ترین پیام</p>
            <p className="mt-1.5 text-sm font-bold text-zinc-200">{faDate(stats?.oldestAt ?? null)}</p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
            <p className="text-xs text-zinc-500">پاک‌سازی خودکار روزانه</p>
            <p className="mt-1.5 text-sm font-bold text-emerald-300">فعال — هر شب ۰۰:۳۰ تهران</p>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-bold text-zinc-300">پیام‌های هر اتاق</h3>
        {(stats?.scopes ?? []).length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/30 p-8 text-center">
            <MessagesSquare className="mx-auto h-6 w-6 text-zinc-600" aria-hidden="true" />
            <p className="mt-2 text-sm text-zinc-400">هیچ پیامی ذخیره نیست — چت‌ها خالی‌اند.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {stats?.scopes.map((s) => (
              <div
                key={s.scope}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-zinc-200">{scopeLabel(s.scope)}</p>
                  <p className="mt-0.5 text-[11px] text-zinc-500" dir="ltr">
                    {s.scope}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-zinc-400">{numFa(s.count)} پیام</span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => setWipeScope(s.scope)}
                    className="h-8 rounded-lg border-zinc-700 bg-transparent text-xs text-zinc-400 hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-300"
                  >
                    <Eraser className="h-3 w-3" aria-hidden="true" />
                    پاک‌کردن
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* تأیید پاک‌سازی کامل */}
      <AlertDialog open={wipeAll} onOpenChange={(v) => !v && setWipeAll(false)}>
        <AlertDialogContent dir="rtl" className="border-zinc-800 bg-zinc-900">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-zinc-50">پاک‌سازی همهٔ پیام‌های چت؟</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              همهٔ پیام‌های چت لابی و همهٔ اتاق‌ها و تیم‌ها حذف می‌شوند. اعضا و اتاق‌ها دست
              نمی‌خورند. این کار برگشت‌پذیر نیست.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800">
              انصراف
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                wipe("all");
              }}
              className="bg-rose-600 text-white hover:bg-rose-500"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "پاک‌سازی کامل"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* تأیید پاک‌سازی یک scope */}
      <AlertDialog open={Boolean(wipeScope)} onOpenChange={(v) => !v && setWipeScope(null)}>
        <AlertDialogContent dir="rtl" className="border-zinc-800 bg-zinc-900">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-zinc-50">
              پاک‌کردن پیام‌های {wipeScope ? scopeLabel(wipeScope) : ""}؟
            </AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              فقط پیام‌های همین چت حذف می‌شود؛ بقیهٔ چت‌ها دست نمی‌خورند.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800">
              انصراف
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (wipeScope) void wipe(wipeScope);
              }}
              className="bg-rose-600 text-white hover:bg-rose-500"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "پاک‌کردن"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
