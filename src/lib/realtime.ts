"use client";

/* مدیر اتصال لحظه‌ای آرنا (SSE) — سمت کلاینت.
   چند کامپوننت می‌توانند به یک اسکوپ مشترک شوند (مثلاً وضعیت اتاق و چت
   همان اتاق) اما فقط «یک» اتصال باز می‌شود؛ با خروج آخرین مشترک، اتصال
   بسته می‌شود. قطع‌ووصل با backoff خودکار، پخش پیام‌های چت با کرسر هر
   مشترک و حذف پیام تکراری، و اطلاع وضعیت (live/connecting/offline). */

import type { ArenaRoomSummary, ArenaStateResponse, ChatMsgView } from "@/lib/types";

export type StreamStatus = "connecting" | "live" | "offline";

export type StreamHandlers = {
  /** کرسر چت از بارگذاری اولیه — پیام‌های قدیمی‌تر دوباره پخش نمی‌شوند */
  initialChatCursor?: number;
  onState?: (st: ArenaStateResponse) => void;
  onChat?: (msgs: ChatMsgView[]) => void;
  onRooms?: (rooms: ArenaRoomSummary[], maxRooms: number) => void;
  onStatus?: (status: StreamStatus) => void;
  onGone?: () => void;
};

type Sub = { h: StreamHandlers; cursor: number };

type Entry = {
  kind: "room" | "lobby";
  code: string;
  subs: Map<symbol, Sub>;
  es: EventSource | null;
  chatCursor: number;
  buf: ChatMsgView[];
  status: StreamStatus;
  attempts: number;
  dead: boolean; // اتاق پریده — دیگر reconnect نمی‌کنیم
  timer: ReturnType<typeof setTimeout> | null;
};

const entries = new Map<string, Entry>();
const MAX_BUF = 300;

function entryKey(kind: "room" | "lobby", code: string): string {
  return kind === "room" ? `room:${code}` : "lobby";
}

function setStatus(e: Entry, s: StreamStatus): void {
  if (e.status === s) return;
  e.status = s;
  for (const { h } of e.subs.values()) h.onStatus?.(s);
}

function deliverChat(e: Entry, incoming: ChatMsgView[]): void {
  for (const sub of e.subs.values()) {
    const fresh = incoming.filter((m) => m.id > sub.cursor);
    if (fresh.length === 0) continue;
    sub.cursor = fresh[fresh.length - 1].id;
    sub.h.onChat?.(fresh);
  }
}

function openEntry(e: Entry): void {
  if (e.dead || e.es) return;
  setStatus(e, "connecting");

  const url = `/api/arena/stream?mode=${e.kind}${
    e.kind === "room" ? `&code=${encodeURIComponent(e.code)}` : ""
  }&after=${e.chatCursor}`;
  const es = new EventSource(url);
  e.es = es;

  const closeSocket = () => {
    es.close();
    if (e.es === es) e.es = null;
  };

  es.addEventListener("hello", () => {
    e.attempts = 0;
    setStatus(e, "live");
  });

  es.addEventListener("state", (ev) => {
    try {
      const st = JSON.parse((ev as MessageEvent).data) as ArenaStateResponse;
      for (const { h } of e.subs.values()) h.onState?.(st);
    } catch {
      /* داده خراب — دور بعد */
    }
  });

  es.addEventListener("chat", (ev) => {
    try {
      const msgs = JSON.parse((ev as MessageEvent).data) as ChatMsgView[];
      if (!Array.isArray(msgs) || msgs.length === 0) return;
      e.buf = [...e.buf, ...msgs].slice(-MAX_BUF);
      const last = msgs[msgs.length - 1].id;
      if (last > e.chatCursor) e.chatCursor = last;
      deliverChat(e, msgs);
    } catch {
      /* داده خراب — دور بعد */
    }
  });

  es.addEventListener("rooms", (ev) => {
    try {
      const data = JSON.parse((ev as MessageEvent).data) as {
        rooms: ArenaRoomSummary[];
        maxRooms: number;
      };
      for (const { h } of e.subs.values()) h.onRooms?.(data.rooms ?? [], data.maxRooms ?? 30);
    } catch {
      /* داده خراب — دور بعد */
    }
  });

  es.addEventListener("gone", () => {
    e.dead = true;
    closeSocket();
    setStatus(e, "offline");
    for (const { h } of e.subs.values()) h.onGone?.();
  });

  es.onerror = () => {
    closeSocket();
    if (e.dead) return;
    setStatus(e, "offline");
    const delay = Math.min(5_000, 700 * 2 ** Math.min(e.attempts, 3));
    e.attempts += 1;
    e.timer = setTimeout(() => {
      e.timer = null;
      openEntry(e);
    }, delay);
  };
}

/** تلاش فوری اتصال — بعد از برگشت شبکه یا تب فعال */
function kick(e: Entry): void {
  if (e.dead || e.es) return;
  if (e.timer) {
    clearTimeout(e.timer);
    e.timer = null;
  }
  openEntry(e);
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    for (const e of entries.values()) kick(e);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      for (const e of entries.values()) kick(e);
    }
  });
}

/** اشتراک در استریم یک اسکوپ — تابع خروجی، لغو اشتراک است */
export function subscribeStream(
  kind: "room" | "lobby",
  code: string,
  handlers: StreamHandlers,
): () => void {
  const key = entryKey(kind, code);
  let e = entries.get(key);
  if (!e) {
    e = {
      kind,
      code,
      subs: new Map(),
      es: null,
      chatCursor: 0,
      buf: [],
      status: "connecting",
      attempts: 0,
      dead: false,
      timer: null,
    };
    entries.set(key, e);
    openEntry(e);
  }

  const id = Symbol("sub");
  const sub: Sub = { h: handlers, cursor: handlers.initialChatCursor ?? 0 };
  e.subs.set(id, sub);

  /* پیام‌های رسیده بین بارگذاری اولیه و همین اشتراک — از بافر پخش می‌شود */
  const pending = e.buf.filter((m) => m.id > sub.cursor);
  if (pending.length) {
    sub.cursor = pending[pending.length - 1].id;
    handlers.onChat?.(pending);
  }
  handlers.onStatus?.(e.status);

  return () => {
    e.subs.delete(id);
    if (e.subs.size === 0) {
      if (e.timer) {
        clearTimeout(e.timer);
        e.timer = null;
      }
      e.es?.close();
      e.es = null;
      entries.delete(key);
    }
  };
}
