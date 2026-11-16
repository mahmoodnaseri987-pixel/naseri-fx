"use client";

/* دیالوگ «برش قبل از آپلود» برای بازی «شعر یادت نره».
   فایل کامل (مثلاً ۳ دقیقه‌ای) در مرورگر decode می‌شود، روی موج‌نگار یک
   پنجرهٔ ثابتِ ۲۰ثانیه‌ای انتخاب می‌شود (کشیدن لبه‌ها/پنجره، کلیک بیرون
   پنجره آن را می‌برد، پیش‌نمایش پخش با حلقهٔ اختیاری) و دکمهٔ «برش» همان
   بازه را با انکودر MP3 مرورگری (lamejs، ۱۲۸kbps) به یک Blob کوچک
   (~۳۰۰-۵۰۰ کیلوبایت) تبدیل می‌کند — فقط همین Blob به سرور آپلود می‌شود.
   هیچ ابزار یا سرویس بیرونی لازم نیست؛ همه‌چیز سمت مرورگر است.
   تعامل موج‌نگار از SherTrimDialog الگو گرفته است (همان رفتار کشیدن). */

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Play, Scissors, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mp3Encoder } from "@breezystack/lamejs";

const CLIP_SECONDS = 20; // طول ثابت کلیپ در موتور بازی
const WAVE_H = 96; // ارتفاع موج‌نگار (px)
const EDGE_PX = 8; // فاصلهٔ نزدیک لبه برای گرفتن لبهٔ پنجره
const PEAK_BUCKETS = 1000; // تعداد باکت‌های موج
const KBPS = 128; // بیت‌ریت انکود MP3

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

/* clamp شروع پنجره در [0, duration-win] با گام ۰٫۱ ثانیه — پنجره هرگز از انتهای فایل بیرون نمی‌زند */
function clampStart(v: number, duration: number): number {
  const win = Math.min(CLIP_SECONDS, duration);
  const max = Math.max(0, duration - win);
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
    const stride = Math.max(1, Math.floor((s1 - s0) / 50));
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

/* Float32 [-1,1] → Int16 با clamp */
function toInt16(src: Float32Array, from: number, to: number): Int16Array {
  const out = new Int16Array(to - from);
  for (let i = from; i < to; i++) {
    let v = Math.round(src[i] * 32767);
    if (v > 32767) v = 32767;
    else if (v < -32768) v = -32768;
    out[i - from] = v;
  }
  return out;
}

/* RMS هر ثانیه → بهترین پنجرهٔ کلیپ: بیشینهٔ انرژی، ثانیه‌های سکوت جریمه،
   ۵ ثانیهٔ اول و ۱۰ ثانیهٔ آخر کنار گذاشته می‌شوند — برای «انتخاب خودکار» */
function bestWindowStart(buffer: AudioBuffer): number {
  const sr = buffer.sampleRate;
  const nSec = Math.floor(buffer.length / sr);
  if (nSec <= CLIP_SECONDS + 2) return 0;
  const ch0 = buffer.getChannelData(0);
  const rms: number[] = [];
  for (let s = 0; s < nSec; s++) {
    const off = s * sr;
    let sum = 0;
    for (let i = off; i < off + sr; i += 2) {
      const v = ch0[i] ?? 0;
      sum += v * v;
    }
    rms.push(Math.sqrt(sum / (sr / 2)));
  }
  const minStart = Math.max(0, Math.min(5, nSec - CLIP_SECONDS));
  const maxStart = Math.max(minStart, nSec - CLIP_SECONDS - 2);
  let best = minStart;
  let bestScore = -Infinity;
  for (let s = minStart; s <= maxStart; s++) {
    let sum = 0;
    let quiet = 0;
    for (let i = s; i < s + CLIP_SECONDS; i++) {
      const v = rms[i] ?? 0;
      sum += v;
      if (v < 0.02) quiet++;
    }
    const score = sum - quiet * 0.5 * 0.02 * CLIP_SECONDS;
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }
  return best;
}

export function SherClipEncoder({
  file,
  busy = false,
  onEncoded,
  onClose,
}: {
  file: File;
  /** درست = آپلودِ کلیپ قبلی در جریان است — برش/بستن قفل می‌شود */
  busy?: boolean;
  onEncoded: (clip: Blob, filename: string) => void;
  onClose: () => void;
}) {
  const [wave, setWave] = useState<WaveState>({ phase: "loading" });
  const [start, setStart] = useState(0);
  const [startText, setStartText] = useState("0.0");
  const [loop, setLoop] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [encoding, setEncoding] = useState(false);
  const [encodeError, setEncodeError] = useState("");
  const [audioUrl, setAudioUrl] = useState(""); // یک بار در decode ساخته می‌شود — نه در هر رندر

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rafRef = useRef(0);
  const playTimeRef = useRef(0);
  const dragRef = useRef<{ mode: DragMode; grabOffset: number } | null>(null);
  const inputFocusedRef = useRef(false);
  const decodedRef = useRef<AudioBuffer | null>(null); // برای انکد — بدون decode دوم

  const waveRef = useRef<WaveState>(wave);
  const startRef = useRef(start);
  const playingRef = useRef(playing);
  const loopRef = useRef(loop);

  /* --- رندر موج روی canvas (DPR-aware) — همان سبک SherTrimDialog --- */
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

    ctx.fillStyle = "#52525b";
    const peaks = w.peaks;
    const n = peaks.length;
    for (let x = 0; x < cssW; x++) {
      const i0 = Math.floor((x / cssW) * n);
      const i1 = Math.min(n, Math.max(i0 + 1, Math.floor(((x + 1) / cssW) * n)));
      let m = 0;
      for (let i = i0; i < i1; i++) if (peaks[i] > m) m = peaks[i];
      const bh = Math.max(1, m * half);
      ctx.fillRect(x, mid - bh, 1, bh * 2);
    }

    ctx.fillStyle = "rgba(16, 185, 129, 0.2)";
    ctx.fillRect(x0, 0, Math.max(0, x1 - x0), WAVE_H);
    ctx.fillStyle = "#34d399";
    ctx.fillRect(Math.round(x0) - 1, 0, 2, WAVE_H);
    ctx.fillRect(Math.round(x1) - 1, 0, 2, WAVE_H);

    if (playingRef.current) {
      const t = playTimeRef.current;
      if (t >= startRef.current - 0.05 && t <= startRef.current + win + 0.05) {
        ctx.fillStyle = "#f97316";
        ctx.fillRect(Math.round(t * pxPerSec) - 1, 0, 2, WAVE_H);
      }
    }

    ctx.fillStyle = "#71717a";
    ctx.font = "10px ui-sans-serif, system-ui, sans-serif";
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.fillText("0", 4, 3);
    ctx.textAlign = "right";
    ctx.fillText(`${fmt1(duration)}s`, cssW - 4, 3);
  }, []);

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
        el.currentTime = startRef.current;
      } else {
        stopPlayback();
        return;
      }
    }
    draw();
    rafRef.current = requestAnimationFrame(tick);
  }, [draw, stopPlayback]);

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

  /* --- decode فایل انتخاب‌شده + ساخت objectURL برای پیش‌نمایش --- */
  useEffect(() => {
    let cancelled = false;
    let ctx: AudioContext | null = null;
    const objectUrl = URL.createObjectURL(file);
    setAudioUrl(objectUrl);
    (async () => {
      try {
        const buf = await file.arrayBuffer();
        const Ctor =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (!Ctor) throw new Error("no-audio-context");
        ctx = new Ctor();
        const decoded = await ctx.decodeAudioData(buf);
        if (cancelled) return;
        decodedRef.current = decoded;
        const peaks = computePeaks(decoded, PEAK_BUCKETS);
        setWave({ phase: "ready", duration: decoded.duration, peaks });
        /* انتخاب خودکار بهترین بازه — کاربر فقط تأیید یا تنظیم ریز می‌کند */
        setStart(clampStart(bestWindowStart(decoded), decoded.duration));
      } catch {
        if (!cancelled)
          setWave({
            phase: "error",
            message:
              "decode این فایل در مرورگر ممکن نشد (فرمت پشتیبانی نمی‌شود). می‌توانی حالت «آپلود کامل فایل» را انتخاب کنی یا فایل را به MP3 تبدیل کنی.",
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
      void ctx?.close().catch(() => undefined);
      URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  useEffect(() => {
    waveRef.current = wave;
    draw();
  }, [wave, draw]);

  useEffect(() => {
    startRef.current = start;
    const el = audioRef.current;
    if (el && playingRef.current) el.currentTime = start;
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

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const ro = new ResizeObserver(() => draw());
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [draw, wave]);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      audioRef.current?.pause();
    };
  }, []);

  /* Escape می‌بندد؛ قفل اسکرول پس‌زمینه */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !encoding && !busy) onClose();
    }
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, encoding, busy]);

  /* --- تعامل با Pointer Events (لبه‌ها = تغییر شروع، وسط = جابه‌جایی) --- */
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
      /* بی‌ضرر */
    }
    const duration = w.duration;
    const win = Math.min(CLIP_SECONDS, duration);
    const t = pointerTime(e);
    const x0 = startRef.current;
    const x1 = startRef.current + win;
    const pxPerSec = canvas.getBoundingClientRect().width / duration;
    const nearL = Math.abs(t - x0) * pxPerSec <= EDGE_PX;
    const nearR = Math.abs(t - x1) * pxPerSec <= EDGE_PX;
    if (nearL) dragRef.current = { mode: "left", grabOffset: t - x0 };
    else if (nearR) dragRef.current = { mode: "right", grabOffset: t - x1 };
    else if (t > x0 && t < x1)
      dragRef.current = { mode: "move", grabOffset: t - x0 };
    else {
      dragRef.current = { mode: "move", grabOffset: win / 2 };
      setStart(clampStart(t - win / 2, duration));
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current;
    const w = waveRef.current;
    if (!drag || w.phase !== "ready") return;
    e.preventDefault();
    const duration = w.duration;
    const win = Math.min(CLIP_SECONDS, duration);
    const t = pointerTime(e);
    if (drag.mode === "left") setStart(clampStart(t - drag.grabOffset, duration));
    else if (drag.mode === "right") setStart(clampStart(t - drag.grabOffset - win, duration));
    else setStart(clampStart(t - drag.grabOffset, duration));
  }

  function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    dragRef.current = null;
    try {
      canvasRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* بی‌ضرر */
    }
  }

  function applyStartText() {
    const w = waveRef.current;
    if (w.phase !== "ready") return;
    const v = parseFloat(startText.replace(/[٫،]/, "."));
    if (!Number.isFinite(v)) {
      setStartText(fmt1(startRef.current));
      return;
    }
    setStart(clampStart(v, w.duration));
  }

  /* --- برش: انکد بازهٔ انتخابی به MP3 مرورگری --- */
  async function encodeClip(): Promise<void> {
    const w = waveRef.current;
    const decoded = decodedRef.current;
    if (w.phase !== "ready" || !decoded) return;
    setEncodeError("");
    setEncoding(true);
    try {
      const sr = decoded.sampleRate;
      if (sr < 8000 || sr > 48000)
        throw new Error(
          `نرخ نمونهٔ فایل (${sr}Hz) برای انکود MP3 نامتعارف است — فایل را با نرخ ۴۴۱۰۰ یا ۴۸۰۰۰ ذخیره کن.`,
        );
      const ch = Math.min(2, decoded.numberOfChannels);
      const s0 = Math.floor(startRef.current * sr);
      const s1 = Math.min(decoded.length, Math.ceil((startRef.current + Math.min(CLIP_SECONDS, w.duration)) * sr));
      if (s1 - s0 < sr) throw new Error("بازهٔ انتخابی بیش از حد کوتاه است.");
      const enc = new Mp3Encoder(ch, sr, KBPS);
      const left = toInt16(decoded.getChannelData(0), s0, s1);
      const right = ch === 2 ? toInt16(decoded.getChannelData(1), s0, s1) : null;
      const parts: BlobPart[] = [];
      const BLOCK = 1152 * 100;
      for (let off = 0; off < left.length; off += BLOCK) {
        const end = Math.min(off + BLOCK, left.length);
        const l = left.subarray(off, end);
        const r = right ? right.subarray(off, end) : undefined;
        const d = r ? enc.encodeBuffer(l, r) : enc.encodeBuffer(l);
        if (d.length) parts.push(new Uint8Array(d));
      }
      const tail = enc.flush();
      if (tail.length) parts.push(new Uint8Array(tail));
      const blob = new Blob(parts, { type: "audio/mpeg" });
      if (blob.size < 2000) throw new Error("خروجی انکود خیلی کوچک است — دوباره تلاش کن.");
      /* نام خروجی: پایهٔ نام فایل با پسوند mp3 — جایگزینی همنام‌ها در مخزن */
      const base = file.name.replace(/\.[A-Za-z0-9]{1,6}$/, "").replace(/[.\s]+$/, "") || "clip";
      onEncoded(blob, `${base}.mp3`);
    } catch (e) {
      setEncodeError(e instanceof Error ? e.message : "انکود ناموفق بود — دوباره تلاش کن.");
      setEncoding(false);
    }
  }

  const win = wave.phase === "ready" ? Math.min(CLIP_SECONDS, wave.duration) : CLIP_SECONDS;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" dir="rtl">
      <div className="rb-menu-glass w-full max-w-2xl rounded-3xl border border-zinc-800 p-5 shadow-2xl">
        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-sm font-black text-zinc-100">
            <Scissors className="h-4 w-4 text-emerald-400" aria-hidden="true" />
            برش ۲۰ثانیه‌ای — «{file.name}»
          </p>
          <button
            type="button"
            onClick={onClose}
            disabled={encoding || busy}
            className="rounded-xl p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 disabled:opacity-40"
            aria-label="بستن"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <p className="mt-1.5 text-[11px] leading-5 text-zinc-500">
          پنجرهٔ سبز را روی بازهٔ دلخواه بکش (لبه‌ها یا خود پنجره)، با «پخش» گوش کن و در پایان «برش و ادامه» را بزن — فقط همین ۲۰ ثانیه (~۳۰۰ کیلوبایت) آپلود می‌شود.
        </p>

        {wave.phase === "loading" && (
          <p className="mt-6 flex items-center justify-center gap-2 py-8 text-sm text-zinc-400">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            در حال ساخت موج صوتی…
          </p>
        )}
        {wave.phase === "error" && (
          <p className="mt-4 rounded-2xl border border-rose-900 bg-rose-950/50 p-3 text-xs leading-5 text-rose-200">
            {wave.message}
          </p>
        )}

        {wave.phase === "ready" && (
          <>
            <div ref={wrapRef} className="mt-4 w-full touch-none select-none">
              <canvas
                ref={canvasRef}
                className="h-24 w-full cursor-ew-resize rounded-xl border border-zinc-800 bg-zinc-950"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              />
            </div>

            <div className="mt-3 flex flex-wrap items-end gap-3">
              <div className="w-28">
                <Label className="text-xs text-zinc-400">شروع (ثانیه)</Label>
                <Input
                  value={startText}
                  onChange={(e) => {
                    inputFocusedRef.current = true;
                    setStartText(e.target.value);
                  }}
                  onFocus={() => (inputFocusedRef.current = true)}
                  onBlur={() => {
                    inputFocusedRef.current = false;
                    applyStartText();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      applyStartText();
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                  inputMode="decimal"
                  dir="ltr"
                  className={`${field} mt-1 text-center tabular-nums`}
                />
              </div>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  if (playingRef.current) {
                    stopPlayback();
                    return;
                  }
                  const el = audioRef.current;
                  if (!el) return;
                  el.currentTime = startRef.current;
                  el.play()
                    .then(() => {
                      playingRef.current = true;
                      setPlaying(true);
                      playTimeRef.current = startRef.current;
                      rafRef.current = requestAnimationFrame(tick);
                    })
                    .catch(() => stopPlayback());
                }}
                className="h-9 rounded-xl bg-zinc-800 text-xs text-zinc-100 hover:bg-zinc-700"
              >
                {playing ? (
                  <>
                    <Square className="me-1.5 h-3 w-3" aria-hidden="true" /> توقف
                  </>
                ) : (
                  <>
                    <Play className="me-1.5 h-3 w-3" aria-hidden="true" /> پخش بازه
                  </>
                )}
              </Button>
              <label className="flex h-9 items-center gap-2 text-xs text-zinc-400">
                <input
                  type="checkbox"
                  checked={loop}
                  onChange={(e) => setLoop(e.target.checked)}
                  className="h-3.5 w-3.5 accent-emerald-500"
                />
                پخش تکراری
              </label>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  const decoded = decodedRef.current;
                  if (!decoded) return; // فقط پس از decode موفق مقدار دارد
                  stopPlayback();
                  setStart(clampStart(bestWindowStart(decoded), decoded.duration));
                }}
                className="h-9 rounded-xl border border-emerald-700 bg-emerald-950/50 text-xs text-emerald-300 hover:bg-emerald-900/60"
              >
                ✨ انتخاب خودکار بهترین بازه
              </Button>
              <span className="text-[11px] text-zinc-500" dir="ltr">
                {fmt1(startRef.current)}s → {fmt1(startRef.current + win)}s ({fmt1(win)}s)
              </span>
            </div>

            <audio
              ref={audioRef}
              src={audioUrl || undefined}
              onEnded={onAudioEnded}
              preload="auto"
              className="hidden"
            />

            {encodeError && (
              <p className="mt-3 rounded-2xl border border-rose-900 bg-rose-950/50 p-3 text-xs leading-5 text-rose-200">
                {encodeError}
              </p>
            )}

            <div className="mt-5 flex items-center justify-end gap-3">
              <Button
                type="button"
                size="sm"
                onClick={onClose}
                disabled={encoding || busy}
                className="h-9 rounded-xl bg-zinc-800 text-xs text-zinc-200 hover:bg-zinc-700"
              >
                انصراف
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={encodeClip}
                disabled={encoding || busy}
                className="h-9 rounded-xl bg-emerald-600 text-xs text-white hover:bg-emerald-500"
              >
                {encoding || busy ? (
                  <>
                    <Loader2 className="me-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    در حال برش…
                  </>
                ) : (
                  <>
                    <Scissors className="me-1.5 h-3.5 w-3.5" aria-hidden="true" />
                    برش و ادامه
                  </>
                )}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
