"use client";

/* فرم ورود و ثبت‌نام اعضای گیم‌کلاب */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Gamepad2, KeyRound, Loader2, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLang } from "@/components/site/language-provider";
import { AvatarPicker } from "@/components/site/avatar-picker";
import { MemberAvatar } from "@/components/site/member-avatar";
import type { MemberInfo } from "@/lib/types";

type AuthFormProps = {
  initialMode: "login" | "register" | "forgot";
  nextPath: string;
};

export function AuthForm({ initialMode, nextPath }: AuthFormProps) {
  const { t, lang } = useLang();
  const router = useRouter();
  const a = t.auth;

  const [mode, setMode] = useState<"login" | "register" | "forgot">(initialMode);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [avatar, setAvatar] = useState(""); // dataUrl عکس پروفایل — اختیاری
  const [code, setCode] = useState(""); // کد بازیابی ۶ رقمی
  const [newPassword, setNewPassword] = useState("");
  const [forgotStep, setForgotStep] = useState<1 | 2>(1);
  const [forgotChannel, setForgotChannel] = useState<"sms" | "email" | "admin" | null>(null);
  const [forgotMasked, setForgotMasked] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(""); // پیام موفقیت سبز
  const [busy, setBusy] = useState(false);
  const [member, setMember] = useState<MemberInfo | null>(null);
  const [checked, setChecked] = useState(false);

  /* اگر قبلاً وارد شده، مستقیم خوش‌آمد بگو */
  useEffect(() => {
    let alive = true;
    fetch("/api/member/me")
      .then((r) => r.json())
      .then((d) => {
        if (alive) setMember(d.member ?? null);
      })
      .catch(() => undefined)
      .finally(() => {
        if (alive) setChecked(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const res = await fetch(mode === "register" ? "/api/member/register" : "/api/member/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "register" ? { name, username, password, avatar } : { username, password },
        ),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "خطایی رخ داد؛ دوباره تلاش کن.");
        return;
      }
      router.push(nextPath);
      router.refresh();
    } catch {
      setError("ارتباط برقرار نشد؛ اتصال اینترنت را بررسی کن.");
    } finally {
      setBusy(false);
    }
  }

  /* جریان فراموشی رمز — مرحله ۱: گرفتن کد، مرحله ۲: ثبت رمز جدید */
  async function submitForgot(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      if (forgotStep === 1) {
        const res = await fetch("/api/member/forgot-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(typeof data.error === "string" ? data.error : "خطایی رخ داد؛ دوباره تلاش کن.");
          return;
        }
        setForgotChannel(data.channel ?? "admin");
        setForgotMasked(typeof data.masked === "string" ? data.masked : "");
        setForgotStep(2);
        return;
      }

      const res = await fetch("/api/member/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, code, password: newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "خطایی رخ داد؛ دوباره تلاش کن.");
        return;
      }
      setNotice(a.forgotSuccess);
      setMode("login");
      setForgotStep(1);
      setForgotChannel(null);
      setCode("");
      setNewPassword("");
      setPassword("");
    } catch {
      setError("ارتباط برقرار نشد؛ اتصال اینترنت را بررسی کن.");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    try {
      await fetch("/api/member/logout", { method: "POST" });
    } finally {
      setMember(null);
    }
  }

  /* بعد از گذاشتن/تغییر عکس پروفایل، اطلاعات حساب را دوباره بگیر */
  async function reloadMember() {
    try {
      const r = await fetch("/api/member/me", { cache: "no-store" });
      const d = await r.json();
      setMember(d.member ?? null);
    } catch {
      /* بی‌خیال */
    }
  }

  const isRegister = mode === "register";
  const isForgot = mode === "forgot";

  /* پیام راه ارسال کد — بسته به کانال */
  const channelMsg =
    forgotChannel === "sms"
      ? a.forgotOkSms.replace("{m}", forgotMasked)
      : forgotChannel === "email"
        ? a.forgotOkEmail.replace("{m}", forgotMasked)
        : a.forgotOkAdmin;

  return (
    <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900/70 p-6 sm:p-8" dir="rtl">
      {checked && member ? (
        /* حالت واردشده */
        <div className="text-center">
          <MemberAvatar
            memberId={member.id}
            name={member.name}
            size={56}
            hasAvatar={Boolean(member.avatarUrl)}
            className="mx-auto"
          />
          <h1 className="mt-4 text-xl font-extrabold text-zinc-50">
            {a.welcome}، {member.name}!
          </h1>
          <p className="mt-2 text-sm leading-7 text-zinc-400">
            حساب شما فعال است؛ می‌توانی بروی سراغ بازی‌ها.
          </p>
          {!member.avatarUrl && (
            <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold leading-6 text-amber-300">
              {a.avatarRequired}
            </p>
          )}
          <div className="mt-4 flex justify-start">
            <AvatarPicker variant="upload" onDone={reloadMember} />
          </div>
          <div className="mt-4 flex flex-col gap-2">
            <Button
              asChild
              className="h-11 rounded-xl bg-emerald-500 text-sm font-bold text-zinc-950 hover:bg-emerald-400"
            >
              <a href={nextPath.startsWith("/play/") ? nextPath : "/games"}>
                <Gamepad2 className="h-4 w-4" aria-hidden="true" />
                {lang === "fa" ? "رفتن به بازی‌ها" : "Go to games"}
              </a>
            </Button>
            <Button
              onClick={logout}
              variant="outline"
              className="h-10 rounded-xl border-zinc-700 bg-transparent text-xs text-zinc-400 hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-300"
            >
              {lang === "fa" ? "خروج از حساب" : "Sign out"}
            </Button>
          </div>
        </div>
      ) : (
        /* فرم ورود / ثبت‌نام */
        <>
          <div className="text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-violet-500/30 bg-violet-500/10">
              {isForgot ? (
                <KeyRound className="h-6 w-6 text-violet-300" aria-hidden="true" />
              ) : (
                <UserRound className="h-6 w-6 text-violet-300" aria-hidden="true" />
              )}
            </span>
            <h1 className="mt-4 text-xl font-extrabold text-zinc-50">
              {isForgot
                ? forgotStep === 1
                  ? a.forgotTitle
                  : a.forgotStep2Title
                : isRegister
                  ? a.registerTitle
                  : a.loginTitle}
            </h1>
            <p className="mt-2 text-sm leading-7 text-zinc-400">
              {isForgot
                ? forgotStep === 1
                  ? a.forgotSubtitle
                  : a.forgotStep2Subtitle
                : isRegister
                  ? a.registerSubtitle
                  : a.loginSubtitle}
            </p>
          </div>

          {isForgot ? (
            /* فرم فراموشی رمز */
            <form onSubmit={submitForgot} className="mt-6 flex flex-col gap-4">
              {forgotStep === 1 ? (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="auth-username" className="text-xs text-zinc-300">
                    {a.username}
                  </Label>
                  <Input
                    id="auth-username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder={a.usernamePh}
                    dir="ltr"
                    inputMode="email"
                    autoComplete="username"
                    required
                    className="h-11 border-zinc-700 bg-zinc-950 text-left text-sm text-zinc-100 placeholder:text-zinc-600 focus-visible:border-violet-500/60"
                  />
                </div>
              ) : (
                <>
                  <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-3 text-xs leading-6 text-emerald-300">
                    {channelMsg}
                  </p>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="forgot-code" className="text-xs text-zinc-300">
                      {a.forgotCode}
                    </Label>
                    <Input
                      id="forgot-code"
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder={a.forgotCodePh}
                      dir="ltr"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      required
                      className="h-12 border-zinc-700 bg-zinc-950 text-center text-lg font-bold tracking-[0.4em] text-zinc-100 placeholder:tracking-normal placeholder:text-zinc-600 focus-visible:border-violet-500/60"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="forgot-password" className="text-xs text-zinc-300">
                      {a.forgotNewPassword}
                    </Label>
                    <Input
                      id="forgot-password"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder={a.passwordPh}
                      dir="ltr"
                      autoComplete="new-password"
                      minLength={6}
                      required
                      className="h-11 border-zinc-700 bg-zinc-950 text-left text-sm text-zinc-100 placeholder:text-zinc-600 focus-visible:border-violet-500/60"
                    />
                  </div>
                </>
              )}

              {error && (
                <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs leading-5 text-rose-300">
                  {error}
                </p>
              )}

              <Button
                type="submit"
                disabled={busy}
                className="h-11 rounded-xl bg-violet-500 text-sm font-bold text-zinc-950 hover:bg-violet-400 disabled:opacity-60"
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <KeyRound className="h-4 w-4" aria-hidden="true" />
                )}
                {forgotStep === 1 ? a.forgotBtn : a.forgotResetBtn}
              </Button>

              <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs font-semibold">
                {forgotStep === 2 && (
                  <button
                    type="button"
                    onClick={() => {
                      setForgotStep(1);
                      setError("");
                    }}
                    className="text-zinc-400 transition-colors hover:text-zinc-200"
                  >
                    {a.forgotChangeId}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setMode("login");
                    setForgotStep(1);
                    setError("");
                  }}
                  className="text-emerald-400 transition-colors hover:text-emerald-300"
                >
                  {a.forgotBack}
                </button>
              </div>
            </form>
          ) : (
          <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
            {isRegister && (
              <div className="flex flex-col gap-1.5 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3.5">
                <Label className="flex items-center justify-between text-xs text-zinc-300">
                  <span>{a.avatar}</span>
                  <span className="text-[10px] font-medium text-zinc-500">{a.avatarOptional}</span>
                </Label>
                <AvatarPicker variant="register" value={avatar} onChange={setAvatar} />
              </div>
            )}
            {isRegister && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="auth-name" className="text-xs text-zinc-300">
                  {a.name}
                </Label>
                <Input
                  id="auth-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={a.namePh}
                  maxLength={60}
                  required
                  className="h-11 border-zinc-700 bg-zinc-950 text-sm text-zinc-100 placeholder:text-zinc-600 focus-visible:border-violet-500/60"
                />
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="auth-username" className="text-xs text-zinc-300">
                {a.username}
              </Label>
              <Input
                id="auth-username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={a.usernamePh}
                dir="ltr"
                inputMode="email"
                autoComplete="username"
                required
                className="h-11 border-zinc-700 bg-zinc-950 text-left text-sm text-zinc-100 placeholder:text-zinc-600 focus-visible:border-violet-500/60"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="auth-password" className="text-xs text-zinc-300">
                {a.password}
              </Label>
              <Input
                id="auth-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={a.passwordPh}
                dir="ltr"
                autoComplete={isRegister ? "new-password" : "current-password"}
                minLength={6}
                required
                className="h-11 border-zinc-700 bg-zinc-950 text-left text-sm text-zinc-100 placeholder:text-zinc-600 focus-visible:border-violet-500/60"
              />
            </div>

            {notice && (
              <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs leading-5 text-emerald-300">
                {notice}
              </p>
            )}

            {error && (
              <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs leading-5 text-rose-300">
                {error}
              </p>
            )}

            <Button
              type="submit"
              disabled={busy}
              className="h-11 rounded-xl bg-violet-500 text-sm font-bold text-zinc-950 hover:bg-violet-400 disabled:opacity-60"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Gamepad2 className="h-4 w-4" aria-hidden="true" />
              )}
              {isRegister ? a.registerBtn : a.loginBtn}
            </Button>
          </form>
          )}

          <div className="mt-5 text-center">
            {!isForgot && (
              <button
                type="button"
                onClick={() => {
                  setMode(isRegister ? "login" : "register");
                  setError("");
                  setNotice("");
                }}
                className="text-xs font-semibold text-emerald-400 transition-colors hover:text-emerald-300"
              >
                {isRegister ? a.switchToLogin : a.switchToRegister}
              </button>
            )}
            {mode === "login" && (
              <button
                type="button"
                onClick={() => {
                  setMode("forgot");
                  setForgotStep(1);
                  setError("");
                  setNotice("");
                }}
                className={`block text-xs font-semibold text-violet-400 transition-colors hover:text-violet-300 ${
                  isRegister ? "mt-2" : ""
                }`}
              >
                {a.forgotSwitch}
              </button>
            )}
          </div>
        </>
      )}

      <div className="mt-6 text-center">
        <a href="/games" className="inline-flex items-center gap-1.5 text-xs text-zinc-500 transition-colors hover:text-zinc-300">
          <Gamepad2 className="h-3 w-3" aria-hidden="true" />
          {a.backToGames}
        </a>
      </div>
    </div>
  );
}
