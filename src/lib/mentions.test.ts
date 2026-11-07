import { describe, expect, it } from "vitest";
import { encodeMentions, plainMentions, mentionName } from "./mentions";

const T = { id: "11111111-1111-4111-8111-111111111111", name: "Tolu Adebayo" };
const T2 = { id: "22222222-2222-4222-8222-222222222222", name: "Tolu" };

describe("mentions", () => {
  it("encodes a picked mention once", () => {
    expect(encodeMentions("Hi @Tolu Adebayo and @Tolu Adebayo!", [T])).toBe(`Hi @[Tolu Adebayo](${T.id}) and @Tolu Adebayo!`);
  });
  it("prefers the longer name", () => {
    expect(encodeMentions("@Tolu Adebayo @Tolu", [T2, T])).toBe(`@[Tolu Adebayo](${T.id}) @[Tolu](${T2.id})`);
  });
  it("leaves a mention that was deleted from the text", () => {
    expect(encodeMentions("hello", [T])).toBe("hello");
  });
  it("doesn't match inside an email or a longer word", () => {
    expect(encodeMentions("mail me@Tolu Adebayo", [T])).toBe("mail me@Tolu Adebayo");
    expect(encodeMentions("@Tolu Adebayox", [T])).toBe("@Tolu Adebayox");
  });
  it("turns saved mentions back into plain words", () => {
    expect(plainMentions(`Hi @[Tolu Adebayo](${T.id})`)).toBe("Hi @Tolu Adebayo");
  });
  it("cleans names that would break the markup", () => {
    expect(mentionName("Ada (Lagos) [x]")).toBe("Ada Lagos x");
  });
});
