import { describe, expect, it } from "vitest";
import { clipMono, fitMono, sentenceSize } from "./card-image";

describe("share card text fitting", () => {
  it("keeps a headline figure at full size while it fits, and shrinks a long one to the card's width", () => {
    expect(fitMono("+$1,514.58", 1072, 132, 56, -0.03)).toBe(132);
    const size = fitMono("+$11,141,123.88", 1072, 132, 56, -0.03);
    expect(size).toBeLessThan(132);
    expect("+$11,141,123.88".length * size * 0.57).toBeLessThanOrEqual(1072);
    expect(fitMono("9".repeat(200), 1072, 132, 56, -0.03)).toBe(56);
  });

  it("cuts a value that cannot fit its column, and leaves one that does alone", () => {
    expect(clipMono("Call", 244, 36, -0.02)).toBe("Call");
    const cut = clipMono("Put spread 1,100/1,250.50", 244, 20, -0.02);
    expect(cut.endsWith("…")).toBe(true);
    expect(cut.length * 20 * 0.58).toBeLessThanOrEqual(244);
  });

  it("sets a longer sentence smaller", () => {
    expect(sentenceSize("BTC will be above $64,500 on Nov 20")).toBe(76);
    expect(sentenceSize("x".repeat(60))).toBe(64);
    expect(sentenceSize("x".repeat(90))).toBe(54);
    expect(sentenceSize("x".repeat(140))).toBe(46);
  });
});
