"use client";

import { Mail, Send, Instagram, MessageCircle, type LucideIcon } from "lucide-react";
import { FadeIn } from "@/components/site/fade-in";
import { useLang } from "@/components/site/language-provider";
import type { ContactInfo } from "@/lib/types";

type ContactProps = {
  contacts: ContactInfo;
};

export function Contact({ contacts }: ContactProps) {
  const { t } = useLang();
  const c = t.contact;

  /* کارت‌ها از اطلاعات تماسی که مدیر در پنل ذخیره کرده ساخته می‌شوند */
  const sources: { icon: LucideIcon; title: string; value: string; href: string }[] = [
    {
      icon: Send,
      title: c.telegram,
      value: contacts.telegram ? `@${contacts.telegram}` : "",
      href: contacts.telegram ? `https://t.me/${contacts.telegram}` : "",
    },
    {
      icon: MessageCircle,
      title: c.whatsapp,
      value: contacts.whatsapp,
      href: contacts.whatsapp ? `https://wa.me/${contacts.whatsapp}` : "",
    },
    {
      icon: Mail,
      title: c.email,
      value: contacts.email,
      href: contacts.email ? `mailto:${contacts.email}` : "",
    },
    {
      icon: Instagram,
      title: c.instagram,
      value: contacts.instagram ? `@${contacts.instagram}` : "",
      href: contacts.instagram ? `https://instagram.com/${contacts.instagram}` : "",
    },
  ];

  const cards = sources.filter((s) => s.value && s.href);

  if (cards.length === 0) return null;

  return (
    <section id="contact" className="scroll-mt-20 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <FadeIn className="text-center">
          <span className="text-sm font-semibold text-emerald-400">{c.badge}</span>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-zinc-50 sm:text-4xl">
            {c.title}
          </h2>
          <p className="mt-4 text-sm leading-7 text-zinc-400 sm:text-base">{c.replyNote}</p>
        </FadeIn>

        <div className={`mt-12 grid gap-5 sm:grid-cols-2 ${cards.length > 2 ? "lg:grid-cols-4" : "lg:grid-cols-2"}`}>
          {cards.map((card, index) => (
            <FadeIn key={card.title} delay={(index % 4) * 0.08}>
              <a
                href={card.href}
                target={card.href.startsWith("mailto:") ? undefined : "_blank"}
                rel="noopener noreferrer"
                className="block h-full rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 text-center transition-all duration-300 hover:-translate-y-1 hover:border-emerald-500/40 hover:bg-zinc-900 hover:shadow-lg hover:shadow-emerald-500/10"
              >
                <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10">
                  <card.icon className="h-5 w-5 text-emerald-400" aria-hidden="true" />
                </div>
                <h3 className="mt-4 text-base font-bold text-zinc-100">{card.title}</h3>
                <p className="mt-2 font-mono text-sm text-zinc-400" dir="ltr">
                  {card.value}
                </p>
              </a>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}
