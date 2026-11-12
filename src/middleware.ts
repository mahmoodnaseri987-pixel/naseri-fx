import { NextRequest, NextResponse } from "next/server";

/* ================================================================
   دیوار ورود سایت — ورود به سایت فقط با حساب عضو.
   همهٔ صفحه‌ها برای بازدیدکنندهٔ مهمان به /login هدایت می‌شوند؛
   اول ثبت‌نام، بعد ورود به سایت.
   صفحات عمومی: /login (ورود و ثبت‌نام) و /admin (پنل مدیریت با
   احراز هویت مستقل خودش).
   بررسی کوکی در middleware فقط «حضور نشست» است؛ اعتبارسنجی کامل
   توکن در خود صفحه‌ها و APIها با getCurrentMember انجام می‌شود.
   ================================================================ */

const MEMBER_COOKIE = "naseri_member";

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  /* صفحات عمومی — ورود/ثبت‌نام، پنل مدیریت و پنل مدیریت شعر
     (/sher-admin گیت رمز مستقل خودش را دارد — فرم ورود بخش شعر) */
  if (
    pathname === "/login" ||
    pathname.startsWith("/login/") ||
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname === "/sher-admin" ||
    pathname.startsWith("/sher-admin/")
  ) {
    return NextResponse.next();
  }

  /* عضو واردشده — عبور آزاد */
  if (req.cookies.get(MEMBER_COOKIE)?.value) {
    return NextResponse.next();
  }

  /* مهمان — هدایت به ورود با آدرس مقصد برای بازگشت بعد از ثبت‌نام */
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("next", pathname + search);
  return NextResponse.redirect(url);
}

export const config = {
  /* همهٔ مسیرها به‌جز APIها، دارایی‌های Next و فایل‌های استاتیک */
  matcher: ["/((?!api|_next|favicon.ico|robots.txt|.*\\..*).*)"],
};
