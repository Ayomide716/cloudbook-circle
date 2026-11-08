import { isNative } from "@/lib/native/platform";

type HapticsPlugin = typeof import("@capacitor/haptics");
let plugin: Promise<HapticsPlugin | null> | null = null;
// Android only plays selection ticks between selectionStart and selectionEnd: start once.
const loadPlugin = () =>
  (plugin ??= import("@capacitor/haptics")
    .then((mod) => { mod.Haptics.selectionStart().catch(() => {}); return mod; })
    .catch(() => null));

/**
 * A light tap you feel, like the ones Android's own apps give. In the app this is the phone's
 * real haptic engine (crisp ticks, not a buzz); in a browser it falls back to a short vibration
 * (iPhones ignore it). `ms` is the strength: 8 or less a tick, up to 12 light, above that medium.
 */
export function haptic(ms = 10) {
  if (isNative) {
    void loadPlugin().then((mod) => {
      if (!mod) return vibrate(ms);
      const { Haptics, ImpactStyle } = mod;
      const done = ms <= 8 ? Haptics.selectionChanged() : Haptics.impact({ style: ms <= 12 ? ImpactStyle.Light : ImpactStyle.Medium });
      // An APK from before the haptics plugin, updated over the air: vibrate instead.
      done.catch(() => vibrate(ms));
    });
    return;
  }
  vibrate(ms);
}

function vibrate(ms: number) {
  try {
    navigator.vibrate?.(ms);
  } catch { /* not supported */ }
}
