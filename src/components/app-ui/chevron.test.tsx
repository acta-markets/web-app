import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Chevron, type ChevronKind } from "./chevron";

afterEach(cleanup);

describe("Chevron", () => {
  it.each<[ChevronKind, number]>([
    ["menu", 1],
    ["next", 1],
    ["switch", 2],
    ["go", 2],
    ["unfold", 2],
    ["fold", 2],
    ["close", 2],
  ])("draws %s with %i stroke(s), cut square and in the text colour", (kind, strokes) => {
    const { container } = render(<Chevron kind={kind} className="h-5 w-5" />);
    const svg = container.querySelector("svg")!;
    expect(svg.querySelectorAll("path")).toHaveLength(strokes);
    expect(svg.getAttribute("stroke")).toBe("currentColor");
    expect(svg.getAttribute("stroke-linecap")).toBe("square");
    // decoration only: the control it sits in carries the name
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("class")).toBe("h-5 w-5");
  });
});
