/* اسکن پوشهٔ public/sher/songs برای بازی «شعر یادت نره» — node خالص، بدون وابستگی.
   فهرست mp3/wav/m4a/ogg/flac را می‌خواند و src/data/sher-manifest.json می‌سازد.
   فایل حذف‌شده از پوشه در manifest نمی‌آید؛ پوشهٔ نبود = manifest خالی. */
import { mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const songsDir = path.join(repo, "public", "sher", "songs");
const outFile = path.join(repo, "src", "data", "sher-manifest.json");
const EXTENSIONS = new Set([".mp3", ".wav", ".m4a", ".ogg", ".flac"]);

let files = [];
try {
  files = readdirSync(songsDir)
    .filter((name) => EXTENSIONS.has(path.extname(name).toLowerCase()))
    .filter((name) => {
      try {
        return statSync(path.join(songsDir, name)).isFile();
      } catch {
        return false;
      }
    })
    .map((name) => ({
      filename: name, // فقط نام فایل، بدون مسیر
      size: statSync(path.join(songsDir, name)).size,
    }))
    .sort((a, b) => a.filename.localeCompare(b.filename));
} catch {
  files = []; // پوشه نبود یا خوانده نشد — manifest خالی می‌سازیم
}

mkdirSync(path.dirname(outFile), { recursive: true });
writeFileSync(
  outFile,
  JSON.stringify({ generatedAt: new Date().toISOString(), files }, null, 2) + "\n",
  "utf-8",
);
console.log(`sher_scan: ${files.length} فایل صوتی در sher-manifest.json ثبت شد.`);
