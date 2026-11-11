"use client";

import { useEffect, useState } from "react";
import { Menu, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useLang } from "@/components/site/language-provider";

type SiteHeaderProps = {
  logoUrl?: string;
};

export function SiteHeader({ logoUrl }: SiteHeaderProps) {
  const { t, lang, toggleLang } = useLang();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  const navItems = [
    { label: t.nav.apps, href: "#apps" },
    { label: t.nav.games, href: "/games" },
    { label: t.nav.arena, href: "/arena" },
    { label: t.nav.about, href: "#about" },
    { label: t.nav.contact, href: "#contact" },
  ];

  const LogoMark = logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={logoUrl}
      alt={t.brand}
      className="h-9 w-9 rounded-xl border border-zinc-800 object-contain"
    />
  ) : (
    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/30">
      <Terminal className="h-4.5 w-4.5 text-emerald-400" aria-hidden="true" />
    </span>
  );

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-zinc-950/80 backdrop-blur-md border-b border-zinc-800"
          : "bg-transparent border-b border-transparent"
      }`}
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <a href="#top" className="flex items-center gap-2.5" aria-label={t.brand}>
            {LogoMark}
            <span className="text-lg font-bold text-zinc-100">{t.brand}</span>
          </a>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-8" aria-label={lang === "fa" ? "منوی اصلی" : "Main navigation"}>
            {navItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="text-sm font-medium text-zinc-400 hover:text-zinc-100 transition-colors"
              >
                {item.label}
              </a>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-3">
            {/* Language toggle */}
            <Button
              onClick={toggleLang}
              variant="outline"
              size="sm"
              aria-label={lang === "fa" ? "Switch to English" : "تغییر به فارسی"}
              className="rounded-full border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 hover:border-zinc-600 font-semibold"
            >
              {t.langToggle}
            </Button>
            <Button asChild className="rounded-full bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold">
              <a href="#contact">{t.orderCta}</a>
            </Button>
          </div>

          {/* Mobile: lang + menu */}
          <div className="flex md:hidden items-center gap-2">
            <Button
              onClick={toggleLang}
              variant="outline"
              size="sm"
              aria-label={lang === "fa" ? "Switch to English" : "تغییر به فارسی"}
              className="rounded-full border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 hover:border-zinc-600 font-semibold"
            >
              {t.langToggle}
            </Button>
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={lang === "fa" ? "باز کردن منو" : "Open menu"}
                  className="text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
                >
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent
                side="left"
                className="w-72 bg-zinc-950 border-zinc-800 text-zinc-100"
              >
                <SheetHeader>
                  <SheetTitle className="flex items-center gap-2 text-start text-zinc-100">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                      <Terminal className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                    </span>
                    {t.brand}
                  </SheetTitle>
                </SheetHeader>
                <nav className="mt-4 flex flex-col gap-1 px-2" aria-label={lang === "fa" ? "منوی موبایل" : "Mobile navigation"}>
                  {navItems.map((item) => (
                    <a
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className="rounded-lg px-3 py-3 text-base font-medium text-zinc-300 hover:bg-zinc-800/70 hover:text-zinc-100 transition-colors"
                    >
                      {item.label}
                    </a>
                  ))}
                  <div className="mt-4 px-2">
                    <Button asChild className="w-full rounded-full bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold">
                      <a href="#contact" onClick={() => setOpen(false)}>
                        {t.orderCta}
                      </a>
                    </Button>
                  </div>
                </nav>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </header>
  );
}
