/* ================================================================
   عملیات گیت‌هاب برای آپلود/حذف آهنگ‌های «شعر یادت نره» — فقط سمت سرور
   ================================================================
   ورکل فایل‌سیستم فقط-خواندنی دارد، پس فایل صوتی به‌جای دیسک با
   GitHub Contents API در مسیر public/sher/songs روی شاخهٔ main کامیت
   می‌شود تا ورکل خودش deploy بزند و فایل استاتیک سرو شود.

   توکن عملیات پروداکشن از متغیر محیطی SHER_GITHUB_TOKEN خوانده می‌شود
   (باید در پنل Vercel تعریف شده باشد و دسترسی Contents: read/write روی
   مخزن داشته باشد). branch و token پارامتری هم هستند تا پروبِ محلی
   بتواند شاخهٔ آزمایشی و توکن جدا بدهد.

   مخزن مقصد ثابت است:
     owner: mahmoodnaseri987-pixel
     name:  naseri-fx
   ================================================================ */

const GITHUB_OWNER = "mahmoodnaseri987-pixel"; // مخزن ثابت وب‌سایت — تغییر ندهید
const GITHUB_REPO = "naseri-fx";
const DEFAULT_BRANCH = "main";
const TIMEOUT_MS = 20_000; // سقف هر درخواست به API گیت‌هاب

export type SherGithubResult = {
  ok: boolean;
  /** sha فایل پس از نوشتن، یا sha فعلی هنگام خواندن — در خطا نیست */
  sha?: string | null;
  /** فقط برای حذف: فایل از قبل وجود نداشت (حذف idempotent) */
  missing?: boolean;
  /** پیام خطای فارسی برای نمایش در پنل */
  error?: string;
};

type CallOptions = { branch?: string; token?: string };

/* توکن: مقدار صریح مقدم است، وگرنه متغیر محیطی پروداکشن */
function resolveToken(explicit?: string): string | null {
  const t = explicit ?? process.env.SHER_GITHUB_TOKEN ?? "";
  return t.trim() || null;
}

/* مسیر داخل مخزن → URL رست Contents API (هر سگمنت جدا انکود می‌شود) */
function contentsUrl(path: string): string {
  const encoded = path
    .split("/")
    .filter((seg) => seg.length > 0)
    .map(encodeURIComponent)
    .join("/");
  return `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encoded}`;
}

function headers(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
    "User-Agent": "naseri-fx-sher-admin",
  };
}

/* fetch با سقف زمانی — خطای شبکه/تایم‌اوت با پیام فارسی برمی‌گردد */
async function githubFetch(
  url: string,
  init: RequestInit,
): Promise<{ res?: Response; error?: string }> {
  try {
    const res = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    return { res };
  } catch (e) {
    const detail = e instanceof Error ? e.message : "";
    return {
      error: detail.includes("abort") || detail.includes("timeout")
        ? "اتصال به گیت‌هاب بیش از حد طول کشید (تایم‌اوت). چند لحظه بعد دوباره تلاش کنید."
        : `اتصال به گیت‌هاب برقرار نشد. ${detail}`.trim(),
    };
  }
}

/* بدنهٔ خطای API گیت‌هاب را اگر ممکن بود استخراج می‌کند */
async function apiErrorDetail(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { message?: string };
    if (j?.message) return j.message;
  } catch {
    /* بدنه JSON نبود */
  }
  return "";
}

/* ---------- خواندن sha فایل ---------- */

/** sha فایل موجود، یا {ok:true, sha:null} اگر نبود (404) */
export async function githubGetSha(
  path: string,
  opts: CallOptions = {},
): Promise<SherGithubResult> {
  const token = resolveToken(opts.token);
  if (!token)
    return { ok: false, error: "توکن گیت‌هاب (SHER_GITHUB_TOKEN) تنظیم نشده است — عملیات ممکن نیست." };

  const branch = opts.branch ?? DEFAULT_BRANCH;
  const { res, error } = await githubFetch(`${contentsUrl(path)}?ref=${encodeURIComponent(branch)}`, {
    method: "GET",
    headers: headers(token),
  });
  if (error) return { ok: false, error };
  if (!res) return { ok: false, error: "پاسخی از گیت‌هاب دریافت نشد." };

  if (res.status === 404) return { ok: true, sha: null };
  if (!res.ok) {
    const detail = await apiErrorDetail(res);
    return { ok: false, error: `خواندن فایل از گیت‌هاب ناموفق بود (کد ${res.status}). ${detail}`.trim() };
  }
  const j = (await res.json().catch(() => null)) as { sha?: string } | null;
  if (!j?.sha)
    return { ok: false, error: "پاسخ گیت‌هاب فاقد sha بود — ساختار پاسخ غیرمنتظره است." };
  return { ok: true, sha: j.sha };
}

/* ---------- نوشتن (کامیت) فایل ---------- */

/**
 * ساختن/به‌روزرسانی فایل در مخزن. اگر فایل از قبل باشد (422) اول sha
 * فعلی خوانده می‌شود و PUT با sha تکرار می‌شود (کامیتِ جایگزینی).
 */
export async function githubPutFile(
  path: string,
  contentBase64: string,
  message: string,
  opts: CallOptions = {},
): Promise<SherGithubResult> {
  const token = resolveToken(opts.token);
  if (!token)
    return { ok: false, error: "توکن گیت‌هاب (SHER_GITHUB_TOKEN) تنظیم نشده است — عملیات ممکن نیست." };

  const branch = opts.branch ?? DEFAULT_BRANCH;

  async function put(sha?: string): Promise<{ res: Response; status: number }> {
    const body: Record<string, unknown> = { message, content: contentBase64, branch };
    if (sha) body.sha = sha;
    const { res, error } = await githubFetch(contentsUrl(path), {
      method: "PUT",
      headers: headers(token as string),
      body: JSON.stringify(body),
    });
    if (error || !res) throw new Error(error ?? "پاسخی از گیت‌هاب دریافت نشد.");
    return { res, status: res.status };
  }

  try {
    const first = await put();
    if (first.res.ok) {
      const j = (await first.res.json().catch(() => null)) as { content?: { sha?: string } } | null;
      return { ok: true, sha: j?.content?.sha ?? null };
    }

    /* فایل از قبل هست و sha می‌خواهد — sha را بگیر و دوباره PUT کن */
    if (first.status === 422) {
      const got = await githubGetSha(path, { branch, token });
      if (!got.ok) return { ok: false, error: got.error };
      const second = await put(got.sha ?? undefined);
      if (second.res.ok) {
        const j = (await second.res.json().catch(() => null)) as
          | { content?: { sha?: string } }
          | null;
        return { ok: true, sha: j?.content?.sha ?? null };
      }
      const detail = await apiErrorDetail(second.res);
      return {
        ok: false,
        error: `کامیت فایل در گیت‌هاب ناموفق بود (کد ${second.status}). ${detail}`.trim(),
      };
    }

    const detail = await apiErrorDetail(first.res);
    return {
      ok: false,
      error: `کامیت فایل در گیت‌هاب ناموفق بود (کد ${first.status}). ${detail}`.trim(),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "خطای ناشناخته در ارتباط با گیت‌هاب." };
  }
}

/* ---------- حذف فایل ---------- */

/** حذف idempotent: فایل نبود هم موفقیت حساب می‌شود (missing:true) */
export async function githubDeleteFile(
  path: string,
  message: string,
  opts: CallOptions = {},
): Promise<SherGithubResult> {
  const token = resolveToken(opts.token);
  if (!token)
    return { ok: false, error: "توکن گیت‌هاب (SHER_GITHUB_TOKEN) تنظیم نشده است — عملیات ممکن نیست." };

  const branch = opts.branch ?? DEFAULT_BRANCH;

  const got = await githubGetSha(path, { branch, token });
  if (!got.ok) return { ok: false, error: got.error };
  if (got.sha == null) return { ok: true, missing: true };

  const { res, error } = await githubFetch(contentsUrl(path), {
    method: "DELETE",
    headers: headers(token),
    body: JSON.stringify({ message, sha: got.sha, branch }),
  });
  if (error) return { ok: false, error };
  if (!res) return { ok: false, error: "پاسخی از گیت‌هاب دریافت نشد." };

  if (res.ok) return { ok: true };
  /* بین GET و DELETE فایل حذف شده باشد — باز هم idempotent موفق */
  if (res.status === 404) return { ok: true, missing: true };
  const detail = await apiErrorDetail(res);
  return { ok: false, error: `حذف فایل از گیت‌هاب ناموفق بود (کد ${res.status}). ${detail}`.trim() };
}
