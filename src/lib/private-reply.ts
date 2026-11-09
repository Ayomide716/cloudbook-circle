import type { ChatQuote } from "@/lib/chat-extras";

/**
 * "Reply privately" to someone's group message, as on WhatsApp: the quote waits here while
 * their one-to-one chat opens, which picks it up (once).
 */
const KEY = "ember:private-reply";

export function setPrivateReply(userId: string, quote: ChatQuote) {
  try { sessionStorage.setItem(KEY, JSON.stringify({ userId, quote })); } catch { /* blocked */ }
}

export function takePrivateReply(userId: string): ChatQuote | null {
  try {
    const stored = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as { userId: string; quote: ChatQuote } | null;
    if (!stored || stored.userId !== userId) return null;
    sessionStorage.removeItem(KEY);
    return stored.quote;
  } catch {
    return null;
  }
}
