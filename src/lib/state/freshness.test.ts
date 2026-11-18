import { describe, expect, it } from "vitest";
import { asOfText, isLastKnown, isLive, isTooOld } from "./freshness";

const SESSION = 1_000_000;

describe("data an action may be built on", () => {
  it("was read in this session and is recent enough", () => {
    expect(isLive({ dataUpdatedAt: SESSION + 1_000 }, 60_000, SESSION + 30_000, SESSION)).toBe(true);
  });

  it("is never something read back from storage, however recent", () => {
    expect(isLive({ dataUpdatedAt: SESSION - 1 }, 60_000, SESSION + 10, SESSION)).toBe(false);
  });

  it("is never older than the stated age", () => {
    expect(isLive({ dataUpdatedAt: SESSION + 1_000 }, 60_000, SESSION + 61_001, SESSION)).toBe(false);
  });

  it("is never the leftover of a failed refresh, and never absent", () => {
    expect(isLive({ dataUpdatedAt: SESSION + 1_000, isError: true }, 60_000, SESSION + 2_000, SESSION)).toBe(false);
    expect(isLive({ dataUpdatedAt: 0 }, 60_000, SESSION + 2_000, SESSION)).toBe(false);
  });
});

describe("data shown from storage", () => {
  it("is last-known until a read in this session replaces it", () => {
    expect(isLastKnown({ dataUpdatedAt: SESSION - 5_000 }, SESSION)).toBe(true);
    expect(isLastKnown({ dataUpdatedAt: SESSION + 5_000 }, SESSION)).toBe(false);
    expect(isLastKnown({ dataUpdatedAt: 0 }, SESSION)).toBe(false);
  });

  it("is too old to show past its limit", () => {
    expect(isTooOld({ dataUpdatedAt: 1_000 }, 5_000, 6_001)).toBe(true);
    expect(isTooOld({ dataUpdatedAt: 1_000 }, 5_000, 6_000)).toBe(false);
    expect(isTooOld({ dataUpdatedAt: 0 }, 5_000, 99_999)).toBe(false);
  });

  it("says when it is from: the time today, the date before that", () => {
    const now = new Date(2026, 10, 16, 15, 30).getTime();
    expect(asOfText(new Date(2026, 10, 16, 14, 2).getTime(), now)).toBe("as of 14:02");
    expect(asOfText(new Date(2026, 10, 15, 23, 59).getTime(), now)).toBe("as of Nov 15");
  });
});
