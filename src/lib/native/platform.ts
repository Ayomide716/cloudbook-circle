import { Capacitor } from "@capacitor/core";

/** Running inside the Android app (Capacitor), not a browser. */
export const isNative = Capacitor.isNativePlatform();

/**
 * The public website. Inside the app, pages are served from https://localhost, so links people
 * share or receive by email must point here instead.
 */
export const PUBLIC_URL = (import.meta.env.VITE_PUBLIC_URL as string | undefined)?.replace(/\/$/, "") || "https://ayo-chat-xi.vercel.app";

/** The app's own link scheme (android/app/src/main/res/values/strings.xml: custom_url_scheme). */
export const APP_SCHEME = "app.ember.social";

/** A link to a page of Ember that works for anyone who receives it (website or app). */
export const publicUrl = (path: string) => `${isNative ? PUBLIC_URL : window.location.origin}${path}`;
