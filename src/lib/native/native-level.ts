/**
 * What the Android app's native shell can do. Raise this by one whenever a change needs a new
 * APK (a new Capacitor plugin, a new permission, a native setting), because over-the-air updates
 * only carry the web part. An update made with a higher level waits for people to install the
 * new APK instead of landing on a shell that can't run it.
 *
 * android/app/build.gradle reads this number, so the APK and the web code always agree.
 */
// 2: push notifications (Firebase).
// 3: calls ring with Ember closed (full-screen call notification), Ember's own notification sound.
export const NATIVE_LEVEL = 3;
