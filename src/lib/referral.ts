/**
 * Invite links: ember…/?ref=<your id>. Someone who signs up from your link sends you a friend
 * request straight away, so you hear that they joined (the friend-request notification) and
 * they don't land on an empty app. That's how invites keep spreading (WhatsApp, mostly).
 */
import { supabase } from "@/integrations/supabase/client";
import { publicUrl } from "./native/platform";

const KEY = "ember:ref";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Only accounts this new count as "joined from the link". */
const NEW_ACCOUNT_MS = 24 * 60 * 60 * 1000;

export const inviteUrl = (userId: string) => publicUrl(`/?ref=${userId}`);

export const inviteMessage = (userId: string) => `Join me on Ember, it's where my friends and I share what we're up to: ${inviteUrl(userId)}`;

/** Remember who invited this visitor (from ?ref=…), and tidy the address. */
export function captureReferral(location: Location = window.location) {
  try {
    const params = new URLSearchParams(location.search);
    const ref = params.get("ref");
    if (!ref || !UUID.test(ref)) return;
    localStorage.setItem(KEY, ref);
    params.delete("ref");
    const rest = params.toString();
    history.replaceState(history.state, "", `${location.pathname}${rest ? `?${rest}` : ""}${location.hash}`);
  } catch {
    // Private mode etc.: the invite just isn't remembered.
  }
}

/** Once signed in: a new account from an invite sends the inviter a friend request. */
export async function claimReferral(user: { id: string; created_at?: string }) {
  let ref: string | null = null;
  try {
    ref = localStorage.getItem(KEY);
    if (ref) localStorage.removeItem(KEY);
  } catch {
    return;
  }
  if (!ref || ref === user.id) return;
  const created = user.created_at ? Date.parse(user.created_at) : NaN;
  if (!(Date.now() - created < NEW_ACCOUNT_MS)) return;
  const { data: existing } = await supabase
    .from("friendships")
    .select("id")
    .or(`and(user_id.eq.${user.id},friend_id.eq.${ref}),and(user_id.eq.${ref},friend_id.eq.${user.id})`)
    .limit(1);
  if (existing?.length) return;
  await supabase.from("friendships").insert({ user_id: user.id, friend_id: ref, status: "pending" });
}
