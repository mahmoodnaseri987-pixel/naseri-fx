"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Save, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

const field =
  "h-10 border-zinc-800 bg-zinc-950 text-right text-sm text-zinc-100 placeholder:text-zinc-600";

type Contacts = {
  telegram: string;
  whatsapp: string;
  email: string;
  instagram: string;
};

/* --- تب اطلاعات تماس --- */
export function SettingsForm() {
  const { toast } = useToast();
  const [contacts, setContacts] = useState<Contacts | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/settings");
    if (res.ok) {
      const data = await res.json();
      setContacts(data.settings);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!contacts) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(contacts),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setContacts(data.settings);
      toast({
        title: "اطلاعات تماس ذخیره شد.",
        description: "از الان در همه بخش‌های سایت (کارت‌های تماس و دکمه‌های سفارش) اعمال می‌شود.",
      });
    } catch {
      toast({ title: "ذخیره ناموفق بود.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  if (!contacts) {
    return (
      <div className="flex items-center justify-center py-10" dir="rtl">
        <Loader2 className="h-5 w-5 animate-spin text-emerald-400" aria-hidden="true" />
      </div>
    );
  }

  const set = (key: keyof Contacts, v: string) =>
    setContacts((c) => (c ? { ...c, [key]: v } : c));

  return (
    <form onSubmit={save} dir="rtl" className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-zinc-300">آی‌دی تلگرام (بدون @)</Label>
          <Input className={field} dir="ltr" value={contacts.telegram} onChange={(e) => set("telegram", e.target.value)} placeholder="naseri_dev" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-zinc-300">شماره واتساپ (با کد کشور، بدون +)</Label>
          <Input className={field} dir="ltr" value={contacts.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} placeholder="989120000000" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-zinc-300">ایمیل</Label>
          <Input className={field} dir="ltr" value={contacts.email} onChange={(e) => set("email", e.target.value)} placeholder="hello@naseri.dev" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-zinc-300">آی‌دی اینستاگرام (بدون @)</Label>
          <Input className={field} dir="ltr" value={contacts.instagram} onChange={(e) => set("instagram", e.target.value)} placeholder="naseri.dev" />
        </div>
      </div>
      <p className="text-xs leading-5 text-zinc-500">
        هر فیلد که خالی بماند، کارتش در بخش «تماس» سایت حذف می‌شود. شماره واتساپ هم برای دکمه
        «تماس مستقیم» استفاده می‌شود.
      </p>
      <Button
        type="submit"
        disabled={saving}
        className="h-10 rounded-xl bg-emerald-500 font-bold text-zinc-950 hover:bg-emerald-400"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
        ذخیره اطلاعات تماس
      </Button>
    </form>
  );
}

/* --- تب امنیت: تغییر رمز --- */
export function SecurityForm() {
  const { toast } = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (next !== repeat) {
      toast({ title: "تکرار رمز جدید با خودش یکسان نیست.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "تغییر رمز ناموفق بود.");
      toast({ title: "رمز عبور با موفقیت عوض شد.", description: "نشست شما حفظ شد." });
      setCurrent("");
      setNext("");
      setRepeat("");
    } catch (err) {
      toast({
        title: err instanceof Error ? err.message : "تغییر رمز ناموفق بود.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} dir="rtl" className="max-w-sm space-y-4">
      <div className="space-y-1.5">
        <Label className="text-zinc-300">رمز فعلی</Label>
        <Input type="password" className={field} dir="ltr" value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="••••••••" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-zinc-300">رمز جدید (حداقل ۶ کاراکتر)</Label>
        <Input type="password" className={field} dir="ltr" value={next} onChange={(e) => setNext(e.target.value)} placeholder="••••••••" />
      </div>
      <div className="space-y-1.5">
        <Label className="text-zinc-300">تکرار رمز جدید</Label>
        <Input type="password" className={field} dir="ltr" value={repeat} onChange={(e) => setRepeat(e.target.value)} placeholder="••••••••" />
      </div>
      <Button
        type="submit"
        disabled={saving || !current || !next}
        className="h-10 rounded-xl bg-emerald-500 font-bold text-zinc-950 hover:bg-emerald-400"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <KeyRound className="h-4 w-4" aria-hidden="true" />}
        تغییر رمز عبور
      </Button>
    </form>
  );
}
