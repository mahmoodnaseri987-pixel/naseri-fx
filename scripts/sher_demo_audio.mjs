/* ساخت ۵ فایل صدای نمونهٔ سینتِزشده برای بازی «شعر یادت نره» — فقط صدای خودمان،
   بدون هیچ فایل کپی‌رایت‌دار. node خالص: WAV 16bit mono 22050Hz با گام/ریتم/تمپو
   متفاوت (سینوسی/مثلثی با envelope + کوبهٔ سادهٔ هر ثانیه)، بعد ffmpeg به mp3 mono 96k.
   خروجی: public/sher/songs/demo-1.mp3 … demo-5.mp3 — WAVهای موقت در tmp پاک می‌شوند. */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SR = 22050; // نمونه‌برداری
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(repo, "public", "sher", "songs");
const FFMPEG = existsSync("/usr/bin/ffmpeg") ? "/usr/bin/ffmpeg" : "ffmpeg";

/* شبه‌تصادفی قطعی — خروجی هر بار یکسان */
function lcg(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/* نوشتن WAV — PCM 16bit mono با هدر ۴۴ بایتی */
function writeWav(file, samples) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16); // اندازهٔ بلاک fmt
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // مونو
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28); // نرخ بایت
  buf.writeUInt16LE(2, 32); // اندازهٔ فریم
  buf.writeUInt16LE(16, 34); // بیت هر نمونه
  buf.write("data", 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }
  writeFileSync(file, buf);
}

/* افزودن یک نت با envelope (حملهٔ سریع + میرایی) — سینوسی یا مثلثی */
function addNote(out, start, dur, freq, wave, amp) {
  const i0 = Math.floor(start * SR);
  const n = Math.min(Math.floor(dur * SR), out.length - i0);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const env = Math.min(1, t / 0.012) * Math.pow(Math.max(0, 1 - t / dur), 1.4);
    const ph = 2 * Math.PI * freq * t;
    const v =
      wave === "sine"
        ? Math.sin(ph)
        : ((2 / Math.PI) * Math.asin(Math.sin(ph))); // مثلثی
    out[i0 + i] += amp * env * v;
  }
}

/* کوبهٔ ساده هر ثانیه — سینوس بم با میرایی تند */
function addKick(out, start, amp = 0.5) {
  const i0 = Math.floor(start * SR);
  const n = Math.min(Math.floor(0.09 * SR), out.length - i0);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    out[i0 + i] += amp * Math.exp(-38 * t) * Math.sin(2 * Math.PI * 95 * t);
  }
}

/* ملودی: قدم زدن قطعی روی گام + پالس بم هر ثانیه */
function makeTrack({ seed, scale, base, tempo, seconds, wave }) {
  const total = Math.floor(seconds * SR);
  const out = new Float64Array(total);
  const rnd = lcg(seed);
  const beat = 60 / tempo;
  let deg = Math.floor(rnd() * scale.length);
  let t = 0.15;
  while (t < seconds - 0.2) {
    const dur = beat * (rnd() < 0.3 ? 0.5 : rnd() < 0.5 ? 1 : 1.5);
    const oct = rnd() < 0.25 ? 12 : 0;
    addNote(out, t, Math.min(dur, seconds - t), base * Math.pow(2, (scale[deg] + oct) / 12), wave, 0.28);
    // قدم بعدی: یک گام بالا/پایین یا دو گام
    const step = rnd() < 0.55 ? (rnd() < 0.5 ? 1 : -1) : rnd() < 0.5 ? 2 : -2;
    deg = ((deg + step) % scale.length + scale.length) % scale.length;
    t += dur;
  }
  for (let s = 0; s < seconds; s += 1) addKick(out, s);
  for (let i = 0; i < total; i++) out[i] = Math.max(-0.9, Math.min(0.9, out[i]));
  return out;
}

/* پنج تراک با گام/ریتم/تمپو/شکل‌موج متفاوت */
const TRACKS = [
  { name: "demo-1", seed: 11, scale: [0, 2, 4, 7, 9], base: 261.63, tempo: 92, seconds: 20, wave: "sine" }, // پنتاتونیک دو
  { name: "demo-2", seed: 23, scale: [0, 2, 3, 5, 7, 9, 10], base: 293.66, tempo: 112, seconds: 19, wave: "triangle" }, // دوریان ر
  { name: "demo-3", seed: 37, scale: [0, 2, 3, 5, 7, 8, 10], base: 220.0, tempo: 100, seconds: 22, wave: "sine" }, // مینور لا
  { name: "demo-4", seed: 53, scale: [0, 2, 4, 5, 7, 9, 11], base: 196.0, tempo: 80, seconds: 18, wave: "triangle" }, // ماژور سل
  { name: "demo-5", seed: 71, scale: [0, 2, 3, 5, 7, 8, 11], base: 329.63, tempo: 126, seconds: 21, wave: "sine" }, // مینور هارمونیک می
];

mkdirSync(outDir, { recursive: true });
const tmp = mkdtempSync(path.join(tmpdir(), "sher-demo-"));
try {
  for (const tr of TRACKS) {
    const wavPath = path.join(tmp, `${tr.name}.wav`);
    writeWav(wavPath, makeTrack(tr));
    const mp3Path = path.join(outDir, `${tr.name}.mp3`);
    execFileSync(
      FFMPEG,
      ["-y", "-i", wavPath, "-codec:a", "libmp3lame", "-b:a", "96k", "-ac", "1", mp3Path],
      { stdio: "pipe" },
    );
    console.log(`sher_demo_audio: ${tr.name}.mp3 ساخته شد (${tr.seconds} ثانیه).`);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true }); // پاک‌کردن WAVهای موقت
}
