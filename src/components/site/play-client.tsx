"use client";

/* نوار اجرای بازی + قاب iframe هم‌مبدأ */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ArrowLeft, Maximize, Minimize, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLang } from "@/components/site/language-provider";

type PlayClientProps = {
  slug: string;
  titleFa: string;
  titleEn: string;
  memberName: string;
};

export function PlayClient({ slug, titleFa, titleEn, memberName }: PlayClientProps) {
  const { t, lang } = useLang();
  const router = useRouter();
  const p = t.play;
  const title = lang === "fa" ? titleFa : titleEn;
  const BackIcon = lang === "fa" ? ArrowRight : ArrowLeft;

  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = document.getElementById("game-frame");
    if (!document.fullscreenElement) {
      el?.requestFullscreen?.().catch(() => undefined);
    } else {
      document.exitFullscreen?.().catch(() => undefined);
    }
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
      {/* نوار بالا */}
      <header className="border-b border-zinc-800 bg-zinc-950/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              onClick={() => router.push("/games")}
              variant="outline"
              size="sm"
              className="h-9 shrink-0 rounded-full border-zinc-700 bg-transparent text-xs text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
            >
              <BackIcon className="h-3.5 w-3.5" aria-hidden="true" />
              {p.back}
            </Button>
            <h1 className="truncate text-sm font-bold text-zinc-100">{title}</h1>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {memberName && (
              <span className="hidden items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-400 sm:flex">
                <UserRound className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                {memberName}
              </span>
            )}
            <Button
              onClick={toggleFullscreen}
              variant="outline"
              size="sm"
              aria-label={fullscreen ? p.exitFullscreen : p.fullscreen}
              className="h-9 rounded-full border-zinc-700 bg-transparent text-xs text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
            >
              {fullscreen ? (
                <Minimize className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Maximize className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              <span className="hidden sm:inline">{fullscreen ? p.exitFullscreen : p.fullscreen}</span>
            </Button>
          </div>
        </div>
      </header>

      {/* قاب بازی */}
      <main className="flex flex-1 flex-col">
        <iframe
          id="game-frame"
          src={`/api/games/${slug}/file`}
          title={title}
          className="w-full flex-1 border-0 bg-zinc-950"
          style={{ minHeight: "calc(100vh - 3.5rem)" }}
          allow="autoplay; fullscreen; gamepad"
        />
      </main>
    </div>
  );
}
