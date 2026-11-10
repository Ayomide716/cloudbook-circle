import { afterEach, describe, expect, it, vi } from "vitest";
import { checkDbUpdates, knownDbUpdates } from "./db-updates";

const answer = (status: number, body: unknown = []) => Promise.resolve(new Response(JSON.stringify(body), { status }));

describe("finding database updates", () => {
  afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

  it("switches on an update whose columns are there, and not one whose aren't", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://x.supabase.co");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "anon");
    vi.stubGlobal("fetch", (url: string) =>
      /group_messages\?select=poll|group_pins/.test(url) ? answer(400, { code: url.includes("pins") ? "PGRST205" : "42703" })
        : /hidden_messages/.test(url) ? answer(401, { code: "42501" })
        : answer(200));
    expect(await checkDbUpdates()).toBe(true);
    const found = knownDbUpdates();
    expect(found["2026_11B"]).toBe(true);
    expect(found["2026_11C"]).toBe(true); // a table it may not read is still there
    expect(found["2026_11D"]).toBe(false);
  });

  it("keeps what it knew when the server can't be reached", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://x.supabase.co");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "anon");
    localStorage.setItem("ember:db-updates", JSON.stringify({ "2026_11B": true }));
    vi.stubGlobal("fetch", () => Promise.reject(new Error("offline")));
    expect(await checkDbUpdates()).toBe(false);
    expect(knownDbUpdates()["2026_11B"]).toBe(true);
  });
});
