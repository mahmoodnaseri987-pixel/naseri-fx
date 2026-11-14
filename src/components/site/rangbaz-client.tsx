"use client";

/* ================================================================
   رنگ‌باز — کلاینت آنلاین اتاقی (۲ تا ۸ نفر)
   از st.rangbaz (snapshot سرور) می‌خواند و اکشن‌ها را به API می‌فرستد.
   ================================================================ */

import { useCallback, useEffect, useRef, useState } from "react";
import { Layers } from "lucide-react";
import { useLang } from "@/components/site/language-provider";
import { subscribeStream } from "@/lib/realtime";
import { RangbazTable } from "@/components/site/rangbaz-table";
import type { RbColor } from "@/lib/rangbaz-shared";
import type { ArenaStateResponse } from "@/lib/types";

export function RangbazClient({ st, offsetMs }: { st: ArenaStateResponse; offsetMs: number }) {
  const { lang } = useLang();
  const fa = lang === "fa";
  const code = st.room.code;
  const view = st.rangbaz;
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsub = subscribeStream("room", code, {});
    return () => unsub();
  }, [code]);

  useEffect(() => {
    if (!flash) return;
    const id = setTimeout(() => setFlash(null), flash.kind === "bad" ? 3200 : 2200);
    return () => clearTimeout(id);
  }, [flash]);

  const post = useCallback(
    async (type: string, extra: Record<string, unknown> = {}) => {
      setBusy(true);
      try {
        const res = await fetch(`/api/arena/rooms/${encodeURIComponent(code)}/action`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type, ...extra }),
        });
        const body = (await res.json().catch(() => ({}))) as { error?: string; reason?: string };
        if (!res.ok) {
          const reason = body.error || body.reason || "";
          const text =
            reason === "not-turn"
              ? fa ? "هنوز نوبت تو نیست" : "not your turn"
              : reason === "not-playable"
                ? fa ? "این کارت الان قابل بازی نیست" : "card not playable"
                : reason === "no-window"
                  ? fa ? "پنجرهٔ لو دادن بسته شده" : "window closed"
                  : reason === "expired"
                    ? fa ? "دیگر دیر شده" : "too late"
                    : fa ? "انجام نشد — دوباره تلاش کن" : "action failed";
          setFlash({ kind: "bad", text });
          return false;
        }
        return true;
      } catch {
        setFlash({ kind: "bad", text: fa ? "ارتباط برقرار نشد" : "network error" });
        return false;
      } finally {
        setBusy(false);
      }
    },
    [code, fa],
  );

  if (!view) {
    return (
      <div className="flex min-h-[60svh] items-center justify-center text-sm font-bold text-zinc-500">
        {fa ? "در حال آماده‌سازی میز…" : "dealing cards…"}
      </div>
    );
  }

  const settingsLabel = [
    `${fa ? "شروع" : "hand"}: ${view.settings.handSize}`,
    view.settings.stacking ? (fa ? "جریمه جمع می‌شود" : "stacking") : fa ? "بدون جمع جریمه" : "no stacking",
    view.settings.custom ? (fa ? "کارت‌های اختصاصی فعال" : "custom cards") : fa ? "بدون کارت اختصاصی" : "no custom cards",
  ];

  return (
    <RangbazTable
      view={view}
      fa={fa}
      busy={busy}
      onPlay={(cardId, opts) => void post("rb_play", { cardId, color: opts?.color, targetId: opts?.targetId, call: opts?.call })}
      onDrawPass={() => void post("rb_draw")}
      onCall={() => void post("rb_call")}
      onCatch={() => void post("rb_catch")}
      header={
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h1 className="flex items-center gap-2 text-lg font-extrabold text-zinc-50">
              <Layers className="h-5 w-5 text-violet-400" aria-hidden="true" />
              {fa ? "رنگ‌باز" : "Rangbaz"}
              <span className="rounded-full border border-violet-500/40 bg-violet-500/10 px-2 py-0.5 text-[10px] font-black text-violet-300">
                {fa ? "آنلاین" : "online"}
              </span>
            </h1>
            <p className="text-[10px] font-bold leading-4 text-zinc-500">{settingsLabel.join(" · ")}</p>
          </div>
          {flash && (
            <div
              role="status"
              className={`mt-2 rounded-xl border px-3 py-2 text-center text-xs font-bold ${
                flash.kind === "bad"
                  ? "border-rose-500/40 bg-rose-500/10 text-rose-300"
                  : "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
              }`}
            >
              {flash.text}
            </div>
          )}
        </>
      }
      footer={
        <p className="mt-3 text-center text-[10px] leading-5 text-zinc-600">
          {fa
            ? "با یک کارتِ باقی‌مانده دکمهٔ «رنگ‌باز!» را بزن — وگرنه دو کارت جریمه می‌شوی."
            : "call “one left!” when you have a single card — or take a 2-card penalty."}
        </p>
      }
    />
  );
}
