"use client";

/* فرم ورود به بخش مدیریت آهنگ‌های «شعر یادت نره» — رمز اختصاصی این بخش.
   با ورود موفق صفحه رفرش می‌شود تا نسخهٔ سروری پنل رندر شود.
   لینک ورود مدیر کل سایت و دکمهٔ خروج از بخش شعر (وقتی logout=true) هم این‌جاست. */

import { useState, type FormEvent } from "react";
import { Loader2, Music4 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SherLoginForm({ logout = false }: { logout?: boolean }) {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/sher/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.ok && data.ok) {
        window.location.reload(); // با کوکی تازه، نسخهٔ سروری پنل می‌آید
        return;
      }
      setError(data.error || "ورود ناموفق بود.");
    } catch {
      setError("اتصال به سرور برقرار نشد.");
    } finally {
      setLoading(false);
    }
  }

  /* خروج از بخش شعر — کوکی شعر پاک می‌شود و فرم ورود دوباره می‌آید */
  async function doLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await fetch("/api/sher/admin/logout", { method: "POST" });
    } catch {
      /* کوکی پاک نشد — رفرش همان فرم را نشان می‌دهد */
    }
    window.location.reload();
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center bg-zinc-950 px-4 text-zinc-100"
      dir="rtl"
    >
      <div className="w-full max-w-sm space-y-5 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10">
            <Music4 className="h-5 w-5 text-emerald-400" aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-bold text-zinc-100">آهنگ‌های «شعر یادت نره»</p>
            <p className="mt-0.5 text-xs text-zinc-500">ورود به بخش مدیریت شعر</p>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="sher-login-password" className="text-xs text-zinc-400">
              رمز بخش مدیریت شعر
            </Label>
            <Input
              id="sher-login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              className="h-10 border-zinc-800 bg-zinc-950 text-sm text-zinc-100 placeholder:text-zinc-600"
              dir="ltr"
            />
          </div>
          <Button
            type="submit"
            disabled={loading || password.length === 0}
            className="h-10 w-full rounded-xl bg-emerald-600 text-sm text-white hover:bg-emerald-500"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            ورود
          </Button>
          {error && <p className="text-sm leading-6 text-rose-300">{error}</p>}
        </form>

        <div className="flex items-center justify-between gap-2 border-t border-zinc-800 pt-4">
          <a
            href="/admin"
            className="text-xs text-zinc-500 transition-colors hover:text-zinc-300"
          >
            ورود به‌عنوان مدیر کل سایت
          </a>
          {logout && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={doLogout}
              disabled={loggingOut}
              className="h-8 rounded-xl border-zinc-700 bg-transparent text-xs text-zinc-300 hover:bg-zinc-800"
            >
              {loggingOut && (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              )}
              خروج از بخش شعر
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
