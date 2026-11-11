"use client";

/* نشانه حضور در سایت — هر ۳۰ ثانیه یک POST بی‌صدا به /api/member/heartbeat.
   برای «آنلاین‌های الان» در پنل مدیریت؛ وقتی کاربر عضو نبود سرور ۴۰۱
   می‌دهد و بی‌اثر است. داخل LanguageProvider سوار می‌شود تا در همه صفحات
   سایت فعال باشد (پنل مدیریت مستقل است و به آن نیاز ندارد). */

import { useEffect } from "react";

export function MemberHeartbeat() {
  useEffect(() => {
    let stopped = false;
    const ping = () => {
      if (stopped) return;
      if (document.visibilityState === "hidden") return;
      fetch("/api/member/heartbeat", { method: "POST", keepalive: true }).catch(() => undefined);
    };
    ping();
    const id = window.setInterval(ping, 30_000);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, []);

  return null;
}
