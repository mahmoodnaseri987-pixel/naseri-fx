"use client";

import { createContext, useContext, useEffect, ReactNode, useSyncExternalStore } from "react";
import { dict, Lang } from "@/lib/i18n";

type LangContextType = {
  lang: Lang;
  t: (typeof dict)["fa"];
  toggleLang: () => void;
};

const LangContext = createContext<LangContextType | null>(null);

const STORAGE_KEY = "naseri-lang";

/* External store for language preference (localStorage-backed).
   useSyncExternalStore keeps SSR-safe hydration and avoids
   setState-inside-effect. */
const listeners = new Set<() => void>();
let currentLang: Lang | null = null; // null = not yet read on client

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

function getSnapshot(): Lang {
  if (currentLang === null) {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      currentLang = saved === "en" ? "en" : "fa";
    } catch {
      currentLang = "fa";
    }
  }
  return currentLang;
}

function getServerSnapshot(): Lang {
  return "fa";
}

function setLang(next: Lang) {
  currentLang = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* storage unavailable — ignore */
  }
  listeners.forEach((cb) => cb());
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const lang = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Keep <html> lang/dir in sync with the active language
  useEffect(() => {
    const t = dict[lang];
    document.documentElement.lang = lang;
    document.documentElement.dir = t.dir;
  }, [lang]);

  const toggleLang = () => setLang(lang === "fa" ? "en" : "fa");

  return (
    <LangContext.Provider value={{ lang, t: dict[lang] as (typeof dict)["fa"], toggleLang }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useLang must be used inside LanguageProvider");
  return ctx;
}
