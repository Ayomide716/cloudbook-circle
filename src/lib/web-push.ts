import { supabase } from "@/integrations/supabase/client";

/**
 * Notifications that reach a locked phone or a closed app (Web Push). The phone's browser
 * gives us a subscription; we save it, and the server (send-push) delivers through it.
 *
 * The public half of the server's key pair; the private half is only on the server.
 */
const VAPID_PUBLIC_KEY =
  import.meta.env.VITE_VAPID_PUBLIC_KEY ||
  "BDpNQiIEbgdBPOB0Q58T7aHS58bvQ9ZXry75_dduoLhhVcEGvLvTk-2SWz6F-CKqv-AulMqFom5sE_3nCThLMK4";

/** Set while this device is subscribed, so the open app doesn't show the same alert twice. */
export const PUSH_ACTIVE_KEY = "ember_push_active";

export const pushSupported = () =>
  typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

/** iPhones only allow notifications for apps added to the Home Screen. */
export const needsHomeScreenInstall = () => {
  if (typeof window === "undefined") return false;
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
