"use client";

/* درخواست‌های بازیابی رمز اعضا — تا وقتی سرویس پیامک/ایمیل تنظیم نشده،
   کد بازیابی این‌جا دیده می‌شود تا مدیر به عضو اعلام کند. */

import { useCallback, useEffect, useState } from "react";
import {
  Copy,
  KeyRound,
  Loader2,
  Mail,
  MailCheck,
  MailQuestion,
  RefreshCw,
  Save,
  Send,
  Smartphone,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import type { AdminPasswordReset } from "@/lib/types";

/* ===== کارت تنظیمات ایمیل بازیابی (Resend) — کلید در پنل ذخیره و رمزنگاری می‌شود ===== */

type MailConfigInfo = {
  configured: boolean;
  source: "panel" | "env" | "none";
  from: string;
  keyMasked: string | null;
};

function MailConfigCard() {
  const { toast } = useToast();
  const [cfg, setCfg] = useState<MailConfigInfo | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [from, setFrom] = useState("");
  const [testTo, setTestTo] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/password-resets/mail-config", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data: MailConfigInfo = await res.json();
      setCfg(data);
      setFrom(data.from && data.source === "panel" ? data.from : "");
    } catch {
      setCfg(null);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    if (!apiKey.trim() && !from.trim()) {
      toast({ title: "کلید API یا فرستنده را وارد کنید.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/password-resets/mail-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: apiKey.trim() || undefined, from: from.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.error || "ذخیره نشد.", variant: "destructive" });
        return;
      }
      setApiKey("");
      setTestResult(null);
      await load();
      toast({ title: "تنظیمات ایمیل ذخیره شد (کلید رمزنگاری‌شده در دیتابیس)." });
    } catch {
      toast({ title: "ارتباط با سرور برقرار نشد.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function clearConfig() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/password-resets/mail-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clear: true }),
      });
      if (!res.ok) {
        toast({ title: "پاک‌سازی نشد.", variant: "destructive" });
        return;
      }
      setTestResult(null);
      await load();
      toast({ title: "تنظیمات پنل پاک شد؛ اگر env تنظیم باشد همان استفاده می‌شود." });
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/admin/password-resets/mail-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: testTo.trim() || undefined }),
      });
      const data = await res.json();
      if (data.ok) {
        setTestResult({
          ok: true,
          text: `ایمیل آزمایشی به ${data.to} ارسال شد؛ صندوق ورودی (و اسپم) را بررسی کنید.`,
        });
      } else {
        /* خطای واقعی سرویس عیناً نمایش داده می‌شود */
        setTestResult({ ok: false, text: String(data.error || "ارسال آزمایشی ناموفق بود.") });
      }
    } catch {
      setTestResult({ ok: false, text: "ارتباط با سرور برقرار نشد." });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10">
          <Mail className="h-4 w-4 text-emerald-300" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-zinc-50">تنظیمات ایمیل بازیابی (Resend)</h3>
          <p className="mt-0.5 text-[11px] leading-5 text-zinc-500">
            کلید API از resend.com/api-keys و فرستنده با دامنهٔ تأییدشده در resend.com/domains —
            تا پیش از تأیید دامنه، فقط به ایمیل صاحب‌حساب می‌رسد.
          </p>
        </div>
        {cfg && (
          <Badge
            className={
              cfg.source === "panel"
                ? "border-emerald-500/40 bg-emerald-500/10 text-[10px] text-emerald-300"
                : cfg.source === "env"
                  ? "border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-300"
                  : "border-zinc-700 bg-zinc-800 text-[10px] text-zinc-400"
            }
          >
            {cfg.source === "panel"
              ? "تنظیم از پنل"
              : cfg.source === "env"
                ? "از متغیر محیطی"
                : "تنظیم نشده"}
          </Badge>
        )}
      </div>

      {cfg?.source === "env" && (
        <p className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] leading-5 text-amber-200">
          فعلاً کلید از متغیر محیطی خوانده می‌شود؛ با ذخیرهٔ کلید در این کارت، تنظیمات پنل
          اولویت می‌گیرد.
        </p>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="mail-api-key" className="text-xs font-medium text-zinc-300">
            کلید API رِزِند
          </label>
          <Input
            id="mail-api-key"
            type="password"
            dir="ltr"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={cfg?.keyMasked ? `ذخیره‌شده: ${cfg.keyMasked}` : "re_..."}
            className="h-9 rounded-lg border-zinc-700 bg-zinc-950/60 text-xs text-zinc-100 placeholder:text-zinc-600"
            autoComplete="off"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="mail-from" className="text-xs font-medium text-zinc-300">
            فرستنده (From)
          </label>
          <Input
            id="mail-from"
            dir="ltr"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            placeholder="Naseri <no-reply@naseri.dev>"
            className="h-9 rounded-lg border-zinc-700 bg-zinc-950/60 text-xs text-zinc-100 placeholder:text-zinc-600"
          />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          onClick={save}
          disabled={saving}
          size="sm"
          className="h-9 rounded-lg bg-emerald-500 text-xs font-bold text-zinc-950 hover:bg-emerald-400"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          ذخیرهٔ تنظیمات
        </Button>
        {cfg?.source === "panel" && (
          <Button
            onClick={clearConfig}
            disabled={saving}
            variant="outline"
            size="sm"
            className="h-9 rounded-lg border-zinc-700 bg-transparent text-xs text-zinc-400 hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-300"
          >
            <Trash2 className="h-3.5 w-3.5" />
            پاک‌کردن
          </Button>
        )}
      </div>

      <div className="mt-4 border-t border-zinc-800 pt-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1 space-y-1.5">
            <label htmlFor="mail-test-to" className="text-xs font-medium text-zinc-300">
              گیرندهٔ ارسال آزمایشی (خالی = ایمیل تماس سایت)
            </label>
            <Input
              id="mail-test-to"
              dir="ltr"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder="you@example.com"
              className="h-9 rounded-lg border-zinc-700 bg-zinc-950/60 text-xs text-zinc-100 placeholder:text-zinc-600"
            />
          </div>
          <Button
            onClick={sendTest}
            disabled={testing || !cfg || cfg.source === "none"}
            variant="outline"
            size="sm"
            className="h-9 rounded-lg border-emerald-500/40 bg-transparent text-xs text-emerald-300 hover:bg-emerald-500/10"
          >
            {testing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            ارسال آزمایشی
          </Button>
        </div>

        {testResult && (
          <div
            className={`mt-3 rounded-xl border px-3 py-2.5 ${
              testResult.ok
                ? "border-emerald-500/40 bg-emerald-500/10"
                : "border-rose-500/40 bg-rose-500/10"
            }`}
          >
            <p
              dir="auto"
              className={`flex items-start gap-2 text-xs leading-6 ${
                testResult.ok ? "text-emerald-200" : "text-rose-200"
              }`}
            >
              {testResult.ok ? (
                <MailCheck className="mt-1 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              ) : null}
              {testResult.text}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function faTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}

const numFa = (n: number) => new Intl.NumberFormat("fa-IR").format(n);

export function PasswordResetsManager() {
  const { toast } = useToast();
  const [resets, setResets] = useState<AdminPasswordReset[] | null>(null);
  const [, setTick] = useState(0); // برای شمارش معکوس انقضا

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/password-resets", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setResets(data.resets ?? []);
    } catch {
      setResets([]);
    }
  }, []);

  useEffect(() => {
    load();
    /* هر ۱۰ ثانیه تازه می‌شود تا درخواست‌های تازه زود دیده شوند */
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 10_000);
    /* شمارش معکوس اعتبار کد */
    const tick = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => {
      clearInterval(id);
      clearInterval(tick);
    };
  }, [load]);

  function copyCode(code: string) {
    navigator.clipboard
      .writeText(code)
      .then(() => toast({ title: "کد کپی شد." }))
      .catch(() => toast({ title: "کپی نشد؛ دستی انتخاب کنید.", variant: "destructive" }));
  }

  function minsLeft(iso: string): number {
    return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 60_000));
  }

  return (
    <div dir="rtl" className="space-y-4">
      <MailConfigCard />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-zinc-50">درخواست‌های بازیابی رمز عبور</h2>
          <p className="mt-1 max-w-2xl text-xs leading-6 text-zinc-500">
            وقتی سرویس پیامک (کاوه‌نگار) یا ایمیل (Resend) تنظیم نشده باشد، کد بازیابی این‌جا
            نمایش داده می‌شود تا از طریق تماس یا پیام به عضو برسانید. کدها ۱۰ دقیقه اعتبار
            دارند و بعد از استفاده حذف می‌شوند.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={load}
          className="h-9 rounded-lg border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          به‌روزرسانی
        </Button>
      </div>

      {resets === null ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-emerald-400" aria-hidden="true" />
        </div>
      ) : resets.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/30 p-8 text-center">
          <MailQuestion className="mx-auto h-6 w-6 text-zinc-600" aria-hidden="true" />
          <p className="mt-2 text-sm leading-7 text-zinc-400">
            فعلاً درخواست بازیابی رمزی در انتظار نیست. این صفحه هر ۱۰ ثانیه خودکار تازه می‌شود.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {resets.map((r) => (
            <div
              key={r.id}
              className="flex flex-wrap items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-violet-500/30 bg-violet-500/10">
                <KeyRound className="h-4 w-4 text-violet-300" aria-hidden="true" />
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-bold text-zinc-100">{r.name}</p>
                  <span dir="ltr" className="text-xs text-zinc-500">
                    {r.username}
                  </span>
                  <Badge
                    className={
                      r.channel === "sms"
                        ? "border-sky-500/40 bg-sky-500/10 text-[10px] text-sky-300"
                        : r.channel === "email"
                          ? "border-emerald-500/40 bg-emerald-500/10 text-[10px] text-emerald-300"
                          : "border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-300"
                    }
                  >
                    {r.channel === "sms" ? (
                      <>
                        <Smartphone className="me-1 inline h-3 w-3" aria-hidden="true" />
                        پیامک
                      </>
                    ) : r.channel === "email" ? (
                      <>
                        <Mail className="me-1 inline h-3 w-3" aria-hidden="true" />
                        ایمیل
                      </>
                    ) : (
                      "اعلام توسط مدیر"
                    )}
                  </Badge>
                </div>
                <p className="mt-1 text-[11px] text-zinc-500">
                  درخواست: {faTime(r.createdAt)} — اعتبار: {numFa(minsLeft(r.expiresAt))} دقیقه
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span
                  dir="ltr"
                  className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-lg font-black tracking-[0.25em] text-emerald-300"
                >
                  {r.code}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyCode(r.code)}
                  className="h-9 rounded-lg border-zinc-700 bg-transparent text-xs text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
                >
                  <Copy className="h-3 w-3" aria-hidden="true" />
                  کپی
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
