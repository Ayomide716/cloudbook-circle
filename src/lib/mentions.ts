/**
 * @mentions in posts and comments. The composer shows "@Tolu Adebayo"; what's saved is
 * "@[Tolu Adebayo](user id)", so the post can link to them and the database can notify them
 * (notify_mentions, 20261108110000_mentions_close_friends_trending_reminders.sql).
 */
export interface Mention { id: string; name: string }

/** A saved mention: @[Name](uuid). */
export const MENTION_RE = /@\[([^\]\n]{1,80})\]\(([0-9a-fA-F-]{36})\)/g;

/** A name as it can sit inside the markup (no brackets, parentheses or line breaks). */
export const mentionName = (name: string | null | undefined) =>
  (name || "Someone").replace(/[[\]()\n]/g, "").trim().slice(0, 80) || "Someone";

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Turns each "@Name" you picked from the suggestions into its saved form, once per person. */
export function encodeMentions(text: string, mentions: Mention[]): string {
  let out = text;
  const seen = new Set<string>();
  // Longest names first, so "@Tolu Adebayo" wins over "@Tolu".
  for (const m of [...mentions].sort((a, b) => b.name.length - a.name.length)) {
    if (seen.has(m.id)) continue;
    // "@Name" not already inside a saved mention, and not the start of a longer word.
    const re = new RegExp(`(^|[^\\[\\w])@${escape(m.name)}(?![\\w\\]])`);
    if (re.test(out)) {
      out = out.replace(re, (_all, before: string) => `${before}@[${m.name}](${m.id})`);
      seen.add(m.id);
    }
  }
  return out;
}

/** Plain words for previews and editing: "@[Tolu Adebayo](…)" becomes "@Tolu Adebayo". */
export const plainMentions = (text: string) => text.replace(MENTION_RE, (_m, name: string) => `@${name}`);

/** Lower case without accents, for matching "Adé" with "ade". */
export const foldName = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/**
 * The "@…" being typed just before the caret, if any: where it starts and what's typed so far.
 * Up to two words ("@Tolu Ad"), letters with accents, apostrophes and hyphens; the @ must start
 * a word, so emails don't count.
 */
export function mentionQueryAt(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const m = /(^|\s)@([\p{L}\p{M}'’-]{0,30}(?: [\p{L}\p{M}'’-]{0,30})?)$/u.exec(before);
  if (!m) return null;
  return { start: before.length - m[2].length - 1, query: m[2] };
}

export interface MentionCandidate { id: string; full_name: string | null; avatar_url: string | null; friend?: boolean }

/** Friends before others; a name starting with what you typed before one that only contains it. */
export function rankPeople<T extends MentionCandidate>(people: T[], query: string, limit = 6): T[] {
  const q = foldName(query.trim());
  const score = (p: T) => {
    const name = foldName(p.full_name ?? "");
    if (!q) return p.friend ? 0 : 9;
    const words = name.split(/\s+/);
    const where = name.startsWith(q) ? 0 : words.some((w) => w.startsWith(q)) ? 1 : name.includes(q) ? 2 : -1;
    if (where < 0) return -1;
    return where + (p.friend ? 0 : 3);
  };
  const seen = new Set<string>();
  return people
    .map((p) => ({ p, s: score(p) }))
    .filter(({ p, s }) => s >= 0 && !seen.has(p.id) && seen.add(p.id))
    .sort((a, b) => a.s - b.s || (a.p.full_name ?? "").localeCompare(b.p.full_name ?? ""))
    .slice(0, limit)
    .map(({ p }) => p);
}

/** The picked "@Name" the caret is at the end of (or inside), so Backspace removes it whole. */
export function mentionTokenAt(text: string, caret: number, mentions: Mention[]): { start: number; end: number } | null {
  for (const m of mentions) {
    const token = `@${m.name}`;
    let from = 0;
    for (;;) {
      const i = text.indexOf(token, from);
      if (i < 0) break;
      const end = i + token.length;
      if (caret > i && caret <= end) return { start: i, end };
      from = end;
    }
  }
  return null;
}
