"use client";

/* ================================================================
   انتخابگر عکس پروفایل — دو حالت:
     ۱) register: کنترل‌شده؛ dataUrl را به فرم ثبت‌نام می‌دهد
     ۲) upload: مستقیم به API می‌فرستد (بنر آرنا، کارت حساب، گیت عکس)
   سه مسیرِ گذاشتن عکس (موبایل و ویندوز):
     • گالری — input[type=file accept=image/*]؛ روی موبایل گالری و
       انتخاب دوربین سیستم‌عامل، روی ویندوز پوشه‌ها باز می‌شود
     • دوربین زنده — getUserMedia با پیش‌نمایش ویدیویی، عکس گرفتن،
       تأیید/عکس مجدد و تغییر دوربین جلو/عقب؛ روی ویندوز وب‌کم
     • دوربین خودِ گوشی — input[capture=environment] به‌عنوان جایگزین
       وقتی دسترسی دوربین در مرورگر رد شد یا پشتیبانی نشد
   ================================================================ */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Camera,
  Image as ImageIcon,
  Loader2,
  RefreshCcw,
  SwitchCamera,
  X,
} from "lucide-react";
import { useLang } from "@/components/site/language-provider";

const SIZE = 128;

/** برش مربعِ وسط منبع تصویر + کوچک‌سازی به ۱۲۸px + JPEG با کیفیت ۰٫۸۲
    ۱۲۸px برای چت و اتاق‌ها کاملاً کافی است و رشد دیتابیس را ~۴ برابر کم می‌کند */
async function toAvatarDataUrl(
  src: CanvasImageSource,
  sw: number,
  sh: number,
): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  const side = Math.min(sw, sh);
  const sx = (sw - side) / 2;
  const sy = (sh - side) / 2;
  ctx.fillStyle = "#18181b";
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.drawImage(src, sx, sy, side, side, 0, 0, SIZE, SIZE);
  return canvas.toDataURL("image/jpeg", 0.82);
}

async function fileToAvatarDataUrl(file: File): Promise<string> {
  const raw = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error("read"));
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("decode"));
    i.src = raw;
  });
  return toAvatarDataUrl(img, img.width, img.height);
}

type AvatarPickerProps = {
  variant: "register" | "upload";
  value?: string; // حالت register
  onChange?: (dataUrl: string) => void;
  onDone?: () => void; // حالت upload بعد از ذخیرهٔ موفق
};

export function AvatarPicker({ variant, value = "", onChange, onDone }: AvatarPickerProps) {
  const { t, lang } = useLang();
  const a = t.auth;
  const router = useRouter();

  const galleryRef = useRef<HTMLInputElement>(null);
  const nativeCamRef = useRef<HTMLInputElement>(null);

  const [preview, setPreview] = useState(value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  /* دوربین زنده */
  const [camOpen, setCamOpen] = useState(false);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [camState, setCamState] = useState<"idle" | "starting" | "live" | "shot" | "error">("idle");
  const [shot, setShot] = useState("");
  const [camError, setCamError] = useState("");
  const [multiCam, setMultiCam] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const tokenRef = useRef(0);

  const stopStream = useCallback(() => {
    tokenRef.current += 1;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const startCamera = useCallback(async () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    const token = ++tokenRef.current;
    setCamError("");
    setCamState("starting");
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw Object.assign(new Error("unsupported"), { name: "NotSupportedError" });
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 720 }, height: { ideal: 720 } },
        audio: false,
      });
      if (token !== tokenRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const v = videoRef.current;
      if (v) {
        v.srcObject = stream;
        await v.play().catch(() => undefined);
      }
      setCamState("live");
      try {
        const devs = await navigator.mediaDevices.enumerateDevices();
        if (token === tokenRef.current) {
          setMultiCam(devs.filter((d) => d.kind === "videoinput").length > 1);
        }
      } catch {
        /* فهرست دوربین‌ها مهم نیست */
      }
    } catch (e) {
      if (token !== tokenRef.current) return;
      streamRef.current = null;
      const name = e && typeof e === "object" ? (e as { name?: string }).name ?? "" : "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        setCamError(a.cameraDenied);
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        setCamError(a.cameraMissing);
      } else {
        setCamError(a.cameraGeneric);
      }
      setCamState("error");
    }
  }, [a.cameraDenied, a.cameraMissing, a.cameraGeneric, facing]);

  /* باز/بسته شدن مودال یا تغییر دوربین — راه‌اندازی جریان ویدیو */
  useEffect(() => {
    if (camOpen) {
      void startCamera();
    } else {
      stopStream();
      setShot("");
      setCamState("idle");
      setCamError("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camOpen, facing]);

  /* پاک‌سازی قطعی هنگام تخریب کامپوننت */
  useEffect(() => () => stopStream(), [stopStream]);

  function openCamera() {
    setFacing(/Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) ? "environment" : "user");
    setCamOpen(true);
  }

  function captureShot() {
    const v = videoRef.current;
    if (!v || !v.videoWidth || !v.videoHeight) return;
    toAvatarDataUrl(v, v.videoWidth, v.videoHeight)
      .then((url) => {
        setShot(url);
        setCamState("shot");
        stopStream();
      })
      .catch(() => {
        setCamError(a.cameraGeneric);
        setCamState("error");
      });
  }

  /** ذخیرهٔ نهایی — register به فرم، upload مستقیم به API */
  async function applyCore(dataUrl: string) {
    if (variant === "register") {
      setPreview(dataUrl);
      onChange?.(dataUrl);
      setCamOpen(false);
    } else {
      const res = await fetch("/api/member/avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatar: dataUrl }),
      });
      if (!res.ok) throw new Error("upload");
      setPreview(dataUrl);
      setCamOpen(false);
      router.refresh();
      onDone?.();
    }
  }

  async function confirmShot() {
    if (!shot) return;
    setError("");
    setBusy(true);
    try {
      await applyCore(shot);
    } catch {
      setError(lang === "fa" ? "عکس ذخیره نشد؛ دوباره تلاش کن." : "Could not save the photo — try again.");
    } finally {
      setBusy(false);
    }
  }

  function retake() {
    setShot("");
    void startCamera();
  }

  async function pick(file: File | undefined) {
    if (!file) return;
    setError("");
    if (!/^image\/(png|jpe?g|webp|gif|avif)$/i.test(file.type)) {
      setError(lang === "fa" ? "فقط عکس (JPG، PNG یا WebP)" : "Images only (JPG, PNG or WebP)");
      return;
    }
    setBusy(true);
    try {
      const dataUrl = await fileToAvatarDataUrl(file);
      await applyCore(dataUrl);
    } catch {
      setError(
        lang === "fa"
          ? "عکس پردازش یا ذخیره نشد؛ عکس دیگری امتحان کن."
          : "Could not process or save that image — try another.",
      );
    } finally {
      setBusy(false);
      if (galleryRef.current) galleryRef.current.value = "";
      if (nativeCamRef.current) nativeCamRef.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => galleryRef.current?.click()}
        className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-full ring-2 ring-violet-500/50 transition hover:ring-violet-400"
        aria-label={a.avatar}
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center bg-zinc-800">
            <Camera className="h-6 w-6 text-zinc-400 group-hover:text-violet-300" aria-hidden="true" />
          </span>
        )}
        <span className="absolute inset-x-0 bottom-0 flex h-5 items-center justify-center bg-zinc-950/70 opacity-0 transition group-hover:opacity-100">
          {busy ? (
            <Loader2 className="h-3 w-3 animate-spin text-violet-300" aria-hidden="true" />
          ) : (
            <Camera className="h-3 w-3 text-zinc-200" aria-hidden="true" />
          )}
        </span>
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex flex-col items-start gap-0.5">
          <button
            type="button"
            onClick={() => galleryRef.current?.click()}
            className="inline-flex min-h-[36px] items-center gap-1.5 px-2 text-sm font-bold text-violet-300 transition hover:text-violet-200"
          >
            <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />
            {a.avatarGallery}
          </button>
          <button
            type="button"
            onClick={openCamera}
            className="inline-flex min-h-[36px] items-center gap-1.5 px-2 text-sm font-bold text-emerald-400 transition hover:text-emerald-300"
          >
            <Camera className="h-3.5 w-3.5" aria-hidden="true" />
            {a.avatarCamera}
          </button>
        </div>
        <p className="mt-0.5 text-[11px] leading-5 text-zinc-400">{a.avatarHint}</p>
        {error && <p className="mt-0.5 text-[11px] font-semibold text-rose-400">{error}</p>}
      </div>

      {/* گالری / پوشه‌ها — روی موبایل انتخابگر گالری و دوربین سیستم‌عامل */}
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => pick(e.target.files?.[0])}
        aria-hidden="true"
        tabIndex={-1}
      />
      {/* دوربین بومی گوشی — جایگزین وقتی دسترسی دوربین مرورگر رد شد */}
      <input
        ref={nativeCamRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => pick(e.target.files?.[0])}
        aria-hidden="true"
        tabIndex={-1}
      />

      {camOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-zinc-950/85 p-4 backdrop-blur-sm"
          dir="rtl"
        >
          <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900 p-4 shadow-2xl sm:p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-extrabold text-zinc-100">{a.cameraTitle}</h2>
              <button
                type="button"
                onClick={() => setCamOpen(false)}
                aria-label={a.cameraClose}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-100"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="relative mt-3 aspect-square w-full overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
              {camState === "shot" && shot ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={shot} alt="" className="h-full w-full object-cover" />
              ) : (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="h-full w-full object-cover"
                  style={{ transform: facing === "user" ? "scaleX(-1)" : "none" }}
                />
              )}
              {camState === "starting" && (
                <div className="absolute inset-0 flex items-center justify-center gap-2 text-xs text-zinc-400">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  {a.cameraStarting}
                </div>
              )}
            </div>

            {camError && (
              <p
                role="alert"
                className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs leading-6 text-rose-300"
              >
                {camError}
              </p>
            )}
            {camState === "error" && (
              <button
                type="button"
                onClick={() => nativeCamRef.current?.click()}
                className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 text-xs font-bold text-amber-300 transition hover:bg-amber-500/15"
              >
                <Camera className="h-4 w-4" aria-hidden="true" />
                {a.cameraFallback}
              </button>
            )}

            <div className="mt-4 flex items-center justify-center gap-3">
              {camState === "live" && (
                <>
                  {multiCam && (
                    <button
                      type="button"
                      onClick={() => setFacing(facing === "user" ? "environment" : "user")}
                      aria-label={a.cameraSwitch}
                      title={a.cameraSwitch}
                      className="flex h-11 w-11 items-center justify-center rounded-full border border-zinc-700 text-zinc-300 transition hover:bg-zinc-800"
                    >
                      <SwitchCamera className="h-5 w-5" aria-hidden="true" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={captureShot}
                    aria-label={a.cameraShot}
                    title={a.cameraShot}
                    disabled={busy}
                    className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-zinc-950 ring-4 ring-emerald-500/25 transition hover:bg-emerald-400 disabled:opacity-50"
                  >
                    <Camera className="h-6 w-6" aria-hidden="true" />
                  </button>
                </>
              )}
              {camState === "shot" && (
                <>
                  <button
                    type="button"
                    onClick={retake}
                    className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-zinc-700 px-3 text-xs font-bold text-zinc-300 transition hover:bg-zinc-800"
                  >
                    <RefreshCcw className="h-4 w-4" aria-hidden="true" />
                    {a.cameraRetake}
                  </button>
                  <button
                    type="button"
                    onClick={confirmShot}
                    disabled={busy}
                    className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-emerald-500 px-4 text-xs font-extrabold text-zinc-950 transition hover:bg-emerald-400 disabled:opacity-60"
                  >
                    {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                    {a.cameraConfirm}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
