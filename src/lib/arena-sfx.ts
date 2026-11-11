"use client";

/* افکت‌های صوتی آرنا — کاملاً سنتزشده با WebAudio و بدون هیچ فایل صوتی.
   • موزیک ملایم پس‌زمینه: پد آکوردی آرام با زنگ‌های پراکنده (برای جدول و چالش سرعتی)
   • پیروزی: سوت داور + تشویق تماشاگر + فانفار کوتاه
   • شکست: هوِ تماشاگر + آهنگ نزولی کوتاه
   وضعیت قطع صدا در localStorage نگه داشته می‌شود و بین بازی‌ها مشترک است. */

const MUTE_KEY = "naseri_arena_sfx_muted";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
let mutedLoaded = false;
let ambientOn = false;
let ambientTimer: number | null = null;
let chordIdx = 0;
let noiseBuf: AudioBuffer | null = null;

/* پد پس‌زمینه — پیشروی آکوردی آرام در رجیستر پایین */
const CHORD_MS = 4200;
const AMBIENT_CHORDS: number[][] = [
  [220.0, 261.63, 329.63], // Am
  [174.61, 220.0, 261.63], // F
  [196.0, 246.94, 293.66], // G
  [174.61, 261.63, 349.23], // Fsus
];
const BELL_NOTES = [587.33, 659.25, 783.99, 880.0];

function loadMuted(): boolean {
  if (mutedLoaded) return muted;
  mutedLoaded = true;
  try {
    muted = window.localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    /* بدون localStorage — بی‌صدا ادامه */
  }
  return muted;
}

function ensureCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 1;
    master.connect(ctx.destination);
  }
  /* مرورگرها AudioContext را تا اولین تعامل کاربر معلق می‌کنند */
  if (ctx.state === "suspended") {
    void ctx.resume();
    const kick = () => void ctx?.resume();
    window.addEventListener("pointerdown", kick, { once: true });
    window.addEventListener("keydown", kick, { once: true });
  }
  return ctx;
}

export function sfxIsMuted(): boolean {
  return loadMuted();
}

export function sfxSetMuted(v: boolean): void {
  loadMuted();
  muted = v;
  try {
    window.localStorage.setItem(MUTE_KEY, v ? "1" : "0");
  } catch {
    /* بی‌خیال */
  }
}

export function sfxToggleMuted(): boolean {
  sfxSetMuted(!sfxIsMuted());
  return muted;
}

/* ---------- ابزارهای پایه ---------- */

function tone(
  c: AudioContext,
  out: AudioNode,
  freq: number,
  at: number,
  dur: number,
  peak: number,
  type: OscillatorType,
  glideTo?: number,
): void {
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, at + dur);
  const env = c.createGain();
  env.gain.setValueAtTime(0.0001, at);
  env.gain.linearRampToValueAtTime(peak, at + Math.min(0.06, dur * 0.2));
  env.gain.exponentialRampToValueAtTime(0.0002, at + dur);
  o.connect(env);
  env.connect(out);
  o.start(at);
  o.stop(at + dur + 0.06);
}

function noiseSource(c: AudioContext, seconds: number): AudioBufferSourceNode {
  if (!noiseBuf || noiseBuf.duration < seconds) {
    noiseBuf = c.createBuffer(1, Math.ceil(c.sampleRate * seconds), c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  return src;
}

/* ---------- موزیک ملایم پس‌زمینه ---------- */

function scheduleChord(): void {
  const c = ctx;
  if (!c || !master || muted) return;
  const t0 = c.currentTime + 0.06;
  const chord = AMBIENT_CHORDS[chordIdx % AMBIENT_CHORDS.length];
  chordIdx += 1;

  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 820;
  lp.Q.value = 0.4;
  lp.connect(master);

  const hold = CHORD_MS / 1000;
  for (const f of chord) {
    const layers: [OscillatorType, number, number][] = [
      ["sine", 0, 1],
      ["triangle", 5, 0.4],
    ];
    for (const [type, det, g] of layers) {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.value = f;
      o.detune.value = det;
      const env = c.createGain();
      env.gain.setValueAtTime(0.0001, t0);
      env.gain.linearRampToValueAtTime(0.034 * g, t0 + 1.7);
      env.gain.setValueAtTime(0.034 * g, t0 + hold - 0.4);
      env.gain.linearRampToValueAtTime(0.0001, t0 + hold + 1.2);
      o.connect(env);
      env.connect(lp);
      o.start(t0);
      o.stop(t0 + hold + 1.4);
    }
  }

  /* زنگ پراکنده — کمی امید و نشاط بدون تمرکززدایی */
  if (Math.random() < 0.6) {
    const f = BELL_NOTES[Math.floor(Math.random() * BELL_NOTES.length)];
    tone(c, master, f, t0 + 0.9 + Math.random() * 1.6, 1.7, 0.02, "sine");
  }
}

function startScheduler(): void {
  if (ambientTimer !== null) return;
  scheduleChord();
  ambientTimer = window.setInterval(scheduleChord, CHORD_MS);
}

export function sfxAmbientStart(): void {
  loadMuted();
  ambientOn = true;
  const c = ensureCtx();
  if (!c || muted) return;
  startScheduler();
}

export function sfxAmbientStop(): void {
  ambientOn = false;
  if (ambientTimer !== null) {
    clearInterval(ambientTimer);
    ambientTimer = null;
  }
}

/* ---------- پیروزی: سوت + تشویق + فانفار ---------- */

export function sfxWin(): void {
  loadMuted();
  if (muted) return;
  const c = ensureCtx();
  if (!c || !master) return;
  const t = c.currentTime + 0.05;

  /* سوت داور — سه بار با ویبراتو */
  for (let i = 0; i < 3; i++) {
    const ts = t + i * 0.3;
    const o = c.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(1900 + i * 190, ts);
    const lfo = c.createOscillator();
    lfo.frequency.value = 34;
    const lg = c.createGain();
    lg.gain.value = 230;
    lfo.connect(lg);
    lg.connect(o.frequency);
    const env = c.createGain();
    env.gain.setValueAtTime(0.0001, ts);
    env.gain.linearRampToValueAtTime(0.15, ts + 0.03);
    env.gain.setValueAtTime(0.15, ts + 0.16);
    env.gain.linearRampToValueAtTime(0.0001, ts + 0.25);
    o.connect(env);
    env.connect(master);
    o.start(ts);
    o.stop(ts + 0.28);
    lfo.start(ts);
    lfo.stop(ts + 0.28);
  }

  /* تشویق تماشاگر — نویز باندپاس با لرزش طبیعی */
  const noise = noiseSource(c, 3.5);
  const bp1 = c.createBiquadFilter();
  bp1.type = "bandpass";
  bp1.frequency.value = 950;
  bp1.Q.value = 0.6;
  const bp2 = c.createBiquadFilter();
  bp2.type = "bandpass";
  bp2.frequency.value = 2400;
  bp2.Q.value = 0.8;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.09, t + 0.35);
  g.gain.setValueAtTime(0.09, t + 1.7);
  g.gain.exponentialRampToValueAtTime(0.0002, t + 3.5);
  const am = c.createOscillator();
  am.frequency.value = 6.5;
  const amG = c.createGain();
  amG.gain.value = 0.03;
  am.connect(amG);
  amG.connect(g.gain);
  noise.connect(bp1);
  noise.connect(bp2);
  bp1.connect(g);
  bp2.connect(g);
  g.connect(master);
  noise.start(t);
  noise.stop(t + 3.6);
  am.start(t);
  am.stop(t + 3.6);

  /* فانفار پیروزی — آرپژ ماژور + آکورد پایانی */
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
    tone(c, master as AudioNode, f, t + 0.4 + i * 0.17, 0.18, 0.13, "triangle"),
  );
  [523.25, 659.25, 783.99].forEach((f) =>
    tone(c, master as AudioNode, f, t + 1.15, 1.15, 0.08, "triangle"),
  );
}

/* ---------- شکست: هو تماشاگر + آهنگ نزولی ---------- */

export function sfxLose(): void {
  loadMuted();
  if (muted) return;
  const c = ensureCtx();
  if (!c || !master) return;
  const t = c.currentTime + 0.05;

  /* هوِ جمعیت — نویز بم با موج آهسته */
  const noise = noiseSource(c, 3.4);
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 420;
  lp.Q.value = 0.7;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.11, t + 0.5);
  g.gain.setValueAtTime(0.11, t + 1.7);
  g.gain.exponentialRampToValueAtTime(0.0002, t + 3.3);
  const am = c.createOscillator();
  am.frequency.value = 3.2;
  const amG = c.createGain();
  amG.gain.value = 0.045;
  am.connect(amG);
  amG.connect(g.gain);
  noise.connect(lp);
  lp.connect(g);
  g.connect(master);
  noise.start(t);
  noise.stop(t + 3.4);
  am.start(t);
  am.stop(t + 3.4);

  /* «اووه» بم — glide پایین‌رونده */
  const o = c.createOscillator();
  o.type = "sawtooth";
  o.frequency.setValueAtTime(185, t);
  o.frequency.exponentialRampToValueAtTime(118, t + 2.4);
  const og = c.createGain();
  og.gain.value = 0.05;
  const lp2 = c.createBiquadFilter();
  lp2.type = "lowpass";
  lp2.frequency.value = 320;
  o.connect(og);
  og.connect(lp2);
  lp2.connect(master);
  o.start(t);
  o.stop(t + 2.5);

  /* آهنگ کوتاه شکست — نزولی در لا مینور */
  const seq: [number, number][] = [
    [329.63, 0.5],
    [293.66, 0.5],
    [246.94, 0.5],
    [220.0, 0.9],
  ];
  let tt = t + 0.25;
  for (const [f, d] of seq) {
    tone(c, master, f, tt, d, 0.1, "triangle");
    tone(c, master, f / 2, tt, d, 0.05, "sine");
    tt += d * 0.85;
  }
  tone(c, master, 196.0, tt + 0.1, 1.0, 0.08, "triangle", 174.61);
}
