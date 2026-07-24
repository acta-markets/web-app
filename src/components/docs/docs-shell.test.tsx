import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DocsShell } from "@/components/docs/docs-shell";

vi.mock("next/navigation", () => ({
  usePathname: () => "/docs/reference/http-api",
}));

const navigation = [
  {
    title: "Overview",
    items: [{ title: "Acta Protocol", slug: "" }],
  },
  {
    title: "Reference",
    items: [{ title: "Public HTTP API", slug: "reference/http-api" }],
  },
];

const searchIndex = [
  {
    title: "Acta Protocol",
    slug: "",
    description: "Protocol overview",
    text: "Structured yield on Solana",
  },
  {
    title: "Public HTTP API",
    slug: "reference/http-api",
    description: "Read-only endpoints",
    text: "Market discovery requires no authentication",
  },
];

describe("DocsShell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks the current page and searches documentation content", async () => {
    const user = userEvent.setup();
    render(
      <DocsShell navigation={navigation} searchIndex={searchIndex}>
        <p>Documentation content</p>
      </DocsShell>,
    );

    expect(
      screen
        .getByRole("link", { name: "Public HTTP API" })
        .getAttribute("aria-current"),
    ).toBe("page");
    expect(
      screen.getByRole("link", { name: "Back to Acta" }).getAttribute("href"),
    ).toBe("/");

    await user.type(
      screen.getByRole("textbox", { name: "Search documentation" }),
      "authentication",
    );

    expect(
      screen.getAllByRole("link", { name: /Public HTTP API/ }),
    ).toHaveLength(2);
    expect(screen.getByText("Read-only endpoints")).toBeTruthy();
  });

  it("opens and closes mobile navigation", async () => {
    const user = userEvent.setup();
    render(
      <DocsShell navigation={navigation} searchIndex={searchIndex}>
        <p>Documentation content</p>
      </DocsShell>,
    );

    const toggle = screen.getByRole("button", {
      name: "Toggle documentation navigation",
    });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");

    await user.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");

    await user.click(
      screen.getByRole("button", {
        name: "Close documentation navigation",
      }),
    );
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });
});
