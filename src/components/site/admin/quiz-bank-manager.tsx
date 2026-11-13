"use client";

/* «بانک سؤال» پنل مدیریت — بانک سؤال‌های اطلاعات عمومی بازی «چالش سرعتی».
   فهرست با جست‌وجو و فیلتر دسته، افزودن/ویرایش/حذف دستی، فعال‌غیرفعال‌سازی
   و ورود گروهی (چسباندن آرایهٔ JSON). سؤال‌های فعال این بانک در مسابقه‌های
   بزرگسال و حرفه‌ای به‌کار می‌روند. */

import { useCallback, useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
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
import { CATEGORY_LABELS } from "@/lib/arena-game";

type QuizItem = {
  id: string;
  category: string;
  age: string;
  text: string;
  options: string[];
  correct: number;
  active: boolean;
  createdAt: string;
};

type QuizStats = { total: number; active: number; byCategory: Record<string, number> };

type FormData = { id?: string; text: string; options: string[]; correct: number; category: string; age: string };

const EMPTY_FORM: FormData = {
  text: "",
  options: ["", "", "", ""],
  correct: 0,
  category: "general",
  age: "adult",
};

const inputCls =
  "w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-emerald-500/50 focus:outline-none";

export function QuizBankManager() {
  const { toast } = useToast();
  const [items, setItems] = useState<QuizItem[]>([]);
  const [stats, setStats] = useState<QuizStats>({ total: 0, active: 0, byCategory: {} });
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState<FormData | null>(null);
  const [formBusy, setFormBusy] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [deleting, setDeleting] = useState<QuizItem | null>(null);

  const load = useCallback(
    async (p = page, quiet = false) => {
      try {
        const sp = new URLSearchParams({ page: String(p), pageSize: "25" });
        if (q.trim()) sp.set("q", q.trim());
        if (category) sp.set("category", category);
        const res = await fetch(`/api/admin/quiz?${sp}`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        setItems(data.items);
        setStats(data.stats);
        setTotal(data.total);
        setPage(data.page);
        setPages(Math.max(1, Math.ceil(data.total / data.pageSize)));
      } catch {
        if (!quiet) toast({ title: "دریافت بانک سؤال ناموفق بود.", variant: "destructive" });
      } finally {
        setLoading(false);
      }
    },
    [page, q, category, toast],
  );

  useEffect(() => {
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, category]);

  async function saveForm() {
    if (!form) return;
    setFormBusy(true);
    try {
      const editing = Boolean(form.id);
      const res = await fetch(editing ? `/api/admin/quiz/${form.id}` : "/api/admin/quiz", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: form.text,
          options: form.options,
          correct: form.correct,
          category: form.category,
          age: form.age,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "");
      toast({ title: editing ? "سؤال ویرایش شد." : "سؤال به بانک اضافه شد." });
      setForm(null);
      load();
    } catch (e) {
      toast({
        title: e instanceof Error && e.message ? e.message : "ذخیرهٔ سؤال ناموفق بود.",
        variant: "destructive",
      });
    } finally {
      setFormBusy(false);
    }
  }

  async function toggleActive(item: QuizItem) {
    setItems((list) => list.map((m) => (m.id === item.id ? { ...m, active: !m.active } : m)));
    const res = await fetch(`/api/admin/quiz/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !item.active }),
    });
    if (!res.ok) {
      setItems((list) => list.map((m) => (m.id === item.id ? { ...m, active: item.active } : m)));
      toast({ title: "تغییر وضعیت ناموفق بود.", variant: "destructive" });
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    try {
      const res = await fetch(`/api/admin/quiz/${deleting.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast({ title: "سؤال حذف شد." });
      setDeleting(null);
      load();
    } catch {
      toast({ title: "حذف ناموفق بود.", variant: "destructive" });
    }
  }

  async function runImport() {
    setImportBusy(true);
    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(importText);
      } catch {
        throw new Error("متن چسبانده‌شده JSON معتبر نیست.");
      }
      const questions = Array.isArray(parsed) ? parsed : (parsed as { questions?: unknown }).questions;
      if (!Array.isArray(questions)) throw new Error("یک آرایهٔ JSON لازم است.");
      const res = await fetch("/api/admin/quiz/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questions }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "");
      toast({
        title: `${new Intl.NumberFormat("fa-IR").format(data.inserted)} سؤال اضافه شد.`,
        description:
          data.duplicate || data.invalid
            ? `${new Intl.NumberFormat("fa-IR").format(data.duplicate)} تکراری، ${new Intl.NumberFormat("fa-IR").format(data.invalid)} نامعتبر رد شد.`
            : undefined,
      });
      setImportOpen(false);
      setImportText("");
      load(1);
    } catch (e) {
      toast({
        title: e instanceof Error && e.message ? e.message : "ورود گروهی ناموفق بود.",
        variant: "destructive",
      });
    } finally {
      setImportBusy(false);
    }
  }

  return (
    <div dir="rtl" className="space-y-4">
      {/* سربرگ و آمار */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold text-zinc-100">بانک سؤال — چالش سرعتی</h2>
          <p className="mt-1 text-sm text-zinc-400">
            {new Intl.NumberFormat("fa-IR").format(stats.total)} سؤال (
            {new Intl.NumberFormat("fa-IR").format(stats.active)} فعال) — سؤال‌های فعال در مسابقه‌های
            بزرگسال و حرفه‌ای به‌کار می‌روند.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => load()} className="h-9 rounded-lg border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800">
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            به‌روزرسانی
          </Button>
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)} className="h-9 rounded-lg border-sky-500/40 bg-transparent text-xs text-sky-300 hover:bg-sky-500/10">
            <Upload className="h-3.5 w-3.5" aria-hidden="true" />
            ورود گروهی
          </Button>
          <Button size="sm" onClick={() => setForm({ ...EMPTY_FORM })} className="h-9 rounded-lg bg-emerald-600 text-white hover:bg-emerald-500">
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            سؤال جدید
          </Button>
        </div>
      </div>

      {/* چیپ دسته‌ها */}
      <div className="flex flex-wrap gap-1.5">
        {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setCategory(category === key ? "" : key)}
            className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
              category === key
                ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300"
                : "border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-700"
            }`}
          >
            {label.fa}: {new Intl.NumberFormat("fa-IR").format(stats.byCategory[key] ?? 0)}
          </button>
        ))}
      </div>

      {/* ابزار جست‌وجو */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute start-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="جست‌وجو در متن سؤال‌ها…"
            className={`${inputCls} ps-9`}
          />
        </div>
        <p className="text-xs text-zinc-500">{new Intl.NumberFormat("fa-IR").format(total)} نتیجه</p>
      </div>

      {/* فهرست */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-emerald-400" aria-hidden="true" />
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((m) => (
            <div key={m.id} className="flex flex-wrap items-start gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="border-emerald-500/40 bg-emerald-500/10 text-[11px] text-emerald-300">
                    {CATEGORY_LABELS[m.category as keyof typeof CATEGORY_LABELS]?.fa ?? m.category}
                  </Badge>
                  <Badge
                    className={
                      m.active
                        ? "border-emerald-500/40 bg-emerald-500/10 text-[11px] text-emerald-300"
                        : "border-zinc-700 bg-zinc-800/60 text-[11px] text-zinc-400"
                    }
                  >
                    {m.active ? "فعال" : "خاموش"}
                  </Badge>
                </div>
                <p className="mt-2 text-sm font-bold leading-6 text-zinc-100">{m.text}</p>
                <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-400">
                  {m.options.map((o, i) => (
                    <span key={i} className={i === m.correct ? "font-bold text-emerald-300" : ""}>
                      {i === m.correct ? "✓ " : ""}
                      {o}
                    </span>
                  ))}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => toggleActive(m)} className="h-8 rounded-lg border-zinc-700 bg-transparent text-xs text-zinc-300 hover:bg-zinc-800">
                  {m.active ? "خاموش کن" : "روشن کن"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setForm({
                      id: m.id,
                      text: m.text,
                      options: [...m.options],
                      correct: m.correct,
                      category: m.category,
                      age: m.age,
                    })
                  }
                  className="h-8 rounded-lg border-zinc-700 bg-transparent text-xs text-zinc-300 hover:bg-zinc-800"
                >
                  <Pencil className="h-3 w-3" aria-hidden="true" />
                  ویرایش
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

          {items.length === 0 && (
            <div className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/30 p-8 text-center">
              <p className="text-sm leading-7 text-zinc-400">
                سؤالی با این جست‌وجو پیدا نشد. از «سؤال جدید» یا «ورود گروهی» استفاده کن.
              </p>
            </div>
          )}
        </div>
      )}

      {/* صفحه‌بندی */}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => load(page - 1)} className="h-8 rounded-lg border-zinc-700 bg-transparent text-xs text-zinc-300">
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            قبلی
          </Button>
          <span className="text-xs text-zinc-500">
            صفحهٔ {new Intl.NumberFormat("fa-IR").format(page)} از {new Intl.NumberFormat("fa-IR").format(pages)}
          </span>
          <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => load(page + 1)} className="h-8 rounded-lg border-zinc-700 bg-transparent text-xs text-zinc-300">
            بعدی
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </div>
      )}

      {/* فرم افزودن/ویرایش */}
      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => !formBusy && setForm(null)}>
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-zinc-800 bg-zinc-900 p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-extrabold text-zinc-100">
              {form.id ? "ویرایش سؤال" : "سؤال جدید"}
            </h3>
            <div className="mt-4 space-y-3">
              <textarea
                value={form.text}
                onChange={(e) => setForm({ ...form, text: e.target.value })}
                placeholder="متن سؤال…"
                rows={2}
                className={inputCls}
              />
              {form.options.map((o, i) => (
                <div key={i} className="flex items-center gap-2">
                  <button
                    onClick={() => setForm({ ...form, correct: i })}
                    title="گزینهٔ درست"
                    className={`h-5 w-5 shrink-0 rounded-full border-2 transition-colors ${
                      form.correct === i ? "border-emerald-400 bg-emerald-400" : "border-zinc-600 bg-transparent"
                    }`}
                    aria-label={`گزینهٔ ${i + 1} درست است`}
                  />
                  <input
                    value={o}
                    onChange={(e) => {
                      const options = [...form.options];
                      options[i] = e.target.value;
                      setForm({ ...form, options });
                    }}
                    placeholder={`گزینهٔ ${new Intl.NumberFormat("fa-IR").format(i + 1)}`}
                    className={inputCls}
                  />
                </div>
              ))}
              <div className="grid grid-cols-2 gap-3">
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={inputCls}>
                  {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                    <option key={key} value={key} className="bg-zinc-900">
                      {label.fa}
                    </option>
                  ))}
                </select>
                <select value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} className={inputCls}>
                  <option value="adult" className="bg-zinc-900">بزرگسال</option>
                  <option value="pro" className="bg-zinc-900">حرفه‌ای</option>
                  <option value="kid" className="bg-zinc-900">کودکان</option>
                </select>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setForm(null)} disabled={formBusy} className="rounded-lg border-zinc-700 bg-transparent text-zinc-300">
                انصراف
              </Button>
              <Button size="sm" onClick={saveForm} disabled={formBusy} className="rounded-lg bg-emerald-600 text-white hover:bg-emerald-500">
                {formBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "ذخیره"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ورود گروهی */}
      {importOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => !importBusy && setImportOpen(false)}>
          <div className="w-full max-w-2xl rounded-3xl border border-zinc-800 bg-zinc-900 p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-extrabold text-zinc-100">ورود گروهی سؤال</h3>
            <p className="mt-2 text-xs leading-6 text-zinc-400">
              یک آرایهٔ JSON بچسبان؛ هر سؤال: <code dir="ltr" className="text-emerald-300">{`{"c":"geo","q":"متن؟","o":["الف","ب","پ","ت"],"a":0}`}</code>{" "}
              — دسته‌ها: geo، history، science، general، sport، cinema، literature، music، tech، math.
              سؤال تکراری و نامعتبر خودکار رد می‌شود.
            </p>
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              rows={10}
              dir="ltr"
              placeholder='[{"c":"geo","q":"...","o":["...","...","...","..."],"a":0}]'
              className={`${inputCls} mt-3 font-mono text-xs`}
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setImportOpen(false)} disabled={importBusy} className="rounded-lg border-zinc-700 bg-transparent text-zinc-300">
                انصراف
              </Button>
              <Button size="sm" onClick={runImport} disabled={importBusy || !importText.trim()} className="rounded-lg bg-sky-600 text-white hover:bg-sky-500">
                {importBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "بارگذاری"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* تأیید حذف */}
      <AlertDialog open={Boolean(deleting)} onOpenChange={(v) => !v && setDeleting(null)}>
        <AlertDialogContent dir="rtl" className="border-zinc-800 bg-zinc-900">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-zinc-50">حذف این سؤال؟</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">{deleting?.text}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800">انصراف</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
              className="bg-rose-600 text-white hover:bg-rose-500"
            >
              حذف کن
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
