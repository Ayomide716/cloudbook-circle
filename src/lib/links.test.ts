import { describe, expect, it } from "vitest";
import { firstLink, youTubeId } from "@/lib/links";

describe("link previews", () => {
  it("finds the first link and drops trailing punctuation", () => {
    expect(firstLink("see https://example.com/a/b. nice")).toBe("https://example.com/a/b");
    expect(firstLink("(https://example.com)")).toBe("https://example.com/");
    expect(firstLink("no links #here")).toBeNull();
    expect(firstLink("javascript:alert(1)")).toBeNull();
  });

  it("recognises YouTube links", () => {
    expect(youTubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youTubeId("https://youtu.be/dQw4w9WgXcQ?t=3")).toBe("dQw4w9WgXcQ");
    expect(youTubeId("https://youtube.com/shorts/abcDEF12345")).toBe("abcDEF12345");
    expect(youTubeId("https://example.com/watch?v=dQw4w9WgXcQ")).toBeNull();
  });
});
