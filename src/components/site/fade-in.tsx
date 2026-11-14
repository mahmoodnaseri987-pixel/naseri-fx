"use client";

import { CSSProperties, ReactNode } from "react";

type FadeInProps = {
  children: ReactNode;
  delay?: number;
  className?: string;
  y?: number;
};

/* محو‌شدن نرم — کاملاً CSS (بدون JS). نسخهٔ قبلی با framer-motion تا
   hydration همه را opacity:0 نگه می‌داشت و LCP را چند ثانیه عقب می‌انداخت. */
export function FadeIn({ children, delay = 0, className, y = 24 }: FadeInProps) {
  return (
    <div
      className={`fi-anim ${className ?? ""}`}
      style={{ animationDelay: `${delay}s`, "--fi-y": `${y}px` } as CSSProperties}
    >
      {children}
    </div>
  );
}
