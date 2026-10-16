import { describe, expect, it } from "vitest";
import { nameProblem, tidyName } from "./name-check";

describe("name-check", () => {
  it("accepts real names", () => {
    for (const n of ["Ada Lovelace", "Oyetayo Abdullahi", "Chukwuemeka Obi", "Yusuff Opeyemi Ojeniran", "Mary-Jane O'Neil", "José Álvarez", "Ng Wei"]) {
      expect(nameProblem(n), n).toBeNull();
    }
  });

  it("refuses junk", () => {
    expect(nameProblem("ddd")).toMatch(/first name and surname/);
    expect(nameProblem("ddd ddd")).toMatch(/real name/);
    expect(nameProblem("asdf ghjk")).toMatch(/real name/);
    expect(nameProblem("Test User")).toMatch(/real name/);
    expect(nameProblem("John 123")).toMatch(/letters only/);
    expect(nameProblem("J D")).toMatch(/in full/);
    expect(nameProblem("   ")).toMatch(/Enter your name/);
  });

  it("tidies spacing and capitals", () => {
    expect(tidyName("  ada   lovelace ")).toBe("Ada Lovelace");
    expect(tidyName("ADA LOVELACE")).toBe("Ada Lovelace");
    expect(tidyName("Ronald McDonald")).toBe("Ronald McDonald");
  });
});
