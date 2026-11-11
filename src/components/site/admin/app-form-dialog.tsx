"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { APP_COLORS, APP_ICONS } from "@/components/site/apps";
import { Sparkles } from "lucide-react";
import type { AdminApp } from "@/lib/types";

export const ICON_OPTIONS = Object.keys(APP_ICONS);
export const COLOR_OPTIONS = Object.keys(APP_COLORS);

/* نقشه استاتیک برای دات‌های انتخاب رنگ (Tailwind کلاس داینامیک نمی‌سازد) */
export const DOT_COLORS: Record<string, string> = {
  emerald: "bg-emerald-400",
  cyan: "bg-cyan-400",
  violet: "bg-violet-400",
  amber: "bg-amber-400",
  rose: "bg-rose-400",
  sky: "bg-sky-400",
  lime: "bg-lime-400",
  fuchsia: "bg-fuchsia-400",
  orange: "bg-orange-400",
  teal: "bg-teal-400",
};

type Draft = {
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
  bazaarUrl: string;
  playUrl: string;
  published: boolean;
  sortOrder: number;
};

const EMPTY_DRAFT: Draft = {
  nameFa: "",
  nameEn: "",
  categoryFa: "",
  categoryEn: "",
  descFa: "",
  descEn: "",
  icon: "Sparkles",
  color: "emerald",
  installsFa: "۰",
  installsEn: "0",
  rating: "4.5",
  bazaarUrl: "",
  playUrl: "",
  published: false,
  sortOrder: 0,
};

type AppFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: AdminApp | null; // null = ایجاد اپ جدید
  onSaved: () => void;
};

export function AppFormDialog({ open, onOpenChange, editing, onSaved }: AppFormDialogProps) {
  const { toast } = useToast();
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setDraft({
        nameFa: editing.nameFa,
        nameEn: editing.nameEn,
        categoryFa: editing.categoryFa,
        categoryEn: editing.categoryEn,
        descFa: editing.descFa,
        descEn: editing.descEn,
        icon: editing.icon,
        color: editing.color,
        installsFa: editing.installsFa,
        installsEn: editing.installsEn,
        rating: editing.rating,
        bazaarUrl: editing.bazaarUrl ?? "",
        playUrl: editing.playUrl ?? "",
        published: editing.published,
        sortOrder: editing.sortOrder,
      });
    } else {
      setDraft(EMPTY_DRAFT);
    }
  }, [open, editing]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.nameFa.trim()) {
      toast({ title: "نام فارسی اپ الزامی است.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(editing ? `/api/admin/apps/${editing.id}` : "/api/admin/apps", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "ذخیره ناموفق بود.");
      }
      toast({ title: editing ? "اپ با موفقیت ویرایش شد." : "اپ جدید ساخته شد." });
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

  const field =
    "h-10 border-zinc-800 bg-zinc-950 text-right text-sm text-zinc-100 placeholder:text-zinc-600";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto border-zinc-800 bg-zinc-900 sm:max-w-xl">
        <DialogHeader dir="rtl">
          <DialogTitle className="text-zinc-50">
            {editing ? `ویرایش «${editing.nameFa}»` : "افزودن اپ جدید"}
          </DialogTitle>
          <DialogDescription className="text-zinc-500">
            اطلاعات فارسی در نسخه فارسی سایت و انگلیسی در نسخه انگلیسی نمایش داده می‌شود.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={save} dir="rtl" className="space-y-4">
          {/* پیش‌نمایش زنده آیکون و رنگ */}
          <div className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
            <div
              className={`flex h-11 w-11 items-center justify-center rounded-xl border bg-gradient-to-br ${
                APP_COLORS[draft.color] ?? APP_COLORS.emerald
              }`}
            >
              <PreviewIcon className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-bold text-zinc-100">{draft.nameFa || "نام اپ"}</p>
              <p className="text-xs text-zinc-500">
                {draft.categoryFa || "دسته‌بندی"} — پیش‌نمایش کارت
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-zinc-300">نام (فارسی) *</Label>
              <Input className={field} value={draft.nameFa} onChange={(e) => set("nameFa", e.target.value)} placeholder="مثلاً: قسط‌یار" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-zinc-300">Name (English)</Label>
              <Input className={field} dir="ltr" value={draft.nameEn} onChange={(e) => set("nameEn", e.target.value)} placeholder="GhestYar" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-zinc-300">دسته‌بندی (فارسی)</Label>
              <Input className={field} value={draft.categoryFa} onChange={(e) => set("categoryFa", e.target.value)} placeholder="مدیریت مالی" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-zinc-300">Category (English)</Label>
              <Input className={field} dir="ltr" value={draft.categoryEn} onChange={(e) => set("categoryEn", e.target.value)} placeholder="Personal finance" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-zinc-300">توضیح کوتاه (فارسی)</Label>
            <Textarea
              className="min-h-16 border-zinc-800 bg-zinc-950 text-right text-sm text-zinc-100 placeholder:text-zinc-600"
              value={draft.descFa}
              onChange={(e) => set("descFa", e.target.value)}
              placeholder="یک جمله درباره کاربرد اپ"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-zinc-300">Short description (English)</Label>
            <Textarea
              className="min-h-16 border-zinc-800 bg-zinc-950 text-sm text-zinc-100 placeholder:text-zinc-600"
              dir="ltr"
              value={draft.descEn}
              onChange={(e) => set("descEn", e.target.value)}
              placeholder="One-line description"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-zinc-300">آیکون</Label>
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

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="text-zinc-300">نصب (فا)</Label>
              <Input className={field} value={draft.installsFa} onChange={(e) => set("installsFa", e.target.value)} placeholder="۸۵ هزار" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-zinc-300">Installs (EN)</Label>
              <Input className={field} dir="ltr" value={draft.installsEn} onChange={(e) => set("installsEn", e.target.value)} placeholder="85K" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-zinc-300">امتیاز</Label>
              <Input className={field} dir="ltr" value={draft.rating} onChange={(e) => set("rating", e.target.value)} placeholder="4.7" />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-zinc-300">لینک کافه‌بازار</Label>
              <Input className={`${field} text-left`} dir="ltr" value={draft.bazaarUrl} onChange={(e) => set("bazaarUrl", e.target.value)} placeholder="https://cafebazaar.ir/app/..." />
            </div>
            <div className="space-y-1.5">
              <Label className="text-zinc-300">لینک گوگل‌پلی</Label>
              <Input className={`${field} text-left`} dir="ltr" value={draft.playUrl} onChange={(e) => set("playUrl", e.target.value)} placeholder="https://play.google.com/..." />
            </div>
          </div>
          <p className="text-xs leading-5 text-zinc-500">
            اگر هر دو لینک خالی باشند، به‌جای دکمه دانلود، دکمه «سفارش مستقیم در تلگرام» نمایش داده می‌شود.
          </p>

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
              <Label htmlFor="published-switch" className="cursor-pointer text-sm text-zinc-300">
                انتشار در سایت
              </Label>
              <Switch
                id="published-switch"
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
              {editing ? "ذخیره تغییرات" : "افزودن اپ"}
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
      </DialogContent>
    </Dialog>
  );
}
