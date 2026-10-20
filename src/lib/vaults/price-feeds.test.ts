import { afterEach, describe, expect, it, vi } from "vitest";
import { pythFeedShards } from "./price-feeds";

describe("pythFeedShards", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("defaults to shard 0 and reads configured shards", () => {
    vi.stubEnv("NEXT_PUBLIC_PYTH_FEED_SHARDS", "");
    expect(pythFeedShards()).toEqual([0]);
    vi.stubEnv("NEXT_PUBLIC_PYTH_FEED_SHARDS", "2");
    expect(pythFeedShards()).toEqual([2]);
    expect(pythFeedShards(" ")).toEqual([0]);
    expect(pythFeedShards("1")).toEqual([1]);
    expect(pythFeedShards("0, 3")).toEqual([0, 3]);
  });

  it("rejects values that are not u16 shards", () => {
    for (const value of ["x", "1,", "-1", "65536", "1.5"]) {
      expect(() => pythFeedShards(value)).toThrow("NEXT_PUBLIC_PYTH_FEED_SHARDS");
    }
  });
});
