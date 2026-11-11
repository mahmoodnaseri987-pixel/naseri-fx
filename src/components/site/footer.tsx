"use client";

import { Terminal, Settings2 } from "lucide-react";
import { useLang } from "@/components/site/language-provider";

type SiteFooterProps = {
  logoUrl?: string;
};

export function SiteFooter({ logoUrl }: SiteFooterProps) {
  const { t, lang } = useLang();

  const links = [
    { label: t.nav.apps, href: "#apps" },
    { label: t.nav.about, href: "#about" },
    { label: t.nav.contact, href: "#contact" },
  ];

  const LogoMark = logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={logoUrl}
      alt={t.brand}
      className="h-8 w-8 rounded-lg border border-zinc-800 object-contain"
    />
  ) : (
    <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10">
      <Terminal className="h-4 w-4 text-emerald-400" aria-hidden="true" />
    </span>
  );

  return (
    <footer className="mt-auto border-t border-zinc-800/80 bg-zinc-950 pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
          <a href="#top" className="flex items-center gap-2" aria-label={t.brand}>
            {LogoMark}
            <span className="font-bold text-zinc-100">{t.brand}</span>
            <span className="font-mono text-xs text-zinc-500">
              {lang === "fa" ? "/ محمود ناصری" : "/ Mahmoud Naseri"}
            </span>
          </a>

          <nav aria-label={lang === "fa" ? "لینک‌های فوتر" : "Footer links"}>
            <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
              {links.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    className="text-sm text-zinc-500 hover:text-zinc-200 transition-colors"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="mt-6 flex items-center justify-center gap-4">
          <p className="text-xs text-zinc-600">{t.footer.madeWith}</p>
          <span aria-hidden="true" className="h-3 w-px bg-zinc-800" />
          <a
            href="/admin"
            className="flex items-center gap-1.5 text-xs text-zinc-600 transition-colors hover:text-zinc-300"
          >
            <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
            {t.footer.admin}
          </a>
        </div>
      </div>
    </footer>
  );
}
