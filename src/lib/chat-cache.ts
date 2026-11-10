/**
 * Chats on the phone, as WhatsApp does: the chat list and each chat's latest messages are kept
 * on the device, so opening Messages (or a chat) shows them at once, and the server is asked
 * for what's new in the background. Per account; small (the newest 50 messages of the 40 most
 * recent chats); never anything still sending.
 */
const LIST = (userId: string) => `ember:chats:${userId}`;
const CHAT = (userId: string, chatKey: string) => `ember:chat:${userId}:${chatKey}`;
const INDEX = (userId: string) => `ember:chat-index:${userId}`;
const KEEP_MESSAGES = 50;
const KEEP_CHATS = 40;

const read = <T,>(key: string): T | null => {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") as T | null;
  } catch {
    return null;
  }
};
const write = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* full or blocked: it just won't be instant next time */
  }
};

/** The chat list as it was last time (or null). */
export const cachedChatList = <T,>(userId: string | null | undefined): T[] | null => (userId ? read<T[]>(LIST(userId)) : null);
export const saveChatList = (userId: string, list: unknown[]) => write(LIST(userId), list);

/** Saved messages only: no placeholders still sending, none of this phone's own extras. */
function clean<M extends { id: string }>(messages: M[]): M[] {
  return messages
    .filter((m) => !m.id.startsWith("temp-"))
    .slice(-KEEP_MESSAGES)
    .map((m) => Object.fromEntries(Object.entries(m).filter(([k]) => !k.startsWith("_"))) as M);
}

/** A chat's latest messages as they were last time (or null). `chatKey`: their id, or "g:<group>". */
export const cachedMessages = <M,>(userId: string | null | undefined, chatKey: string): M[] | null =>
  userId ? read<M[]>(CHAT(userId, chatKey)) : null;

export function saveMessages<M extends { id: string }>(userId: string, chatKey: string, messages: M[]) {
  write(CHAT(userId, chatKey), clean(messages));
  // Keep only the most recent chats, so it stays small.
  const index = (read<string[]>(INDEX(userId)) ?? []).filter((k) => k !== chatKey);
  index.unshift(chatKey);
  for (const old of index.splice(KEEP_CHATS)) {
    try { localStorage.removeItem(CHAT(userId, old)); } catch { /* blocked */ }
  }
  write(INDEX(userId), index);
}
