"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  Eye,
  EyeOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
import { APP_COLORS, APP_ICONS } from "@/components/site/apps";
import { Sparkles } from "lucide-react";
import { AppFormDialog } from "@/components/site/admin/app-form-dialog";
import type { AdminApp } from "@/lib/types";

export function AppsManager() {
  const { toast } = useToast();
  const [apps, setApps] = useState<AdminApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AdminApp | null>(null);
  const [deleting, setDeleting] = useState<AdminApp | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/apps");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setApps(data.apps);
    } catch {
      toast({ title: "دریافت لیست اپ‌ها ناموفق بود.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  /** تغییر وضعیت انتشار — آپتیمیستیک */
  async function togglePublished(app: AdminApp, published: boolean) {
    setApps((list) =>
      list.map((a) => (a.id === app.id ? { ...a, published } : a))
    );
    const res = await fetch(`/api/admin/apps/${app.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ published }),
    });
    if (!res.ok) {
      setApps((list) =>
        list.map((a) => (a.id === app.id ? { ...a, published: !published } : a))
      );
      toast({ title: "تغییر وضعیت انتشار ناموفق بود.", variant: "destructive" });
      return;
    }
    toast({
      title: published
        ? `«${app.nameFa}» در سایت منتشر شد.`
        : `«${app.nameFa}» از سایت مخفی شد.`,
      description: published
        ? "از الان در صفحه اصلی بازدیدکنندگان دیده می‌شود."
        : "فقط شما در پنل می‌بینیدش؛ بازدیدکنندگان دیگر نمی‌بینند.",
    });
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeletingBusy(true);
    try {
      const res = await fetch(`/api/admin/apps/${deleting.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast({ title: `«${deleting.nameFa}» حذف شد.` });
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
          {apps.length} اپ — با سوییچ کنار هر اپ مشخص کنید کدام در سایت دیده شود.
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={load}
            className="h-9 rounded-lg border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            به‌روزرسانی
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
            className="h-9 rounded-lg bg-emerald-500 font-bold text-zinc-950 hover:bg-emerald-400"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            افزودن اپ
          </Button>
        </div>
      </div>

      {apps.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-700 p-10 text-center text-sm text-zinc-500">
          هنوز اپی ندارید. با دکمه «افزودن اپ» اولین اپ را بسازید.
        </div>
      ) : (
        <ul className="space-y-3">
          {apps.map((app) => {
            const Icon = APP_ICONS[app.icon] ?? Sparkles;
            return (
              <li
                key={app.id}
                className="flex flex-col gap-4 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 sm:flex-row sm:items-center"
              >
                <div
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border bg-gradient-to-br ${
                    APP_COLORS[app.color] ?? APP_COLORS.emerald
                  }`}
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-zinc-100">{app.nameFa}</span>
                    <span className="font-mono text-xs text-zinc-500" dir="ltr">
                      {app.nameEn}
                    </span>
                    {app.published ? (
                      <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
                        منتشرشده
                      </Badge>
                    ) : (
                      <Badge className="border-zinc-700 bg-zinc-800 text-zinc-400">
                        پیش‌نویس (مخفی)
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 truncate text-xs text-zinc-500">{app.descFa}</p>
                </div>

                <div className="flex shrink-0 items-center gap-3">
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-400">
                    {app.published ? (
                      <Eye className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                    ) : (
                      <EyeOff className="h-4 w-4 text-zinc-500" aria-hidden="true" />
                    )}
                    <Switch
                      checked={app.published}
                      onCheckedChange={(v) => togglePublished(app, v)}
                      aria-label={`انتشار ${app.nameFa}`}
                    />
                  </label>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      setEditing(app);
                      setFormOpen(true);
                    }}
                    className="h-9 w-9 rounded-lg border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
                    aria-label={`ویرایش ${app.nameFa}`}
                  >
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setDeleting(app)}
                    className="h-9 w-9 rounded-lg border-zinc-700 bg-transparent text-rose-400 hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-300"
                    aria-label={`حذف ${app.nameFa}`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <AppFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editing}
        onSaved={load}
      />

      <AlertDialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent className="border-zinc-800 bg-zinc-900" dir="rtl">
          <AlertDialogHeader className="text-right">
            <AlertDialogTitle className="text-zinc-50">
              حذف «{deleting?.nameFa}»؟
            </AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              این اپ برای همیشه حذف می‌شود و قابل بازگشت نیست. اگر فقط نمی‌خواهید در سایت دیده
              شود، به‌جای حذف سوییچ انتشار را خاموش کنید.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
              disabled={deletingBusy}
              className="bg-rose-500 font-bold text-zinc-950 hover:bg-rose-400"
            >
              {deletingBusy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              حذف کن
            </AlertDialogAction>
            <AlertDialogCancel className="border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100">
              انصراف
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
