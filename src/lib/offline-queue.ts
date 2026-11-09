import { supabase } from "@/integrations/supabase/client";

/**
 * Things you do while offline (a comment, a reaction) are kept on the phone and sent as soon
 * as the connection is back, instead of failing. Kept in localStorage so closing the app
 * doesn't lose them.
 */
type Job =
  | { kind: "insert"; table: "comments"; values: Record<string, unknown> }
  | { kind: "upsert"; table: "reactions"; values: Record<string, unknown>; onConflict: string }
  | { kind: "delete"; table: "reactions"; match: Record<string, string> };

const KEY = "ember:offline-queue";
export const QUEUE_FLUSHED_EVENT = "ember:offline-queue-flushed";

const read = (): Job[] => {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "[]") as Job[]; } catch { return []; }
};
const write = (jobs: Job[]) => {
  try { localStorage.setItem(KEY, JSON.stringify(jobs)); } catch { /* full or blocked */ }
};

export const isOffline = () => typeof navigator !== "undefined" && navigator.onLine === false;

export function enqueue(job: Job) {
  write([...read(), job]);
}

// The tables are fixed above; the client's per-table types don't follow a union.
type Result = PromiseLike<{ error: { message?: string } | null }>;
type Filter = Result & { eq: (column: string, value: string) => Filter };
type LooseClient = {
  from: (table: string) => {
    insert: (values: unknown) => Result;
    upsert: (values: unknown, options: { onConflict: string }) => Result;
    delete: () => Filter;
  };
};

function run(job: Job): Result {
  const table = (supabase as unknown as LooseClient).from(job.table);
  if (job.kind === "insert") return table.insert(job.values);
  if (job.kind === "upsert") return table.upsert(job.values, { onConflict: job.onConflict });
  let q = table.delete();
  for (const [k, v] of Object.entries(job.match)) q = q.eq(k, v);
  return q;
}

let flushing = false;
export async function flushQueue() {
  if (flushing || isOffline()) return;
  const jobs = read();
  if (!jobs.length) return;
  flushing = true;
  const left: Job[] = [];
  for (const job of jobs) {
    try {
      const { error } = await run(job);
      // A network failure waits for next time; anything else (deleted post, blocked) is dropped.
      if (error && /fetch|network/i.test(error.message ?? "")) left.push(job);
    } catch {
      left.push(job);
    }
  }
  write(left);
  flushing = false;
  window.dispatchEvent(new Event(QUEUE_FLUSHED_EVENT));
}

export function installOfflineQueue() {
  window.addEventListener("online", () => void flushQueue());
  // Anything left from last time.
  window.setTimeout(() => void flushQueue(), 3000);
}
