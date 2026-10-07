/** A short buzz, like the light taps Facebook and WhatsApp give on Android (iPhones ignore it). */
export function haptic(ms = 10) {
  try {
    navigator.vibrate?.(ms);
  } catch { /* not supported */ }
}
