import { describe, expect, it } from "vitest";
import { planUpload } from "../../supabase/functions/_shared/media-rules";

const user = "a31f83da-2ae6-43cd-8e0d-2605ee881d27";

describe("where uploads go (Cloudflare R2)", () => {
  it("names the file itself, under the uploader's own id", () => {
    expect(planUpload(user, { folder: "post-images", contentType: "image/webp", size: 300_000, ext: "webp" }, 1700000000000, "abc123")).toEqual({
      ok: true,
      key: `post-images/${user}/1700000000000-abc123.webp`,
    });
  });

  it("refuses the wrong kind of file, unknown folders and oversized files", () => {
    expect(planUpload(user, { folder: "avatars", contentType: "video/mp4", size: 1000 })).toMatchObject({ ok: false, status: 415 });
    expect(planUpload(user, { folder: "../secrets", contentType: "image/png", size: 1000 })).toMatchObject({ ok: false, status: 400 });
    expect(planUpload(user, { folder: "avatars", contentType: "image/png", size: 50 * 1024 * 1024 })).toMatchObject({ ok: false, status: 413 });
  });

  it("never lets a strange extension into the name", () => {
    const r = planUpload(user, { folder: "post-images", contentType: "image/jpeg", size: 1000, ext: "../x.html" }, 1, "r");
    expect(r).toEqual({ ok: true, key: `post-images/${user}/1-r.jpeg` });
  });
});
