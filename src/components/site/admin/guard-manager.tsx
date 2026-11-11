"use client";

/* محافظ خودایمنی + بازسازی سایت از پنل.
   • «سلامت سایت»: نسخهٔ درحال‌سرویس، اتصال دیتابیس و فهرست بازی‌های آرنا را می‌سنجد.
   • «بازسازی سایت»: با Deploy Hook ورکسل، دِپلوی تازه از آخرین کد تأییدشدهٔ شاخهٔ
     اصلی می‌سازد — بدون دست‌زدن به محتوا، اعضا و تنظیمات. */

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Trash2,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

type GuardCheck = { id: string; label: string; ok: boolean; detail: string };
type GuardData = { ok: boolean; version: string; versionDate: string; checks: GuardCheck[] };
type RebuildStatus = { version: string; configured: boolean; masked: string | null };

export function GuardManager() {
  const { toast } = useToast();
  const [guard, setGuard] = useState<GuardData | null>(null);
  const [rebuild, setRebuild] = useState<RebuildStatus | null>(null);
  const [hookInput, setHookInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingHook, setSavingHook] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [confirmRebuild, setConfirmRebuild] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [g, r] = await Promise.all([
        fetch("/api/admin/guard", { cache: "no-store" }),
        fetch("/api/admin/rebuild", { cache: "no-store" }),
      ]);
      if (g.ok) setGuard(await g.json());
      if (r.ok) setRebuild(await r.json());
    } catch {
      toast({ title: "دریافت وضعیت سلامت ناموفق بود.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveHook() {
    const url = hookInput.trim();
    if (!url) return;
    setSavingHook(true);
    try {
      const res = await fetch("/api/admin/rebuild", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.error ?? "ذخیرهٔ قلاب ناموفق بود.", variant: "destructive" });
        return;
      }
      setRebuild(data);
      setHookInput("");
      toast({ title: "قلاب بازسازی ذخیره شد — از این پس می‌توانید سایت را از پنل بازسازی کنید." });
    } catch {
      toast({ title: "ذخیرهٔ قلاب ناموفق بود.", variant: "destructive" });
    } finally {
      setSavingHook(false);
    }
  }

  async function runRebuild() {
    setRebuilding(true);
    try {
      const res = await fetch("/api/admin/rebuild", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ run: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.error ?? "دستور بازسازی ارسال نشد.", variant: "destructive" });
        return;
      }
      toast({
        title: "دستور بازسازی به ورکسل ارسال شد.",
        description: "دو تا سه دقیقه صبر کنید؛ بعد با «بررسی سلامت» نسخهٔ جدید را تأیید کنید.",
      });
      setConfirmRebuild(false);
    } catch {
      toast({ title: "دستور بازسازی ارسال نشد.", variant: "destructive" });
    } finally {
      setRebuilding(false);
    }
  }

  async function clearHook() {
    try {
      const res = await fetch("/api/admin/rebuild", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clear: true }),
      });
      if (!res.ok) throw new Error();
      setRebuild(await res.json());
      toast({ title: "قلاب بازسازی پاک شد." });
    } catch {
      toast({ title: "پاک‌کردن قلاب ناموفق بود.", variant: "destructive" });
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
      {/* ─── سلامت سایت ─── */}
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold text-zinc-50">
              <ShieldCheck className="h-5 w-5 text-emerald-400" aria-hidden="true" />
              محافظ خودایمنی — سلامت سایت
            </h2>
            <p className="mt-1 max-w-2xl text-xs leading-6 text-zinc-500">
              اگر نسخهٔ درحال‌سرویس همان نسخهٔ تأییدشده نباشد یا بخشی از سایت خراب شود، همین‌جا
              با نشانگر قرمز دیده می‌شود — پیش از آن‌که کاربران متوجه شوند.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={load}
            className="h-9 rounded-lg border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            بررسی سلامت
          </Button>
        </div>

        <div className="mt-4 space-y-2">
          {guard?.checks.map((c) => (
            <div
              key={c.id}
              className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${
                c.ok ? "border-emerald-500/25 bg-emerald-500/[0.06]" : "border-rose-500/30 bg-rose-500/[0.07]"
              }`}
            >
              {c.ok ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
              ) : (
                <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" aria-hidden="true" />
              )}
              <div className="min-w-0">
                <p className={`text-sm font-bold ${c.ok ? "text-emerald-200" : "text-rose-200"}`}>
                  {c.label}
                </p>
                <p className="mt-0.5 text-xs leading-5 text-zinc-400">{c.detail}</p>
              </div>
            </div>
          ))}
        </div>

        <p className="mt-4 text-[11px] leading-5 text-zinc-500">
          نسخهٔ درحال‌سرویس به‌صورت عمومی هم خوانا است:{" "}
          <a
            href="/api/health"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-emerald-300 hover:text-emerald-200"
            dir="ltr"
          >
            /api/health
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
        </p>
      </section>

      {/* ─── بازسازی سایت ─── */}
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
        <h2 className="text-base font-bold text-zinc-50">بازسازی سایت</h2>
        <p className="mt-1 max-w-2xl text-xs leading-6 text-zinc-500">
          بازسازی یعنی دِپلوی تازه از «آخرین کد تأییدشدهٔ شاخهٔ اصلی» — هیچ محتوا، اعضا، امتیاز
          یا تنظیماتی عوض نمی‌شود؛ فقط هش‌های مزاحم و نسخه‌های گم‌شده با یک دِپلوی سالم جایگزین
          می‌شوند. برای فعال‌سازی، در ورکسل یک Deploy Hook بسازید (Project → Settings → Git →
          Deploy Hooks) و آدرسش را این‌جا ذخیره کنید.
        </p>

        <div className="mt-4 space-y-3">
          {rebuild?.configured ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] px-4 py-3">
              <div>
                <p className="text-sm font-bold text-emerald-200">قلاب بازسازی تنظیم شده است</p>
                <p className="mt-0.5 font-mono text-[11px] text-zinc-400" dir="ltr">
                  {rebuild.masked}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => setConfirmRebuild(true)}
                  size="sm"
                  className="h-9 rounded-lg bg-emerald-500 text-xs font-bold text-zinc-950 hover:bg-emerald-400"
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  بازسازی سایت
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearHook}
                  className="h-9 rounded-lg border-zinc-700 bg-transparent text-xs text-zinc-400 hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-300"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  حذف قلاب
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={hookInput}
                onChange={(e) => setHookInput(e.target.value)}
                placeholder="https://api.vercel.com/v1/integrations/deploy/…"
                dir="ltr"
                className="h-10 flex-1 rounded-lg border-zinc-700 bg-zinc-950 font-mono text-xs text-zinc-100"
              />
              <Button
                onClick={saveHook}
                disabled={savingHook || !hookInput.trim()}
                className="h-10 rounded-lg bg-emerald-500 px-4 text-sm font-bold text-zinc-950 hover:bg-emerald-400 disabled:opacity-60"
              >
                {savingHook ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                ذخیرهٔ قلاب
              </Button>
            </div>
          )}
        </div>
      </section>

      {/* تأیید بازسازی */}
      <AlertDialog open={confirmRebuild} onOpenChange={(v) => !v && setConfirmRebuild(false)}>
        <AlertDialogContent dir="rtl" className="border-zinc-800 bg-zinc-900">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-zinc-50">بازسازی سایت؟</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              ورکسل یک دِپلوی تازه از آخرین کد تأییدشدهٔ شاخهٔ اصلی می‌سازد. دو تا سه دقیقه طول
              می‌کشد و هیچ محتوا یا تنظیماتی تغییر نمی‌کند. سایت در این فاصله بدون وقفه کار
              می‌کند.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800">
              انصراف
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                runRebuild();
              }}
              className="bg-emerald-600 text-white hover:bg-emerald-500"
            >
              {rebuilding ? <Loader2 className="h-4 w-4 animate-spin" /> : "بازسازی کن"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
