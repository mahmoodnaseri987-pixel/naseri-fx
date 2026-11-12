"use client";

/* پنل مدیریت آهنگ‌های بازی «شعر یادت نره» — فهرست فایل‌های پوشه + متادیتای دیتابیس:
   پخش نمونه، تنظیم زمان شروع کلیپ، متن مصرع‌ها و فعال/غیرفعال کردن */

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Music4, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

type SongStatus = "ready" | "draft" | "stale";

type SherSongRow = {
  filename: string;
  exists: boolean;
  size: number;
  id?: string;
  title: string;
  artist: string;
  clipStart: number;
  answerLine: string;
  contextLines: string[];
  extraLines: string[];
  active: boolean;
  status: SongStatus;
};

const STATUS: Record<SongStatus, { label: string; cls: string }> = {
  ready: { label: "آماده", cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" },
  draft: { label: "ناقص", cls: "border-amber-500/40 bg-amber-500/10 text-amber-300" },
  stale: { label: "بدون فایل", cls: "border-rose-500/40 bg-rose-500/10 text-rose-300" },
};

const field =
  "h-10 border-zinc-800 bg-zinc-950 text-right text-sm text-zinc-100 placeholder:text-zinc-600";

function formatSize(n: number): string {
  if (n < 1024) return `${n} بایت`;
  if (n < 1048576) return `${(n / 1024).toFixed(0)} کیلوبایت`;
  return `${(n / 1048576).toFixed(1)} مگابایت`;
}

function rowFrom(row: SherSongRow): SherSongRow {
  return {
    ...row,
    status: !row.exists
      ? "stale"
      : row.title.trim() && row.answerLine.trim()
        ? "ready"
        : "draft",
  };
}

type Draft = {
  title: string;
  artist: string;
  clipStart: string;
  answerLine: string;
  contextLines: [string, string, string];
  extraText: string;
  active: boolean;
};

function draftFrom(row: SherSongRow): Draft {
  return {
    title: row.title,
    artist: row.artist,
    clipStart: String(row.clipStart ?? 0),
    answerLine: row.answerLine,
    contextLines: [0, 1, 2].map((i) => row.contextLines[i] ?? "") as Draft["contextLines"],
    extraText: row.extraLines.join("\n"),
    active: row.active,
  };
}

/* کارت یک آهنگ — پخش‌کننده، فیلدهای متن و دکمه‌های ذخیره/فعال‌سازی */
function SongCard({
  row,
  onPatch,
}: {
  row: SherSongRow;
  onPatch: (filename: string, patch: Partial<SherSongRow>) => void;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [draft, setDraft] = useState<Draft>(() => draftFrom(row));
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  /* پیش‌نویس فقط با تایپ کاربر تغییر می‌کند — به‌روزرسانی ردیف از بیرون (ذخیره/فعال‌سازی)
     پیش‌نویس را بازنویسی نمی‌کند تا ویرایش‌های ذخیره‌نشده نپرند؛
     همگام‌سازی کامل با سرور فقط با «به‌روزرسانی فهرست» و ریمونت کارت رخ می‌دهد */

  /* پیام موفقیت/خطا بعد از چند ثانیه پاک می‌شود */
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 4000);
    return () => clearTimeout(t);
  }, [msg]);

  /* تنظیم clipStart از لحظهٔ فعلی پخش */
  function setClipFromPlayback() {
    const el = audioRef.current;
    if (!el) return;
    const t = Math.round(el.currentTime * 10) / 10;
    setDraft((d) => ({ ...d, clipStart: String(t) }));
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    const payload = {
      filename: row.filename,
      title: draft.title.trim(),
      artist: draft.artist.trim(),
      clipStart: Math.max(0, Number(draft.clipStart) || 0),
      answerLine: draft.answerLine.trim(),
      contextLines: draft.contextLines.map((s) => s.trim()).filter(Boolean),
      extraLines: draft.extraText
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      active: draft.active,
    };
    try {
      const res = await fetch("/api/sher/admin/songs/upsert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "ذخیره ناموفق بود.");
      onPatch(row.filename, payload);
      setMsg({ ok: true, text: "ذخیره شد." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "ذخیره ناموفق بود." });
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive() {
    setToggling(true);
    setMsg(null);
    const active = !row.active;
    try {
      const res = await fetch("/api/sher/admin/songs/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: row.filename, active }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "تغییر وضعیت ناموفق بود.");
      onPatch(row.filename, { active });
      setDraft((d) => ({ ...d, active })); // سوییچ پیش‌نویس هم با واقعیت سرور هم‌راستا شود
      setMsg({ ok: true, text: active ? "آهنگ فعال شد." : "آهنگ غیرفعال شد." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "تغییر وضعیت ناموفق بود." });
    } finally {
      setToggling(false);
    }
  }

  const ready = row.status === "ready";

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
      {/* سربرگ کارت: نام فایل، حجم و وضعیت */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm text-zinc-100" dir="ltr">
          {row.filename}
        </span>
        {row.exists && (
          <span className="text-xs text-zinc-500">{formatSize(row.size)}</span>
        )}
        <span
          className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${STATUS[row.status].cls}`}
        >
          {STATUS[row.status].label}
        </span>
        {row.active && row.exists && (
          <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-300">
            فعال
          </span>
        )}
      </div>

      {row.status === "stale" ? (
        <p className="mt-3 text-sm text-rose-300/90">
          فایل صوتی در پوشهٔ public/sher/songs نیست؛ متادیتای ذخیره‌شده در دیتابیس باقی مانده
          است. اگر فایل را برگردانید، این ردیف دوباره به فهرست اصلی می‌پیوندد.
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          {/* پخش‌کنندهٔ نمونه */}
          <audio
            ref={audioRef}
            controls
            preload="none"
            src={`/sher/songs/${encodeURIComponent(row.filename)}`}
            className="h-10 w-full"
            dir="ltr"
          />

          {/* زمان شروع کلیپ */}
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-400">زمان شروع کلیپ (ثانیه)</Label>
              <Input
                type="number"
                min={0}
                step={0.1}
                value={draft.clipStart}
                onChange={(e) => setDraft((d) => ({ ...d, clipStart: e.target.value }))}
                className={`${field} w-32`}
                dir="ltr"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={setClipFromPlayback}
              className="h-10 rounded-xl border-zinc-700 bg-transparent text-xs text-zinc-300 hover:bg-zinc-800"
            >
              تنظیم زمان از لحظهٔ فعلی
            </Button>
          </div>

          {/* عنوان و خواننده */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-400">عنوان آهنگ</Label>
              <Input
                value={draft.title}
                onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                placeholder="مثلاً: غزل «الا یا ایها الساقی»"
                className={field}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-400">خواننده / اجراکننده</Label>
              <Input
                value={draft.artist}
                onChange={(e) => setDraft((d) => ({ ...d, artist: e.target.value }))}
                placeholder="نام خواننده یا گروه"
                className={field}
              />
            </div>
          </div>

          {/* مصرع جواب */}
          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-400">
              مصرعِ بعدی (جوابی که باید حدس زده شود)
            </Label>
            <Input
              value={draft.answerLine}
              onChange={(e) => setDraft((d) => ({ ...d, answerLine: e.target.value }))}
              placeholder="بیت بعدیِ همان آهنگ"
              className={field}
            />
          </div>

          {/* مصرع‌های زمینه — زیرنویس حین پخش */}
          <div className="space-y-2">
            <Label className="text-xs text-zinc-400">مصرع‌های زمینه (حداکثر ۳ مصرعِ قبل)</Label>
            {draft.contextLines.map((line, i) => (
              <Input
                key={i}
                value={line}
                onChange={(e) =>
                  setDraft((d) => {
                    const next = [...d.contextLines] as Draft["contextLines"];
                    next[i] = e.target.value;
                    return { ...d, contextLines: next };
                  })
                }
                placeholder={`مصرع زمینهٔ ${i + 1} — خالی بماند نادیده گرفته می‌شود`}
                className={field}
              />
            ))}
          </div>

          {/* مصرع‌های اضافه — خوراک گزینه‌های انحرافی */}
          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-400">
              مصرع‌های اضافه برای گزینه‌های انحرافی (هر خط یک مصرع، حداکثر ۱۰ خط)
            </Label>
            <Textarea
              value={draft.extraText}
              onChange={(e) => setDraft((d) => ({ ...d, extraText: e.target.value }))}
              placeholder={"مصرع اول\nمصرع دوم\n…"}
              className="min-h-24 border-zinc-800 bg-zinc-950 text-right text-sm text-zinc-100 placeholder:text-zinc-600"
            />
          </div>

          {/* فعال بودن در بازی */}
          <div className="flex items-center gap-2">
            <Switch
              checked={draft.active}
              onCheckedChange={(v) => setDraft((d) => ({ ...d, active: v }))}
              id={`sher-active-${row.filename}`}
            />
            <Label htmlFor={`sher-active-${row.filename}`} className="text-xs text-zinc-400">
              فعال — آمادهٔ ورود به بازی
            </Label>
          </div>

          {/* دکمه‌ها و پیام */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={save}
              disabled={saving}
              className="h-9 rounded-xl bg-emerald-600 text-xs text-white hover:bg-emerald-500"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
              ذخیره
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={toggleActive}
              disabled={toggling}
              className={`h-9 rounded-xl border-zinc-700 bg-transparent text-xs hover:bg-zinc-800 ${
                row.active
                  ? "text-amber-300 hover:border-amber-500/40"
                  : "text-emerald-300 hover:border-emerald-500/40"
              }`}
            >
              {toggling && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
              {row.active ? "غیرفعال کردن" : "فعال کردن"}
            </Button>
            {ready && !draft.active && (
              <span className="text-[11px] text-zinc-500">
                توجه: آهنگِ فعال‌نشده وارد بازی نمی‌شود.
              </span>
            )}
            {msg && (
              <span className={`text-xs ${msg.ok ? "text-emerald-300" : "text-rose-300"}`}>
                {msg.text}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function SherAdminClient() {
  const [rows, setRows] = useState<SherSongRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [reloadKey, setReloadKey] = useState(0); // با هر refresh کامل، کارت‌ها ریمونت می‌شوند

  const load = useCallback(async (soft = false) => {
    if (soft) setRefreshing(true);
    try {
      const res = await fetch("/api/sher/admin/songs");
      if (res.status === 401) {
        window.location.href = "/admin";
        return;
      }
      if (!res.ok) throw new Error();
      const data = await res.json();
      setRows(data.songs);
      setReloadKey((k) => k + 1); // ریمونت کارت‌ها → پیش‌نویس‌ها با سرور هم‌راستا
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /* به‌روزرسانی همان ردیف بعد از ذخیره/فعال‌سازی — بدون از دست رفتن پیش‌نویس بقیهٔ کارت‌ها */
  const patchRow = useCallback((filename: string, patch: Partial<SherSongRow>) => {
    setRows((list) =>
      list.map((r) => (r.filename === filename ? rowFrom({ ...r, ...patch }) : r)),
    );
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100" dir="rtl">
      {/* نوار بالا */}
      <header className="sticky top-0 z-40 border-b border-zinc-800 bg-zinc-950/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10">
              <Music4 className="h-4 w-4 text-emerald-400" aria-hidden="true" />
            </span>
            <p className="text-sm font-bold text-zinc-100">آهنگ‌های «شعر یادت نره»</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => load(true)}
              disabled={refreshing}
              className="h-9 rounded-full border-zinc-700 bg-transparent text-xs text-zinc-300 hover:bg-zinc-800"
            >
              {refreshing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              به‌روزرسانی فهرست
            </Button>
            <a
              href="/admin"
              className="text-xs text-zinc-500 transition-colors hover:text-zinc-300"
            >
              بازگشت به پنل
            </a>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-4 px-4 py-6 sm:px-6">
        {/* راهنمای کارفرما */}
        <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-4 text-sm leading-7 text-emerald-100/90">
          فایل صوتی را در پوشهٔ public/sher/songs در گیت‌هاب بگذار (یا به دستیار بگو)؛ بعد از
          انتشار سایت، آهنگ خودکار در همین لیست می‌آید. برای هر آهنگ: لحظهٔ شروع کلیپ و بیتِ
          بعدی را مشخص کن.
        </div>

        {loading ? (
          <div className="flex min-h-40 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-emerald-400" aria-hidden="true" />
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-8 text-center text-sm text-zinc-400">
            هنوز فایلی در پوشهٔ public/sher/songs نیست. اولین فایل صوتی را بگذار تا این‌جا
            نمایش داده شود.
          </div>
        ) : (
          rows.map((row) => (
            <SongCard key={`${reloadKey}-${row.filename}`} row={row} onPatch={patchRow} />
          ))
        )}
      </main>
    </div>
  );
}
