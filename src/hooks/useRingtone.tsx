import { useEffect } from "react";
import { audio, bell, playFile } from "@/lib/sounds";

/**
 * The incoming-call ringtone: Android's "Titania" (public/sounds/ringtone.mp3), looping, loud,
 * with the phone buzzing every couple of seconds. If the file can't play, a made-up bell melody
 * rings instead. It rings whatever the in-app sounds setting is (a call should never be silent).
 */
const MELODY: [number, number][] = [[0, 659], [0.16, 831], [0.32, 988], [0.48, 1319], [0.8, 988], [0.96, 1319]];
const EVERY_MS = 2400;

function bellMelody() {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime + 0.02;
  for (const [at, freq] of MELODY) bell(ac, t + at, freq, 0.55, 0.9);
}

const buzz = () => {
  try {
    navigator.vibrate?.([400, 200, 400]);
  } catch {
    /* no vibration here */
  }
};

export const useRingtone = (isPlaying: boolean) => {
  useEffect(() => {
    if (!isPlaying) return;
    let stopped = false;
    let stopFile: (() => void) | null = null;
    let melody: number | undefined;

    buzz();
    const buzzing = window.setInterval(buzz, EVERY_MS);
    void playFile("ringtone", { loop: true }).then((stop) => {
      if (stopped) { stop?.(); return; }
      if (stop) { stopFile = stop; return; }
      bellMelody();
      melody = window.setInterval(bellMelody, EVERY_MS);
    });

    return () => {
      stopped = true;
      stopFile?.();
      window.clearInterval(buzzing);
      window.clearInterval(melody);
      try {
        navigator.vibrate?.(0);
      } catch {
        /* fine */
      }
    };
  }, [isPlaying]);
};
