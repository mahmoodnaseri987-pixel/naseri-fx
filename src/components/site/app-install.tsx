"use client";

import { useEffect, useState } from "react";
import { Download, Smartphone, X } from "lucide-react";
import { FadeIn } from "@/components/site/fade-in";
import { useLang } from "@/components/site/language-provider";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const isIos = () =>
  typeof navigator !== "undefined" &&
  /iphone|ipad|ipod/i.test(navigator.userAgent);

const isAndroid = () =>
  typeof navigator !== "undefined" && /android/i.test(navigator.userAgent);

const isWindows = () =>
  typeof navigator !== "undefined" && /windows/i.test(navigator.userAgent);

/* بخش «دانلود اپ» — نصب کافه به‌عنوان اپ روی گوشی/کامپیوتر (PWA).
   اگر مرورگر پنجرهٔ نصب بدهد همان لحظه نصب می‌شود؛ وگرنه راهنمای گام‌به‌گام
   بر اساس دستگاه کاربر باز می‌شود. */
export function AppInstall() {
  const { lang } = useLang();
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPromptEvent(e as InstallPromptEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setInstalled(true);
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const fa = lang === "fa";

  const handleDownload = async () => {
    if (promptEvent) {
      await promptEvent.prompt();
      const { outcome } = await promptEvent.userChoice;
      if (outcome === "accepted") setInstalled(true);
      setPromptEvent(null);
    } else {
      setShowHelp(true);
    }
  };

  const steps: string[] = fa
    ? isIos()
      ? [
          "در سافاری دکمهٔ اشتراک را بزن (مربع با فلش رو به بالا)",
          "از فهرست «Add to Home Screen» را انتخاب کن",
          "نام و آیکون کافه را تأیید کن و Add را بزن",
        ]
      : isAndroid()
        ? [
            "روی دکمهٔ «دانلود اپ» بزن — پنجرهٔ نصب باز می‌شود",
            "اگر پنجره باز نشد: منوی سه‌نقطهٔ کروم را باز کن",
            "«افزودن به صفحهٔ اصلی» را انتخاب و تأیید کن",
          ]
        : [
            "روی دکمهٔ «دانلود اپ کافه» بزن — پنجرهٔ نصب باز می‌شود",
            "اگر باز نشد: در کروم یا ادج منوی سه‌نقطه را باز کن و گزینهٔ «Install / نصب» را بزن",
            isWindows()
              ? "میان‌بر کافه در منوی استارت و دسکتاپ می‌نشیند و در پنجرهٔ مستقل خودش باز می‌شود"
              : "کافه به‌صورت یک اپ مستقل با آیکون اختصاصی باز می‌شود",
          ]
    : isIos()
      ? [
          "In Safari, tap the Share button (square with an up arrow)",
          'Choose "Add to Home Screen" from the list',
          "Confirm the name and tap Add",
        ]
      : isAndroid()
        ? [
            'Tap "Download the app" — the install dialog opens',
            "If it did not open: open the three-dot menu in Chrome",
            'Choose "Add to Home screen" and confirm',
          ]
        : [
            'Tap "Download the app" — the install dialog opens',
            "If it did not open: in Chrome or Edge, three-dot menu → Install",
            isWindows()
              ? "A Kafe shortcut lands in your Start menu and desktop, opening in its own window"
              : "Kafe opens as a standalone app with its own icon",
          ];

  return (
    <section id="install" className="scroll-mt-20 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <FadeIn className="text-center">
          <span className="text-sm font-semibold text-emerald-400">
            {fa ? "اپ کافه" : "The app"}
          </span>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-zinc-50 sm:text-4xl">
            {fa ? "کافه را روی گوشی‌ات نصب کن" : "Install Kafe on your device"}
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-8 text-zinc-400">
            {fa
              ? "بدون دانلود از فروشگاه و بدون نصب سنگین — هم روی گوشی (اندروید و iOS) و هم روی ویندوز و مک، کافه مثل یک اپ واقعی با آیکون اختصاصی نصب می‌شود و آپدیت‌اش خودکار است."
              : "No store download, no heavy install — on Android, iOS, Windows and macOS, Kafe installs like a real app with its own icon, and updates automatically."}
          </p>

          {installed ? (
            <p className="mt-8 inline-flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-6 py-3 text-sm font-bold text-emerald-400">
              <Smartphone className="size-4" aria-hidden="true" />
              {fa
                ? "کافه روی این دستگاه نصب است ✓"
                : "Kafe is installed on this device ✓"}
            </p>
          ) : (
            <button
              onClick={handleDownload}
              className="mt-8 inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-8 py-4 text-base font-bold text-zinc-950 shadow-lg shadow-emerald-500/20 transition-colors hover:bg-emerald-400"
            >
              <Download className="size-5" aria-hidden="true" />
              {fa ? "دانلود اپ کافه" : "Download the app"}
            </button>
          )}
        </FadeIn>
      </div>

      {showHelp && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setShowHelp(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-zinc-100">
                {fa ? "راهنمای نصب" : "How to install"}
              </h3>
              <button
                onClick={() => setShowHelp(false)}
                aria-label={fa ? "بستن" : "Close"}
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>
            <ol className="mt-4 space-y-3">
              {steps.map((step, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-xs font-bold text-emerald-400">
                    {i + 1}
                  </span>
                  <span className="text-sm leading-6 text-zinc-300">{step}</span>
                </li>
              ))}
            </ol>
            <p className="mt-5 border-t border-zinc-800 pt-4 text-xs leading-5 text-zinc-500">
              {fa
                ? "کافه به‌صورت وب‌اپ پیش‌رونده (PWA) نصب می‌شود — سبک، سریع و بدون نیاز به فروشگاه اپ."
                : "Kafe installs as a Progressive Web App — light, fast, and store-free."}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
