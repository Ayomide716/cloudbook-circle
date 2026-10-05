import { describe, expect, it } from "vitest";
import { mainScriptOf } from "./app-updates";

describe("mainScriptOf", () => {
  it("finds the built app script", () => {
    const html = '<head><script type="module" crossorigin src="/assets/index-AbC123.js"></script></head>';
    expect(mainScriptOf(html)).toBe("/assets/index-AbC123.js");
  });

  it("finds it when src comes first", () => {
    expect(mainScriptOf('<script src="/assets/index-X.js" type="module"></script>')).toBe("/assets/index-X.js");
  });

  it("returns null on the development server", () => {
    expect(mainScriptOf('<script type="module" src="/src/main.tsx"></script>')).toBeNull();
  });
});
