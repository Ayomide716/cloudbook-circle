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
