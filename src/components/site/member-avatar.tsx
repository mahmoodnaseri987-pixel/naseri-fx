"use client";

/* عکس پروفایل عضو — اگر عکسی نبود، حرف اول نام را نشان می‌دهد */

import { useState } from "react";

type MemberAvatarProps = {
  memberId: string;
  name: string;
  size?: number; // پیکسل
  className?: string;
  hasAvatar?: boolean; // اگر false، مستقیم حرف اول نام (درخواست اضافه نمی‌زند)
};

export function MemberAvatar({ memberId, name, size = 36, className = "", hasAvatar = true }: MemberAvatarProps) {
  const [broken, setBroken] = useState(false);
  const initial = (name || "?").trim().charAt(0).toUpperCase();

  const fallback = (
    <span
      style={{ width: size, height: size, fontSize: Math.round(size * 0.44) }}
      className={`flex shrink-0 select-none items-center justify-center rounded-full bg-violet-500/15 font-black text-violet-300 ring-1 ring-violet-500/30 ${className}`}
      aria-hidden="true"
    >
      {initial}
    </span>
  );

  if (!hasAvatar || broken) return fallback;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/api/member/avatar/${encodeURIComponent(memberId)}`}
      alt=""
      width={size}
      height={size}
      onError={() => setBroken(true)}
      style={{ width: size, height: size }}
      className={`shrink-0 rounded-full object-cover ring-1 ring-zinc-700 ${className}`}
    />
  );
}
