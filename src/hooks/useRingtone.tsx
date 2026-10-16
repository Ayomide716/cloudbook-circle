import { useEffect } from "react";
import { audio, bell } from "@/lib/sounds";

/**
 * The incoming-call ringtone: a bright, marimba-like melody that repeats every 2.4 seconds,
 * loud like a phone's own ringtone, with the phone buzzing in time. It rings whatever the
 * in-app sounds setting is (a call should never be silent).
 */
const MELODY: [number, number][] = [
  // [seconds from the start, frequency in Hz]: E5 G#5 B5 E6, B5 E6.
  [0, 659], [0.16, 831], [0.32, 988], [0.48, 1319], [0.8, 988], [0.96, 1319],
];
const EVERY_MS = 2400;

function ringOnce() {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime + 0.02;
  for (const [at, freq] of MELODY) bell(ac, t + at, freq, 0.55, 0.9);
  try {
    navigator.vibrate?.([400, 200, 400]);
  } catch {
    /* no vibration here */
  }
}

export const useRingtone = (isPlaying: boolean) => {
  useEffect(() => {
    if (!isPlaying) return;
    ringOnce();
    const timer = window.setInterval(ringOnce, EVERY_MS);
    return () => {
      window.clearInterval(timer);
      try {
        navigator.vibrate?.(0);
      } catch {
        /* fine */
      }
    };
  }, [isPlaying]);
};
