"use client";

/* مدیریت اعضای سایت — فهرست، مسدودسازی، حذف */

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, Trash2, Ban, CircleCheck } from "lucide-react";
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
import type { AdminMember } from "@/lib/types";

function faDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("fa-IR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return "—";
  }
}

export function MembersManager() {
  const { toast } = useToast();
  const [members, setMembers] = useState<AdminMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<AdminMember | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);

  const load = useCallback(
    async (quiet = false) => {
      try {
        const res = await fetch("/api/admin/members");
        if (!res.ok) throw new Error();
        const data = await res.json();
        setMembers(data.members);
      } catch {
        /* در پولینگ دوره‌ای بی‌صدا رد می‌شود تا اعلان اسپم نشود */
        if (!quiet) toast({ title: "دریافت لیست اعضا ناموفق بود.", variant: "destructive" });
      } finally {
        setLoading(false);
      }
    },
    [toast],
  );

  useEffect(() => {
    load();
    /* وضعیت آنلاین زنده بماند — همان پنجرهٔ ۹۰ثانیه‌ای با تپش قلب ۳۰ثانیه‌ای */
    const id = window.setInterval(() => load(true), 30_000);
    return () => window.clearInterval(id);
  }, [load]);

  async function toggleBlocked(member: AdminMember, blocked: boolean) {
    setMembers((list) => list.map((m) => (m.id === member.id ? { ...m, blocked } : m)));
    const res = await fetch(`/api/admin/members/${member.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blocked }),
    });
    if (!res.ok) {
      setMembers((list) => list.map((m) => (m.id === member.id ? { ...m, blocked: !blocked } : m)));
      toast({ title: "تغییر وضعیت عضو ناموفق بود.", variant: "destructive" });
      return;
    }
    toast({
      title: blocked ? `«${member.name}» مسدود شد.` : `«${member.name}» آزاد شد.`,
      description: blocked
        ? "دیگر نمی‌تواند وارد شود و بازی اجرا کند."
        : "دوباره می‌تواند وارد شود و بازی کند.",
    });
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeletingBusy(true);
    try {
      const res = await fetch(`/api/admin/members/${deleting.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast({ title: `«${deleting.name}» حذف شد.` });
      setDeleting(null);
      load();
    } catch {
      toast({ title: "حذف ناموفق بود.", variant: "destructive" });
    } finally {
      setDeletingBusy(false);
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
    <div dir="rtl" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-400">
          {members.length} عضو — افراد مسدودشده نمی‌توانند وارد شوند یا بازی اجرا کنند.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => load()}
          className="h-9 rounded-lg border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          به‌روزرسانی
        </Button>
      </div>

      <div className="space-y-3">
        {members.map((m) => (
          <div
            key={m.id}
            className="flex flex-wrap items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10 text-sm font-bold text-emerald-300">
              {m.name.trim().charAt(0) || "؟"}
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-bold text-zinc-100">{m.name}</p>
                {m.online ? (
                  <Badge
                    title="در ۹۰ ثانیهٔ گذشته فعالیتی در سایت داشته"
                    className="flex items-center gap-1.5 border-emerald-500/40 bg-emerald-500/10 text-[11px] text-emerald-300"
                  >
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" aria-hidden="true" />
                    آنلاین
                  </Badge>
                ) : (
                  <Badge
                    title="فعالیتی در ۹۰ ثانیهٔ گذشته نداشته"
                    className="flex items-center gap-1.5 border-zinc-700 bg-zinc-800/60 text-[11px] text-zinc-400"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-zinc-500" aria-hidden="true" />
                    آفلاین
                  </Badge>
                )}
                {m.blocked ? (
                  <Badge className="border-rose-500/40 bg-rose-500/10 text-[11px] text-rose-300">
                    مسدود
                  </Badge>
                ) : (
                  <Badge className="border-emerald-500/40 bg-emerald-500/10 text-[11px] text-emerald-300">
                    فعال
                  </Badge>
                )}
              </div>
              <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
                <span dir="ltr">{m.username}</span>
                <span>عضویت: {faDate(m.createdAt)}</span>
                <span>آخرین ورود: {faDate(m.lastLoginAt)}</span>
                <span>اجراها: {new Intl.NumberFormat("fa-IR").format(m.playCount)}</span>
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => toggleBlocked(m, !m.blocked)}
                className={
                  m.blocked
                    ? "h-8 rounded-lg border-emerald-500/40 bg-transparent text-xs text-emerald-300 hover:bg-emerald-500/10"
                    : "h-8 rounded-lg border-amber-500/40 bg-transparent text-xs text-amber-300 hover:bg-amber-500/10"
                }
              >
                {m.blocked ? (
                  <CircleCheck className="h-3 w-3" aria-hidden="true" />
                ) : (
                  <Ban className="h-3 w-3" aria-hidden="true" />
                )}
                {m.blocked ? "آزادسازی" : "مسدودسازی"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeleting(m)}
                className="h-8 rounded-lg border-zinc-700 bg-transparent text-xs text-zinc-400 hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-300"
              >
                <Trash2 className="h-3 w-3" aria-hidden="true" />
                حذف
              </Button>
            </div>
          </div>
        ))}

        {members.length === 0 && (
          <div className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/30 p-8 text-center">
            <p className="text-sm leading-7 text-zinc-400">
              هنوز کسی عضو نشده. وقتی بازدیدکنندگان در صفحه «بازی‌ها» ثبت‌نام کنند، این‌جا دیده
              می‌شوند.
            </p>
          </div>
        )}
      </div>

      <AlertDialog open={Boolean(deleting)} onOpenChange={(v) => !v && setDeleting(null)}>
        <AlertDialogContent dir="rtl" className="border-zinc-800 bg-zinc-900">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-zinc-50">حذف «{deleting?.name}»؟</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              حساب عضو و تاریخچه اجراهایش حذف می‌شود و دیگر نمی‌تواند با این شماره/ایمیل وارد شود.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800">
              انصراف
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
              className="bg-rose-600 text-white hover:bg-rose-500"
            >
              {deletingBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "حذف کن"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
