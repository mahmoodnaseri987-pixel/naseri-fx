# کد انتقال جلسه — پروژه ناصری (۲۲ آبان ۱۴۰۵)

```
[کانتکست پروژه — سایت ناصری | Naseri]

پروژه: سایت دوزبانه فارسی/EN «ناصری | Naseri» — https://mahmoudnaseri.vercel.app
استک: Next.js 16 + TypeScript + Tailwind 4 + Prisma + Neon Postgres؛ دِپلوی Vercel از GitHub main.
سندباکس: /home/z/my-project/deploy-work (کلون گیت‌هاب، آمادهٔ push)

── وضعیت انتشار ──
• پروداکشن سالم: نسخهٔ 2026.11.12-r1 (کامیت 8d28e87) — /api/health ✓
• آمادهٔ انتشار: کامیت d4a96f2 «ریتم نوبت ثابت و تاس یک‌چرخشه» — روی main محلی، منتظر توکن push
• نسخهٔ جدید در کامیت: 2026.11.12-r2 (تاریخ ۱۴۰۵/۰۸/۲۲)

── اصلاحات این جلسه (کامیت d4a96f2) — پاسخ به «تاس دوباره می‌چرخد و عدد مشخص نمی‌شود» ──
۱) کلاینت (ludo-client.tsx): کلید انیمیشن تاس از «v+seq» به شناسهٔ پایدار پرتاب «at»
   تغییر کرد؛ حرکت/پاس دیگر باعث چرخش دوباره نمی‌شود. چرخش نیمه‌کاره با برداشتن
   تاس کامل بازنشانی می‌شود (باگ چرخش بی‌پایان). عدد فرود تا پرتاب بعدی روی زمین
   می‌ماند (lastDiceVRef). مکث فرود ۲ثانیه (SETTLE_MS=2000)، چرخش ۱.۴ثانیه.
۲) سرور (ludo-shared/ludo-engine/action route): تاس شناسهٔ «at: seq» می‌گیرد
   (مهاجرت stateهای قدیمی هم حفظ می‌شود). ریتم ربات: پرتاب ۱.۹–۳.۰ثانیه بعد از
   شروع نوبت، حرکت ۳.۴–۴.۳ثانیه بعد از پرتاب (عدد ≥۲ثانیه دیده می‌شود).
۳) ریشهٔ اصلی پرش نوبت‌ها: کش اسنپ‌شات ۷۰۰میلی‌ثانیه‌ای بین مسیرها مشترک نبود —
   Next.js کد lib را per-route باندل می‌کند؛ حالا Map روی globalThis است و بعد
   از هر اکشن invalidateRoomSnapshot(room.code) صدا زده می‌شود (start/again/
   leave/pass/roll/move/tick). اسنپ‌شات کهنه دیگر وضعیت قبل از اکشن را برنمی‌گرداند.

── راستی‌آزمایی (همه سبز) ──
• scripts/ludo_rhythm_test.py — ۱۷/۱۷: شناسهٔ یکتا برای هر پرتاب، بدون دو پرتاب
  پشت‌سرهم، چرخش سخت‌گیرانهٔ نوبت، پرتاب ۲.۴–۳.۳ثانیه و حرکت ۴.۱–۴.۹ثانیه بعد از پرتاب
• MutationObserver روی تاس در مرورگر: هر پرتاب دقیقاً یک چرخش ۱.۴۰ثانیه‌ای، بعد فرود ثابت
• ludo_manual_roll_probe.py — پرتاب دستی فوری در state می‌نشیند (at == seq)
• next build ✓ — tsc فقط خطاهای قدیمی مرده (scores/online/admin) — فایل‌های تغییرکرده پاک

── محیط سندباکس (بعد از ریست کامل) ──
• کد از گیت‌هاب عمومی کلون شد (بدون توکن)؛ push توکن می‌خواهد
• scripts/.github-token → نیست! کاربر باید PAT تازه بدهد (قبلی با ریست پاک شد)
• scripts/.deploy-hook-url → بازیابی شد و تست شد (HTTP 201) — hook سالم است
• Postgres محلی: scripts/local_pg_run.sh (embedded-postgres در /tmp/localpg، پورت 5433)
  DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/naseri
• تست محلی: prisma db push → next build → next start -p 3100
  (هشدار: بعد از rebuild حتماً سرور قدیمی را kill کنید — پروسه به نام
   «next-server (v16.1.3)» است نه «next start»، وگرنه پورت اشغال می‌ماند!)
• عضو تست: 09120000001 / test123456 (ثبت‌نام خودکار در تست)

── کار بعدی به‌ترتیب ──
۱) PAT تازه از کاربر بگیر → scripts/.github-token (chmod 600)
۲) bash scripts/push_naseri.sh  (rsync به /tmp/naseri-clone و push — هرگز force push نکن)
۳) curl -X POST "$(cat scripts/.deploy-hook-url)"  → انتشار
۴) python3 scripts/watch_deploy.py 2026.11.12-r2
۵) تأیید نهایی منچ روی پروداکشن (یک مسابقهٔ کامل با ربات)
```
