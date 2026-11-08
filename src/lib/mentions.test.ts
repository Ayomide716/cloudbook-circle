import { describe, expect, it } from "vitest";
import { encodeMentions, plainMentions, mentionName, mentionQueryAt, rankPeople, mentionTokenAt } from "./mentions";

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

describe("the @ picker", () => {
  it("finds what's being typed after @, up to two words, with accents", () => {
    expect(mentionQueryAt("hi @Tol", 7)).toEqual({ start: 3, query: "Tol" });
    expect(mentionQueryAt("hi @Tolu Ad", 11)).toEqual({ start: 3, query: "Tolu Ad" });
    expect(mentionQueryAt("@Adé", 4)).toEqual({ start: 0, query: "Adé" });
    expect(mentionQueryAt("hi @", 4)).toEqual({ start: 3, query: "" });
  });
  it("ignores emails and finished words", () => {
    expect(mentionQueryAt("me@Tolu", 7)).toBeNull();
    expect(mentionQueryAt("@Tolu Adebayo is here", 21)).toBeNull();
  });
  it("puts friends first and start-of-name matches before the rest", () => {
    const people = [
      { id: "1", full_name: "Bola Ade", avatar_url: null },
      { id: "2", full_name: "Adé Okafor", avatar_url: null, friend: true },
      { id: "3", full_name: "Ade Bello", avatar_url: null },
      { id: "4", full_name: "Kade Musa", avatar_url: null, friend: true },
    ];
    expect(rankPeople(people, "ade").map((p) => p.id)).toEqual(["2", "4", "3", "1"]);
    expect(rankPeople(people, "").map((p) => p.id)).toEqual(["2", "4", "3", "1"].filter((id) => ["2", "4"].includes(id)).concat(["3", "1"]));
  });
  it("finds the whole mention to delete", () => {
    const m = [{ id: "x", name: "Tolu Adebayo" }];
    expect(mentionTokenAt("hi @Tolu Adebayo ", 16, m)).toEqual({ start: 3, end: 16 });
    expect(mentionTokenAt("hi @Tolu Adebayo ", 17, m)).toBeNull();
  });
});
