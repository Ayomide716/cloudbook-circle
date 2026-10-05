import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
const { dedupeFeedPages } = await import("./useFeedQuery");

describe("dedupeFeedPages", () => {
  it("shows each post once, keeping the first page it appears on", () => {
    const data = {
      pageParams: [null, "c1"],
      pages: [
        { posts: [{ id: "a" }, { id: "b" }], nextCursor: "c1" },
        { posts: [{ id: "b" }, { id: "c" }], nextCursor: null },
      ],
    };
    const out = dedupeFeedPages(data);
    expect(out.pages.map((p) => p.posts.map((x) => x.id))).toEqual([["a", "b"], ["c"]]);
    expect(out.pageParams).toEqual(data.pageParams);
    expect(out.pages[1].nextCursor).toBeNull();
  });
});
