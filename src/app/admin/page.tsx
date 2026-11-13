"use client";

/* صفحه کامل پنل مدیریت روی /admin — ورود، ناوبری و همه بخش‌ها */

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Loader2, LogOut, Music4, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { LoginForm } from "@/components/site/admin/login-form";
import { AppsManager } from "@/components/site/admin/apps-manager";
import { GamesManager } from "@/components/site/admin/games-manager";
import { MembersManager } from "@/components/site/admin/members-manager";
import { ArenaManager } from "@/components/site/admin/arena-manager";
import { ChatCleanupManager } from "@/components/site/admin/chat-cleanup-manager";
import { GuardManager } from "@/components/site/admin/guard-manager";
import { PasswordResetsManager } from "@/components/site/admin/password-resets-manager";
import { BoxesManager } from "@/components/site/admin/boxes-manager";
import { MediaManager } from "@/components/site/admin/media-manager";
import { TextsEditor } from "@/components/site/admin/texts-editor";
import { AppearanceForm } from "@/components/site/admin/appearance-form";
import { SettingsForm, SecurityForm } from "@/components/site/admin/settings-form";
import { DashboardOverview } from "@/components/site/admin/dashboard-overview";
import { ADMIN_SECTIONS, type SectionId } from "@/components/site/admin/admin-nav";

export default function AdminPage() {
  const { toast } = useToast();
  const [authed, setAuthed] = useState<boolean | null>(null); // null = در حال بررسی
  const [section, setSection] = useState<SectionId>("dashboard");

  useEffect(() => {
    let alive = true;
    fetch("/api/admin/me")
      .then((r) => r.json())
      .then((d) => {
        if (alive) setAuthed(Boolean(d.authed));
      })
      .catch(() => {
        if (alive) setAuthed(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/admin/logout", { method: "POST" });
    } finally {
      setAuthed(false);
      toast({ title: "از پنل خارج شدید." });
    }
  }, [toast]);

  /* --- حالت بررسی وضعیت ورود --- */
  if (authed === null) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-950" dir="rtl">
        <Loader2 className="h-6 w-6 animate-spin text-emerald-400" aria-hidden="true" />
      </main>
    );
  }

  /* --- فرم ورود --- */
  if (!authed) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-4" dir="rtl">
        <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900/70 p-6 sm:p-8">
          <LoginForm onSuccess={() => setAuthed(true)} />
          <div className="mt-6 text-center">
            <a
              href="/"
              className="inline-flex items-center gap-1.5 text-xs text-zinc-500 transition-colors hover:text-zinc-300"
            >
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
              بازگشت به سایت
            </a>
          </div>
        </div>
      </main>
    );
  }

  /* --- پنل کامل --- */
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100" dir="rtl">
      {/* نوار بالا */}
      <header className="sticky top-0 z-40 border-b border-zinc-800 bg-zinc-950/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10">
              <Terminal className="h-4 w-4 text-emerald-400" aria-hidden="true" />
            </span>
            <div className="leading-tight">
              <p className="text-sm font-bold text-zinc-100">پنل مدیریت کافه سرگرمی</p>
              <p className="text-[10px] text-zinc-500">mahmoudnaseri.vercel.app</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              asChild
              variant="outline"
              size="sm"
              className="h-9 rounded-full border-zinc-700 bg-transparent text-xs text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
            >
              <a href="/sher-admin" target="_blank" rel="noopener noreferrer">
                <Music4 className="h-3.5 w-3.5" aria-hidden="true" />
                شعر یادت نره
              </a>
            </Button>
            <Button
              asChild
              variant="outline"
              size="sm"
              className="h-9 rounded-full border-zinc-700 bg-transparent text-xs text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
            >
              <a href="/" target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                مشاهده سایت
              </a>
            </Button>
            <Button
              onClick={logout}
              variant="outline"
              size="sm"
              className="h-9 rounded-full border-zinc-700 bg-transparent text-xs text-zinc-400 hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-300"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              خروج
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6 sm:px-6">
        {/* فهرست بخش‌ها — دسکتاپ */}
        <nav
          aria-label="بخش‌های پنل"
          className="sticky top-20 hidden h-fit w-52 shrink-0 flex-col gap-1 lg:flex"
        >
          {ADMIN_SECTIONS.map((item) => {
            const active = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
                className={`flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                    : "border border-transparent text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
                }`}
              >
                <item.icon className="h-4 w-4" aria-hidden="true" />
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* محتوای بخش */}
        <main className="min-w-0 flex-1">
          {/* تب‌های موبایل */}
          <div className="mb-5 -mx-4 overflow-x-auto px-4 pb-1 lg:hidden">
            <div className="flex w-max gap-1.5">
              {ADMIN_SECTIONS.map((item) => {
                const active = section === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSection(item.id)}
                    className={`flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-2 text-xs font-medium transition-colors ${
                      active
                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                        : "border-zinc-800 bg-zinc-900/60 text-zinc-400"
                    }`}
                  >
                    <item.icon className="h-3.5 w-3.5" aria-hidden="true" />
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          <section aria-label={ADMIN_SECTIONS.find((s) => s.id === section)?.label}>
            {section === "dashboard" && <DashboardOverview onNavigate={setSection} />}
            {section === "apps" && <AppsManager />}
            {section === "games" && <GamesManager />}
            {section === "arena" && <ArenaManager />}
            {section === "chat" && <ChatCleanupManager />}
            {section === "members" && <MembersManager />}
            {section === "resets" && <PasswordResetsManager />}
            {section === "boxes" && <BoxesManager />}
            {section === "media" && <MediaManager />}
            {section === "texts" && <TextsEditor />}
            {section === "appearance" && <AppearanceForm />}
            {section === "contacts" && <SettingsForm />}
            {section === "security" && <SecurityForm />}
            {section === "guard" && <GuardManager />}
          </section>
        </main>
      </div>
    </div>
  );
}
