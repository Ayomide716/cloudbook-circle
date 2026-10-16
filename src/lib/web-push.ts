import { supabase } from "@/integrations/supabase/client";
import { isNative } from "@/lib/native/platform";
import {
  disableNativePush,
  enableNativePush,
  nativePushAvailable,
  nativePushPermission,
  nativePushReady,
  syncNativePush,
} from "@/lib/native/push";

/**
 * Notifications that reach a locked phone or a closed app (Web Push). The phone's browser
 * gives us a subscription; we save it, and the server (send-push) delivers through it.
 *
 * VITE_VAPID_PUBLIC_KEY is the public half of the server's key pair (the private half is only
 * in the send-push function's secrets). Without it, push stays off. See docs/push-notifications.md.
 */
const VAPID_PUBLIC_KEY: string = import.meta.env.VITE_VAPID_PUBLIC_KEY ?? "";

/** Set while this device is subscribed, so the open app doesn't show the same alert twice. */
export const PUSH_ACTIVE_KEY = "ember_push_active";

/** The app has a key to subscribe with (set up on the server too). */
export const pushConfigured = !!VAPID_PUBLIC_KEY || isNative;

/**
 * In the Android app, push goes through Firebase (lib/native/push) instead of the browser's
 * Web Push; everything below works the same for both.
 */
export const pushReady = (): Promise<void> => (isNative ? nativePushReady : Promise.resolve());

/** Whether notifications are allowed here: "granted", "denied" or "default" (not asked yet). */
export const pushPermission = (): NotificationPermission =>
  isNative ? nativePushPermission() : typeof Notification !== "undefined" ? Notification.permission : "default";

export const pushSupported = () =>
  isNative ? nativePushAvailable() :
  !!VAPID_PUBLIC_KEY && typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

/** iPhones only allow notifications for apps added to the Home Screen. */
export const needsHomeScreenInstall = () => {
  if (typeof window === "undefined" || isNative) return false;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return ios && !standalone;
};

const keyBytes = (base64: string) => {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
};

const setActive = (on: boolean) => {
  try {
    if (on) localStorage.setItem(PUSH_ACTIVE_KEY, "1");
    else localStorage.removeItem(PUSH_ACTIVE_KEY);
  } catch {
    /* fine */
  }
};

export const pushActive = () => {
  try {
    return localStorage.getItem(PUSH_ACTIVE_KEY) === "1";
  } catch {
    return false;
  }
};

async function save(sub: PushSubscription) {
  const keys = sub.toJSON().keys ?? {};
  const { error } = await supabase.rpc("save_push_subscription", {
    _endpoint: sub.endpoint,
    _p256dh: keys.p256dh ?? "",
    _auth: keys.auth ?? "",
  });
  if (error) throw error;
  setActive(true);
}

/**
 * Ask for permission (call from a tap) and subscribe this device.
 * Returns "on", "denied" (blocked in the browser), or "unsupported".
 */
export async function enablePush(): Promise<"on" | "denied" | "unsupported"> {
  if (isNative) {
    const result = await enableNativePush();
    setActive(result === "on");
    return result;
  }
  if (!pushSupported()) return "unsupported";
  const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
  if (permission !== "granted") return "denied";
  const reg = await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) }));
  await save(sub);
  return "on";
}

/** After signing in: if notifications are already allowed, make sure this device is saved for you. */
export async function syncPush() {
  if (isNative) {
    if (await syncNativePush()) setActive(true);
    return;
  }
  if (!pushSupported() || Notification.permission !== "granted") return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) }));
    await save(sub);
  } catch {
    setActive(false);
  }
}

/** Stop alerts on this device (turning them off, or logging out). */
export async function disablePush() {
  setActive(false);
  if (isNative) {
    await disableNativePush().catch(() => {});
    return;
  }
  if (!pushSupported()) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    await supabase.rpc("remove_push_subscription", { _endpoint: sub.endpoint });
    await sub.unsubscribe();
  } catch {
    /* already gone */
  }
}
