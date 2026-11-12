/* ================================================================
   تست زندهٔ r8: رمز اختصاصی بخش شعر + sherGuard
   ================================================================
   ۱) بدون کوکی → GET songs باید 401 بدهد.
   ۲) رمز غلط → 401 «رمز نادرست است» (فقط یک تلاش — rateLimit ۸/۱۰دقیقه).
   ۳) رمز درست nafas3375 → 200 + کوکی naseri_sher.
   ۴) با کوکی شعر → GET songs: 200 و فهرست پر.
   ۵) با کوکی شعر → upsert demo-1 با همان مقادیر فعلی (بدون تغییر داده — فقط مسیر نوشتن).
   ۶) کوکی مدیر کل سایت (از passwordHash دیتابیس ساخته می‌شود) → GET songs: 200.
   ۷) صفحهٔ /sher-admin بدون کوکی → HTML باید فرم ورود را داشته باشد (نه ریدایرکت).
   اجرا از ریشهٔ مخزن:
     npx esbuild --bundle --alias:@=./src --packages=external \
       scripts/sher_r8_live_test.ts --outfile=.sher-r8.tmp.mjs \
       --platform=node --format=esm --log-level=error \
       && DATABASE_URL=... node .sher-r8.tmp.mjs && rm .sher-r8.tmp.mjs
   ================================================================ */

import { createHmac } from "node:crypto";
import { db } from "@/lib/db";

const SITE = "https://mahmoudnaseri.vercel.app";
const SHER_PASSWORD = process.env.SHER_PASSWORD ?? "";
const DEMO = "demo-1.mp3";

function b64url(s: string): string {
  return Buffer.from(s, "utf-8").toString("base64url");
}

async function adminCookie(): Promise<string> {
  const rows = (await (db as unknown as {
    $queryRawUnsafe: (q: string) => Promise<unknown>;
  }).$queryRawUnsafe(`SELECT "passwordHash" FROM "Settings" WHERE id = 'main'`)) as {
    passwordHash: string;
  }[];
  const hash = rows[0]?.passwordHash;
  if (!hash) throw new Error("passwordHash در Settings نیست.");
  const payload = b64url(JSON.stringify({ exp: Date.now() + 7 * 24 * 3600 * 1000 }));
  const sig = createHmac("sha256", hash).update(payload).digest("hex");
  return `naseri_admin=${payload}.${sig}`;
}

async function post(
  path: string,
  body: unknown,
  cookie?: string,
): Promise<{ status: number; json: Record<string, unknown>; setCookie: string | null }> {
  const res = await fetch(`${SITE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
  });
  const sc = res.headers.get("set-cookie");
  return {
    status: res.status,
    json: (await res.json().catch(() => ({}))) as Record<string, unknown>,
    setCookie: sc ? sc.split(";")[0] : null,
  };
}

async function get(path: string, cookie?: string): Promise<{ status: number; json: unknown }> {
  const res = await fetch(`${SITE}${path}`, {
    headers: cookie ? { Cookie: cookie } : {},
    redirect: "manual",
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

let failed = 0;
function check(name: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed++;
}

async function main(): Promise<void> {
  if (!SHER_PASSWORD) throw new Error("SHER_PASSWORD تنظیم نشده است.");

  /* ۱) بدون کوکی */
  const anon = await get("/api/sher/admin/songs");
  check("بدون کوکی 401", anon.status === 401, `status=${anon.status}`);

  /* ۲) رمز غلط */
  const wrong = await post("/api/sher/admin/login", { password: "wrong-pass-123" });
  check("رمز غلط 401", wrong.status === 401, String(wrong.json.error ?? ""));

  /* ۳) رمز درست */
  const right = await post("/api/sher/admin/login", { password: SHER_PASSWORD });
  const sherCookie = right.setCookie;
  check(
    "رمز درست 200 + کوکی",
    right.status === 200 && right.json.ok === true && !!sherCookie && sherCookie.startsWith("naseri_sher="),
    sherCookie ? sherCookie.slice(0, 24) + "…" : "کوکی نداریم",
  );
  if (!sherCookie) throw new Error("کوکی شعر گرفته نشد — ادامه بی‌معنی است.");

  /* ۴) فهرست با کوکی شعر */
  const list = await get("/api/sher/admin/songs", sherCookie);
  const rows = (list.json as { songs?: { filename: string }[] })?.songs ?? [];
  check(
    "GET songs با کوکی شعر 200",
    list.status === 200 && rows.length > 0,
    `${rows.length} ردیف: ${rows.map((r) => r.filename).slice(0, 4).join("، ")}`,
  );

  /* ۵) ذخیرهٔ کلیپ demo-1 با همان مقادیر فعلی (مسیر نوشتن، بدون تغییر داده) */
  const demo = rows.find((r) => r.filename === DEMO);
  if (!demo) {
    check("demo-1 در فهرست", false, "demo-1 نیست — این مرحله رد شد");
  } else {
    const d = demo as unknown as Record<string, unknown>;
    const up = await post(
      "/api/sher/admin/songs/upsert",
      {
        filename: d.filename,
        title: d.title,
        artist: d.artist,
        clipStart: d.clipStart,
        answerLine: d.answerLine,
        contextLines: d.contextLines,
        extraLines: d.extraLines,
        active: d.active,
      },
      sherCookie,
    );
    check(
      "upsert با کوکی شعر",
      up.status === 200 && up.json.ok !== false,
      `status=${up.status} ${JSON.stringify(up.json).slice(0, 80)}`,
    );
    const list2 = await get("/api/sher/admin/songs", sherCookie);
    const rows2 = (list2.json as { songs?: { filename: string; clipStart: number }[] })?.songs ?? [];
    const demo2 = rows2.find((r) => r.filename === DEMO);
    check(
      "clipStart پس از ذخیره دست‌نخورده",
      !!demo2 && Math.abs(demo2.clipStart - Number(d.clipStart)) < 0.001,
      demo2 ? String(demo2.clipStart) : "پیدا نشد",
    );
  }

  /* ۶) کوکی مدیر کل سایت */
  const aCookie = await adminCookie();
  const adminList = await get("/api/sher/admin/songs", aCookie);
  check("GET songs با کوکی مدیر کل 200", adminList.status === 200, `status=${adminList.status}`);

  /* ۷) صفحه بدون کوکی → فرم ورود */
  const page = await get("/sher-admin");
  const html = typeof page.json === "string" ? page.json : "";
  check(
    "صفحهٔ /sher-admin بدون کوکی فرم ورود می‌دهد",
    page.status === 200 && html.includes("رمز") && !html.includes("sher-admin-client"),
    page.status === 200 ? "فرم ورود" : `status=${page.status}`,
  );

  await db.$disconnect();
  if (failed > 0) {
    console.error(`شکست: ${failed} چک قرمز بود.`);
    process.exit(1);
  }
  console.log("PASS — رمز بخش شعر و sherGuard زنده سبز است.");
}

main().catch((e) => {
  console.error("خطا:", e instanceof Error ? e.message : e);
  process.exit(1);
});
