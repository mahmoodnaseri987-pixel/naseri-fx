"use client";

import { useState } from "react";
import { Loader2, LockKeyhole, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type LoginFormProps = {
  onSuccess: () => void;
};

export function LoginForm({ onSuccess }: LoginFormProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        onSuccess();
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "خطایی رخ داد؛ دوباره تلاش کنید.");
      }
    } catch {
      setError("ارتباط با سرور برقرار نشد.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5" dir="rtl">
      <div className="text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10">
          <Terminal className="h-6 w-6 text-emerald-400" aria-hidden="true" />
        </div>
        <h2 className="mt-4 text-lg font-extrabold text-zinc-50">پنل مدیریت ناصری</h2>
        <p className="mt-1 text-sm text-zinc-500">برای مدیریت محتوای سایت وارد شوید</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="admin-password" className="text-zinc-300">
          رمز عبور
        </Label>
        <div className="relative">
          <LockKeyhole
            className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"
            aria-hidden="true"
          />
          <Input
            id="admin-password"
            type="password"
            dir="ltr"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="h-11 border-zinc-800 bg-zinc-950 pr-10 text-right text-zinc-100 placeholder:text-zinc-600"
            autoFocus
          />
        </div>
        {error && (
          <p role="alert" className="text-sm font-medium text-rose-400">
            {error}
          </p>
        )}
      </div>

      <Button
        type="submit"
        disabled={loading || password.length === 0}
        className="h-11 w-full rounded-xl bg-emerald-500 font-bold text-zinc-950 hover:bg-emerald-400"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : "ورود به پنل"}
      </Button>
    </form>
  );
}
