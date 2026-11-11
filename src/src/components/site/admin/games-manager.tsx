"use client";

/* مدیریت بازی‌ها — افزودن با آپلود فایل HTML تک‌فایلی، انتشار، ویرایش، حذف */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  Upload,
  FileCode2,
  Play,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { MediaPickerDialog } from "@/components/site/admin/media-picker-dialog";
import type { AdminGame } from "@/lib/types";

export const MAX_GAME_BYTES = 3 * 1024 * 1024; // ۳ مگابایت

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} بایت`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} کیلوبایت`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} مگابایت`;
}

export function GamesManager() {
  const { toast } = useToast();
  const [games, setGames] = useState<AdminGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AdminGame | null>(null);
  const [deleting, setDeleting] = useState<AdminGame | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/games");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setGames(data.games);
    } catch {
      toast({ title: "دریافت لیست بازی‌ها ناموفق بود.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  async function togglePublished(game: AdminGame, published: boolean) {
    setGames((list) => list.map((x) => (x.id === game.id ? { ...x, published } : x)));
    const res = await fetch(`/api/admin/games/${game.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ published }),
    });
    if (!res.ok) {
      setGames((list) => list.map((x) => (x.id === game.id ? { ...x, published: !published } : x)));
      toast({ title: "تغییر وضعیت انتشار ناموفق بود.", variant: "destructive" });
      return;
    }
    toast({
      title: published ? `«${game.titleFa}» منتشر شد.` : `«${game.titleFa}» مخفی شد.`,
      description: published
        ? "فقط اعضای واردشده می‌توانند بازی کنند."
        : "در سایت و صفحه بازی‌ها دیده نمی‌شود.",
    });
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeletingBusy(true);
    try {
      const res = await fetch(`/api/admin/games/${deleting.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast({ title: `«${deleting.titleFa}» حذف شد.` });
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
          {games.length} بازی — هر بازی یک فایل HTML است که فقط اعضای واردشده اجرا می‌کنند.
        </p>
        <div className="flex gap-2">
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
            size="sm"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
            className="h-9 rounded-lg bg-emerald-500 text-zinc-950 hover:bg-emerald-400"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            افزودن بازی
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {games.map((game) => (
          <div
            key={game.id}
            className="flex flex-wrap items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-bold text-zinc-100">{game.titleFa}</p>
                <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-[11px] text-zinc-400" dir="ltr">
                  /play/{game.slug}
                </code>
                {game.published ? (
                  <Badge className="border-emerald-500/40 bg-emerald-500/10 text-[11px] text-emerald-300">
                    منتشرشده
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-zinc-700 text-[11px] text-zinc-500">
                    پیش‌نویس
                  </Badge>
                )}
                {!game.hasFile && (
                  <Badge className="border-amber-500/40 bg-amber-500/10 text-[11px] text-amber-300">
                    بدون فایل
                  </Badge>
                )}
              </div>
              <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
                <span>اجراها: {new Intl.NumberFormat("fa-IR").format(game.plays)}</span>
                <span>
                  فایل: {game.hasFile ? formatBytes(game.sizeBytes) : "آپلود نشده"}
                </span>
                <span dir="ltr">{new Date(game.createdAt).toLocaleDateString("fa-IR")}</span>
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <Switch
                  checked={game.published}
                  onCheckedChange={(v) => togglePublished(game, v)}
                  aria-label="انتشار"
                />
                <span className="text-xs text-zinc-500">انتشار</span>
              </div>
              {game.hasFile && (
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-lg border-zinc-700 bg-transparent text-xs text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
                >
                  <a href={`/play/${game.slug}`} target="_blank" rel="noopener noreferrer">
                    <Play className="h-3 w-3" aria-hidden="true" />
                    اجرا
                  </a>
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditing(game);
                  setFormOpen(true);
                }}
                className="h-8 rounded-lg border-zinc-700 bg-transparent text-xs text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
              >
                <Pencil className="h-3 w-3" aria-hidden="true" />
                ویرایش
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeleting(game)}
                className="h-8 rounded-lg border-zinc-700 bg-transparent text-xs text-zinc-400 hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-300"
              >
                <Trash2 className="h-3 w-3" aria-hidden="true" />
                حذف
              </Button>
            </div>
          </div>
        ))}

        {games.length === 0 && (
          <div className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/30 p-8 text-center">
            <p className="text-sm text-zinc-400">
              هنوز بازی‌ای نساخته‌ای. اولین بازی را با دکمه «افزودن بازی» اضافه کن.
            </p>
          </div>
        )}
      </div>

      <GameFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editing}
        onSaved={load}
      />

      <AlertDialog open={Boolean(deleting)} onOpenChange={(v) => !v && setDeleting(null)}>
        <AlertDialogContent dir="rtl" className="border-zinc-800 bg-zinc-900">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-zinc-50">
              حذف «{deleting?.titleFa}»؟
            </AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              فایل بازی و آمار اجراهایش برای همیشه حذف می‌شود. این کار قابل بازگشت نیست.
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

/* ---------- دیالوگ افزودن/ویرایش بازی ---------- */

type GameFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: AdminGame | null;
  onSaved: () => void;
};

function GameFormDialog({ open, onOpenChange, editing, onSaved }: GameFormDialogProps) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const [titleFa, setTitleFa] = useState("");
  const [titleEn, setTitleEn] = useState("");
  const [descFa, setDescFa] = useState("");
  const [descEn, setDescEn] = useState("");
  const [slug, setSlug] = useState("");
  const [icon, setIcon] = useState("Gamepad2");
  const [color, setColor] = useState("violet");
  const [coverUrl, setCoverUrl] = useState("");
  const [html, setHtml] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileSize, setFileSize] = useState(0);
  const [hadFile, setHadFile] = useState(false);
  const [published, setPublished] = useState(false);
  const [saving, setSaving] = useState(false);

  /* بارگذاری بازی در حالت ویرایش */
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setTitleFa(editing.titleFa);
      setTitleEn(editing.titleEn);
      setDescFa(editing.descFa);
      setDescEn(editing.descEn);
      setSlug(editing.slug);
      setIcon(editing.icon);
      setColor(editing.color);
      setCoverUrl(editing.coverUrl);
      setHadFile(editing.hasFile);
      setFileSize(editing.sizeBytes);
      setFileName(editing.hasFile ? "فایل فعلی" : "");
      setPublished(editing.published);
      /* محتوای فعلی را نمی‌خوانیم — فقط اگر فایل جدید انتخاب شود جایگزین می‌شود */
      setHtml("");
    } else {
      setTitleFa("");
      setTitleEn("");
      setDescFa("");
      setDescEn("");
      setSlug("");
      setIcon("Gamepad2");
      setColor("violet");
      setCoverUrl("");
      setHtml("");
      setFileName("");
      setFileSize(0);
      setHadFile(false);
      setPublished(false);
    }
  }, [open, editing]);

  function pickFile(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_GAME_BYTES) {
      toast({
        title: "فایل خیلی بزرگ است (حداکثر ۳ مگابایت).",
        description: "فایل HTML تک‌فایلی و فشرده انتخاب کنید.",
        variant: "destructive",
      });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setHtml(String(reader.result ?? ""));
      setFileName(file.name);
      setFileSize(file.size);
    };
    reader.onerror = () => {
      toast({ title: "خواندن فایل ناموفق بود.", variant: "destructive" });
    };
    reader.readAsText(file);
  }

  async function save() {
    if (!titleFa.trim()) {
      toast({ title: "عنوان فارسی الزامی است.", variant: "destructive" });
      return;
    }
    if (!editing && !html) {
      toast({
        title: "فایل HTML بازی را انتخاب کنید.",
        description: "هر بازی یک فایل HTML مستقل است.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        titleFa,
        titleEn: titleEn || titleFa,
        descFa,
        descEn,
        slug: slug || undefined,
        icon,
        color,
        coverUrl,
        published,
      };
      if (html) payload.html = html;

      const res = await fetch(editing ? `/api/admin/games/${editing.id}` : "/api/admin/games", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({
          title: typeof data.error === "string" ? data.error : "ذخیره ناموفق بود.",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: editing ? "بازی به‌روزرسانی شد." : "بازی ساخته شد.",
        description: published
          ? "در سایت فعال است؛ اعضا می‌توانند بازی کنند."
          : "فعلاً پیش‌نویس است؛ هر وقت خواستی منتشرش کن.",
      });
      onOpenChange(false);
      onSaved();
    } catch {
      toast({ title: "ارتباط با سرور برقرار نشد.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[88vh] overflow-y-auto border-zinc-800 bg-zinc-900 sm:max-w-xl">
          <DialogHeader dir="rtl">
            <DialogTitle className="text-zinc-50">
              {editing ? `ویرایش «${editing.titleFa}»` : "افزودن بازی جدید"}
            </DialogTitle>
            <DialogDescription className="text-zinc-500">
              فایل بازی باید یک صفحه HTML مستقل باشد (مثل خروجی Phaser، Construct یا بازی‌های
              جاوااسکریپتی) — حداکثر ۳ مگابایت.
            </DialogDescription>
          </DialogHeader>

          <div dir="rtl" className="space-y-4">
            {/* آپلود فایل */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs text-zinc-300">فایل بازی (HTML تک‌فایلی)</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => fileRef.current?.click()}
                  className="h-8 rounded-lg border-zinc-700 bg-transparent text-xs text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
                >
                  <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                  انتخاب فایل
                </Button>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".html,.htm,text/html"
                className="hidden"
                onChange={(e) => pickFile(e.target.files?.[0])}
              />
              <p className="mt-2.5 flex items-center gap-1.5 text-xs text-zinc-500">
                <FileCode2 className="h-3.5 w-3.5" aria-hidden="true" />
                {html
                  ? `${fileName} — ${formatBytes(fileSize)} (آماده ذخیره)`
                  : hadFile
                    ? `فایل فعلی: ${formatBytes(fileSize)} — برای جایگزینی فایل جدید انتخاب کنید`
                    : "هنوز فایلی انتخاب نشده"}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-zinc-300">عنوان فارسی *</Label>
                <Input
                  value={titleFa}
                  onChange={(e) => setTitleFa(e.target.value)}
                  maxLength={80}
                  className="h-10 border-zinc-700 bg-zinc-950 text-sm text-zinc-100"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-zinc-300">عنوان انگلیسی</Label>
                <Input
                  value={titleEn}
                  onChange={(e) => setTitleEn(e.target.value)}
                  maxLength={80}
                  dir="ltr"
                  className="h-10 border-zinc-700 bg-zinc-950 text-left text-sm text-zinc-100"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-zinc-300">توضیح فارسی</Label>
              <Input
                value={descFa}
                onChange={(e) => setDescFa(e.target.value)}
                maxLength={300}
                className="h-10 border-zinc-700 bg-zinc-950 text-sm text-zinc-100"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-zinc-300">توضیح انگلیسی</Label>
              <Input
                value={descEn}
                onChange={(e) => setDescEn(e.target.value)}
                maxLength={300}
                dir="ltr"
                className="h-10 border-zinc-700 bg-zinc-950 text-left text-sm text-zinc-100"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-zinc-300">آدرس (انگلیسی)</Label>
                <Input
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="خودکار"
                  maxLength={40}
                  dir="ltr"
                  className="h-10 border-zinc-700 bg-zinc-950 text-left text-sm text-zinc-100 placeholder:text-zinc-600"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-zinc-300">آیکون</Label>
                <select
                  value={icon}
                  onChange={(e) => setIcon(e.target.value)}
                  className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-2 text-sm text-zinc-100"
                >
                  {Object.keys(APP_ICONS).map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-zinc-300">رنگ</Label>
                <select
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="h-10 rounded-md border border-zinc-700 bg-zinc-950 px-2 text-sm text-zinc-100"
                >
                  {Object.keys(APP_COLORS).map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* جلد */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs text-zinc-300">تصویر جلد (اختیاری)</Label>
                <div className="flex gap-2">
                  {coverUrl && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setCoverUrl("")}
                      className="h-8 rounded-lg border-zinc-700 bg-transparent text-xs text-zinc-400 hover:text-rose-300"
                    >
                      حذف
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setPickerOpen(true)}
                    className="h-8 rounded-lg border-zinc-700 bg-transparent text-xs text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
                  >
                    انتخاب از رسانه‌ها
                  </Button>
                </div>
              </div>
              {coverUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={coverUrl}
                  alt="جلد بازی"
                  className="mt-3 h-24 w-full rounded-lg border border-zinc-800 object-cover"
                />
              )}
            </div>

            <div className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
              <div>
                <p className="text-xs font-semibold text-zinc-200">انتشار در سایت</p>
                <p className="mt-0.5 text-[11px] leading-4 text-zinc-500">
                  روشن = در صفحه بازی‌ها دیده می‌شود (اجرا فقط با حساب عضو).
                </p>
              </div>
              <Switch checked={published} onCheckedChange={setPublished} aria-label="انتشار" />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="h-10 rounded-xl border-zinc-700 bg-transparent text-sm text-zinc-300 hover:bg-zinc-800"
              >
                انصراف
              </Button>
              <Button
                type="button"
                onClick={save}
                disabled={saving}
                className="h-10 rounded-xl bg-emerald-500 text-sm font-bold text-zinc-950 hover:bg-emerald-400 disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
                {editing ? "ذخیره تغییرات" : "ساخت بازی"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <MediaPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        kind="image"
        title="انتخاب جلد بازی"
        onSelect={(url) => setCoverUrl(url)}
      />
    </>
  );
}
