"use client";

/* مدیریت باکس‌های محتوا — افزودن/ویرایش/حذف/انتشار */

import { useCallback, useEffect, useState } from "react";
import {
  Clapperboard,
  Image as ImageIcon,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { MediaEmbed } from "@/components/site/media-embed";
import { DOT_COLORS, COLOR_OPTIONS, ICON_OPTIONS } from "@/components/site/admin/app-form-dialog";
import type { PublicBox } from "@/lib/types";

type AdminBox = PublicBox & { published: boolean };

type BoxDraft = {
  titleFa: string;
  titleEn: string;
  bodyFa: string;
  bodyEn: string;
  icon: string;
  color: string;
  imageUrl: string;
  videoUrl: string;
  linkUrl: string;
  linkLabelFa: string;
  linkLabelEn: string;
  published: boolean;
  sortOrder: number;
};

const EMPTY_DRAFT: BoxDraft = {
  titleFa: "",
  titleEn: "",
  bodyFa: "",
  bodyEn: "",
  icon: "Sparkles",
  color: "emerald",
  imageUrl: "",
  videoUrl: "",
  linkUrl: "",
  linkLabelFa: "",
  linkLabelEn: "",
  published: true,
  sortOrder: 0,
};

const field =
  "h-10 border-zinc-800 bg-zinc-950 text-right text-sm text-zinc-100 placeholder:text-zinc-600";

export function BoxesManager() {
  const { toast } = useToast();
  const [boxes, setBoxes] = useState<AdminBox[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AdminBox | null>(null);
  const [deleting, setDeleting] = useState<AdminBox | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/boxes");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setBoxes(data.boxes);
    } catch {
      toast({ title: "دریافت باکس‌ها ناموفق بود.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  async function togglePublished(box: AdminBox, published: boolean) {
    setBoxes((list) => list.map((b) => (b.id === box.id ? { ...b, published } : b)));
    try {
      const res = await fetch(`/api/admin/boxes/${box.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...box, published }),
      });
      if (!res.ok) throw new Error();
      toast({
        title: published ? "باکس منتشر شد." : "باکس از سایت مخفی شد.",
      });
    } catch {
      setBoxes((list) => list.map((b) => (b.id === box.id ? { ...b, published: !published } : b)));
      toast({ title: "تغییر وضعیت انتشار ناموفق بود.", variant: "destructive" });
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeletingBusy(true);
    try {
      const res = await fetch(`/api/admin/boxes/${deleting.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setBoxes((list) => list.filter((b) => b.id !== deleting.id));
      toast({ title: "باکس حذف شد." });
    } catch {
      toast({ title: "حذف ناموفق بود.", variant: "destructive" });
    } finally {
      setDeletingBusy(false);
      setDeleting(null);
    }
  }

  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-zinc-100">باکس‌های محتوا</h3>
          <p className="mt-1 text-xs leading-5 text-zinc-500">
            باکس‌های دلخواه با عکس، ویدیو، متن و دکمه — بین بخش اپلیکیشن‌ها و «درباره من» نمایش داده
            می‌شوند.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={load}
            aria-label="بازخوانی"
            className="h-10 w-10 rounded-xl border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
            className="h-10 rounded-xl bg-emerald-500 font-bold text-zinc-950 hover:bg-emerald-400"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            باکس جدید
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-emerald-400" aria-hidden="true" />
        </div>
      ) : boxes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-800 py-12 text-center">
          <p className="text-sm text-zinc-500">
            هنوز باکسی نساخته‌اید. با دکمه «باکس جدید» اولین باکس را اضافه کنید.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {boxes.map((box) => {
            const Icon = APP_ICONS[box.icon] ?? Sparkles;
            const gradient = APP_COLORS[box.color] ?? APP_COLORS.emerald;
            return (
              <li
                key={box.id}
                className="flex flex-col gap-4 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 sm:flex-row sm:items-center"
              >
                {/* تصویر کوچک */}
                <div className="relative h-24 w-full shrink-0 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 sm:w-40">
                  {box.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={box.imageUrl} alt="" className="h-full w-full object-cover" />
                  ) : box.videoUrl ? (
                    <div className="flex h-full w-full items-center justify-center text-zinc-500">
                      <Clapperboard className="h-6 w-6" aria-hidden="true" />
                    </div>
                  ) : (
                    <div
                      className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${gradient}`}
                    >
                      <Icon className="h-6 w-6" aria-hidden="true" />
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold text-zinc-100">{box.titleFa}</p>
                    <span className="font-mono text-xs text-zinc-500">{box.titleEn}</span>
                    <Badge
                      variant="secondary"
                      className={
                        box.published
                          ? "bg-emerald-500/15 text-[10px] text-emerald-300"
                          : "bg-amber-500/15 text-[10px] text-amber-300"
                      }
                    >
                      {box.published ? "منتشرشده" : "پیش‌نویس"}
                    </Badge>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs leading-6 text-zinc-500">
                    {box.bodyFa || "—"}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-zinc-500">{box.published ? "نمایش" : "مخفی"}</span>
                    <Switch
                      checked={box.published}
                      onCheckedChange={(v) => togglePublished(box, v)}
                      aria-label="انتشار"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="ویرایش"
                    className="h-9 w-9 rounded-lg border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
                    onClick={() => {
                      setEditing(box);
                      setFormOpen(true);
                    }}
                  >
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="حذف"
                    className="h-9 w-9 rounded-lg border-zinc-700 bg-transparent text-zinc-400 hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-400"
                    onClick={() => setDeleting(box)}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <BoxFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editing}
        onSaved={load}
      />

      <AlertDialog open={deleting !== null} onOpenChange={(v) => !v && setDeleting(null)}>
        <AlertDialogContent className="border-zinc-800 bg-zinc-900" dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-zinc-50">
              حذف باکس «{deleting?.titleFa}»؟
            </AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              این کار برگشت‌پذیر نیست.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100">
              انصراف
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={deletingBusy}
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
              className="bg-rose-600 font-bold text-white hover:bg-rose-500"
            >
              {deletingBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : "حذف کن"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* --- فرم ساخت/ویرایش باکس --- */
function BoxFormDialog({
  open,
  onOpenChange,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: AdminBox | null;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [draft, setDraft] = useState<BoxDraft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState<null | "image" | "video">(null);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setDraft({
        titleFa: editing.titleFa,
        titleEn: editing.titleEn,
        bodyFa: editing.bodyFa,
        bodyEn: editing.bodyEn,
        icon: editing.icon,
        color: editing.color,
        imageUrl: editing.imageUrl,
        videoUrl: editing.videoUrl,
        linkUrl: editing.linkUrl ?? "",
        linkLabelFa: editing.linkLabelFa,
        linkLabelEn: editing.linkLabelEn,
        published: editing.published,
        sortOrder: editing.sortOrder,
      });
    } else {
      setDraft(EMPTY_DRAFT);
    }
  }, [open, editing]);

  const set = <K extends keyof BoxDraft>(key: K, value: BoxDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.titleFa.trim()) {
      toast({ title: "عنوان فارسی باکس الزامی است.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(editing ? `/api/admin/boxes/${editing.id}` : "/api/admin/boxes", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "ذخیره ناموفق بود.");
      toast({ title: editing ? "باکس ویرایش شد." : "باکس جدید ساخته شد." });
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast({
        title: err instanceof Error ? err.message : "ذخیره ناموفق بود.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  const PreviewIcon = APP_ICONS[draft.icon] ?? Sparkles;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto border-zinc-800 bg-zinc-900 sm:max-w-xl">
        <DialogHeader dir="rtl">
          <DialogTitle className="text-zinc-50">
            {editing ? `ویرایش باکس «${editing.titleFa}»` : "باکس جدید"}
          </DialogTitle>
          <DialogDescription className="text-zinc-500">
            هر باکس می‌تواند عکس یا ویدیو، متن دو زبانه و یک دکمه داشته باشد.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={save} dir="rtl" className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-zinc-300">عنوان (فارسی) *</Label>
              <Input className={field} value={draft.titleFa} onChange={(e) => set("titleFa", e.target.value)} placeholder="مثلاً: خدمات من" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-zinc-300">Title (English)</Label>
              <Input className={field} dir="ltr" value={draft.titleEn} onChange={(e) => set("titleEn", e.target.value)} placeholder="My services" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-zinc-300">متن (فارسی)</Label>
            <Textarea
              className="min-h-16 border-zinc-800 bg-zinc-950 text-right text-sm text-zinc-100 placeholder:text-zinc-600"
              value={draft.bodyFa}
              onChange={(e) => set("bodyFa", e.target.value)}
              placeholder="توضیح دلخواه — چند خط هم قابل قبول است"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-zinc-300">Body (English)</Label>
            <Textarea
              className="min-h-16 border-zinc-800 bg-zinc-950 text-sm text-zinc-100 placeholder:text-zinc-600"
              dir="ltr"
              value={draft.bodyEn}
              onChange={(e) => set("bodyEn", e.target.value)}
              placeholder="Description"
            />
          </div>

          {/* رسانه‌های باکس */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5 text-zinc-300">
                <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />
                تصویر باکس (اختیاری)
              </Label>
              {draft.imageUrl ? (
                <div className="relative overflow-hidden rounded-lg border border-zinc-800">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={draft.imageUrl} alt="" className="h-24 w-full object-cover" />
                  <button
                    type="button"
                    aria-label="حذف تصویر"
                    onClick={() => set("imageUrl", "")}
                    className="absolute left-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-md bg-zinc-950/80 text-zinc-300 hover:text-rose-400"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPickerOpen("image")}
                  className="h-10 w-full rounded-xl border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
                >
                  <ImageIcon className="h-4 w-4" aria-hidden="true" />
                  انتخاب یا آپلود عکس
                </Button>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5 text-zinc-300">
                <Clapperboard className="h-3.5 w-3.5" aria-hidden="true" />
                ویدیو باکس (اختیاری)
              </Label>
              {draft.videoUrl ? (
                <div className="relative overflow-hidden rounded-lg border border-zinc-800 bg-black">
                  <div className="h-24 w-full pointer-events-none opacity-80">
                    <MediaEmbed url={draft.videoUrl} title="preview" />
                  </div>
                  <button
                    type="button"
                    aria-label="حذف ویدیو"
                    onClick={() => set("videoUrl", "")}
                    className="absolute left-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-md bg-zinc-950/80 text-zinc-300 hover:text-rose-400"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setPickerOpen("video")}
                    className="h-10 w-full rounded-xl border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
                  >
                    <Clapperboard className="h-4 w-4" aria-hidden="true" />
                    انتخاب یا آپلود ویدیو
                  </Button>
                  <Input
                    className={`${field} text-left`}
                    dir="ltr"
                    value={draft.videoUrl}
                    onChange={(e) => set("videoUrl", e.target.value)}
                    placeholder="یا لینک آپارات / MP4"
                  />
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-zinc-300">آیکون (وقتی عکس نباشد)</Label>
              <Select value={draft.icon} onValueChange={(v) => set("icon", v)}>
                <SelectTrigger className={field}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-72 border-zinc-800 bg-zinc-900">
                  {ICON_OPTIONS.map((key) => {
                    const Ic = APP_ICONS[key];
                    return (
                      <SelectItem key={key} value={key} className="text-zinc-200">
                        <span className="flex items-center gap-2">
                          <Ic className="h-4 w-4" aria-hidden="true" />
                          {key}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-zinc-300">رنگ</Label>
              <Select value={draft.color} onValueChange={(v) => set("color", v)}>
                <SelectTrigger className={field}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-zinc-800 bg-zinc-900">
                  {COLOR_OPTIONS.map((key) => (
                    <SelectItem key={key} value={key} className="text-zinc-200">
                      <span className="flex items-center gap-2">
                        <span className={`h-3.5 w-3.5 rounded-full ${DOT_COLORS[key] ?? "bg-zinc-400"}`} />
                        {key}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-zinc-300">لینک دکمه (اختیاری)</Label>
              <Input className={`${field} text-left`} dir="ltr" value={draft.linkUrl} onChange={(e) => set("linkUrl", e.target.value)} placeholder="https://..." />
            </div>
            <div className="space-y-1.5">
              <Label className="text-zinc-300">متن دکمه (فا)</Label>
              <Input className={field} value={draft.linkLabelFa} onChange={(e) => set("linkLabelFa", e.target.value)} placeholder="مشاهده" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-zinc-300">Button (EN)</Label>
              <Input className={field} dir="ltr" value={draft.linkLabelEn} onChange={(e) => set("linkLabelEn", e.target.value)} placeholder="Open" />
            </div>
          </div>

          <div className="grid grid-cols-2 items-end gap-4">
            <div className="space-y-1.5">
              <Label className="text-zinc-300">ترتیب نمایش</Label>
              <Input
                className={field}
                dir="ltr"
                type="number"
                value={draft.sortOrder}
                onChange={(e) => set("sortOrder", Number(e.target.value) || 0)}
              />
              <p className="text-xs text-zinc-500">عدد کوچک‌تر = بالاتر در صفحه</p>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-3">
              <Label htmlFor="box-published-switch" className="cursor-pointer text-sm text-zinc-300">
                انتشار در سایت
              </Label>
              <Switch
                id="box-published-switch"
                checked={draft.published}
                onCheckedChange={(v) => set("published", v)}
              />
            </div>
          </div>

          <div className="flex justify-start gap-3 pt-2">
            <Button
              type="submit"
              disabled={saving}
              className="h-10 rounded-xl bg-emerald-500 font-bold text-zinc-950 hover:bg-emerald-400"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {editing ? "ذخیره تغییرات" : "افزودن باکس"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="h-10 rounded-xl border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
            >
              انصراف
            </Button>
          </div>
        </form>

        <MediaPickerDialog
          open={pickerOpen !== null}
          onOpenChange={(v) => !v && setPickerOpen(null)}
          kind={pickerOpen ?? "image"}
          onSelect={(url) => {
            if (pickerOpen === "video") set("videoUrl", url);
            else set("imageUrl", url);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
