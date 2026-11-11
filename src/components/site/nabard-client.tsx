"use client";

/* بازی «نبرد دایره‌ها» در اتاق آرنا — کلاینت شبیه‌سازی قطعی.
   همه دستگاه‌ها با seed و گام زمانی یکسان، همان مسابقه را ۶۰ فریم می‌سازند.
   لایهٔ شبکه (همان شیوهٔ «میدان آتش»):
   • مسیر مستقیم WebRTC DataChannel مهمان↔میزبان — شتاب و اسنپ‌شات ۱۰هرتزی
     روی کانال UDP-مانند؛ سیگنالینگ (SDP/ICE) از مسیر اتاق (action) عبور می‌کند.
   • مسیر سروری (SSE) پشتیبان است و اگر پیوند مستقیم باز نشود بی‌صدا کار می‌کند.
   • ضدتکرار با nonce — شتابی که از هر دو مسیر برسد فقط یک‌بار اعمال می‌شود. */

import { useCallback, useEffect, useRef, useState } from "react";
import { Crown, Loader2, Timer, Users, Wifi, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLang } from "@/components/site/language-provider";
import { RtcLink } from "@/components/site/fire-rtc";
import {
  applySnap,
  encodeSnap,
  MAX_BOOSTS,
  NABARD_COLORS,
  NabardEngine,
  TIMESTEP,
  type NabardSnap,
} from "@/lib/nabard-engine";
import type { ArenaStateResponse } from "@/lib/types";

const PRIZE_GLYPH: Record<string, string> = {
  shield: "🛡️",
  heart: "❤️",
  spike: "⚡",
  bomb: "💣",
};

type Props = {
  st: ArenaStateResponse;
  offsetMs: number; // ساعت سرور ≈ Date.now() + offsetMs
  sendAction: (body: Record<string, unknown>) => Promise<boolean>;
};

export function NabardClient({ st, offsetMs, sendAction }: Props) {
  const { lang } = useLang();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const engineRef = useRef<NabardEngine | null>(null);
  const stRef = useRef(st);
  const offsetRef = useRef(offsetMs);
  const bqAppliedRef = useRef(0);
  const lastSnapTRef = useRef(0);
  const finishedRef = useRef(false);
  const aliveRef = useRef(true);
  const staleRef = useRef(0); // آخرین زمانی که اسنپ تازه دیدیم

  /* ---------- پیوندهای مستقیم WebRTC — همان شیوهٔ «میدان آتش» ----------
     شتاب و اسنپ‌شات از کانال UDP-مانند مستقیم مهمان↔میزبان می‌روند؛
     مسیر سروری (SSE) همان‌طور که بود کار می‌کند و پشتیبان است.
     ضدتکرار با nonce — یک شتاب هرگز دوبار اعمال نمی‌شود. */
  const sendActionRef = useRef(sendAction);
  sendActionRef.current = sendAction;

  const rtcPeersRef = useRef<Map<string, RtcLink>>(new Map());
  const rtcOpenRef = useRef(false); // مهمان: کانال مستقیم با میزبان باز است
  const rtcTryRef = useRef<{ n: number; timer: number | null }>({ n: 0, timer: null });
  const rtcDialRef = useRef<(peer: string) => void>(() => {});
  const sigSeenRef = useRef<string[]>([]); // سیگنال‌های پردازش‌شده
  const nonceSeenRef = useRef<string[]>([]); // شتاب‌های اعمال‌شده بین دو مسیر
  const dcQRef = useRef<{ id: string; at: number; n?: string }[]>([]); // شتاب‌های رسیده از مسیر مستقیم
  const dcSnapAtRef = useRef(0); // آخرین اسنپ‌شات مسیر مستقیم
  const seqRef = useRef(0); // شمارنده nonce
  const [netMode, setNetMode] = useState<"p2p" | "relay">("relay");

  const nonceMark = useCallback((n?: string) => {
    if (!n) return;
    const s = nonceSeenRef.current;
    if (s.indexOf(n) >= 0) return;
    s.push(n);
    if (s.length > 160) nonceSeenRef.current = s.slice(-120);
  }, []);
  const nonceSeen = useCallback(
    (n?: string) => Boolean(n) && nonceSeenRef.current.indexOf(n as string) >= 0,
    [],
  );

  const [hud, setHud] = useState({ time: 0, alive: 0, phase: "countdown" as string, sudden: false });
  const [boostTick, setBoostTick] = useState(0);
  const [size, setSize] = useState(480);

  stRef.current = st;
  offsetRef.current = offsetMs;

  const nb = st.nabard;
  const isHost = Boolean(nb?.isHost);
  const meId = st.me;
  const faNum = (n: number) => new Intl.NumberFormat(lang === "fa" ? "fa-IR" : "en-US").format(n);

  /* ---------- ساخت موتور (یک بار برای هر مسابقه) ---------- */
  useEffect(() => {
    if (!nb || engineRef.current) return;
    engineRef.current = new NabardEngine(nb.players, nb.seed);
    bqAppliedRef.current = 0;
    lastSnapTRef.current = 0;
    finishedRef.current = false;
    /* ری‌ست لایهٔ مسیر مستقیم برای مسابقهٔ تازه */
    sigSeenRef.current = [];
    nonceSeenRef.current = [];
    dcQRef.current = [];
    dcSnapAtRef.current = 0;
    for (const lk of rtcPeersRef.current.values()) lk.close();
    rtcPeersRef.current.clear();
    rtcOpenRef.current = false;
    setNetMode("relay");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nb?.startedAtMs, nb?.seed]);

  /* ---------- اندازه کنوس ---------- */
  useEffect(() => {
    function measure() {
      const w = wrapRef.current?.clientWidth ?? 480;
      setSize(Math.max(280, Math.min(560, w)));
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  /* ---------- پیام‌های روی کانال مستقیم ---------- */
  const handleRtcData = useCallback(
    (uid: string, str: string, reply: (out: string) => void) => {
      let d: Record<string, unknown>;
      try {
        d = JSON.parse(str) as Record<string, unknown>;
      } catch {
        return;
      }
      const e = engineRef.current;
      const cur = stRef.current;
      const n = cur.nabard;
      if (!e || !n) return;

      if (n.isHost) {
        /* میزبان: پینگ مهمان را جواب می‌دهد؛ شتاب مهمان را موتور مرجع اعمال
           می‌کند و به بقیهٔ پیوندهای مستقیم + مسیر سروری پخش می‌شود */
        if (d.t === "p") {
          if (typeof d.ts === "number") reply(JSON.stringify({ t: "q", ts: d.ts }));
          return;
        }
        if (d.t !== "b" || typeof d.n !== "string") return;
        if (nonceSeen(d.n)) return;
        if (!e.boost(uid)) {
          nonceMark(d.n); /* موتور رد کرد (سقف/حذف‌شده) — دوباره نمی‌آید */
          return;
        }
        nonceMark(d.n);
        const ts = Date.now() + offsetRef.current;
        const msg = JSON.stringify({ t: "b", id: uid, ts, n: d.n });
        for (const [pid, lk] of rtcPeersRef.current) {
          if (pid !== uid && lk.open) lk.send(msg);
        }
        void sendActionRef.current({ type: "boost", id: uid, n: d.n });
        return;
      }

      /* مهمان: فقط پیام‌های میزبان معتبر است */
      if (uid !== cur.room.hostId) return;
      if (d.t === "q") return; /* پاسخ پینگ — نشان «مستقیم» در onOpen گذاشته شده */
      if (d.t === "b" && typeof d.id === "string" && typeof d.ts === "number") {
        if (dcQRef.current.length > 32) return;
        dcQRef.current.push({
          id: d.id,
          at: Math.max(0, (d.ts - n.startedAtMs) / 1000),
          n: typeof d.n === "string" ? d.n : undefined,
        });
        return;
      }
      if (d.t === "s" && typeof d.s === "object" && d.s !== null) {
        const s = d.s as { t?: unknown; el?: unknown; cs?: unknown };
        if (typeof s.t !== "number" || typeof s.el !== "number" || !Array.isArray(s.cs)) return;
        if (Date.now() - dcSnapAtRef.current < 60) return; /* نگهبان نرخ */
        dcSnapAtRef.current = Date.now();
        staleRef.current = Date.now();
        applySnap(e, { t: s.t, el: s.el, cs: s.cs as NabardSnap["cs"] }, 0.15);
      }
    },
    [nonceMark, nonceSeen],
  );

  /* ---------- سیگنالینگ — از مسیر اتاق (action) عبور می‌کند ---------- */
  const rtcSignalSend = useCallback(
    (
      to: string,
      sig:
        | { k: "offer"; sdp: string }
        | { k: "answer"; sdp: string }
        | { k: "ice"; cs: RTCIceCandidateInit[] },
    ) => {
      const body: Record<string, unknown> = { type: "rtc", to, k: sig.k };
      if (sig.k === "ice") body.cs = sig.cs;
      else body.sdp = sig.sdp;
      void sendActionRef.current(body);
    },
    [],
  );

  const startRtc = useCallback(
    (initiator: boolean, peerId: string): void => {
      if (!peerId || typeof RTCPeerConnection === "undefined") return;
      const old = rtcPeersRef.current.get(peerId);
      if (old && old.open) return; /* پیوند سالم — دست نمی‌زنیم */
      if (old) old.close();
      const retryHost = (): void => {
        if (rtcTryRef.current.n >= 4) return;
        const n = rtcTryRef.current.n + 1;
        rtcTryRef.current.n = n;
        if (rtcTryRef.current.timer) window.clearTimeout(rtcTryRef.current.timer);
        rtcTryRef.current.timer = window.setTimeout(
          () => {
            rtcTryRef.current.timer = null;
            const nb2 = stRef.current.nabard;
            if (!nb2 || nb2.isHost || rtcOpenRef.current) return;
            rtcDialRef.current(stRef.current.room.hostId);
          },
          5000 + n * 2000,
        );
      };
      const link = new RtcLink({
        initiator,
        onSignal: (s) => rtcSignalSend(peerId, s),
        onMessage: (str) => handleRtcData(peerId, str, (out) => link.send(out)),
        onOpen: () => {
          if (initiator) {
            rtcOpenRef.current = true;
            rtcTryRef.current.n = 0;
            if (rtcTryRef.current.timer) {
              window.clearTimeout(rtcTryRef.current.timer);
              rtcTryRef.current.timer = null;
            }
            setNetMode("p2p");
          }
        },
        onDown: () => {
          if (rtcPeersRef.current.get(peerId) !== link) return;
          if (initiator) {
            rtcOpenRef.current = false;
            setNetMode("relay");
            retryHost(); /* تلاش دوباره با فاصلهٔ فزاینده — تا ۴ بار */
          } else {
            rtcPeersRef.current.delete(peerId);
            link.close();
          }
        },
      });
      rtcPeersRef.current.set(peerId, link);
      if (initiator) {
        void link.offer().catch(() => {
          /* ignore */
        });
        /* نگهبان: اگر ۱۲ ثانیه باز نشد، همین پیوند را رها کن و دوباره تلاش کن */
        window.setTimeout(() => {
          if (rtcPeersRef.current.get(peerId) !== link || link.open || link.closedByUs) return;
          link.close();
          rtcPeersRef.current.delete(peerId);
          if (peerId === stRef.current.room.hostId) retryHost();
        }, 12000);
      }
    },
    [handleRtcData, rtcSignalSend],
  );

  /* شماره‌گیری دوباره پس از تعریف — در effect تا قاعدهٔ refs/renders رعایت شود */
  useEffect(() => {
    rtcDialRef.current = (peer: string) => startRtc(true, peer);
  }, [startRtc]);

  /* ---------- پردازش سیگنالینگ رسیده از مسیر اتاق ---------- */
  useEffect(() => {
    const sigs = st.nabard?.sig ?? [];
    if (sigs.length === 0) return;
    for (const s of sigs) {
      if (sigSeenRef.current.indexOf(s.i) >= 0) continue;
      sigSeenRef.current.push(s.i);
      if (sigSeenRef.current.length > 200) sigSeenRef.current = sigSeenRef.current.slice(-120);
      try {
        if (s.k === "offer" && typeof s.sdp === "string") {
          if (rtcPeersRef.current.get(s.f)?.open) continue; /* پیوند سالم موجود است */
          startRtc(false, s.f);
          void rtcPeersRef.current
            .get(s.f)
            ?.acceptOffer(s.sdp)
            .catch(() => {
              /* ignore */
            });
        } else if (s.k === "answer" && typeof s.sdp === "string") {
          void rtcPeersRef.current
            .get(s.f)
            ?.acceptAnswer(s.sdp)
            .catch(() => {
              /* ignore */
            });
        } else if (s.k === "ice" && Array.isArray(s.cs)) {
          rtcPeersRef.current.get(s.f)?.addIce(s.cs as RTCIceCandidateInit[]);
        }
      } catch {
        /* ignore */
      }
    }
  }, [st, startRtc]);

  /* ---------- مهمان: شماره‌گیری میزبان به‌محض ورود به مسابقه ---------- */
  const hostId = st.room.hostId;
  useEffect(() => {
    if (isHost) return;
    if (typeof RTCPeerConnection === "undefined") return;
    if (rtcTryRef.current.timer) {
      window.clearTimeout(rtcTryRef.current.timer);
      rtcTryRef.current.timer = null;
    }
    rtcTryRef.current = { n: 0, timer: null };
    rtcOpenRef.current = false;
    if (hostId) rtcDialRef.current(hostId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, hostId, nb?.seed]);

  /* ---------- میزبان: اسنپ‌شات پرتکرار روی مسیر مستقیم (۱۰ هرتز) ---------- */
  useEffect(() => {
    if (!isHost) return;
    const id = setInterval(() => {
      const e = engineRef.current;
      if (!e || e.phase !== "playing") return;
      if (rtcPeersRef.current.size === 0) return;
      const snap = encodeSnap(e, Date.now() + offsetRef.current);
      const msg = JSON.stringify({ t: "s", s: snap });
      for (const lk of rtcPeersRef.current.values()) {
        if (lk.open) lk.send(msg);
      }
    }, 100);
    return () => clearInterval(id);
  }, [isHost]);

  /* ---------- مهمان: پینگ دوره‌ای — زنده‌نگه‌داشتن مسیر مستقیم ---------- */
  useEffect(() => {
    if (isHost) return;
    const id = setInterval(() => {
      if (!rtcOpenRef.current) return;
      const lk = rtcPeersRef.current.get(stRef.current.room.hostId);
      if (lk?.open) lk.send(JSON.stringify({ t: "p", ts: performance.now() }));
    }, 2000);
    return () => clearInterval(id);
  }, [isHost]);

  /* ---------- پاک‌سازی پیوندها هنگام خروج ---------- */
  useEffect(() => {
    return () => {
      for (const lk of rtcPeersRef.current.values()) lk.close();
      rtcPeersRef.current.clear();
      rtcOpenRef.current = false;
      if (rtcTryRef.current.timer) {
        window.clearTimeout(rtcTryRef.current.timer);
        rtcTryRef.current.timer = null;
      }
    };
  }, []);

  /* ---------- حلقه شبیه‌سازی + رندر ---------- */
  useEffect(() => {
    aliveRef.current = true;
    let raf = 0;
    let frame = 0;

    function loop() {
      if (!aliveRef.current) return;
      const e = engineRef.current;
      const cur = stRef.current;
      const n = cur.nabard;
      if (e && n) {
        const serverNow = Date.now() + offsetRef.current;
        const target = (serverNow - n.startedAtMs) / 1000;
        let steps = 0;
        while (e.time < target && steps < 600) {
          e.step(TIMESTEP);
          steps++;
        }
        if (e.time < target) e.time = target; // اضطراری: پرش بلند پس از برگشت به تب

        /* صف شتاب‌ها از مسیر سروری — ضدتکرار با nonce؛ خودم را محلی اعمال کرده‌ام */
        const bq = n.bq;
        for (let i = bqAppliedRef.current; i < bq.length; i++) {
          const item = bq[i];
          const at = Math.max(0, (item.t - n.startedAtMs) / 1000);
          if (e.time >= at - 0.15) {
            if (item.n) {
              if (!nonceSeen(item.n)) {
                nonceMark(item.n);
                if (item.id !== cur.me) e.boost(item.id);
              }
            } else if (item.id !== cur.me) {
              e.boost(item.id);
            }
            bqAppliedRef.current = i + 1;
          } else {
            break;
          }
        }

        /* شتاب‌های رسیده از مسیر مستقیم — همان قاعدهٔ زمانی؛ ضدتکرار با nonce */
        if (dcQRef.current.length > 0) {
          const keep: { id: string; at: number; n?: string }[] = [];
          for (const it of dcQRef.current) {
            if (e.time >= it.at - 0.15) {
              if (!nonceSeen(it.n)) {
                nonceMark(it.n);
                if (it.id !== cur.me) e.boost(it.id);
              }
            } else {
              keep.push(it);
            }
          }
          dcQRef.current = keep;
        }

        /* اصلاح نرم با اسنپ‌شات میزبان.
           مهمانی که مسیر مستقیم باز دارد اسنپ ۱۰هرتزی مستقیم می‌گیرد —
           نسخهٔ سروری فقط وقتی پشتیبانی می‌کند که مسیر مستقیم تازه نباشد. */
        const dcFresh = Date.now() - dcSnapAtRef.current < 700;
        if (n.snap && n.snap.t !== lastSnapTRef.current) {
          if (!dcFresh || n.isHost) {
            lastSnapTRef.current = n.snap.t;
            staleRef.current = Date.now();
            applySnap(e, n.snap, dcFresh ? 0.15 : 0.3);
          }
        }

        /* پایان مسابقه → میزبان نتیجه را ثبت می‌کند */
        if (e.phase === "over" && !finishedRef.current) {
          finishedRef.current = true;
          if (n.isHost) {
            void sendAction({ type: "finish", ranking: e.getRanking() });
          }
        }

        /* رندر */
        const canvas = canvasRef.current;
        if (canvas) {
          const dpr = Math.min(2, window.devicePixelRatio || 1);
          if (canvas.width !== size * dpr) {
            canvas.width = size * dpr;
            canvas.height = size * dpr;
          }
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            drawGame(ctx, e, size, performance.now() / 1000);
          }
        }

        /* HUD با نرخ کم */
        if (frame % 15 === 0) {
          setHud({
            time: e.time,
            alive: e.circles.filter((c) => c.alive).length,
            phase: e.phase,
            sudden: e.sudden,
          });
        }
        frame++;
      }
      raf = requestAnimationFrame(loop);
    }

    raf = requestAnimationFrame(loop);
    return () => {
      aliveRef.current = false;
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, sendAction]);

  /* ---------- اسنپ‌شات دوره‌ای میزبان ---------- */
  useEffect(() => {
    if (!isHost) return;
    const id = setInterval(() => {
      const e = engineRef.current;
      if (!e || e.phase !== "playing") return;
      const snap = encodeSnap(e, Date.now() + offsetRef.current);
      void sendAction({ type: "snap", el: snap.el, cs: snap.cs });
    }, 1000);
    return () => clearInterval(id);
  }, [isHost, sendAction]);

  /* ---------- شتاب ---------- */
  const myCircle = engineRef.current?.byId.get(meId);
  const boostsLeft = myCircle
    ? MAX_BOOSTS - (engineRef.current?.boostUsed[meId] ?? 0)
    : MAX_BOOSTS;
  const iAmOut = Boolean(myCircle && !myCircle.alive);
  const canBoost = Boolean(nb) && hud.phase === "playing" && !iAmOut && boostsLeft > 0;

  function doBoost() {
    const e = engineRef.current;
    if (!e || !canBoost) return;
    const n = `${meId.slice(0, 8)}-${(seqRef.current++).toString(36)}-${Date.now().toString(36)}`;
    if (e.boost(meId)) {
      nonceMark(n); /* شتاب خودم — اعمال شد؛ در هیچ مسیری دوباره اعمال نمی‌شود */
      setBoostTick((x) => x + 1);
      let sent = false;
      if (!isHost) {
        /* مهمان: اول مسیر مستقیم — اگر باز بود، میزبان ثبت سروری را هم انجام می‌دهد */
        const lk = rtcPeersRef.current.get(st.room.hostId);
        if (lk?.open) sent = lk.send(JSON.stringify({ t: "b", n }));
      } else {
        /* میزبان: پخش مستقیم به همهٔ پیوندها + ثبت سروری برای مسیر پشتیبان */
        const ts = Date.now() + offsetRef.current;
        const msg = JSON.stringify({ t: "b", id: meId, ts, n });
        for (const lk of rtcPeersRef.current.values()) {
          if (lk.open) lk.send(msg);
        }
      }
      if (!sent) void sendAction({ type: "boost", n });
    }
  }

  if (!nb) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-600" aria-hidden="true" />
      </div>
    );
  }

  const mm = Math.floor(Math.max(0, hud.time) / 60);
  const ss = Math.floor(Math.max(0, hud.time) % 60);
  const stale = Date.now() - staleRef.current > 6000 && hud.phase === "playing";

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6" data-boost-tick={boostTick}>
      {/* نوار بالا */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-black text-zinc-50">{lang === "fa" ? "نبرد دایره‌ها" : "Circle Battle"}</h1>
        <div className="flex items-center gap-2 text-xs font-bold">
          <span className="flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1.5 text-zinc-300">
            <Timer className="h-3.5 w-3.5" aria-hidden="true" />
            <span dir="ltr" className="tabular-nums">
              {String(mm).padStart(2, "0")}:{String(ss).padStart(2, "0")}
            </span>
          </span>
          <span className="flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1.5 text-zinc-300">
            <Users className="h-3.5 w-3.5" aria-hidden="true" />
            {faNum(hud.alive)} {lang === "fa" ? "زنده" : "alive"}
          </span>
          {!isHost && (
            <span
              className={`rounded-full border px-3 py-1.5 ${
                netMode === "p2p"
                  ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
                  : "border-zinc-800 bg-zinc-900/60 text-zinc-400"
              }`}
              title={lang === "fa" ? "مسیر ارتباط بازی" : "game network path"}
            >
              {netMode === "p2p" ? (lang === "fa" ? "مستقیم P2P" : "Direct P2P") : lang === "fa" ? "رله" : "relay"}
            </span>
          )}
          {hud.sudden && (
            <span className="animate-pulse rounded-full border border-rose-500/50 bg-rose-500/15 px-3 py-1.5 text-rose-300">
              {lang === "fa" ? "مرگ ناگهانی!" : "Sudden death!"}
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-5 lg:grid-cols-[1fr_270px]">
        {/* آرنا */}
        <div>
          <div
            ref={wrapRef}
            className="relative flex items-center justify-center overflow-hidden rounded-2xl border border-zinc-800 bg-[#0a0c10] p-2"
          >
            <canvas
              ref={canvasRef}
              style={{ width: size, height: size }}
              className="max-w-full rounded-xl"
              aria-label={lang === "fa" ? "میدان نبرد" : "battle arena"}
            />
            {iAmOut && hud.phase === "playing" && (
              <div className="pointer-events-none absolute rounded-full border border-rose-500/50 bg-rose-500/15 px-5 py-2 text-sm font-bold text-rose-300 backdrop-blur">
                {lang === "fa" ? "حذف شدی — تماشا کن!" : "You're out — spectating"}
              </div>
            )}
          </div>

          {/* دکمه شتاب */}
          <Button
            onClick={doBoost}
            disabled={!canBoost}
            className="mt-4 h-14 w-full rounded-2xl bg-lime-400 text-lg font-black text-zinc-950 shadow-[0_0_30px_rgba(163,230,53,0.35)] hover:bg-lime-300 disabled:opacity-40 disabled:shadow-none"
          >
            <Zap className="h-5 w-5" aria-hidden="true" />
            {lang === "fa" ? "شتاب!" : "Boost!"}
            <span className="text-sm font-bold opacity-80">
              ({faNum(Math.max(0, boostsLeft))}/{faNum(MAX_BOOSTS)})
            </span>
          </Button>

          {stale && (
            <p className="mt-3 flex items-center justify-center gap-2 text-xs font-semibold text-amber-300">
              <Wifi className="h-3.5 w-3.5" aria-hidden="true" />
              {lang === "fa" ? "ارتباط با میزبان کند شده…" : "Host connection is slow…"}
            </p>
          )}
        </div>

        {/* بازیکنان */}
        <aside className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
          <h2 className="text-xs font-bold uppercase tracking-wide text-zinc-500">
            {lang === "fa" ? "بازیکنان" : "Players"}
          </h2>
          <ul className="mt-3 space-y-1.5">
            {(nb.players ?? []).map((p) => {
              const c = engineRef.current?.byId.get(p.id);
              const color = NABARD_COLORS[c?.colorIdx ?? 0];
              const lines = c ? countLines(c.mask) : 0;
              return (
                <li
                  key={p.id}
                  className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 ${
                    p.id === meId ? "bg-lime-400/10" : ""
                  } ${c && !c.alive ? "opacity-40" : ""}`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: color }}
                      aria-hidden="true"
                    />
                    <span
                      className={`truncate text-sm font-semibold text-zinc-200 ${
                        c && !c.alive ? "line-through" : ""
                      }`}
                    >
                      {p.name}
                    </span>
                    {p.id === st.room.hostId && (
                      <Crown className="h-3.5 w-3.5 shrink-0 text-amber-300" aria-hidden="true" />
                    )}
                  </span>
                  <span className="flex shrink-0 items-center gap-2 text-[11px] font-black tabular-nums text-zinc-400">
                    <span className="text-rose-300">
                      ♥ {faNum(lines)}
                    </span>
                    <span className="text-zinc-500">
                      {faNum(c?.kills ?? 0)} {lang === "fa" ? "حذف" : "KO"}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mt-4 border-t border-zinc-800 pt-3 text-[11px] leading-5 text-zinc-600">
            {lang === "fa"
              ? "با برخورد یک خط از حریف می‌گیری؛ ۳ ضربه از یک حریف یعنی انفجار! جایزه‌ها را بگیر: سپر، جان، تیغ — و از بمب فرار کن."
              : "Collisions steal a line; 3 hits from one rival = boom! Grab power-ups: shield, heart, spike — dodge the bomb."}
          </p>
        </aside>
      </div>
    </div>
  );
}

function countLines(mask: number): number {
  let c = mask;
  let n = 0;
  while (c) {
    c &= c - 1;
    n++;
  }
  return n;
}

/* ---------- رندر کنوس ---------- */

function drawGame(ctx: CanvasRenderingContext2D, e: NabardEngine, size: number, now: number): void {
  const cx = size / 2;
  const cy = size / 2;
  const scale = (size / 2 - 16) / 500;

  ctx.clearRect(0, 0, size, size);

  /* پس‌زمینه */
  const bg = ctx.createRadialGradient(cx, cy, size * 0.05, cx, cy, size * 0.75);
  bg.addColorStop(0, "#141922");
  bg.addColorStop(0.6, "#0d1118");
  bg.addColorStop(1, "#080a0f");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);

  /* دیواره آرنا */
  const wallR = e.arenaR * scale;
  ctx.save();
  if (e.sudden) {
    const pulse = 0.55 + 0.3 * Math.sin(now * 5);
    ctx.shadowColor = `rgba(255,60,80,${pulse})`;
    ctx.shadowBlur = 30;
    ctx.strokeStyle = `rgba(255,120,135,${0.7 + 0.2 * Math.sin(now * 5)})`;
  } else {
    ctx.shadowColor = "rgba(150,190,255,0.5)";
    ctx.shadowBlur = 22;
    ctx.strokeStyle = "rgba(214,228,245,0.9)";
  }
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.arc(cx, cy, wallR, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  /* جوایز */
  for (const p of e.prizes) {
    const px = cx + p.x * scale;
    const py = cy + p.y * scale;
    const pr = Math.max(9, 12 * scale);
    const glow = 0.6 + 0.3 * Math.sin(now * 6 + p.id * 1.7);
    const colors: Record<string, string> = {
      shield: "#4da3ff",
      heart: "#ff4fd8",
      spike: "#ffd60a",
      bomb: "#ff8a00",
    };
    const col = colors[p.kind] ?? "#ffffff";
    ctx.save();
    ctx.shadowColor = col;
    ctx.shadowBlur = 20 * glow;
    ctx.fillStyle = "rgba(10,12,18,0.9)";
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
    ctx.font = `${Math.round(pr * 1.1)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(PRIZE_GLYPH[p.kind] ?? "?", px, py + 1);
    /* حلقه زمان باقی‌مانده */
    const frac = Math.max(0, Math.min(1, p.ttl / 5));
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(px, py, pr + 4, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
    ctx.stroke();
  }

  /* دایره‌ها */
  const r = e.circleR * scale;
  for (const c of e.circles) {
    if (!c.alive) continue;
    const x = cx + c.x * scale;
    const y = cy + c.y * scale;
    const color = NABARD_COLORS[c.colorIdx];

    /* پرتو تیغ */
    if (c.spikeT > 0) {
      const blink = c.spikeT < 2 ? (Math.sin(now * 12) > 0 ? 1 : 0.35) : 1;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = `rgba(255,214,10,${0.85 * blink})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(c.angle) * (r + 1), y + Math.sin(c.angle) * (r + 1));
      ctx.lineTo(
        cx + (c.x + Math.cos(c.angle) * 500) * scale,
        cy + (c.y + Math.sin(c.angle) * 500) * scale,
      );
      ctx.stroke();
      ctx.restore();
    }

    /* بدنه */
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 14 + c.hitFlash * 26;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.6;
    const grad = ctx.createRadialGradient(x, y, 1, x, y, r);
    grad.addColorStop(0, hexA(color, 0.36));
    grad.addColorStop(1, "rgba(10,12,18,0.85)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    /* خط‌ها */
    ctx.fillStyle = color;
    for (let i = 0; i < 12; i++) {
      if ((c.mask & (1 << i)) === 0) continue;
      const a = c.raySpin + (i * Math.PI * 2) / 12;
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(x, y, 3.2, 0, Math.PI * 2);
    ctx.fill();

    if (c.hitFlash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${c.hitFlash * 0.45})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    /* سپر */
    if (c.shieldT > 0) {
      const blink = c.shieldT < 2 ? (Math.sin(now * 12) > 0 ? 1 : 0.3) : 1;
      ctx.strokeStyle = `rgba(96,178,255,${0.9 * blink})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(x, y, r + 5, 0, Math.PI * 2);
      ctx.stroke();
    }

    /* شتاب */
    if (c.boostT > 0) {
      ctx.strokeStyle = "rgba(200,255,46,0.9)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, r + 8 + Math.sin(now * 10) * 2, 0, Math.PI * 2);
      ctx.stroke();
    }

    /* نام */
    ctx.font = "600 11px Vazirmatn, Tahoma, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "rgba(255,255,255,0.82)";
    ctx.fillText(c.name, x, y + r + 14);
  }

  /* شمارش معکوس */
  if (e.phase === "countdown") {
    const n = Math.max(1, Math.ceil(e.countdownLeft));
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "#ffd60a";
    ctx.shadowBlur = 36;
    ctx.fillStyle = "#ffd60a";
    ctx.font = `800 ${Math.round(size * 0.18)}px Vazirmatn, Tahoma, sans-serif`;
    ctx.fillText(String(n), cx, cy);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.font = `500 ${Math.round(size * 0.032)}px Vazirmatn, Tahoma, sans-serif`;
    ctx.fillText("آماده باشید…", cx, cy + size * 0.14);
    ctx.restore();
  }
}

function hexA(hex: string, alpha: number): string {
  const v = hex.replace("#", "");
  const n = parseInt(v, 16);
  const rr = (n >> 16) & 255;
  const gg = (n >> 8) & 255;
  const bb = n & 255;
  return `rgba(${rr},${gg},${bb},${alpha})`;
}
