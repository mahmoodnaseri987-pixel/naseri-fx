"use client";

/* دیالوگ «قیچی کلیپ» برای بازی «شعر یادت نره» — انتخاب دقیق پنجرهٔ ۱۰ثانیه‌ای
   روی موج‌نگارِ فایل صوتی. طول کلیپ در موتور بازی ثابت است (فقط شروع قابل
   انتخاب است)، پس این‌جا پنجره‌ای با عرض ثابتِ ۱۰ ثانیه روی موج جابه‌جا می‌شود:
   کشیدن لبه‌ها یا خود پنجره با Pointer Events (موس + لمس)، کلیک بیرون پنجره
   آن را به نقطهٔ کلیک می‌برد. پیش‌نمایش پخش با یک audio مستقل داخل دیالوگ است. */

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Play, Scissors, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const CLIP_SECONDS = 10; // طول ثابت کلیپ در موتور بازی
const WAVE_H = 96; // ارتفاع موج‌نگار (px)
const EDGE_PX = 8; // فاصلهٔ نزدیک لبه برای گرفتن لبهٔ پنجره
const PEAK_BUCKETS = 1000; // تعداد باکت‌های موج

const field =
  "h-10 border-zinc-800 bg-zinc-950 text-sm text-zinc-100 placeholder:text-zinc-600";

type WaveState =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "ready"; duration: number; peaks: number[] };

type DragMode = "left" | "right" | "move";

function fmt1(n: number): string {
  return (Math.round(n * 10) / 10).toFixed(1);
}

/* clamp شروع پنجره در [0, duration-10] با گام ۰٫۱ ثانیه */
function clampStart(v: number, duration: number): number {
  const max = Math.max(0, duration - CLIP_SECONDS);
  const c = Math.min(Math.max(v, 0), max);
  return Math.round(c * 10) / 10;
}

/* peaks موج: ~۱۰۰۰ باکت؛ هر باکت بیشینهٔ |نمونهٔ ch0| یا |ch1| با stride */
function computePeaks(buffer: AudioBuffer, buckets: number): number[] {
  const ch0 = buffer.getChannelData(0);
  const ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : null;
  const len = ch0.length;
  const per = Math.max(1, Math.floor(len / buckets));
  const peaks: number[] = [];
  for (let b = 0; b < buckets; b++) {
    const s0 = b * per;
    if (s0 >= len) {
      peaks.push(0);
      continue;
    }
    const s1 = Math.min(len, s0 + per);
    const stride = Math.max(1, Math.floor((s1 - s0) / 50)); // نمونه‌برداری پرشی برای سرعت
    let m = 0;
    for (let i = s0; i < s1; i += stride) {
      const v0 = Math.abs(ch0[i]);
      if (v0 > m) m = v0;
      if (ch1) {
        const v1 = Math.abs(ch1[i]);
        if (v1 > m) m = v1;
      }
    }
    peaks.push(m);
  }
  return peaks;
}

export function SherTrimDialog({
  filename,
  url,
  clipStart,
  onApply,
  onClose,
}: {
  filename: string;
  url: string;
  clipStart: number;
  onApply: (startSeconds: number) => void;
  onClose: () => void;
}) {
  const [wave, setWave] = useState<WaveState>({ phase: "loading" });
  const [start, setStart] = useState(() =>
    Number.isFinite(clipStart) ? Math.max(0, clipStart) : 0,
  );
  const [startText, setStartText] = useState(() => fmt1(start));
  const [loop, setLoop] = useState(false);
  const [playing, setPlaying] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef(0);
  const playTimeRef = useRef(0);
  const dragRef = useRef<{ mode: DragMode; grabOffset: number } | null>(null);
  const inputFocusedRef = useRef(false);

  /* آینه‌های ref برای خواندن داخل draw/tick بدون وابستگی به رندر */
  const waveRef = useRef<WaveState>(wave);
  const startRef = useRef(start);
  const playingRef = useRef(playing);
  const loopRef = useRef(loop);

  /* --- رندر موج روی canvas (DPR-aware) --- */
  const draw = useCallback(() => {
    const w = waveRef.current;
    if (w.phase !== "ready") return;
    const duration = w.duration;
    if (!(duration > 0)) return;
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const cssW = wrap.clientWidth;
    if (cssW < 2) return;
    const dpr = Math.min(Math.max(window.devicePixelRatio || 1, 1), 3);
    const wpx = Math.max(1, Math.round(cssW * dpr));
    const hpx = Math.max(1, Math.round(WAVE_H * dpr));
    if (canvas.width !== wpx) canvas.width = wpx;
    if (canvas.height !== hpx) canvas.height = hpx;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, WAVE_H);

    const mid = WAVE_H / 2;
    const half = WAVE_H / 2 - 10;
    const win = Math.min(CLIP_SECONDS, duration);
    const pxPerSec = cssW / duration;
    const x0 = startRef.current * pxPerSec;
    const x1 = (startRef.current + win) * pxPerSec;

    /* موج — zinc-600 */
    const peaks = w.peaks;
    const n = peaks.length;
    ctx.fillStyle = "#52525b";
    for (let x = 0; x < cssW; x++) {
      const i0 = Math.floor((x / cssW) * n);
      const i1 = Math.min(n, Math.max(i0 + 1, Math.floor(((x + 1) / cssW) * n)));
      let m = 0;
      for (let i = i0; i < i1; i++) if (peaks[i] > m) m = peaks[i];
      const bh = Math.max(1, m * half);
      ctx.fillRect(x, mid - bh, 1, bh * 2);
    }

    /* پنجرهٔ انتخاب — overlay سبز + دو خط لبه */
    ctx.fillStyle = "rgba(16, 185, 129, 0.2)";
    ctx.fillRect(x0, 0, Math.max(0, x1 - x0), WAVE_H);
    ctx.fillStyle = "#34d399";
    ctx.fillRect(Math.round(x0) - 1, 0, 2, WAVE_H);
    ctx.fillRect(Math.round(x1) - 1, 0, 2, WAVE_H);

    /* playhead نارنجی هنگام پخش */
    if (playingRef.current) {
      const t = playTimeRef.current;
      if (t >= startRef.current - 0.05 && t <= startRef.current + win + 0.05) {
        ctx.fillStyle = "#f97316";
        ctx.fillRect(Math.round(t * pxPerSec) - 1, 0, 2, WAVE_H);
      }
    }

    /* برچسب‌های محور زمان — LTR */
    ctx.fillStyle = "#71717a";
    ctx.font = "10px ui-sans-serif, system-ui, sans-serif";
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.fillText("0", 4, 3);
    ctx.textAlign = "right";
    ctx.fillText(`${fmt1(duration)}s`, cssW - 4, 3);
  }, []);

  /* --- حلقهٔ rAF پخش: playhead + رسیدن به انتهای پنجره (توقف یا تکرار) --- */
  const stopPlayback = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    const el = audioRef.current;
    if (el) el.pause();
    playingRef.current = false;
    setPlaying(false);
    draw();
  }, [draw]);

  const tick = useCallback(() => {
    const el = audioRef.current;
    const w = waveRef.current;
    if (!el || w.phase !== "ready" || !playingRef.current) return;
    playTimeRef.current = el.currentTime;
    const win = Math.min(CLIP_SECONDS, w.duration);
    if (!el.ended && el.currentTime >= startRef.current + win - 0.02) {
      if (loopRef.current) {
        el.currentTime = startRef.current; // برگرد به شروع پنجره و ادامه بده
      } else {
        stopPlayback();
        return;
      }
    }
    draw();
    rafRef.current = requestAnimationFrame(tick);
  }, [draw, stopPlayback]);

  /* رسیدن به انتهای فایل (وقتی پنجره تا آخر فایل است) */
  const onAudioEnded = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    if (loopRef.current) {
      el.currentTime = startRef.current;
      el.play().catch(() => stopPlayback());
    } else {
      stopPlayback();
    }
  }, [stopPlayback]);

  /* --- بارگذاری و decode فایل صوتی --- */
  useEffect(() => {
    let cancelled = false;
    let ctx: AudioContext | null = null;
    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error("bad-response");
        const buf = await res.arrayBuffer();
        const Ctor =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (!Ctor) throw new Error("no-audio-context");
        ctx = new Ctor();
        const decoded = await ctx.decodeAudioData(buf.slice(0));
        if (cancelled) return;
        const peaks = computePeaks(decoded, PEAK_BUCKETS);
        setWave({ phase: "ready", duration: decoded.duration, peaks });
        setStart((s) => clampStart(s, decoded.duration));
      } catch {
        if (!cancelled)
          setWave({
            phase: "error",
            message:
              "ساخت موج صوتی ممکن نشد — مرورگر این فرمت را پشتیبانی نمی‌کند. می‌توانی با دکمهٔ «تنظیم زمان از لحظهٔ فعلی» پخش‌کنندهٔ کارت، زمان شروع را دستی تنظیم کنی.",
          });
      } finally {
        try {
          await ctx?.close();
        } catch {
          /* بستن دوباره خطا می‌دهد — نادیده */
        }
      }
    })();
    return () => {
      cancelled = true;
      try {
        ctx?.close();
      } catch {
        /* نادیده */
      }
    };
  }, [url]);

  /* همگام‌سازی آینه‌ها + رسم دوباره */
  useEffect(() => {
    waveRef.current = wave;
    draw();
  }, [wave, draw]);

  useEffect(() => {
    startRef.current = start;
    const el = audioRef.current;
    if (el && playingRef.current) el.currentTime = start; // کشیدن پنجره حین پخش، پخش را جابه‌جا می‌کند
    if (!inputFocusedRef.current) setStartText(fmt1(start));
    draw();
  }, [start, draw]);

  useEffect(() => {
    playingRef.current = playing;
    draw();
  }, [playing, draw]);

  useEffect(() => {
    loopRef.current = loop;
  }, [loop]);

  /* رسم دوباره هنگام تغییر عرض کانتینر */
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const ro = new ResizeObserver(() => draw());
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [draw, wave]);

  /* پاک‌سازی هنگام بستن: توقف حلقهٔ rAF و پخش */
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      audioRef.current?.pause();
    };
  }, []);

  /* Escape می‌بندد؛ قفل اسکرول پس‌زمینه */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  /* --- تعامل با Pointer Events --- */
  function pointerTime(e: React.PointerEvent<HTMLCanvasElement>): number {
    const canvas = canvasRef.current;
    const w = waveRef.current;
    if (!canvas || w.phase !== "ready" || !(w.duration > 0)) return 0;
    const rect = canvas.getBoundingClientRect();
    const x = Math.min(Math.max(e.clientX - rect.left, 0), rect.width);
    return (x / rect.width) * w.duration;
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const w = waveRef.current;
    const canvas = canvasRef.current;
    if (w.phase !== "ready" || !canvas) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* نادیده */
    }
    const duration = w.duration;
    const rect = canvas.getBoundingClientRect();
    const x = Math.min(Math.max(e.clientX - rect.left, 0), rect.width);
    const t = (x / rect.width) * duration;
    const win = Math.min(CLIP_SECONDS, duration);

    if (duration <= CLIP_SECONDS) {
      /* پنجره کل فایل است — فقط جابه‌جایی صفر */
      dragRef.current = { mode: "move", grabOffset: 0 };
      return;
    }
    const leftPx = (startRef.current / duration) * rect.width;
    const rightPx = ((startRef.current + win) / duration) * rect.width;
    if (Math.abs(x - leftPx) <= EDGE_PX) {
      dragRef.current = { mode: "left", grabOffset: 0 };
    } else if (Math.abs(x - rightPx) <= EDGE_PX) {
      dragRef.current = { mode: "right", grabOffset: win };
    } else if (x > leftPx && x < rightPx) {
      dragRef.current = { mode: "move", grabOffset: t - startRef.current };
    } else {
      /* بیرون پنجره — پرش: نقطهٔ کلیک مرکز پنجره می‌شود، بعد با جابه‌جایی ادامه */
      setStart(clampStart(t - win / 2, duration));
      dragRef.current = { mode: "move", grabOffset: win / 2 };
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const w = waveRef.current;
    const canvas = canvasRef.current;
    if (w.phase !== "ready" || !canvas) return;
    const drag = dragRef.current;
    if (!drag) {
      /* فقط بازخورد نشانگر موس */
      const duration = w.duration;
      if (duration <= CLIP_SECONDS) {
        canvas.style.cursor = "default";
        return;
      }
      const rect = canvas.getBoundingClientRect();
      const x = Math.min(Math.max(e.clientX - rect.left, 0), rect.width);
      const win = Math.min(CLIP_SECONDS, duration);
      const leftPx = (startRef.current / duration) * rect.width;
      const rightPx = ((startRef.current + win) / duration) * rect.width;
      if (Math.abs(x - leftPx) <= EDGE_PX || Math.abs(x - rightPx) <= EDGE_PX)
        canvas.style.cursor = "ew-resize";
      else if (x > leftPx && x < rightPx) canvas.style.cursor = "grab";
      else canvas.style.cursor = "pointer";
      return;
    }
    const t = pointerTime(e);
    if (drag.mode === "left") {
      setStart(clampStart(t, w.duration));
    } else {
      setStart(clampStart(t - drag.grabOffset, w.duration));
    }
  }

  function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    dragRef.current = null;
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* نادیده */
    }
  }

  /* --- کنترل‌ها --- */
  function stepStart(delta: number) {
    const w = waveRef.current;
    if (w.phase !== "ready") return;
    setStart((s) => clampStart(s + delta, w.duration));
  }

  function onStartInputChange(v: string) {
    setStartText(v);
    if (v.trim() === "") return;
    const n = Number(v);
    if (!Number.isFinite(n)) return;
    const w = waveRef.current;
    if (w.phase === "ready") setStart(clampStart(n, w.duration));
    else setStart(Math.max(0, Math.round(n * 10) / 10));
  }

  async function togglePlayback() {
    const el = audioRef.current;
    const w = waveRef.current;
    if (!el || w.phase !== "ready") return;
    if (playingRef.current) {
      stopPlayback();
      return;
    }
    el.currentTime = startRef.current;
    try {
      await el.play();
    } catch {
      return;
    }
    playingRef.current = true;
    setPlaying(true);
    playTimeRef.current = el.currentTime;
    rafRef.current = requestAnimationFrame(tick);
  }

  function apply() {
    stopPlayback();
    onApply(startRef.current);
  }

  const duration = wave.phase === "ready" ? wave.duration : 0;
  const win = wave.phase === "ready" ? Math.min(CLIP_SECONDS, duration) : CLIP_SECONDS;
  const endSec = start + win;
  const maxStart = wave.phase === "ready" ? Math.max(0, duration - CLIP_SECONDS) : undefined;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
        role="dialog"
        aria-modal="true"
        aria-label={`قیچی کلیپ ${filename}`}
      >
        {/* سربرگ */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10">
              <Scissors className="h-4 w-4 text-emerald-400" aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-bold text-zinc-100">قیچی کلیپ — پنجرهٔ ۱۰ ثانیه‌ای</p>
              <p className="mt-0.5 font-mono text-[11px] text-zinc-500" dir="ltr">
                {filename}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="بستن"
            className="h-8 w-8 rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>

        {/* بدنه */}
        {wave.phase === "loading" && (
          <div className="mt-4 flex h-24 items-center justify-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-950 text-sm text-zinc-400">
            <Loader2 className="h-4 w-4 animate-spin text-emerald-400" aria-hidden="true" />
            در حال ساختن موج…
          </div>
        )}

        {wave.phase === "error" && (
          <div className="mt-4 space-y-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4">
            <p className="text-sm leading-6 text-rose-200">{wave.message}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              className="h-9 rounded-xl border-zinc-700 bg-transparent text-xs text-zinc-300 hover:bg-zinc-800"
            >
              بستن
            </Button>
          </div>
        )}

        {wave.phase === "ready" && (
          <>
            {/* موج‌نگار — dir=ltr تا RTL محور زمان را وارونه نکند */}
            <div
              ref={wrapRef}
              dir="ltr"
              className="mt-4 select-none overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950"
            >
              <canvas
                ref={canvasRef}
                className="block h-24 w-full touch-none"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              />
            </div>

            {/* کنترل‌ها */}
            <div className="mt-4 space-y-3">
              <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
                <div className="space-y-1.5">
                  <Label htmlFor="sher-trim-start" className="text-xs text-zinc-400">
                    شروع کلیپ (ثانیه)
                  </Label>
                  <div className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => stepStart(-0.1)}
                      className="h-10 rounded-xl border-zinc-700 bg-transparent px-3 text-xs text-zinc-300 hover:bg-zinc-800"
                    >
                      <span dir="ltr">−۰٫۱</span>
                      <span>ثانیه</span>
                    </Button>
                    <Input
                      id="sher-trim-start"
                      type="number"
                      min={0}
                      max={maxStart}
                      step={0.1}
                      value={startText}
                      onChange={(e) => onStartInputChange(e.target.value)}
                      onFocus={() => {
                        inputFocusedRef.current = true;
                      }}
                      onBlur={() => {
                        inputFocusedRef.current = false;
                        setStartText(fmt1(start));
                      }}
                      className={`${field} w-28`}
                      dir="ltr"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => stepStart(0.1)}
                      className="h-10 rounded-xl border-zinc-700 bg-transparent px-3 text-xs text-zinc-300 hover:bg-zinc-800"
                    >
                      <span dir="ltr">+۰٫۱</span>
                      <span>ثانیه</span>
                    </Button>
                  </div>
                </div>
                <p className="pb-2 text-xs leading-6 text-zinc-400">
                  بازهٔ انتخاب: از{" "}
                  <span className="text-zinc-200" dir="ltr">
                    {fmt1(start)}
                  </span>{" "}
                  تا{" "}
                  <span className="text-zinc-200" dir="ltr">
                    {fmt1(endSec)}
                  </span>{" "}
                  ثانیه ({win === CLIP_SECONDS ? "۱۰" : fmt1(win)} ثانیه)
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-300">
                  <input
                    type="checkbox"
                    checked={loop}
                    onChange={(e) => setLoop(e.target.checked)}
                    className="h-4 w-4 accent-emerald-500"
                  />
                  تکرار
                </label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={togglePlayback}
                  className="h-9 rounded-xl border-zinc-700 bg-transparent text-xs text-zinc-200 hover:bg-zinc-800"
                >
                  {playing ? (
                    <Square className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <Play className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {playing ? "توقف پخش" : "پخش انتخاب"}
                </Button>
              </div>

              <div className="flex flex-wrap items-center gap-2 border-t border-zinc-800 pt-3">
                <Button
                  type="button"
                  size="sm"
                  onClick={apply}
                  className="h-9 rounded-xl bg-emerald-600 text-xs text-white hover:bg-emerald-500"
                >
                  <Scissors className="h-3.5 w-3.5" aria-hidden="true" />
                  اعمال و ذخیرهٔ کلیپ
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onClose}
                  className="h-9 rounded-xl border-zinc-700 bg-transparent text-xs text-zinc-300 hover:bg-zinc-800"
                >
                  بستن
                </Button>
              </div>
            </div>
          </>
        )}

        {/* پخش‌کنندهٔ مستقل دیالوگ — از پخش‌کنندهٔ کارت جداست */}
        <audio
          ref={audioRef}
          src={url}
          preload="auto"
          onEnded={onAudioEnded}
          className="hidden"
        />
      </div>
    </div>
  );
}
