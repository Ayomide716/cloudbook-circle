import type { ChatMessage } from "@/components/ChatBubble";

/**
 * A photo's size travels with its address (after #, which never reaches the server), so a
 * chat can make room for it before it loads and nothing jumps, as on WhatsApp.
 */
export function withMediaSize(url: string, w: number, h: number): string {
  if (!w || !h) return url;
  return `${url.split("#")[0]}#w=${Math.round(w)}&h=${Math.round(h)}`;
}

/** The size saved with a photo's address, if there is one. */
export function mediaSize(url: string | null | undefined): { w: number; h: number } | null {
  const hash = url?.split("#")[1];
  if (!hash) return null;
  const p = new URLSearchParams(hash);
  const w = Number(p.get("w"));
  const h = Number(p.get("h"));
  return w > 0 && h > 0 ? { w, h } : null;
}

/** A photo file's width and height. */
export async function imageSize(file: Blob): Promise<{ w: number; h: number } | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const size = { w: bitmap.width, h: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return null;
  }
}

/** Runs at most `n` of the given jobs at a time. */
export function limiter(n: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  const next = () => {
    if (active >= n) return;
    const run = queue.shift();
    if (run) { active++; run(); }
  };
  return <T,>(job: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      queue.push(() => job().then(resolve, reject).finally(() => { active--; next(); }));
      next();
    });
}

/**
 * A message you sent, now saved, takes the place of its placeholder (the earliest one still
 * sending with the same text), keeping the photo already on screen so it doesn't load again.
 * `tempId` names the placeholder when it's known.
 */
export function settleSent(prev: ChatMessage[], saved: ChatMessage, tempId?: string): ChatMessage[] {
  if (prev.some((m) => m.id === saved.id)) return tempId ? prev.filter((m) => m.id !== tempId) : prev;
  const i = tempId
    ? prev.findIndex((m) => m.id === tempId)
    : prev.findIndex((m) => m.id.startsWith("temp-") && m._status === "sending" && m.sender_id === saved.sender_id && m.content === saved.content);
  if (i < 0) return [...prev, saved];
  const next = [...prev];
  next[i] = { ...saved, _preview: prev[i]._preview, _video: prev[i]._video };
  return next;
}
