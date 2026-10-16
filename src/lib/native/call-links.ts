/**
 * Calls answered from Android's incoming-call notification (Ember closed): the app opens with
 * app.ember.social://call?from=…&answer=1|0, and CallProvider picks the call up from here.
 */
export interface CallLink {
  peer: { id: string; name: string; avatar: string | null };
  isVoiceOnly: boolean;
  /** Tapped Answer, rather than the notification itself. */
  answer: boolean;
}

/** Older than the ring time: the call is over. */
const MAX_AGE_MS = 45_000;
const EVENT = "ember-call-link";

let pending: CallLink | null = null;

export function parseCallLink(url: string, now = Date.now()): CallLink | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.host !== "call" && !u.pathname.startsWith("//call")) return null;
  const q = u.searchParams;
  const from = q.get("from");
  const at = Number(q.get("at"));
  if (!from || !Number.isFinite(at) || now - at > MAX_AGE_MS) return null;
  return {
    peer: { id: from, name: q.get("name") || "Someone", avatar: q.get("avatar") || null },
    isVoiceOnly: q.get("voice") === "1",
    answer: q.get("answer") === "1",
  };
}

export function openCallLink(link: CallLink) {
  pending = link;
  window.dispatchEvent(new Event(EVENT));
}

/** Hands over the waiting call (once), now and whenever a new one arrives. */
export function onCallLink(handler: (link: CallLink) => void): () => void {
  const take = () => {
    if (!pending) return;
    const link = pending;
    pending = null;
    handler(link);
  };
  take();
  window.addEventListener(EVENT, take);
  return () => window.removeEventListener(EVENT, take);
}
