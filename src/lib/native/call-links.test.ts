import { describe, expect, it } from "vitest";
import { parseCallLink } from "./call-links";

describe("parseCallLink", () => {
  const now = 1_000_000;
  it("reads an answered call", () => {
    expect(parseCallLink(`app.ember.social://call?from=abc&name=Ada&voice=1&at=${now - 5000}&answer=1`, now)).toEqual({
      peer: { id: "abc", name: "Ada", avatar: null },
      isVoiceOnly: true,
      answer: true,
    });
  });
  it("ignores calls that stopped ringing and other links", () => {
    expect(parseCallLink(`app.ember.social://call?from=abc&at=${now - 60_000}`, now)).toBeNull();
    expect(parseCallLink(`app.ember.social://auth#access_token=x`, now)).toBeNull();
  });
});
