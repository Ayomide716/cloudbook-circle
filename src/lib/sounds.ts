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

/** Phones only allow sound after a tap, so the audio engine starts on the first one. */
function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx ??= new AC();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
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
  osc.connect(gain).connect(ac.destination);
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
  noise.connect(filter).connect(gain).connect(ac.destination);
  noise.start(at);
  noise.stop(at + length);
}

const SOUNDS: Record<SoundName, (ac: AudioContext, t: number) => void> = {
  // A quick rising "bloop".
  like: (ac, t) => tone(ac, t, 420, 880, 0.12, 0.22),
  // A whoosh that lands with a pop.
  post: (ac, t) => { whoosh(ac, t, 0.22, 0.18); tone(ac, t + 0.16, 520, 1040, 0.12, 0.2); },
  // A softer, lower pop.
  comment: (ac, t) => tone(ac, t, 360, 620, 0.1, 0.18),
  // Just the whoosh, like a message flying off.
  send: (ac, t) => whoosh(ac, t, 0.2, 0.2),
  // Two light notes going up.
  message: (ac, t) => { tone(ac, t, 880, 880, 0.12, 0.16, "triangle"); tone(ac, t + 0.09, 1175, 1175, 0.16, 0.16, "triangle"); },
  // A three-note chime.
  notification: (ac, t) => {
    tone(ac, t, 659, 659, 0.14, 0.15, "triangle");
    tone(ac, t + 0.1, 880, 880, 0.14, 0.15, "triangle");
    tone(ac, t + 0.2, 1319, 1319, 0.22, 0.13, "triangle");
  },
  // A tiny tick when the feed refreshes.
  refresh: (ac, t) => tone(ac, t, 1200, 1500, 0.06, 0.12),
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
