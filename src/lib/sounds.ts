/**
 * Short in-app sounds, in the spirit of Facebook's: a soft pop when you like something, a
 * light "whoosh" when you post or send, a chime when a notification or message arrives.
 * They're our own, made with the Web Audio API (no sound files to download), and can be
 * turned off in Settings → In-app sounds.
 */

export type SoundName = "like" | "post" | "comment" | "send" | "message" | "notification" | "refresh";

const STORAGE_KEY = "cloudbook_sounds";

export function soundsEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSoundsEnabled(on: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
  } catch { /* storage blocked: the choice lasts for this visit only */ }
}

let ctx: AudioContext | null = null;
let out: AudioNode | null = null;

/** Phones only allow sound after a tap, so the audio engine starts on the first one. */
export function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx ??= new AC();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/**
 * Where every sound goes: a compressor (so loud is loud without crackling) and a strong master
 * level, so Ember's sounds are as loud as a phone's own instead of a faint beep.
 */
export function output(ac: AudioContext): AudioNode {
  if (out && out.context === ac) return out;
  const compressor = ac.createDynamicsCompressor();
  compressor.threshold.value = -18;
  compressor.knee.value = 12;
  compressor.ratio.value = 6;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.15;
  const master = ac.createGain();
  master.gain.value = 1.6;
  compressor.connect(master).connect(ac.destination);
  out = compressor;
  return out;
}

/**
 * A bell-like note (a pure tone with a soft, quickly fading overtone), the basis of the chimes
 * and the ringtone.
 */
export function bell(ac: AudioContext, at: number, freq: number, length: number, volume: number) {
  for (const [ratio, level] of [[1, 1], [2, 0.35], [3, 0.12]] as const) {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq * ratio, at);
    const peak = volume * level;
    const end = at + length / ratio;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(peak, at + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(gain).connect(output(ac));
    osc.start(at);
    osc.stop(end + 0.02);
  }
}

if (typeof window !== "undefined") {
  const unlock = () => { audio(); window.removeEventListener("pointerdown", unlock); };
  window.addEventListener("pointerdown", unlock, { once: true, passive: true });
}

/** A short tone that glides from one pitch to another and fades out. */
function tone(ac: AudioContext, at: number, from: number, to: number, length: number, volume: number, type: OscillatorType = "sine") {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, at);
  osc.frequency.exponentialRampToValueAtTime(to, at + length);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(volume, at + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  osc.connect(gain).connect(output(ac));
  osc.start(at);
  osc.stop(at + length + 0.02);
}

/** A soft breath of filtered noise sweeping upward: the "whoosh" of sending. */
function whoosh(ac: AudioContext, at: number, length: number, volume: number) {
  const buffer = ac.createBuffer(1, Math.ceil(ac.sampleRate * length), ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const noise = ac.createBufferSource();
  noise.buffer = buffer;
  const filter = ac.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 1.2;
  filter.frequency.setValueAtTime(500, at);
  filter.frequency.exponentialRampToValueAtTime(3200, at + length);
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(volume, at + length * 0.35);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  noise.connect(filter).connect(gain).connect(output(ac));
  noise.start(at);
  noise.stop(at + length);
}

const SOUNDS: Record<SoundName, (ac: AudioContext, t: number) => void> = {
  // A quick rising "bloop".
  like: (ac, t) => tone(ac, t, 420, 880, 0.12, 0.45),
  // A whoosh that lands with a pop.
  post: (ac, t) => { whoosh(ac, t, 0.22, 0.35); tone(ac, t + 0.16, 520, 1040, 0.12, 0.4); },
  // A softer, lower pop.
  comment: (ac, t) => tone(ac, t, 360, 620, 0.1, 0.4),
  // Just the whoosh, like a message flying off.
  send: (ac, t) => whoosh(ac, t, 0.2, 0.4),
  // A new message: two bright bell notes going up, like a messenger's ping.
  message: (ac, t) => { bell(ac, t, 1047, 0.35, 0.7); bell(ac, t + 0.11, 1568, 0.5, 0.7); },
  // A notification: a clear three-note bell chime.
  notification: (ac, t) => {
    bell(ac, t, 784, 0.45, 0.65);
    bell(ac, t + 0.12, 1047, 0.45, 0.65);
    bell(ac, t + 0.24, 1319, 0.8, 0.7);
  },
  // A tiny tick when the feed refreshes.
  refresh: (ac, t) => tone(ac, t, 1200, 1500, 0.06, 0.25),
};

/** Plays a sound if sounds are on (and quietly does nothing where audio isn't available). */
export function playSound(name: SoundName) {
  if (!soundsEnabled()) return;
  try {
    const ac = audio();
    if (!ac || ac.state !== "running") return;
    SOUNDS[name](ac, ac.currentTime + 0.01);
  } catch { /* audio unavailable: stay silent */ }
}
