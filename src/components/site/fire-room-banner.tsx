"use client";

import { useCallback, useEffect, useState } from "react";
import { Gamepad2, X } from "lucide-react";
import { useLang } from "@/components/site/language-provider";

type OpenRoom = { c: string; n: string; p: number; m: number; s: number };

/* بنر شناور سراسری سایت: اتاق‌های باز «میدان آتش» را به همه‌ی بازدیدکنندگان نشان می‌دهد
   تا میزبان‌ها بدون کد دعوت، بازیکن پیدا کنند. هر ۲۵ ثانیه از /api/fire/rooms می‌خواند
   (بدون اتصال Ably در مرورگر بازدیدکننده). روی صفحات /fire پنهان می‌شود. */
export function FireRoomBanner() {
  const { t, lang } = useLang();
  const o = t.fireOnline;
  const [rooms, setRooms] = useState<OpenRoom[]>([]);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    let alive = true;
    const dismissed = (() => {
      try {
        const v = window.sessionStorage.getItem("fire-banner-hide");
        return !!v && Number(v) > Date.now();
      } catch {
        return false;
      }
    })();
    const numFmt = (n: number) => new Intl.NumberFormat(lang === "fa" ? "fa-IR" : "en-US").format(n);
    const check = async () => {
      if (window.location.pathname.startsWith("/fire")) {
        if (alive) setHidden(true);
        return;
      }
      try {
        if (document.visibilityState !== "visible") return;
        const r = await fetch("/api/fire/rooms", { cache: "no-store" });
        if (!r.ok) {
          if (alive) setHidden(true);
          return;
        }
        const j = (await r.json()) as { rooms?: OpenRoom[] };
        if (!alive) return;
        const list = Array.isArray(j.rooms) ? j.rooms : [];
        setRooms(list);
        setHidden(list.length === 0 || dismissed);
      } catch {
        /* ignore */
      }
    };
    void check();
    const iv = window.setInterval(() => void check(), 25000);
    return () => {
      alive = false;
      window.clearInterval(iv);
    };
  }, [lang]);

  const dismiss = useCallback(() => {
    setHidden(true);
    try {
      window.sessionStorage.setItem("fire-banner-hide", String(Date.now() + 30 * 60 * 1000));
    } catch {
      /* ignore */
    }
  }, []);

  if (hidden || rooms.length === 0) return null;
  const first = rooms[0];
  const numFmt = (n: number) => new Intl.NumberFormat(lang === "fa" ? "fa-IR" : "en-US").format(n);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-3 z-40 flex justify-center px-3">
      <div className="pointer-events-auto flex max-w-[92vw] items-center gap-2.5 rounded-full border border-orange-500/40 bg-zinc-950/90 px-4 py-2 shadow-xl shadow-orange-500/10 backdrop-blur">
        <Gamepad2 className="h-4 w-4 shrink-0 text-orange-300" aria-hidden="true" />
        <p className="truncate text-xs font-bold text-zinc-200">
          {rooms.length === 1
            ? o.bannerOne.replace("{h}", first.n).replace("{p}", numFmt(first.p)).replace("{m}", numFmt(first.m))
            : o.bannerMany.replace("{n}", numFmt(rooms.length))}
        </p>
        <a
          href={`/fire/online?code=${first.c}`}
          className="shrink-0 rounded-full bg-orange-500 px-3 py-1 text-xs font-black text-zinc-950 hover:bg-orange-400"
        >
          {o.bannerJoin}
        </a>
        <button type="button" onClick={dismiss} aria-label="dismiss" className="shrink-0 text-zinc-500 hover:text-zinc-300">
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
