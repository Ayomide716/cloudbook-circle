import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { resetOutage, useOutage, watchedFetch } from "./outage";

const answer = (status: number) => vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status }));
const outage = () => renderHook(() => useOutage()).result.current;

afterEach(() => { vi.restoreAllMocks(); resetOutage(); });

describe("outage", () => {
  it("a paused project (402) shows at once", async () => {
    answer(402);
    await watchedFetch("https://x.supabase.co/rest/v1/posts");
    expect(outage()).toBe("paused");
  });

  it("needs three server errors in a row, and a good answer clears it", async () => {
    answer(503);
    await watchedFetch("https://x.supabase.co/rest/v1/posts");
    await watchedFetch("https://x.supabase.co/rest/v1/posts");
    expect(outage()).toBeNull();
    await watchedFetch("https://x.supabase.co/rest/v1/posts");
    expect(outage()).toBe("down");
    answer(200);
    await watchedFetch("https://x.supabase.co/rest/v1/posts");
    expect(outage()).toBeNull();
  });

  it("ignores a server function's own errors", async () => {
    answer(500);
    for (let i = 0; i < 5; i++) await watchedFetch("https://x.supabase.co/functions/v1/media-upload");
    expect(outage()).toBeNull();
  });
});
