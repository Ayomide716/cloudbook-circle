import { useEffect, useRef, useState } from "react";

/**
 * Unsent messages, kept per chat on this device (as on WhatsApp): leave a chat halfway through
 * typing and the text is still in the box when you come back, with "Draft:" in the chat list.
 * A chat is a person's id or "g:" plus a group's id.
 */
const PREFIX = "cloudbook_draft_";
const EVENT = "cloudbook:chat-drafts";
const key = (userId: string, chatId: string) => `${PREFIX}${userId}_${chatId}`;

export function readDraft(userId: string | null | undefined, chatId: string | null | undefined): string {
  if (!userId || !chatId) return "";
  try { return localStorage.getItem(key(userId, chatId)) ?? ""; } catch { return ""; }
}

export function saveDraft(userId: string | null | undefined, chatId: string | null | undefined, text: string) {
  if (!userId || !chatId) return;
  try {
    const before = localStorage.getItem(key(userId, chatId)) ?? "";
    const next = text.trim() ? text : "";
    if (before === next) return;
    if (next) localStorage.setItem(key(userId, chatId), next);
    else localStorage.removeItem(key(userId, chatId));
    window.dispatchEvent(new Event(EVENT));
  } catch { /* storage blocked: no drafts */ }
}

function readAll(userId: string | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!userId) return out;
  const own = `${PREFIX}${userId}_`;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(own)) out[k.slice(own.length)] = localStorage.getItem(k) ?? "";
    }
  } catch { /* storage blocked */ }
  return out;
}

/** Every chat's draft, for the chat list. */
export function useChatDrafts(userId: string | null | undefined) {
  const [drafts, setDrafts] = useState<Record<string, string>>(() => readAll(userId));
  useEffect(() => {
    const reload = () => setDrafts(readAll(userId));
    reload();
    window.addEventListener(EVENT, reload);
    window.addEventListener("storage", reload);
    return () => {
      window.removeEventListener(EVENT, reload);
      window.removeEventListener("storage", reload);
    };
  }, [userId]);
  return drafts;
}

/**
 * Keeps a message box's text as the chat's draft: fills the box with the chat's draft when the
 * chat opens, and saves what's typed. While `paused` (editing a sent message) the draft is left
 * alone, and it's put back in the box afterwards.
 */
export function useDraft(
  userId: string | null | undefined,
  chatId: string | null | undefined,
  text: string,
  setText: (text: string) => void,
  paused = false
) {
  const openChat = useRef<string | null>(null);
  const justOpened = useRef(false);
  const wasPaused = useRef(paused);
  const setTextRef = useRef(setText);
  setTextRef.current = setText;

  useEffect(() => {
    openChat.current = chatId ?? null;
    justOpened.current = true;
    setTextRef.current(readDraft(userId, chatId));
  }, [userId, chatId]);

  useEffect(() => {
    // Right after a chat opens the box still holds the previous chat's text: don't save that.
    if (justOpened.current) { justOpened.current = false; return; }
    if (paused) { wasPaused.current = true; return; }
    // Done editing a sent message: the draft comes back.
    if (wasPaused.current) { wasPaused.current = false; setTextRef.current(readDraft(userId, openChat.current)); return; }
    if (!openChat.current) return;
    saveDraft(userId, openChat.current, text);
  }, [userId, chatId, text, paused]);
}
