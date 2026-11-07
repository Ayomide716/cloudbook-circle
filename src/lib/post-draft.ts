/**
 * The post you were writing, kept on this phone so closing the composer (or the app) doesn't
 * lose it. One draft per account; cleared once the post goes up.
 */
export interface PostDraft { content: string; location?: string; savedAt: number }

const key = (userId: string) => `ember:post-draft:${userId}`;
/** Drafts older than this are dropped rather than offered back. */
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

export function loadDraft(userId: string): PostDraft | null {
  try {
    const raw = localStorage.getItem(key(userId));
    if (!raw) return null;
    const d = JSON.parse(raw) as PostDraft;
    if (!d.content?.trim() || Date.now() - d.savedAt > MAX_AGE_MS) return null;
    return d;
  } catch {
    return null;
  }
}

export function saveDraft(userId: string, content: string, location = "") {
  try {
    if (!content.trim()) localStorage.removeItem(key(userId));
    else localStorage.setItem(key(userId), JSON.stringify({ content, location, savedAt: Date.now() } satisfies PostDraft));
  } catch {
    /* private mode or storage full: drafts just aren't kept */
  }
}

export const clearDraft = (userId: string) => saveDraft(userId, "");
