/* ================================================================
   پروب محلی گیت‌هاب برای جریان آپلود آهنگ شعر
   ================================================================
   همان توابع src/lib/sher-github.ts را با شاخهٔ آزمایشی
   sher-upload-test اجرا می‌کند (نه main — تا deploy نزند):
     ۱) PUT فایل متنی کوچک probe/sher-github-probe.txt
     ۲) GET sha و مقایسه با خروجی PUT
     ۳) DELETE همان فایل
     ۴) GET برای اطمینان از 404 (حذف واقعی)
   توکن از متغیر محیطی GITHUB_TOKEN خوانده می‌شود (نه SHER_GITHUB_TOKEN —
   این اسکریپت فقط محلی است؛ .vercelignore پوشهٔ scripts/ را از بیلد ورکل
   حذف می‌کند و در پروداکشن اجرا نمی‌شود).
   اجرا از ریشهٔ مخزن:
     GITHUB_TOKEN=... npx esbuild --bundle --alias:@=./src \
       scripts/sher_github_probe.ts --outfile=/tmp/sher_github_probe.mjs \
       --platform=node --format=esm --log-level=error \
       && node /tmp/sher_github_probe.mjs
   ================================================================ */

import { githubDeleteFile, githubGetSha, githubPutFile } from "@/lib/sher-github";

const BRANCH = "sher-upload-test"; // شاخهٔ آزمایشی — هرگز main
const PROBE_PATH = "probe/sher-github-probe.txt";
const OWNER = "mahmoodnaseri987-pixel";
const REPO = "naseri-fx";
const API = `https://api.github.com/repos/${OWNER}/${REPO}`;

/* ابزارهای خام برای ساختن/حذف شاخهٔ آزمایشی — Contents API شاخهٔ غایب را نمی‌سازد */
function api(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "naseri-fx-sher-probe",
  };
}

async function ensureBranch(token: string): Promise<void> {
  const head = await fetch(`${API}/git/ref/heads/main`, { headers: api(token) });
  if (!head.ok) throw new Error(`خواندن سرِ main ناموفق بود (${head.status}).`);
  const sha = ((await head.json()) as { object?: { sha?: string } }).object?.sha;
  if (!sha) throw new Error("سرِ main فاقد sha بود.");
  const created = await fetch(`${API}/git/refs`, {
    method: "POST",
    headers: api(token),
    body: JSON.stringify({ ref: `refs/heads/${BRANCH}`, sha }),
  });
  if (created.status === 422) return; // شاخه از قبل هست — همان استفاده می‌شود
  if (!created.ok) throw new Error(`ساختن شاخهٔ آزمایشی ناموفق بود (${created.status}).`);
}

async function dropBranch(token: string): Promise<void> {
  await fetch(`${API}/git/refs/heads/${BRANCH}`, { method: "DELETE", headers: api(token) });
}

async function main(): Promise<void> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.error("خطا: متغیر محیطی GITHUB_TOKEN تنظیم نشده است.");
    process.exit(1);
  }
  const opts = { branch: BRANCH, token };

  /* ۰) شاخهٔ آزمایشی ساخته می‌شود (از سرِ main) و در پایان پاک می‌شود */
  try {
    await ensureBranch(token);
  } catch (e) {
    console.error("شکست: ساخت شاخهٔ آزمایشی ناموفق بود —", e instanceof Error ? e.message : e);
    process.exit(1);
  }
  process.on("exit", () => void dropBranch(token));

  /* ۱) PUT فایل آزمایشی */
  const content = Buffer.from(
    `sher github probe — ${new Date().toISOString()}\n`,
    "utf-8",
  ).toString("base64");
  const put = await githubPutFile(PROBE_PATH, content, "پروب شعر: ساخت فایل آزمایشی", opts);
  console.log("PUT  :", JSON.stringify(put));
  if (!put.ok || !put.sha) {
    console.error("شکست: PUT موفق نشد.");
    process.exit(1);
  }

  /* ۲) GET sha — باید با خروجی PUT یکی باشد */
  const got = await githubGetSha(PROBE_PATH, opts);
  console.log("GET  :", JSON.stringify(got));
  if (!got.ok || got.sha !== put.sha) {
    console.error("شکست: sha خوانده‌شده با خروجی PUT یکی نیست.");
    process.exit(1);
  }

  /* ۳) DELETE */
  const del = await githubDeleteFile(PROBE_PATH, "پروب شعر: حذف فایل آزمایشی", opts);
  console.log("DEL  :", JSON.stringify(del));
  if (!del.ok) {
    console.error("شکست: DELETE موفق نشد.");
    process.exit(1);
  }

  /* ۴) GET پس از حذف — باید 404 (sha:null) باشد */
  const after = await githubGetSha(PROBE_PATH, opts);
  console.log("GET* :", JSON.stringify(after));
  if (!after.ok || after.sha !== null) {
    console.error("شکست: فایل باید حذف شده باشد (انتظار 404).");
    process.exit(1);
  }

  console.log("پروب کامل شد: PUT → GET(sha یکسان) → DELETE → GET(404) همه موفق.");
}

main();
