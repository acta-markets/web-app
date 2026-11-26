import { describe, expect, it } from "vitest";
import { EDITION, editionFrom, isHiddenAsset } from "./edition";

describe("edition", () => {
  it("is the default build unless the variable names p0", () => {
    expect(editionFrom(undefined)).toBe("default");
    expect(editionFrom("")).toBe("default");
    expect(editionFrom("devnet")).toBe("default");
    expect(editionFrom("p0")).toBe("p0");
    expect(editionFrom(" P0 ")).toBe("p0");
    // tests run without the variable
    expect(EDITION).toBe("default");
  });

  it("hides nothing by default and jitoSOL in the P0 edition, in any case", () => {
    expect(isHiddenAsset("JITOSOL", "default")).toBe(false);
    expect(isHiddenAsset("JITOSOL", "p0")).toBe(true);
    expect(isHiddenAsset("jitoSOL", "p0")).toBe(true);
    expect(isHiddenAsset(" jitosol ", "p0")).toBe(true);
    expect(isHiddenAsset("LST", "p0")).toBe(false);
    expect(isHiddenAsset("SOL", "p0")).toBe(false);
  });
});
