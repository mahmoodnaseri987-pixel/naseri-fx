"use client";

/* نمای کلی داشبورد — آمار و میان‌برها */

import { useEffect, useState } from "react";
import {
  Boxes,
  Eye,
  FileImage,
  Gamepad2,
  Loader2,
  Smartphone,
  Type,
  Users,
  ArrowUpLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/upload-client";
import type { SectionId } from "@/components/site/admin/admin-nav";

type Stats = {
  appsTotal: number;
  appsPublished: number;
  boxesTotal: number;
  boxesPublished: number;
  mediaCount: number;
  mediaBytes: number;
  contentCount: number;
  membersTotal: number;
  gamesTotal: number;
  gamesPublished: number;
  playsTotal: number;
};

export function DashboardOverview({ onNavigate }: { onNavigate: (id: SectionId) => void }) {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch("/api/admin/stats")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setStats(d.stats))
      .catch(() => setStats(null));
  }, []);

  const cards: {
    label: string;
    value: string;
    sub?: string;
    icon: typeof Smartphone;
    target?: SectionId;
  }[] = [
    {
      label: "اپلیکیشن‌ها",
      value: stats ? `${stats.appsPublished} از ${stats.appsTotal}` : "—",
      sub: "منتشرشده از کل",
      icon: Smartphone,
      target: "apps",
    },
    {
      label: "باکس‌های محتوا",
      value: stats ? `${stats.boxesPublished} از ${stats.boxesTotal}` : "—",
      sub: "منتشرشده از کل",
      icon: Boxes,
      target: "boxes",
    },
    {
      label: "بازی‌ها",
      value: stats ? `${stats.gamesPublished} از ${stats.gamesTotal}` : "—",
      sub: stats ? `${new Intl.NumberFormat("fa-IR").format(stats.playsTotal)} بار اجرا شده` : "منتشرشده از کل",
      icon: Gamepad2,
      target: "games",
    },
    {
      label: "اعضای سایت",
      value: stats ? new Intl.NumberFormat("fa-IR").format(stats.membersTotal) : "—",
      sub: "عضو ثبت‌نام‌شده گیم‌کلاب",
      icon: Users,
      target: "members",
    },
    {
      label: "رسانه‌ها",
      value: stats ? `${stats.mediaCount} فایل` : "—",
      sub: stats ? `حجم ${formatBytes(stats.mediaBytes)}` : undefined,
      icon: FileImage,
      target: "media",
    },
    {
      label: "متن‌های شخصی‌سازی‌شده",
      value: stats ? `${stats.contentCount} مورد` : "—",
      sub: "متفاوت با پیش‌فرض سایت",
      icon: Type,
      target: "texts",
    },
  ];

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h3 className="text-base font-bold text-zinc-100">داشبورد</h3>
        <p className="mt-1 text-xs leading-5 text-zinc-500">
          خلاصه وضعیت سایت — برای ویرایش هر بخش روی کارت یا فهرست کنار صفحه بزنید.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <button
            key={card.label}
            type="button"
            onClick={() => card.target && onNavigate(card.target)}
            className="group rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 text-right transition-all hover:-translate-y-0.5 hover:border-emerald-500/40 hover:bg-zinc-900"
          >
            <div className="flex items-center justify-between">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10">
                <card.icon className="h-4.5 w-4.5 text-emerald-400" aria-hidden="true" />
              </span>
              {card.target && (
                <ArrowUpLeft className="h-4 w-4 text-zinc-600 transition-colors group-hover:text-emerald-400" aria-hidden="true" />
              )}
            </div>
            <p className="mt-4 text-2xl font-extrabold text-zinc-50">{card.value}</p>
            <p className="mt-1 text-sm font-medium text-zinc-300">{card.label}</p>
            {card.sub && <p className="mt-0.5 text-xs text-zinc-500">{card.sub}</p>}
          </button>
        ))}
      </div>

      {stats === null && (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-emerald-400" aria-hidden="true" />
        </div>
      )}

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
        <h4 className="text-sm font-bold text-zinc-100">میان‌برها</h4>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={() => onNavigate("games")}
            className="h-9 rounded-xl bg-emerald-500 px-4 text-xs font-bold text-zinc-950 hover:bg-emerald-400"
          >
            افزودن بازی جدید
          </Button>
          <Button
            type="button"
            onClick={() => onNavigate("appearance")}
            variant="outline"
            className="h-9 rounded-xl border-zinc-700 bg-transparent px-4 text-xs text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
          >
            تنظیم بنر و لوگو
          </Button>
          <Button
            type="button"
            onClick={() => onNavigate("boxes")}
            variant="outline"
            className="h-9 rounded-xl border-zinc-700 bg-transparent px-4 text-xs text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
          >
            افزودن باکس
          </Button>
          <Button
            type="button"
            onClick={() => onNavigate("texts")}
            variant="outline"
            className="h-9 rounded-xl border-zinc-700 bg-transparent px-4 text-xs text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
          >
            ویرایش متن‌ها
          </Button>
          <Button
            type="button"
            onClick={() => onNavigate("media")}
            variant="outline"
            className="h-9 rounded-xl border-zinc-700 bg-transparent px-4 text-xs text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
          >
            آپلود عکس / ویدیو
          </Button>
          <Button
            type="button"
            asChild
            variant="outline"
            className="h-9 rounded-xl border-zinc-700 bg-transparent px-4 text-xs text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
          >
            <a href="/" target="_blank" rel="noopener noreferrer">
              <Eye className="h-3.5 w-3.5" aria-hidden="true" />
              مشاهده سایت
            </a>
          </Button>
        </div>
      </section>
    </div>
  );
}
