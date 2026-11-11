"use client";

import {
  Wallet,
  Users,
  Languages,
  Dumbbell,
  NotebookPen,
  Sparkles,
  Calculator,
  BookOpen,
  Camera,
  Music,
  ShoppingBag,
  Gamepad2,
  Cloud,
  Map,
  Clock,
  MessageSquare,
  Heart,
  GraduationCap,
  Utensils,
  Car,
  Plane,
  Briefcase,
  Image,
  Bell,
  CheckSquare,
  Timer,
  Hammer,
  Star,
  Download,
  Send,
  MessageCircle,
  Phone,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FadeIn } from "@/components/site/fade-in";
import { useLang } from "@/components/site/language-provider";
import { pickText } from "@/lib/site-texts";
import type { ContactInfo, PublicApp, SiteContentMap } from "@/lib/types";

/* نقشه آیکون‌ها و رنگ‌ها — کلیدها در پنل مدیریت انتخاب می‌شوند */
export const APP_ICONS: Record<string, LucideIcon> = {
  Wallet,
  Users,
  Languages,
  Dumbbell,
  NotebookPen,
  Sparkles,
  Calculator,
  BookOpen,
  Camera,
  Music,
  ShoppingBag,
  Gamepad2,
  Cloud,
  Map,
  Clock,
  MessageSquare,
  Heart,
  GraduationCap,
  Utensils,
  Car,
  Plane,
  Briefcase,
  Image,
  Bell,
  CheckSquare,
  Timer,
};

export const APP_COLORS: Record<string, string> = {
  emerald: "from-emerald-500/20 to-teal-500/10 text-emerald-300 border-emerald-500/30",
  cyan: "from-cyan-500/20 to-sky-500/10 text-cyan-300 border-cyan-500/30",
  violet: "from-violet-500/20 to-purple-500/10 text-violet-300 border-violet-500/30",
  amber: "from-amber-500/20 to-orange-500/10 text-amber-300 border-amber-500/30",
  rose: "from-rose-500/20 to-pink-500/10 text-rose-300 border-rose-500/30",
  sky: "from-sky-500/20 to-blue-500/10 text-sky-300 border-sky-500/30",
  lime: "from-lime-500/20 to-green-500/10 text-lime-300 border-lime-500/30",
  fuchsia: "from-fuchsia-500/20 to-pink-500/10 text-fuchsia-300 border-fuchsia-500/30",
  orange: "from-orange-500/20 to-red-500/10 text-orange-300 border-orange-500/30",
  teal: "from-teal-500/20 to-cyan-500/10 text-teal-300 border-teal-500/30",
};

type AppsProps = {
  apps: PublicApp[];
  contacts: ContactInfo;
  content?: SiteContentMap;
};

export function Apps({ apps, contacts, content = {} }: AppsProps) {
  const { t, lang } = useLang();
  const appsTitle = pickText(content, `apps_title_${lang}`, t.apps.title);
  const appsSubtitle = pickText(content, `apps_subtitle_${lang}`, t.apps.subtitle);

  const telegramHref = contacts.telegram
    ? `https://t.me/${contacts.telegram}`
    : "#contact";
  const whatsappHref = contacts.whatsapp ? `https://wa.me/${contacts.whatsapp}` : "#contact";
  const callHref = contacts.whatsapp ? `tel:+${contacts.whatsapp}` : "#contact";

  const order = t.apps.order;
  const orderButtons = [
    { icon: Send, label: order.telegram, href: telegramHref, primary: true },
    { icon: MessageCircle, label: order.whatsapp, href: whatsappHref, primary: false },
    { icon: Phone, label: order.call, href: callHref, primary: false },
  ];

  return (
    <section id="apps" className="scroll-mt-20 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <FadeIn className="text-center">
          <span className="text-sm font-semibold text-emerald-400">{t.apps.badge}</span>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-zinc-50 sm:text-4xl">
            {appsTitle}
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-8 text-zinc-400">
            {appsSubtitle}
          </p>
        </FadeIn>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {apps.map((app, index) => {
            const Icon = APP_ICONS[app.icon] ?? Sparkles;
            const gradient = APP_COLORS[app.color] ?? APP_COLORS.emerald;
            const name = lang === "fa" ? app.nameFa : app.nameEn;
            const category = lang === "fa" ? app.categoryFa : app.categoryEn;
            const description = lang === "fa" ? app.descFa : app.descEn;
            const installs = lang === "fa" ? app.installsFa : app.installsEn;

            return (
              <FadeIn key={app.id} delay={(index % 3) * 0.1}>
                <article className="group flex h-full flex-col rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 transition-all duration-300 hover:-translate-y-1 hover:border-zinc-700 hover:bg-zinc-900 hover:shadow-xl hover:shadow-emerald-500/5">
                  <div className="flex items-start justify-between">
                    <div
                      className={`flex h-13 w-13 items-center justify-center rounded-xl border bg-gradient-to-br p-3 ${gradient}`}
                    >
                      <Icon className="h-6 w-6" aria-hidden="true" />
                    </div>
                    <span className="flex items-center gap-1 rounded-full border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-xs font-semibold text-zinc-300">
                      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden="true" />
                      {app.rating}
                    </span>
                  </div>
                  <h3 className="mt-5 text-lg font-bold text-zinc-50">{name}</h3>
                  <p className="mt-1 text-xs font-medium text-emerald-400/90">{category}</p>
                  <p className="mt-3 flex-1 text-sm leading-7 text-zinc-400">{description}</p>

                  <div className="mt-5 flex items-center gap-1.5 text-xs text-zinc-500">
                    <Download className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>
                      {installs} {t.apps.installs}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    {app.bazaarUrl && (
                      <Button
                        asChild
                        size="sm"
                        className="h-9 rounded-lg bg-emerald-500 text-xs font-semibold text-zinc-950 hover:bg-emerald-400"
                      >
                        <a href={app.bazaarUrl} target="_blank" rel="noopener noreferrer">
                          {lang === "fa" ? "کافه‌بازار" : "Cafe Bazaar"}
                        </a>
                      </Button>
                    )}
                    {app.playUrl && (
                      <Button
                        asChild
                        size="sm"
                        variant="outline"
                        className={`h-9 rounded-lg border-zinc-700 bg-zinc-950 text-xs font-semibold text-zinc-200 hover:border-zinc-600 hover:bg-zinc-800 hover:text-zinc-50 ${
                          app.bazaarUrl ? "" : "col-span-2"
                        }`}
                      >
                        <a href={app.playUrl} target="_blank" rel="noopener noreferrer">
                          {lang === "fa" ? "گوگل‌پلی" : "Google Play"}
                        </a>
                      </Button>
                    )}
                    {!app.bazaarUrl && !app.playUrl && (
                      <Button
                        asChild
                        size="sm"
                        className="col-span-2 h-9 rounded-lg bg-emerald-500 text-xs font-semibold text-zinc-950 hover:bg-emerald-400"
                      >
                        <a href={telegramHref} target="_blank" rel="noopener noreferrer">
                          <Send className="h-4 w-4" aria-hidden="true" />
                          {order.telegram}
                        </a>
                      </Button>
                    )}
                  </div>
                </article>
              </FadeIn>
            );
          })}

          {/* کارت «در حال ساخت» */}
          <FadeIn delay={0.2}>
            <article className="flex h-full flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/30 p-6 text-center">
              <div className="flex h-13 w-13 items-center justify-center rounded-xl border border-zinc-700/70 bg-zinc-800/60 p-3">
                <Hammer className="h-6 w-6 text-zinc-400" aria-hidden="true" />
              </div>
              <span className="mt-4 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-300">
                {t.apps.soonBadge}
              </span>
              <h3 className="mt-3 text-lg font-bold text-zinc-200">{t.apps.soonTitle}</h3>
              <p className="mt-2 text-sm leading-7 text-zinc-500">{t.apps.soonDesc}</p>
              <Button
                asChild
                size="sm"
                variant="outline"
                className="mt-5 rounded-full border-zinc-700 bg-transparent text-xs font-semibold text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
              >
                <a href={telegramHref} target="_blank" rel="noopener noreferrer">
                  {order.telegram}
                </a>
              </Button>
            </article>
          </FadeIn>
        </div>

        {/* پنل سفارش مستقیم */}
        <FadeIn className="mt-16">
          <div className="relative overflow-hidden rounded-3xl border border-emerald-500/25 bg-gradient-to-b from-emerald-500/10 to-transparent p-8 sm:p-12">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-grid opacity-60"
            />
            <div className="relative mx-auto max-w-2xl text-center">
              <span className="text-sm font-semibold text-emerald-400">{order.badge}</span>
              <h2 className="mt-3 text-2xl font-extrabold tracking-tight text-zinc-50 sm:text-3xl">
                {order.title}
              </h2>
              <p className="mt-4 text-sm leading-7 text-zinc-400 sm:text-base sm:leading-8">
                {order.subtitle}
              </p>
              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                {orderButtons.map((btn) => (
                  <Button
                    key={btn.label}
                    asChild
                    size="lg"
                    variant={btn.primary ? "default" : "outline"}
                    className={
                      btn.primary
                        ? "h-12 rounded-full bg-emerald-500 px-6 font-semibold text-zinc-950 hover:bg-emerald-400"
                        : "h-12 rounded-full border-zinc-700 bg-zinc-950/60 px-6 font-semibold text-zinc-200 hover:border-zinc-600 hover:bg-zinc-800 hover:text-zinc-50"
                    }
                  >
                    <a href={btn.href} target={btn.href.startsWith("tel:") ? undefined : "_blank"} rel="noopener noreferrer">
                      <btn.icon className="h-5 w-5" aria-hidden="true" />
                      {btn.label}
                    </a>
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
