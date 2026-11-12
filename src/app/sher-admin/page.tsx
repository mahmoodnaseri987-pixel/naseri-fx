import { getAuthed } from "@/lib/admin";
import { sherCookieValid } from "@/lib/sher-auth";
import { SherAdminClient } from "@/components/site/sher-admin-client";
import { SherLoginForm } from "@/components/site/sher-login-form";

/* صفحهٔ مدیریت آهنگ‌های بازی «شعر یادت نره» — با رمز اختصاصی بخش شعر
   یا رمز مدیر کل سایت؛ هیچ‌کدام نباشد، فرم ورود بدون redirect نشان داده می‌شود */

export const dynamic = "force-dynamic"; // همیشه سمت سرور بررسی می‌شود — رندر استاتیک ممنوع

export default async function SherAdminPage() {
  const authed = await getAuthed();
  if (authed) return <SherAdminClient />;
  const sherAuthed = await sherCookieValid();
  return sherAuthed ? <SherAdminClient /> : <SherLoginForm />;
}
