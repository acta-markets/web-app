import { describe, expect, it } from "vitest";
import { fitLine, fitSentence, wrapLines } from "./render";

/** Every character is as wide as the font size is tall, halved: enough to test the arithmetic. */
const measureAt = (size: number) => (text: string) => text.length * size * 0.5;

describe("share card text fitting", () => {
  it("wraps at word boundaries and never drops a word", () => {
    const lines = wrapLines(measureAt(20), "BTC will be above $64,500 on Nov 20", 120);
    expect(lines.join(" ")).toBe("BTC will be above $64,500 on Nov 20");
    for (const line of lines) expect(line.length * 10).toBeLessThanOrEqual(120);
  });

  it("keeps a word wider than the line on a line of its own", () => {
    expect(wrapLines(measureAt(20), "a Supercalifragilistic b", 60)).toEqual(["a", "Supercalifragilistic", "b"]);
  });

  it("takes the largest size whose line budget the sentence fits", () => {
    const sizes = [[80, 1], [40, 2], [20, 3]] as const;
    expect(fitSentence(measureAt, "short", 400, sizes).size).toBe(80);
    const fitted = fitSentence(measureAt, "a sentence that needs two lines here", 400, sizes);
    expect(fitted.size).toBe(40);
    expect(fitted.lines).toHaveLength(2);
  });

  it("falls back to the smallest size, cut to its budget, when nothing fits", () => {
    const fitted = fitSentence(measureAt, "one two three four five six seven eight nine ten", 60, [[40, 1], [20, 2]]);
    expect(fitted.size).toBe(20);
    expect(fitted.lines).toHaveLength(2);
  });

  it("shrinks one line until it fits, down to a floor", () => {
    expect(fitLine(measureAt, "+$1,514.58", 1000, 132, 56)).toBe(132);
    const size = fitLine(measureAt, "+$11,141,123.88", 600, 132, 56);
    expect("+$11,141,123.88".length * size * 0.5).toBeLessThanOrEqual(600);
    expect(fitLine(measureAt, "x".repeat(200), 100, 132, 56)).toBe(56);
  });
});
