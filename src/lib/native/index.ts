/**
 * What makes the Android app feel native: the back button, the status bar matching the theme,
 * the share sheet, the splash screen, coming back from Google sign-in, and over-the-air updates.
 * Nothing here runs in a browser.
 */
import { isNative, APP_SCHEME } from "./platform";

/** Android back: close the open sheet or dialog, else go back a page, else leave the app. */
async function handleBackButton() {
  const { App } = await import("@capacitor/app");
  App.addListener("backButton", ({ canGoBack }) => {
    const open = document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [data-vaul-drawer][data-state="open"], [role="menu"][data-state="open"]');
    if (open) {
      // Radix dialogs, sheets and menus all close on Escape.
      document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      return;
    }
    const atStart = ["/", "/auth"].includes(window.location.pathname);
    if (canGoBack && !atStart) window.history.back();
    else App.minimizeApp();
  });
}

/** Light status bar icons on the dark theme, dark icons on the light one. */
async function matchSystemBarsToTheme() {
  const { SystemBars, SystemBarsStyle } = await import("@capacitor/core");
  const apply = () => {
    const dark = document.documentElement.classList.contains("dark");
    SystemBars.setStyle({ style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => {});
  };
  apply();
  new MutationObserver(apply).observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
}

/** The web share API isn't in Android's WebView: route it to the real share sheet. */
async function provideShareSheet() {
  const { Share } = await import("@capacitor/share");
  const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void>; canShare?: (data?: ShareData) => boolean };
  nav.share = async (data: ShareData) => {
    try {
      await Share.share({ title: data.title, text: data.text, url: data.url, dialogTitle: "Share" });
    } catch (e) {
      // Closing the sheet counts as cancelling, as in browsers.
      throw new DOMException(String((e as Error)?.message ?? "Share cancelled"), "AbortError");
    }
  };
  nav.canShare = () => true;
}

/** Coming back from Google sign-in in the browser: app.ember.social://auth#access_token=… */
async function handleSignInReturn() {
  const { App } = await import("@capacitor/app");
  App.addListener("appUrlOpen", async ({ url }) => {
    if (!url.startsWith(`${APP_SCHEME}://auth`)) return;
    const params = new URLSearchParams(url.split("#")[1] ?? url.split("?")[1] ?? "");
    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");
    const { Browser } = await import("@capacitor/browser");
    Browser.close().catch(() => {});
    if (!access_token || !refresh_token) return;
    const { supabase } = await import("@/integrations/supabase/client");
    const { error } = await supabase.auth.setSession({ access_token, refresh_token });
    if (!error) window.location.replace("/");
  });
}

/**
 * The keyboard's height straight from Android, as --keyboard-inset (what sheets, the chat box
 * and the story reply bar sit on). Inside the app the web view's own viewport numbers aren't
 * reliable for this. If Android already made the app shorter for the keyboard, only the part
 * it didn't cover is added, so nothing is lifted twice.
 */
async function trackKeyboard() {
  const { Keyboard } = await import("@capacitor/keyboard");
  const root = document.documentElement;
  let keyboardUp = false;
  let fullHeight = window.innerHeight;
  window.addEventListener("resize", () => {
    if (!keyboardUp) fullHeight = window.innerHeight; // rotating, split screen…
  });
  const apply = (height: number) => {
    const shrunk = Math.max(0, fullHeight - window.innerHeight);
    root.style.setProperty("--keyboard-inset", `${Math.max(0, Math.round(height - shrunk))}px`);
    document.body.classList.toggle("keyboard-open", height > 0);
  };
  Keyboard.addListener("keyboardWillShow", ({ keyboardHeight }) => { keyboardUp = true; apply(keyboardHeight); });
  Keyboard.addListener("keyboardDidShow", ({ keyboardHeight }) => { keyboardUp = true; apply(keyboardHeight); });
  Keyboard.addListener("keyboardWillHide", () => { keyboardUp = false; apply(0); });
  Keyboard.addListener("keyboardDidHide", () => {
    keyboardUp = false;
    fullHeight = window.innerHeight;
    apply(0);
  });
}

/** The native splash hides once the app's own first screen (index.html's splash) is painted. */
async function hideSplashWhenPainted() {
  const { SplashScreen } = await import("@capacitor/splash-screen");
  requestAnimationFrame(() => setTimeout(() => SplashScreen.hide({ fadeOutDuration: 200 }).catch(() => {}), 0));
}

export async function initNative() {
  if (!isNative) return;
  document.documentElement.classList.add("native-app");
  // First: tell the updater this version started fine (or it rolls back to the last good one).
  const { startOverTheAirUpdates } = await import("./ota");
  await startOverTheAirUpdates();
  await Promise.all([handleBackButton(), matchSystemBarsToTheme(), provideShareSheet(), handleSignInReturn(), trackKeyboard(), hideSplashWhenPainted()]).catch(() => {});
}
