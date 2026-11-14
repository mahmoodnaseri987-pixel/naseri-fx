import Link from "next/link";

/* صفحهٔ ۴۰۴ اختصاصی — هم‌سبک بقیهٔ کافه */
export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-zinc-950 px-6 text-center">
      <p
        className="bg-gradient-to-br from-emerald-400 to-teal-500 bg-clip-text text-8xl font-black text-transparent select-none"
        aria-hidden="true"
      >
        ۴۰۴
      </p>
      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-zinc-100">
          این صفحه در کافه پیدا نشد!
        </h1>
        <p className="max-w-md text-sm leading-6 text-zinc-400">
          یا آدرس را اشتباه رفته‌ای یا این صفحه حذف شده است. نگران نباش —
          میزهای بازی هنوز همان‌جا هستند.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="rounded-xl bg-emerald-500 px-6 py-3 text-sm font-bold text-zinc-950 transition-colors hover:bg-emerald-400"
        >
          بازگشت به خانه
        </Link>
        <Link
          href="/fire"
          className="rounded-xl border border-zinc-700 px-6 py-3 text-sm font-bold text-zinc-300 transition-colors hover:border-zinc-500 hover:text-zinc-100"
        >
          میدان آتش — بازی بدون عضویت
        </Link>
      </div>
    </main>
  );
}
