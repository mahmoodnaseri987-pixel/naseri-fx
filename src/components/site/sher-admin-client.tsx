"use client";

/* پنل مدیریت آهنگ‌های بازی «شعر یادت نره» — آپلود تکه‌تکهٔ فایل صوتی
   (کامیت خودکار در گیت‌هاب)، حذف فایل/رکورد، پخش نمونه، تنظیم زمان
   شروع کلیپ، متن مصرع‌ها و فعال/غیرفعال کردن */

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { Loader2, Music4, RefreshCw, Scissors, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { SherTrimDialog } from "@/components/site/sher-trim-dialog";
import { SherLoginForm } from "@/components/site/sher-login-form";

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

const CHUNK_BYTES = 900 * 1024; // هر تکه ~۹۰۰ کیلوبایت — زیر سقف بدنهٔ ~۴.۵ مگابایتی ورکل

/* ۴۰۱ از APIهای بخش شعر — به‌جای ریدایرکت به /admin، پنل با فرم ورود بخش شعر جایگزین می‌شود */
class SherAuthError extends Error {}

/* عدد با یک اعشار برای پیام‌ها و برچسب‌ها */
function fmt1(n: number): string {
  return (Math.round(n * 10) / 10).toFixed(1);
}

function formatSize(n: number): string {
  if (n < 1024) return `${n} بایت`;
  if (n < 1048576) return `${(n / 1024).toFixed(0)} کیلوبایت`;
  return `${(n / 1048576).toFixed(1)} مگابایت`;
}

/* ArrayBuffer → base64 (بخش‌بخش برای جلوگیری از سرریز پشتهٔ فراخوانی) */
function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += 0x8000) {
    parts.push(String.fromCharCode(...bytes.subarray(i, i + 0x8000)));
  }
  return btoa(parts.join(""));
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

/* کارت یک آهنگ — پخش‌کننده، فیلدهای متن و دکمه‌های ذخیره/فعال‌سازی/حذف */
function SongCard({
  row,
  onPatch,
  onRefresh,
  notify,
}: {
  row: SherSongRow;
  onPatch: (filename: string, patch: Partial<SherSongRow>) => void;
  onRefresh: () => void;
  notify: (text: string, ok?: boolean) => void;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [draft, setDraft] = useState<Draft>(() => draftFrom(row));
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [deletingFile, setDeletingFile] = useState(false);
  const [deletingRecord, setDeletingRecord] = useState(false);
  const [trimOpen, setTrimOpen] = useState(false);
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

  /* باز کردن دیالوگ قیچی — پخش‌کنندهٔ کارت تا بسته شدن دیالوگ pause می‌ماند */
  function openTrim() {
    audioRef.current?.pause();
    setTrimOpen(true);
  }

  /* اعمال پنجرهٔ انتخاب‌شده در قیچی: ثبت در پیش‌نویس + همان مسیر ذخیرهٔ موجود کارت */
  async function applyTrim(startSeconds: number) {
    const v = String(Math.round(startSeconds * 10) / 10);
    setDraft((d) => ({ ...d, clipStart: v }));
    setTrimOpen(false);
    const ok = await save({ clipStart: v });
    if (ok) notify(`کلیپ از ${fmt1(startSeconds)} تا ${fmt1(startSeconds + 10)} ذخیره شد.`);
  }

  /* ذخیرهٔ متادیتا — overrides برای اعمال قیچی بدون رقابت با state پیش‌نویس */
  async function save(overrides?: Partial<Draft>): Promise<boolean> {
    const d = { ...draft, ...overrides };
    setSaving(true);
    setMsg(null);
    const payload = {
      filename: row.filename,
      title: d.title.trim(),
      artist: d.artist.trim(),
      clipStart: Math.max(0, Number(d.clipStart) || 0),
      answerLine: d.answerLine.trim(),
      contextLines: d.contextLines.map((s) => s.trim()).filter(Boolean),
      extraLines: d.extraText
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      active: d.active,
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
      return true;
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "ذخیره ناموفق بود." });
      return false;
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

  /* حذف فایل صوتی از مخزن (کامیت حذف در گیت‌هاب) — رکورد متادیتا می‌ماند */
  async function deleteFile() {
    if (
      !window.confirm(
        `فایل صوتی «${row.filename}» از سایت حذف شود؟\n` +
          "یک انتشار خودکار ۲-۳ دقیقه‌ای راه می‌افتد؛ متادیتا در دیتابیس می‌ماند و می‌توانید فایل را دوباره آپلود کنید.",
      )
    )
      return;
    setDeletingFile(true);
    setMsg(null);
    try {
      const res = await fetch("/api/sher/admin/delete-file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: row.filename }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "حذف فایل ناموفق بود.");
      onRefresh();
      notify(
        `فایل «${row.filename}» حذف شد — انتشار خودکار ۲-۳ دقیقه‌ای؛ بعد «به‌روزرسانی فهرست» را بزن.`,
      );
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "حذف فایل ناموفق بود." });
    } finally {
      setDeletingFile(false);
    }
  }

  /* حذف رکورد متادیتای بدون فایل از دیتابیس */
  async function deleteRecord() {
    if (!window.confirm(`رکورد متادیتای «${row.filename}» از دیتابیس حذف شود؟`)) return;
    setDeletingRecord(true);
    setMsg(null);
    try {
      const res = await fetch("/api/sher/admin/delete-record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: row.filename }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "حذف رکورد ناموفق بود.");
      onRefresh();
      notify(`رکورد «${row.filename}» از دیتابیس حذف شد.`);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "حذف رکورد ناموفق بود." });
    } finally {
      setDeletingRecord(false);
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
        <>
          <p className="mt-3 text-sm text-rose-300/90">
            فایل صوتی در پوشهٔ public/sher/songs نیست؛ متادیتای ذخیره‌شده در دیتابیس باقی مانده
            است. اگر فایل را برگردانید، این ردیف دوباره به فهرست اصلی می‌پیوندد.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={deleteRecord}
              disabled={deletingRecord}
              className="h-9 rounded-xl border-zinc-700 bg-transparent text-xs text-rose-300 hover:border-rose-500/40 hover:bg-zinc-800"
            >
              {deletingRecord && (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              )}
              حذف رکورد
            </Button>
            {msg && (
              <span className={`text-xs ${msg.ok ? "text-emerald-300" : "text-rose-300"}`}>
                {msg.text}
              </span>
            )}
          </div>
        </>
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
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={openTrim}
              className="h-10 rounded-xl border-zinc-700 bg-transparent text-xs text-zinc-300 hover:bg-zinc-800"
            >
              <Scissors className="h-3.5 w-3.5" aria-hidden="true" />
              قیچی
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
              onClick={() => save()}
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
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={deleteFile}
              disabled={deletingFile}
              className="h-9 rounded-xl border-zinc-700 bg-transparent text-xs text-rose-300 hover:border-rose-500/40 hover:bg-zinc-800"
            >
              {deletingFile && (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              )}
              حذف فایل
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

      {/* دیالوگ قیچی کلیپ — فقط برای کارت‌های دارای فایل */}
      {trimOpen && (
        <SherTrimDialog
          filename={row.filename}
          url={`/sher/songs/${encodeURIComponent(row.filename)}`}
          clipStart={Math.max(0, Number(draft.clipStart) || 0)}
          onApply={applyTrim}
          onClose={() => setTrimOpen(false)}
        />
      )}
    </div>
  );
}

export function SherAdminClient() {
  const [rows, setRows] = useState<SherSongRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [reloadKey, setReloadKey] = useState(0); // با هر refresh کامل، کارت‌ها ریمونت می‌شوند
  const [needsLogin, setNeedsLogin] = useState(false); // ۴۰۱ → فرم ورود بخش شعر به‌جای ریدایرکت

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState("");
  const [uploadMsg, setUploadMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async (soft = false) => {
    if (soft) setRefreshing(true);
    try {
      const res = await fetch("/api/sher/admin/songs");
      if (res.status === 401) {
        setNeedsLogin(true); // نشست بخش شعر منقضی شده — کل پنل با فرم ورود جایگزین می‌شود
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

  /* تازه‌سازی فهرست پس از حذف فایل/رکورد */
  const refreshList = useCallback(() => {
    load(true);
  }, [load]);

  /* اعلان موفقیت حذف‌ها — چند ثانیه بعد پاک می‌شود */
  const notify = useCallback((text: string, ok = true) => setNotice({ ok, text }), []);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 8000);
    return () => clearTimeout(t);
  }, [notice]);

  /* --- آپلود تکه‌تکهٔ یک فایل — ترتیبی، هر تکه با یک تلاش مجدد --- */
  async function postChunk(
    uploadId: string,
    filename: string,
    total: number,
    index: number,
    data: string,
  ): Promise<void> {
    let lastErr = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch("/api/sher/admin/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uploadId, filename, total, index, data }),
        });
        if (res.status === 401) {
          setNeedsLogin(true); // نشست بخش شعر منقضی شده — آپلود نیمه‌کاره رها می‌شود
          throw new SherAuthError();
        }
        const d = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (res.ok && d.ok) return;
        lastErr = d.error || `خطای سرور (کد ${res.status})`;
      } catch (e) {
        if (e instanceof SherAuthError) throw e;
        lastErr = "اتصال به سرور برقرار نشد.";
      }
      if (attempt === 0) await new Promise((r) => setTimeout(r, 800)); // پیش از تلاش مجدد کمی صبر
    }
    throw new Error(lastErr || "آپلود تکه ناموفق بود.");
  }

  async function uploadOneFile(file: File, fileNo: number, fileCount: number): Promise<void> {
    const uploadId = crypto.randomUUID();
    const buf = await file.arrayBuffer();
    if (buf.byteLength === 0) throw new Error(`فایل «${file.name}» خالی است.`);
    if (buf.byteLength > 15 * 1024 * 1024)
      throw new Error(`فایل «${file.name}» بزرگ‌تر از سقف ۱۵ مگابایت است.`);
    const total = Math.ceil(buf.byteLength / CHUNK_BYTES);
    for (let i = 0; i < total; i++) {
      setProgress(
        `فایل ${fileNo} از ${fileCount} — «${file.name}» — تکه ${i + 1} از ${total}`,
      );
      const slice = buf.slice(i * CHUNK_BYTES, Math.min((i + 1) * CHUNK_BYTES, buf.byteLength));
      await postChunk(uploadId, file.name, total, i, bufferToBase64(slice));
    }
  }

  async function startUpload() {
    if (uploading || picked.length === 0) return;
    setUploading(true);
    setUploadMsg(null);
    const count = picked.length;
    try {
      for (let f = 0; f < count; f++) {
        await uploadOneFile(picked[f], f + 1, count);
      }
      setUploadMsg({
        ok: true,
        text:
          (count > 1 ? `${count} فایل آپلود شد` : "آپلود شد") +
          " — انتشار خودکار ۲-۳ دقیقه‌ای؛ بعد «به‌روزرسانی فهرست» را بزن." +
          " اگر نام فایلی از قبل موجود بوده، نسخهٔ جدید جایگزین قبلی شده است.",
      });
      setPicked([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (e) {
      if (e instanceof SherAuthError) {
        setUploadMsg(null); // پنل با فرم ورود بخش شعر جایگزین می‌شود — پیام خطا لازم نیست
      } else {
        setUploadMsg({
          ok: false,
          text: e instanceof Error ? e.message : "آپلود ناموفق بود — دوباره تلاش کنید.",
        });
      }
    } finally {
      setUploading(false);
      setProgress("");
    }
  }

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    setPicked(Array.from(e.target.files ?? []));
    setUploadMsg(null);
  }

  /* نشست بخش شعر منقضی/نامعتبر است — کل پنل با فرم ورود بخش شعر جایگزین می‌شود */
  if (needsLogin) return <SherLoginForm logout />;

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
          فایل صوتی را از همین‌جا آپلود کن — دیگر لازم نیست چیزی در گیت‌هاب بگذاری. حذف فایل و
          حذف رکورد هم از همین‌جاست. هر تغییر (آپلود یا حذف) یک انتشار خودکار ۲-۳ دقیقه‌ای راه
          می‌اندازد؛ بعد از آن «به‌روزرسانی فهرست» را بزن. برای هر آهنگ: لحظهٔ شروع کلیپ و بیتِ
          بعدی را مشخص کن.
        </div>

        {/* اعلان حذف‌ها */}
        {notice && (
          <div
            className={`rounded-2xl border p-3 text-sm leading-6 ${
              notice.ok
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                : "border-rose-500/30 bg-rose-500/10 text-rose-200"
            }`}
          >
            {notice.text}
          </div>
        )}

        {/* باکس آپلود */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".mp3,.wav,.m4a,.ogg,.flac"
              onChange={onPick}
              disabled={uploading}
              className="h-10 max-w-full text-sm text-zinc-300 file:me-3 file:h-9 file:rounded-xl file:border-0 file:bg-zinc-800 file:px-3 file:text-xs file:text-zinc-200 hover:file:bg-zinc-700"
              dir="ltr"
            />
            <Button
              type="button"
              size="sm"
              onClick={startUpload}
              disabled={uploading || picked.length === 0}
              className="h-9 rounded-xl bg-emerald-600 text-xs text-white hover:bg-emerald-500"
            >
              {uploading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Upload className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              آپلود
            </Button>
            {picked.length > 0 && !uploading && (
              <span className="text-xs text-zinc-500">
                {picked.length} فایل انتخاب شد — هر فایل حداکثر ۱۵ مگابایت
              </span>
            )}
          </div>
          {uploading && progress && (
            <p className="mt-3 text-xs text-emerald-300">{progress}</p>
          )}
          {uploadMsg && (
            <p
              className={`mt-3 text-xs leading-6 ${
                uploadMsg.ok ? "text-emerald-300" : "text-rose-300"
              }`}
            >
              {uploadMsg.text}
            </p>
          )}
        </div>

        {loading ? (
          <div className="flex min-h-40 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-emerald-400" aria-hidden="true" />
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-8 text-center text-sm text-zinc-400">
            هنوز فایلی در پوشهٔ public/sher/songs نیست. اولین فایل صوتی را از باکس بالا آپلود کن
            تا پس از انتشار، این‌جا نمایش داده شود.
          </div>
        ) : (
          rows.map((row) => (
            <SongCard
              key={`${reloadKey}-${row.filename}`}
              row={row}
              onPatch={patchRow}
              onRefresh={refreshList}
              notify={notify}
            />
          ))
        )}
      </main>
    </div>
  );
}
