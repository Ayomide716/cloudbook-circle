import { describe, expect, it } from "vitest";
import { planUpload, readR2Settings } from "../../supabase/functions/_shared/media-rules";

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

describe("readR2Settings", () => {
  const id = "0123456789abcdef0123456789ABCDEF";
  const env = (over: Record<string, string>) => (name: string) =>
    ({ R2_ACCOUNT_ID: id, R2_ACCESS_KEY_ID: "key", R2_SECRET_ACCESS_KEY: "secret", R2_BUCKET: "ember-media", R2_PUBLIC_URL: "https://pub-1.r2.dev", ...over })[name];

  it("takes the account ID out of a pasted address, and trims spaces and slashes", () => {
    const r = readR2Settings(env({ R2_ACCOUNT_ID: ` https://${id}.r2.cloudflarestorage.com/\n`, R2_SECRET_ACCESS_KEY: "secret\n", R2_PUBLIC_URL: "pub-1.r2.dev/" }));
    expect(r).toEqual({
      ok: true,
      settings: { accountId: id.toLowerCase(), accessKeyId: "key", secretAccessKey: "secret", bucket: "ember-media", publicUrl: "https://pub-1.r2.dev" },
    });
  });

  it("names missing and wrong-looking secrets, never their values", () => {
    expect(readR2Settings(env({ R2_ACCOUNT_ID: "my-account", R2_PUBLIC_URL: "" }))).toEqual({ ok: false, missing: ["R2_PUBLIC_URL"], bad: ["R2_ACCOUNT_ID"] });
    expect(readR2Settings(env({ R2_BUCKET: "Ember Media" }))).toEqual({ ok: false, missing: [], bad: ["R2_BUCKET"] });
  });
});
