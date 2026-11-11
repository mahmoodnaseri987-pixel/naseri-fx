"use client";

/* ویرایش متن‌های سایت — تایپ مستقیم متن‌ها؛ خالی بماند = متن پیش‌فرض سایت */

import { useCallback, useEffect, useState } from "react";
import { Eraser, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { dict } from "@/lib/i18n";
import type { SiteContentMap } from "@/lib/types";

const field =
  "min-h-10 border-zinc-800 bg-zinc-950 py-2 text-right text-sm text-zinc-100 placeholder:text-zinc-600";
const fieldLtr =
  "min-h-10 border-zinc-800 bg-zinc-950 py-2 text-sm text-zinc-100 placeholder:text-zinc-600";

type FieldDef = {
  key: string;
  label: string;
  /** متن پیش‌فرض (به‌عنوان placeholder نمایش داده می‌شود) */
  fallback: string;
  multiline?: boolean;
  ltr?: boolean;
};

type GroupDef = {
  id: string;
  title: string;
  hint?: string;
  fields: FieldDef[];
};

const fa = dict.fa;
const en = dict.en;

const GROUPS: GroupDef[] = [
  {
    id: "hero",
    title: "بالای سایت (هیرو)",
    hint: "اولین چیزی که بازدیدکننده می‌بیند — عنوان بزرگ، توضیح و چهار عدد آمار.",
    fields: [
      { key: "hero_badge_fa", label: "برچسب بالای عنوان (فا)", fallback: fa.hero.badge },
      { key: "hero_badge_en", label: "Badge (EN)", fallback: en.hero.badge, ltr: true },
      { key: "hero_title_a_fa", label: "عنوان — خط اول (فا)", fallback: fa.hero.titleA },
      { key: "hero_title_a_en", label: "Title line 1 (EN)", fallback: en.hero.titleA, ltr: true },
      { key: "hero_title_b_fa", label: "عنوان — خط دوم (رنگی)", fallback: fa.hero.titleB },
      { key: "hero_title_b_en", label: "Title line 2 (EN)", fallback: en.hero.titleB, ltr: true },
      { key: "hero_subtitle_fa", label: "توضیح زیر عنوان (فا)", fallback: fa.hero.subtitle, multiline: true },
      { key: "hero_subtitle_en", label: "Subtitle (EN)", fallback: en.hero.subtitle, multiline: true, ltr: true },
      ...[1, 2, 3, 4].flatMap((i): FieldDef[] => [
        { key: `hero_stat${i}_value_fa`, label: `آمار ${i} — عدد (فا)`, fallback: fa.hero.stats[i - 1].value },
        { key: `hero_stat${i}_value_en`, label: `Stat ${i} — value (EN)`, fallback: en.hero.stats[i - 1].value, ltr: true },
        { key: `hero_stat${i}_label_fa`, label: `آمار ${i} — برچسب (فا)`, fallback: fa.hero.stats[i - 1].label },
        { key: `hero_stat${i}_label_en`, label: `Stat ${i} — label (EN)`, fallback: en.hero.stats[i - 1].label, ltr: true },
      ]),
    ],
  },
  {
    id: "apps",
    title: "بخش اپلیکیشن‌ها",
    fields: [
      { key: "apps_title_fa", label: "عنوان بخش (فا)", fallback: fa.apps.title },
      { key: "apps_title_en", label: "Section title (EN)", fallback: en.apps.title, ltr: true },
      { key: "apps_subtitle_fa", label: "توضیح بخش (فا)", fallback: fa.apps.subtitle, multiline: true },
      { key: "apps_subtitle_en", label: "Section subtitle (EN)", fallback: en.apps.subtitle, multiline: true, ltr: true },
    ],
  },
  {
    id: "boxes",
    title: "بخش باکس‌های محتوا",
    hint: "اگر باکسی ساخته باشید، این عنوان بالای آن‌ها دیده می‌شود.",
    fields: [
      { key: "boxes_title_fa", label: "عنوان بخش (فا)", fallback: "باکس‌های ویژه" },
      { key: "boxes_title_en", label: "Section title (EN)", fallback: "Featured highlights", ltr: true },
      { key: "boxes_subtitle_fa", label: "توضیح بخش (فا)", fallback: "" },
      { key: "boxes_subtitle_en", label: "Section subtitle (EN)", fallback: "", ltr: true },
    ],
  },
  {
    id: "about",
    title: "بخش درباره من",
    fields: [
      { key: "about_title_fa", label: "عنوان (فا)", fallback: fa.about.title },
      { key: "about_title_en", label: "Title (EN)", fallback: en.about.title, ltr: true },
      { key: "about_p1_fa", label: "پاراگراف اول (فا)", fallback: fa.about.p1, multiline: true },
      { key: "about_p1_en", label: "Paragraph 1 (EN)", fallback: en.about.p1, multiline: true, ltr: true },
      { key: "about_p2_fa", label: "پاراگراف دوم (فا)", fallback: fa.about.p2, multiline: true },
      { key: "about_p2_en", label: "Paragraph 2 (EN)", fallback: en.about.p2, multiline: true, ltr: true },
    ],
  },
  {
    id: "footer",
    title: "فوتر",
    fields: [
      { key: "footer_madewith_fa", label: "متن فوتر (فا)", fallback: fa.footer.madeWith },
      { key: "footer_madewith_en", label: "Footer text (EN)", fallback: en.footer.madeWith, ltr: true },
    ],
  },
];

export function TextsEditor() {
  const { toast } = useToast();
  const [content, setContent] = useState<SiteContentMap>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/content");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setContent(data.content ?? {});
    } catch {
      toast({ title: "دریافت متن‌ها ناموفق بود.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/content", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(content),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "ذخیره ناموفق بود.");
      setContent(data.content ?? {});
      toast({
        title: "متن‌ها ذخیره شد.",
        description: "برای دیدن نتیجه، صفحه سایت را تازه‌سازی (Refresh) کنید.",
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

  function setValue(key: string, value: string) {
    setContent((c) => ({ ...c, [key]: value }));
  }

  function clearField(key: string) {
    setContent((c) => {
      const next = { ...c, [key]: "" };
      delete next[key];
      return next;
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12" dir="rtl">
        <Loader2 className="h-5 w-5 animate-spin text-emerald-400" aria-hidden="true" />
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="space-y-6"
      dir="rtl"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-zinc-100">متن‌های سایت</h3>
          <p className="mt-1 text-xs leading-5 text-zinc-500">
            هر متنی را که خالی بگذارید، همان متن پیش‌فرض (نمونه کم‌رنگ داخل کادر) نمایش داده می‌شود.
          </p>
        </div>
        <Button
          type="submit"
          disabled={saving}
          className="h-10 rounded-xl bg-emerald-500 font-bold text-zinc-950 hover:bg-emerald-400"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
          ذخیره همه متن‌ها
        </Button>
      </div>

      {GROUPS.map((group) => (
        <section key={group.id} className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 sm:p-5">
          <div className="mb-4">
            <h4 className="text-sm font-bold text-zinc-100">{group.title}</h4>
            {group.hint && <p className="mt-1 text-xs leading-5 text-zinc-500">{group.hint}</p>}
          </div>

          <div className="grid grid-cols-1 gap-x-5 gap-y-4 md:grid-cols-2">
            {group.fields.map((f) => (
              <div key={f.key} className={`space-y-1.5 ${f.multiline ? "md:col-span-2" : ""}`}>
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-xs text-zinc-300">{f.label}</Label>
                  {content[f.key] !== undefined && content[f.key] !== "" && (
                    <button
                      type="button"
                      onClick={() => clearField(f.key)}
                      className="flex items-center gap-1 text-[10px] text-zinc-500 transition-colors hover:text-amber-400"
                    >
                      <Eraser className="h-3 w-3" aria-hidden="true" />
                      بازگشت به پیش‌فرض
                    </button>
                  )}
                </div>
                {f.multiline ? (
                  <Textarea
                    className={`min-h-20 border-zinc-800 bg-zinc-950 text-sm text-zinc-100 placeholder:text-zinc-600 ${f.ltr ? "text-left" : "text-right"}`}
                    dir={f.ltr ? "ltr" : "rtl"}
                    value={content[f.key] ?? ""}
                    onChange={(e) => setValue(f.key, e.target.value)}
                    placeholder={f.fallback}
                  />
                ) : (
                  <Input
                    className={f.ltr ? fieldLtr : field}
                    dir={f.ltr ? "ltr" : "rtl"}
                    value={content[f.key] ?? ""}
                    onChange={(e) => setValue(f.key, e.target.value)}
                    placeholder={f.fallback}
                  />
                )}
              </div>
            ))}
          </div>
        </section>
      ))}

      <div className="flex justify-start">
        <Button
          type="submit"
          disabled={saving}
          className="h-10 rounded-xl bg-emerald-500 font-bold text-zinc-950 hover:bg-emerald-400"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
          ذخیره همه متن‌ها
        </Button>
      </div>
    </form>
  );
}
