import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
const { storagePathFromUrl } = await import("./storage-upload");

describe("storagePathFromUrl", () => {
  const base = "https://abc.supabase.co/storage/v1/object/public";

  it("returns the path inside the bucket", () => {
    expect(storagePathFromUrl("post-videos", `${base}/post-videos/user-1/clip.mp4`)).toBe("user-1/clip.mp4");
  });

  it("decodes encoded names", () => {
    expect(storagePathFromUrl("avatars", `${base}/avatars/u/my%20photo.png`)).toBe("u/my photo.png");
  });

  it("refuses files from another bucket or site", () => {
    expect(storagePathFromUrl("avatars", `${base}/post-images/u/a.png`)).toBeNull();
    expect(storagePathFromUrl("avatars", "https://example.com/a.png")).toBeNull();
  });
});
