"use client";

/* ظاهر سایت — لوگو، بنر هیرو، تصویر «درباره من» و ویدیو موشن گرافیک */

import { useCallback, useEffect, useState } from "react";
import {
  Clapperboard,
  Eraser,
  Image as ImageIcon,
  Loader2,
  Save,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { MediaPickerDialog } from "@/components/site/admin/media-picker-dialog";
import { UploadButton } from "@/components/site/admin/media-manager";
import { MediaEmbed } from "@/components/site/media-embed";
import { prepareFile } from "@/lib/upload-client";
import type { ContactInfoWithAppearance } from "@/lib/types";

type ImageSlot = "logoUrl" | "bannerUrl" | "aboutImageUrl";

const SLOT_LABELS: Record<ImageSlot, { title: string; hint: string }> = {
  logoUrl: {
    title: "لوگوی سایت",
    hint: "در هدر و فوتر نمایش داده می‌شود — بهترین حالت: PNG مربعی با شفافیت",
  },
  bannerUrl: {
    title: "بنر بالای سایت (هیرو)",
    hint: "پشت متن‌های ابتدای صفحه قرار می‌گیرد با لایه تیره برای خوانایی — بهترین حالت: عکس افقی ۱۹۲۰×۱۰۸۰",
  },
  aboutImageUrl: {
    title: "تصویر بخش «درباره من»",
    hint: "به‌جای عکس فعلی میز کار نمایش داده می‌شود — بهترین حالت: عکس عمودی ۴:۵",
  },
};

const field =
  "h-10 border-zinc-800 bg-zinc-950 text-right text-sm text-zinc-100 placeholder:text-zinc-600";

export function AppearanceForm() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<ContactInfoWithAppearance | null>(null);
  const [saving, setSaving] = useState(false);
  const [pickerSlot, setPickerSlot] = useState<ImageSlot | null>(null);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/settings");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setSettings(data.settings);
    } catch {
      toast({ title: "دریافت تنظیمات ناموفق بود.", variant: "destructive" });
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const set = (key: keyof ContactInfoWithAppearance, value: string) =>
    setSettings((s) => (s ? { ...s, [key]: value } : s));

  async function uploadToSlot(slot: ImageSlot, file: File) {
    setUploading(true);
    try {
      const prepared = await prepareFile(file);
      if (prepared.mime.startsWith("video/")) {
        throw new Error("این بخش فقط عکس قبول می‌کند — ویدیو را در بخش موشن گرافیک بگذارید.");
      }
      const res = await fetch("/api/admin/media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: prepared.name, mime: prepared.mime, dataUrl: prepared.dataUrl }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "آپلود ناموفق بود.");
      set(slot, `/api/media/${data.media.id}`);
      toast({ title: `«${prepared.name}» آپلود شد — فراموش نکنید ذخیره کنید.` });
    } catch (err) {
      toast({
        title: err instanceof Error ? err.message : "آپلود ناموفق بود.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  }

  async function uploadMotionVideo(file: File) {
    setUploading(true);
    try {
      const prepared = await prepareFile(file);
      if (!prepared.mime.startsWith("video/")) {
        throw new Error("اینجا باید فایل ویدیو انتخاب کنید. عکس‌ها در بخش‌های خودشان آپلود می‌شوند.");
      }
      const res = await fetch("/api/admin/media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: prepared.name, mime: prepared.mime, dataUrl: prepared.dataUrl }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "آپلود ناموفق بود.");
      set("motionUrl", `/api/media/${data.media.id}`);
      toast({
        title: "ویدیو آپلود شد — فراموش نکنید ذخیره کنید.",
        description: "برای ویدیوهای بلندتر (بیش از ۳ مگابایت) لینک آپارات را وارد کنید.",
      });
    } catch (err) {
      toast({
        title: err instanceof Error ? err.message : "آپلود ناموفق بود.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          logoUrl: settings.logoUrl,
          bannerUrl: settings.bannerUrl,
          aboutImageUrl: settings.aboutImageUrl,
          motionUrl: settings.motionUrl,
          motionTitleFa: settings.motionTitleFa,
          motionTitleEn: settings.motionTitleEn,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "ذخیره ناموفق بود.");
      setSettings(data.settings);
      toast({
        title: "ظاهر سایت ذخیره شد.",
        description: "برای دیدن نتیجه، صفحه سایت را تازه‌سازی کنید.",
      });
    } catch (err) {
      toast({
        title: err instanceof Error ? err.message : "ذخیره ناموفق بود.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  if (!settings) {
    return (
      <div className="flex items-center justify-center py-10" dir="rtl">
        <Loader2 className="h-5 w-5 animate-spin text-emerald-400" aria-hidden="true" />
      </div>
    );
  }

  return (
    <form onSubmit={save} className="space-y-6" dir="rtl">
      <div>
        <h3 className="text-base font-bold text-zinc-100">ظاهر سایت</h3>
        <p className="mt-1 text-xs leading-5 text-zinc-500">
          لوگو، بنر و موشن گرافیک را همین‌جا تنظیم کنید — می‌توانید فایل آپلود کنید یا از کتابخانه
          رسانه‌ها انتخاب کنید.
        </p>
      </div>

      {/* سه اسلات عکس */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {(Object.keys(SLOT_LABELS) as ImageSlot[]).map((slot) => {
          const meta = SLOT_LABELS[slot];
          const value = settings[slot];
          return (
            <section key={slot} className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h4 className="text-sm font-bold text-zinc-100">{meta.title}</h4>
                  <p className="mt-1 text-[11px] leading-5 text-zinc-500">{meta.hint}</p>
                </div>
                {value && (
                  <button
                    type="button"
                    onClick={() => set(slot, "")}
                    className="flex shrink-0 items-center gap-1 text-[10px] text-zinc-500 hover:text-amber-400"
                  >
                    <Eraser className="h-3 w-3" aria-hidden="true" />
                    حذف
                  </button>
                )}
              </div>

              <div className="mt-3 flex aspect-video items-center justify-center overflow-hidden rounded-xl border border-dashed border-zinc-700 bg-zinc-950/60">
                {value ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={value} alt={meta.title} className="h-full w-full object-contain" />
                ) : (
                  <div className="flex flex-col items-center gap-1.5 text-zinc-600">
                    {slot === "logoUrl" ? (
                      <Sparkles className="h-6 w-6" aria-hidden="true" />
                    ) : (
                      <ImageIcon className="h-6 w-6" aria-hidden="true" />
                    )}
                    <span className="text-xs">تصویری انتخاب نشده</span>
                  </div>
                )}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <UploadButton
                  onPick={(file) => uploadToSlot(slot, file)}
                  uploading={uploading}
                  accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,image/avif"
                  label="آپلود عکس"
                  className="h-9 rounded-xl bg-emerald-500 px-3 text-xs font-bold text-zinc-950 hover:bg-emerald-400"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPickerSlot(slot)}
                  className="h-9 rounded-xl border-zinc-700 bg-transparent px-3 text-xs text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
                >
                  از کتابخانه
                </Button>
              </div>
            </section>
          );
        })}
      </div>

      {/* موشن گرافیک */}
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 sm:p-5">
        <div className="mb-4">
          <h4 className="flex items-center gap-2 text-sm font-bold text-zinc-100">
            <Clapperboard className="h-4 w-4 text-emerald-400" aria-hidden="true" />
            ویدیو موشن گرافیک
          </h4>
          <p className="mt-1 text-xs leading-5 text-zinc-500">
            فایل ویدیو (تا ۳ مگابایت) آپلود کنید یا لینک آپارات/یوتیوب/MP4 مستقیم وارد کنید. اگر
            خالی بماند، این بخش در سایت نمایش داده نمی‌شود.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-zinc-300">آدرس ویدیو (لینک یا مسیر کتابخانه)</Label>
            <Input
              className={`${field} text-left`}
              dir="ltr"
              value={settings.motionUrl}
              onChange={(e) => set("motionUrl", e.target.value)}
              placeholder="https://www.aparat.com/v/xxxxx یا /api/media/..."
            />
            <div className="flex flex-wrap gap-2 pt-1">
              <UploadButton
                onPick={uploadMotionVideo}
                uploading={uploading}
                accept="video/mp4,video/webm,video/quicktime"
                label="آپلود ویدیو"
                className="h-9 rounded-xl bg-emerald-500 px-3 text-xs font-bold text-zinc-950 hover:bg-emerald-400"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:col-span-1">
            <div className="space-y-1.5">
              <Label className="text-zinc-300">عنوان بخش (فا)</Label>
              <Input className={field} value={settings.motionTitleFa} onChange={(e) => set("motionTitleFa", e.target.value)} placeholder="موشن گرافیک" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-zinc-300">Section title (EN)</Label>
              <Input className={field} dir="ltr" value={settings.motionTitleEn} onChange={(e) => set("motionTitleEn", e.target.value)} placeholder="Motion graphic" />
            </div>
          </div>
        </div>

        {settings.motionUrl && (
          <div className="mt-4 overflow-hidden rounded-xl border border-zinc-800 bg-black">
            <div className="aspect-video w-full">
              <MediaEmbed url={settings.motionUrl} title="پیش‌نمایش موشن گرافیک" />
            </div>
          </div>
        )}
      </section>

      <Button
        type="submit"
        disabled={saving}
        className="h-10 rounded-xl bg-emerald-500 font-bold text-zinc-950 hover:bg-emerald-400"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
        ذخیره ظاهر سایت
      </Button>

      <MediaPickerDialog
        open={pickerSlot !== null}
        onOpenChange={(v) => !v && setPickerSlot(null)}
        kind="image"
        onSelect={(url) => {
          if (pickerSlot) set(pickerSlot, url);
        }}
      />
    </form>
  );
}
