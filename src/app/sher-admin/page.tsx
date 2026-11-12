import { redirect } from "next/navigation";
import { getAuthed } from "@/lib/admin";
import { SherAdminClient } from "@/components/site/sher-admin-client";

/* صفحهٔ مدیریت آهنگ‌های بازی «شعر یادت نره» — همان احراز پنل ادمین سایت؛
   اگر مدیر وارد نباشد به /admin برمی‌گردد */

export const dynamic = "force-dynamic"; // همیشه سمت سرور بررسی می‌شود — رندر استاتیک ممنوع

export default async function SherAdminPage() {
  const authed = await getAuthed();
  if (!authed) redirect("/admin");
  return <SherAdminClient />;
}
