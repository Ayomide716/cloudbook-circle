import { supabase } from "@/integrations/supabase/client";
import { deviceAuthenticate } from "@/lib/native/ember-window";

export type UnlockResult = { ok: true } | { ok: false; message: string } | { ok: false; needsPassword: true };

/**
 * Opening locked chats, as on WhatsApp: the phone's fingerprint, face or PIN in the app. On the
 * website (or an older app) your Ember password instead (unlockWithPassword).
 */
export async function unlockChats(): Promise<UnlockResult> {
  const r = await deviceAuthenticate("Unlock your locked chats");
  if (r === "ok") return { ok: true };
  if (r === "no-lock") return { ok: false, message: "Set a screen lock on your phone first (Settings → Security), then try again." };
  if (r === "failed") return { ok: false, message: "Couldn't confirm it's you." };
  return { ok: false, needsPassword: true };
}

/** The website's check: your Ember password. Accounts that only use Google can't do this here. */
export async function unlockWithPassword(password: string): Promise<{ ok: boolean; message?: string }> {
  const { data } = await supabase.auth.getUser();
  const email = data.user?.email;
  const hasPassword = data.user?.identities?.some((i) => i.provider === "email");
  if (!email || !hasPassword) return { ok: false, message: "Your account signs in with Google: open locked chats in the Ember app." };
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return error ? { ok: false, message: "That password isn't right." } : { ok: true };
}
