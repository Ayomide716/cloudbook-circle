/**
 * Which of the database updates (supabase/migrations) the live database has, found out by
 * asking it, so features switch on by themselves once the SQL has been run: no Vercel switch,
 * and the Android app (built without them) gets them too.
 *
 * Each update is recognised by columns it adds. Asking for a column the database doesn't have
 * is an error; asking for one it has is fine even when you may not read any rows. The answer
 * is kept on the device, so the app starts straight away next time and checks again quietly.
 */
export type DbUpdate = "2026_10" | "2026_11" | "2026_11B" | "2026_11C" | "2026_11D";

const PROBES: Record<DbUpdate, string[]> = {
  "2026_10": ["profiles?select=hometown", "blocks?select=blocker_id"],
  "2026_11": ["groups?select=category", "close_friends?select=user_id"],
  "2026_11B": ["messages?select=view_once", "chat_themes?select=theme"],
  "2026_11C": ["messages?select=poll", "hidden_messages?select=message_id"],
  "2026_11D": ["group_messages?select=poll", "group_pins?select=message_id"],
};

const KEY = "ember:db-updates";

/** What this device last found (read synchronously by lib/features). */
export function knownDbUpdates(): Partial<Record<DbUpdate, boolean>> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}
const haveChecked = () => { try { return localStorage.getItem(KEY) !== null; } catch { return false; } };

async function probe(path: string): Promise<boolean | null> {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  try {
    const res = await fetch(`${url}/rest/v1/${path}&limit=0`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (res.ok) return true;
    // A missing column or table: the update hasn't been run. Not allowed to read it: it's there.
    const body = (await res.json().catch(() => ({}))) as { code?: string };
    if (["42703", "42P01", "PGRST204", "PGRST205", "PGRST200"].includes(body.code ?? "")) return false;
    if (body.code === "42501" || res.status === 401 || res.status === 403) return true;
    return null; // can't tell (the server is down…)
  } catch {
    return null; // offline
  }
}

/** Asks the database; returns true when something newly switched on. */
export async function checkDbUpdates(): Promise<boolean> {
  const before = knownDbUpdates();
  const after = { ...before };
  await Promise.all(
    (Object.keys(PROBES) as DbUpdate[]).map(async (u) => {
      const results = await Promise.all(PROBES[u].map(probe));
      if (results.every((r) => r === true)) after[u] = true;
      else if (results.some((r) => r === false)) after[u] = false;
    }),
  );
  try { localStorage.setItem(KEY, JSON.stringify(after)); } catch { /* storage blocked */ }
  return (Object.keys(after) as DbUpdate[]).some((u) => after[u] && !before[u]);
}

/**
 * Before the app's first screen: the first time, wait (briefly) for the answer; after that,
 * start at once with what was found last time and check again in the background. A newly run
 * update takes effect the next time the app starts.
 */
export function prepareDbUpdates(timeoutMs = 2500): Promise<void> {
  const check = checkDbUpdates().catch(() => false);
  if (haveChecked()) return Promise.resolve();
  return Promise.race([check.then(() => undefined), new Promise<void>((r) => setTimeout(r, timeoutMs))]);
}
