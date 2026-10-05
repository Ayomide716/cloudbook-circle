/**
 * Posts you hid with ✕ and people you snoozed for 30 days, as in Facebook's
 * "Why aren't you interested?" panel. Kept on this device (like the mood), so it
 * works without a server change; the feed leaves these posts out when it loads.
 */
const HIDDEN_KEY = "cloudbook_hidden_posts";
const SNOOZED_KEY = "cloudbook_snoozed_people";
export const SNOOZE_DAYS = 30;

type Snoozed = Record<string, number>; // person id -> snoozed until (ms)
interface State {
  hidden: string[];
  snoozed: Snoozed;
}

// Read once and cached; every change clears it.
let cache: State | null = null;

const read = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

const write = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage blocked: it lasts for this visit only */
  }
  cache = null;
};

const state = (): State => (cache ??= { hidden: read<string[]>(HIDDEN_KEY, []), snoozed: read<Snoozed>(SNOOZED_KEY, {}) });

export function hidePost(postId: string) {
  const { hidden } = state();
  if (!hidden.includes(postId)) write(HIDDEN_KEY, [...hidden, postId].slice(-500));
}

export function unhidePost(postId: string) {
  write(HIDDEN_KEY, state().hidden.filter((id) => id !== postId));
}

export function snoozePerson(personId: string, now = Date.now()) {
  write(SNOOZED_KEY, { ...state().snoozed, [personId]: now + SNOOZE_DAYS * 24 * 3600_000 });
}

export function unsnoozePerson(personId: string) {
  const next = { ...state().snoozed };
  delete next[personId];
  write(SNOOZED_KEY, next);
}

/** Whether the feed should leave this post out. */
export function isFilteredOut(post: { id: string; user_id: string }, current: State = state(), now = Date.now()) {
  const until = current.snoozed[post.user_id];
  return current.hidden.includes(post.id) || (until !== undefined && until > now);
}
