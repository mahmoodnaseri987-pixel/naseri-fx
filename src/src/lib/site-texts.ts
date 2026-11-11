/* ابزار مشترک برای خواندن متن‌های قابل ویرایش با مقدار پیش‌فرض */
import type { SiteContentMap } from "@/lib/types";

export function pickText(content: SiteContentMap, key: string, fallback: string): string {
  const value = content[key];
  return typeof value === "string" && value.trim() !== "" ? value : fallback;
}
