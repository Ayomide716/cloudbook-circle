import { useCallback, useEffect, useState } from "react";

/**
 * Pinned, muted and archived chats, as in WhatsApp. Kept on this device (per account), so
 * there's nothing to set up in the database; they don't follow you to another phone yet.
 */
export interface ChatPrefs {
  pinned: string[];
  muted: string[];
  archived: string[];
}

const EMPTY: ChatPrefs = { pinned: [], muted: [], archived: [] };
export const CHAT_PREFS_EVENT = "cloudbook:chat-prefs";
const key = (userId: string) => `cloudbook_chat_prefs_${userId}`;

export function readChatPrefs(userId: string | null | undefined): ChatPrefs {
  if (!userId) return EMPTY;
  try {
    const stored = JSON.parse(localStorage.getItem(key(userId)) ?? "null") as Partial<ChatPrefs> | null;
    return {
      pinned: Array.isArray(stored?.pinned) ? stored.pinned : [],
      muted: Array.isArray(stored?.muted) ? stored.muted : [],
      archived: Array.isArray(stored?.archived) ? stored.archived : [],
    };
  } catch {
    return EMPTY;
  }
}

/** Adds or removes a chat (the other person's id) from one of the lists. */
export function toggleChatPref(prefs: ChatPrefs, list: keyof ChatPrefs, otherId: string): ChatPrefs {
  const has = prefs[list].includes(otherId);
  return { ...prefs, [list]: has ? prefs[list].filter((id) => id !== otherId) : [...prefs[list], otherId] };
}

export function useChatPrefs(userId: string | null | undefined) {
  const [prefs, setPrefs] = useState<ChatPrefs>(() => readChatPrefs(userId));

  useEffect(() => {
    setPrefs(readChatPrefs(userId));
    const reload = () => setPrefs(readChatPrefs(userId));
    window.addEventListener(CHAT_PREFS_EVENT, reload);
    window.addEventListener("storage", reload);
    return () => {
      window.removeEventListener(CHAT_PREFS_EVENT, reload);
      window.removeEventListener("storage", reload);
    };
  }, [userId]);

  const toggle = useCallback(
    (list: keyof ChatPrefs, otherId: string) => {
      if (!userId) return;
      const next = toggleChatPref(readChatPrefs(userId), list, otherId);
      try {
        localStorage.setItem(key(userId), JSON.stringify(next));
      } catch { /* storage blocked: lasts for this visit only */ }
      setPrefs(next);
      window.dispatchEvent(new Event(CHAT_PREFS_EVENT));
    },
    [userId]
  );

  return { prefs, toggle };
}
