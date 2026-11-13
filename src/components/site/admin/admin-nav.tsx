"use client";

/* تعریف بخش‌های پنل مدیریت — مشترک بین فهرست ناوبری و صفحه اصلی پنل */

import {
  BookOpenCheck,
  Boxes,
  Clapperboard,
  FileImage,
  Gamepad2,
  KeyRound,
  LayoutDashboard,
  MailQuestion,
  MessagesSquare,
  Phone,
  ShieldCheck,
  Smartphone,
  Swords,
  Type,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type SectionId =
  | "dashboard"
  | "apps"
  | "games"
  | "arena"
  | "quiz"
  | "chat"
  | "members"
  | "resets"
  | "boxes"
  | "media"
  | "texts"
  | "appearance"
  | "contacts"
  | "security"
  | "guard";

export const ADMIN_SECTIONS: {
  id: SectionId;
  label: string;
  icon: LucideIcon;
}[] = [
  { id: "dashboard", label: "داشبورد", icon: LayoutDashboard },
  { id: "apps", label: "اپلیکیشن‌ها", icon: Smartphone },
  { id: "games", label: "بازی‌ها", icon: Gamepad2 },
  { id: "arena", label: "آرنا و اتاق‌ها", icon: Swords },
  { id: "quiz", label: "بانک سؤال", icon: BookOpenCheck },
  { id: "chat", label: "پاک‌سازی چت‌ها", icon: MessagesSquare },
  { id: "members", label: "اعضای سایت", icon: Users },
  { id: "resets", label: "بازیابی رمز اعضا", icon: MailQuestion },
  { id: "boxes", label: "باکس‌های محتوا", icon: Boxes },
  { id: "media", label: "رسانه‌ها", icon: FileImage },
  { id: "texts", label: "متن‌های سایت", icon: Type },
  { id: "appearance", label: "بنر، لوگو و موشن", icon: Clapperboard },
  { id: "contacts", label: "اطلاعات تماس", icon: Phone },
  { id: "security", label: "امنیت", icon: KeyRound },
  { id: "guard", label: "سلامت و بازسازی", icon: ShieldCheck },
];
