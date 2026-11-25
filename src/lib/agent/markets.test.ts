// @vitest-environment node
import { describe, expect, it } from "vitest";
import { STRATEGIES as EASY_STRATEGIES, strategyInfo } from "@/lib/trade/thesis";
import { optionName, STRATEGIES, strategyFor } from "./markets";

describe("strategyFor", () => {
  it("turns a view into the same option the Trade page's sentence does", () => {
    for (const strategy of EASY_STRATEGIES) {
      const easy = strategyInfo(strategy);
      const agent = strategyFor(easy.side, easy.direction);
      expect({ product: agent.product, isPut: agent.isPut }, strategy).toEqual({ product: easy.positionType, isPut: easy.isPut });
      expect(agent.name, strategy).toBe(easy.optionName);
    }
    expect(STRATEGIES).toHaveLength(EASY_STRATEGIES.length);
  });

  it("selling above is a cash-secured put; buying above is a call", () => {
    expect(strategyFor("sell", "above")).toMatchObject({ product: "cash_secured_put", isPut: true });
    expect(strategyFor("sell", "below")).toMatchObject({ product: "covered_call", isPut: false });
    expect(strategyFor("buy", "above")).toMatchObject({ product: "covered_call", isPut: false });
    expect(strategyFor("buy", "below")).toMatchObject({ product: "cash_secured_put", isPut: true });
  });

  it("names a product it does not trade by its own name", () => {
    expect(optionName("put_spread", "buy")).toBe("buy put spread");
  });
});
