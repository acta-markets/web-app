import { describe, expect, it } from "vitest";
import { shareLink, xPostUrl } from "./actions";

describe("share actions", () => {
  it("opens a new post on X with the words and the link", () => {
    const url = new URL(xPostUrl("I believe BTC will be above $64,500. Earning 36.52% APR on Acta.", "https://beta.acta.markets/?ref=TIM"));
    expect(url.origin + url.pathname).toBe("https://x.com/intent/post");
    expect(url.searchParams.get("text")).toBe("I believe BTC will be above $64,500. Earning 36.52% APR on Acta.");
    expect(url.searchParams.get("url")).toBe("https://beta.acta.markets/?ref=TIM");
  });

  it("carries the sharer's referral code when they have one", () => {
    expect(shareLink("https://beta.acta.markets", "TIM 1")).toBe("https://beta.acta.markets/?ref=TIM%201");
    expect(shareLink("https://beta.acta.markets", null)).toBe("https://beta.acta.markets");
    expect(shareLink("https://beta.acta.markets")).toBe("https://beta.acta.markets");
  });
});
