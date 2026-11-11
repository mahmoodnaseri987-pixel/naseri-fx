"use client";

/* ================================================================
   گیت عکس پروفایل — برای شروع هر بازی باید عکس پروفایل وجود داشته باشد.
   ثبت‌نام بدون عکس آزاد است؛ اما قبل از اولین اجرای بازی، همین صفحه
   عضو را به گذاشتن عکس دعوت می‌کند. انتخاب عکس با گالری، دوربین زندهٔ
   مرورگر (موبایل و وب‌کم ویندوز) یا دوربین خودِ گوشی انجام می‌شود.
   ================================================================ */

import { Camera } from "lucide-react";
import { AvatarPicker } from "@/components/site/avatar-picker";
import { useLang } from "@/components/site/language-provider";

export function PhotoGate() {
  const { lang } = useLang();

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4 pb-16 pt-28 text-zinc-100">
      <div
        className="w-full max-w-sm rounded-2xl border border-amber-500/40 bg-zinc-900/70 p-6 text-center sm:p-8"
        dir="rtl"
      >
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10">
          <Camera className="h-6 w-6 text-amber-300" aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-xl font-extrabold text-zinc-50">
          {lang === "fa" ? "عکس پروفایل لازم داری" : "You need a profile photo"}
        </h1>
        <p className="mt-2 text-sm leading-7 text-zinc-400">
          {lang === "fa"
            ? "برای شروع بازی‌ها باید عکس پروفایل داشته باشی؛ عکس تو در چت و اتاق‌های بازی نمایش داده می‌شود."
            : "A profile photo is required to start games — it appears in chat and inside game rooms."}
        </p>

        <div className="mt-6 flex flex-col items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
          <AvatarPicker variant="upload" />
        </div>

        <p className="mt-4 text-[11px] leading-5 text-zinc-500">
          {lang === "fa"
            ? "عکس را از گالری موبایل یا پوشه‌های ویندوز انتخاب کن، یا با «دوربین» مستقیم عکس بگیر؛ عکس خودکار مربع و سبک می‌شود."
            : "Pick from your phone gallery or Windows folders, or take a live photo with the camera — auto-cropped square and compressed."}
        </p>

        <p className="mt-3 text-[11px] leading-5 text-zinc-600">
          {lang === "fa"
            ? "بعد از گذاشتن عکس، بازی خودکار اجرا می‌شود."
            : "Once the photo is saved, the game starts automatically."}
        </p>
      </div>
    </div>
  );
}
