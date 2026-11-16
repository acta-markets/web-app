import { ActaHttpError } from "@acta-markets/ts-sdk/http";
import { describe, expect, it } from "vitest";
import { nullWhenMissing } from "./api";
import { rewardsSampleRequested } from "./source";

describe("sample mode", () => {
  it("is asked for by the flag or by the page's address, in development", () => {
    expect(rewardsSampleRequested("development", "1", "")).toBe(true);
    expect(rewardsSampleRequested("development", undefined, "?sample=1")).toBe(true);
    expect(rewardsSampleRequested("development", undefined, "")).toBe(false);
    expect(rewardsSampleRequested("development", "0", "?sample=0")).toBe(false);
  });

  it("is never on in a production build, whatever asks for it", () => {
    expect(rewardsSampleRequested("production", "1", "?sample=1")).toBe(false);
  });
});

describe("a missing season or wallet", () => {
  it("is an answer, not a failure", async () => {
    // what the devnet backend answers while no season is published
    await expect(nullWhenMissing(Promise.reject(new ActaHttpError(404, "not_found", "no season yet")))).resolves.toBeNull();
  });

  it("leaves every other error an error", async () => {
    await expect(nullWhenMissing(Promise.reject(new ActaHttpError(500, "internal", "boom")))).rejects.toThrow("boom");
    await expect(nullWhenMissing(Promise.reject(new TypeError("Failed to fetch")))).rejects.toThrow("Failed to fetch");
  });

  it("passes a value through", async () => {
    await expect(nullWhenMissing(Promise.resolve({ slug: "s" }))).resolves.toEqual({ slug: "s" });
  });
});
