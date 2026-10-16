/**
 * Push notifications in the Android app, through Firebase Cloud Messaging. The phone gets a
 * token from Firebase; we save it with the person's other devices (push_subscriptions, as an
 * address under FCM_PREFIX so the server knows to send it through Firebase), and send-push
 * delivers there. Only in APKs made for it (native level 2 and up): older ones have no Firebase
 * and would crash on register().
 */
import { supabase } from "@/integrations/supabase/client";
import { shellLevelFrom } from "./ota";

export const FCM_PREFIX = "https://fcm.googleapis.com/v1/ember-device/";
const TOKEN_KEY = "ember_fcm_token";

let available = false;
let permission: NotificationPermission = "default";
let waiting: ((token: string | null) => void) | null = null;
let markReady: () => void = () => {};
/** Settles once start-up has found out whether this app can do push. */
export const nativePushReady = new Promise<void>((resolve) => { markReady = resolve; });

/** This app can do push (its APK has Firebase). Known once initNativePush has run. */
export const nativePushAvailable = () => available;
export const nativePushPermission = () => permission;

const toPermission = (state: string): NotificationPermission =>
  state === "granted" ? "granted" : state === "denied" ? "denied" : "default";

const storedToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

async function saveToken(token: string) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* fine */
  }
  const { data } = await supabase.auth.getSession();
  if (!data.session) return; // Saved for this person after they sign in (syncNativePush).
  await supabase.rpc("save_push_subscription", { _endpoint: FCM_PREFIX + token, _p256dh: "fcm", _auth: "" });
}

/** At start-up in the app: listen for the token and for taps on notifications. */
export async function initNativePush(open: (path: string) => void) {
  try {
    await setUp(open);
  } finally {
    markReady();
  }
}

async function setUp(open: (path: string) => void) {
  const { App } = await import("@capacitor/app");
  const info = await App.getInfo().catch(() => null);
  if (shellLevelFrom(info?.version) < 2) return;
  const { PushNotifications } = await import("@capacitor/push-notifications");
  available = true;
  permission = toPermission((await PushNotifications.checkPermissions()).receive);
  await PushNotifications.createChannel({
    id: "ember",
    name: "Ember",
    description: "Messages, comments, likes and friend requests",
    importance: 4,
    visibility: 1,
    vibration: true,
  }).catch(() => {});
  await PushNotifications.addListener("registration", ({ value }) => {
    void saveToken(value).finally(() => { waiting?.(value); waiting = null; });
  });
  await PushNotifications.addListener("registrationError", (e) => {
    console.warn("[push] registration failed", e.error);
    waiting?.(null);
    waiting = null;
  });
  // Tapping a notification opens what it's about (a chat, a post…).
  await PushNotifications.addListener("pushNotificationActionPerformed", ({ notification }) => {
    const url = (notification.data as { url?: unknown } | undefined)?.url;
    if (typeof url === "string" && url.startsWith("/")) open(url);
  });
}

async function register(): Promise<boolean> {
  const { PushNotifications } = await import("@capacitor/push-notifications");
  const token = new Promise<string | null>((resolve) => {
    waiting = resolve;
    setTimeout(() => resolve(null), 15000);
  });
  await PushNotifications.register();
  return !!(await token);
}

/** "Allow notifications": asks (Android 13+), then saves this phone. */
export async function enableNativePush(): Promise<"on" | "denied" | "unsupported"> {
  await nativePushReady;
  if (!available) return "unsupported";
  const { PushNotifications } = await import("@capacitor/push-notifications");
  let state = (await PushNotifications.checkPermissions()).receive;
  if (state === "prompt" || state === "prompt-with-rationale") state = (await PushNotifications.requestPermissions()).receive;
  permission = toPermission(state);
  if (permission !== "granted") return "denied";
  return (await register()) ? "on" : "unsupported";
}

/** After signing in: if notifications are allowed, make sure this phone is saved for you. */
export async function syncNativePush(): Promise<boolean> {
  await nativePushReady;
  if (!available || permission !== "granted") return false;
  return register().catch(() => false);
}

/** Stop alerts on this phone (turning them off, or signing out). */
export async function disableNativePush() {
  const token = storedToken();
  if (token) await supabase.rpc("remove_push_subscription", { _endpoint: FCM_PREFIX + token });
}
