/**
 * Real-looking names, as Facebook asks for: a first name and a surname, in letters, not "ddd"
 * or "asdf". Kept simple on purpose: it stops obvious junk, not unusual real names.
 */
const JUNK = new Set(["test", "tester", "user", "admin", "asdf", "qwerty", "abc", "abcd", "xyz", "name", "null", "undefined", "aaa", "zzz", "hello", "hi", "nobody", "anonymous", "unknown"]);

/** "  ada   LOVELACE " → "Ada Lovelace": tidy spaces, and capitals if typed all-lower or all-upper. */
export function tidyName(raw: string): string {
  const name = raw.trim().replace(/\s+/g, " ");
  if (name !== name.toLowerCase() && name !== name.toUpperCase()) return name; // Mixed case: as typed (McDonald).
  return name
    .toLowerCase()
    .replace(/(^|[\s'-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

/** What's wrong with this name, in words, or null when it's fine. */
export function nameProblem(raw: string): string | null {
  const name = tidyName(raw);
  if (!name) return "Enter your name.";
  if (name.length > 50) return "That name is too long.";
  if (!/^[\p{L}\p{M}' .-]+$/u.test(name)) return "Use letters only, without numbers or symbols.";
  const words = name.split(" ").filter((w) => /\p{L}/u.test(w));
  if (words.length < 2) return "Enter your first name and surname.";
  for (const word of words) {
    const letters = word.toLowerCase().replace(/[^\p{L}]/gu, "");
    if (letters.length < 2) return "Write your names in full.";
    if (/^(.)\1+$/u.test(letters)) return "Please use your real name.";
    if (JUNK.has(letters)) return "Please use your real name.";
    // Longer Latin-alphabet words need a vowel ("Xzqk" isn't a name; "Ng" is).
    if (letters.length > 2 && /^[a-z]+$/.test(letters) && !/[aeiouy]/.test(letters)) return "Please use your real name.";
  }
  return null;
}
