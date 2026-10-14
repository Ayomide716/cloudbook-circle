import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
const { isUploadedMedia } = await import("./media-upload");

describe("isUploadedMedia", () => {
  const user = "d1b90bde-2fab-4682-89b9-4642123b26c6";

  it("knows files uploaded to Supabase Storage and to Cloudflare R2", () => {
    expect(isUploadedMedia(`https://abc.supabase.co/storage/v1/object/public/post-videos/${user}/1.mp4`)).toBe(true);
    expect(isUploadedMedia(`https://pub-04dbd7976d174440ac7a0bd6fa475de0.r2.dev/post-videos/${user}/1792013330715-82xjkceq.mp4`)).toBe(true);
    expect(isUploadedMedia(`https://media.example.com/watch-videos/${user}/a.webm`)).toBe(true);
  });

  it("treats pasted links as links", () => {
    expect(isUploadedMedia("https://www.tiktok.com/@someone/video/123")).toBe(false);
    expect(isUploadedMedia("https://youtube.com/shorts/abc")).toBe(false);
    expect(isUploadedMedia("https://example.com/post-videos/not-a-user/x.mp4")).toBe(false);
    expect(isUploadedMedia("not a url")).toBe(false);
  });
});
