import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DocsShell } from "@/components/docs/docs-shell";
import type { DocsNavGroup } from "@/lib/docs-content";

const route = vi.hoisted(() => ({ pathname: "/docs/reference/http-api", push: vi.fn() }));

vi.mock("next/navigation", () => ({
  usePathname: () => route.pathname,
  useRouter: () => ({ push: route.push }),
}));

const navigation: DocsNavGroup[] = [
  {
    audience: "user",
    title: "Overview",
    items: [{ title: "Getting started", slug: "" }],
  },
  {
    audience: "protocol",
    title: "Protocol",
    items: [{ title: "Overview", slug: "protocol" }],
  },
  {
    audience: "protocol",
    title: "Reference",
    items: [{ title: "Public HTTP API", slug: "reference/http-api" }],
  },
];

const searchIndex = [
  {
    audience: "user" as const,
    title: "Getting started",
    slug: "",
    description: "Protocol overview",
    text: "Structured yield on Solana",
  },
  {
    audience: "protocol" as const,
    title: "Public HTTP API",
    slug: "reference/http-api",
    description: "Read-only endpoints",
    text: "Market discovery requires no authentication. Services can be unavailable.",
  },
  {
    audience: "protocol" as const,
    title: "Shares, NAV and fees",
    slug: "protocol/vault-accounting",
    description: "Net asset value and share price",
    text: "The contract values vault assets at processing.",
  },
];

describe("DocsShell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    route.pathname = "/docs/reference/http-api";
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
    expect(screen.queryByRole("link", { name: "Getting started" })).toBeNull();
    expect(screen.getByRole("link", { name: "Protocol & integrations" }).getAttribute("aria-current")).toBe("true");
    expect(
      screen.getByRole("link", { name: "Back to Acta" }).getAttribute("href"),
    ).toBe("/");

    await user.type(
      screen.getByRole("combobox", { name: "Search documentation" }),
      "authentication",
    );

    expect(
      screen.getAllByText("Public HTTP API"),
    ).toHaveLength(2);
    expect(screen.getByText("Read-only endpoints")).toBeTruthy();
  });

  it("opens the user guide by default and searches across both sections", async () => {
    route.pathname = "/docs";
    const user = userEvent.setup();
    render(<DocsShell navigation={navigation} searchIndex={searchIndex}>Content</DocsShell>);

    expect(screen.getByRole("link", { name: "Getting started" }).getAttribute("aria-current")).toBe("page");
    expect(screen.queryByRole("link", { name: "Public HTTP API" })).toBeNull();
    expect(screen.getByRole("link", { name: "Protocol & integrations" }).getAttribute("href")).toBe("/docs/protocol");

    await user.type(screen.getByRole("combobox", { name: "Search documentation" }), "authentication");
    expect(screen.getByRole("option", { name: /Public HTTP API/ }).getAttribute("href")).toBe("/docs/reference/http-api");
  });

  it("finds NAV without matching unavailable and combines query terms", async () => {
    const user = userEvent.setup();
    render(<DocsShell navigation={navigation} searchIndex={searchIndex}>Content</DocsShell>);
    const input = screen.getByRole("combobox", { name: "Search documentation" });
    await user.type(input, "NAV");
    expect(screen.getByRole("option", { name: /Shares, NAV and fees/ })).toBeTruthy();
    expect(screen.queryByRole("option", { name: /Public HTTP API/ })).toBeNull();
    await user.clear(input);
    await user.type(input, "share price");
    expect(screen.getByRole("option", { name: /Shares, NAV and fees/ })).toBeTruthy();
  });

  it("selects results with arrows and Enter and dismisses with Escape or blur", async () => {
    const user = userEvent.setup();
    render(<DocsShell navigation={navigation} searchIndex={searchIndex}>Content</DocsShell>);
    const input = screen.getByRole("combobox", { name: "Search documentation" });
    await user.type(input, "authentication");
    await user.keyboard("{ArrowDown}");
    expect(input.getAttribute("aria-activedescendant")).toBe(screen.getByRole("option").id);
    expect(screen.getByRole("option").getAttribute("aria-selected")).toBe("true");
    await user.keyboard("{Enter}");
    expect(route.push).toHaveBeenCalledWith("/docs/reference/http-api");
    expect(screen.queryByRole("listbox")).toBeNull();
    await user.type(input, "NAV");
    await user.keyboard("{ArrowUp}");
    expect(screen.getByRole("option").getAttribute("aria-selected")).toBe("true");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("listbox")).toBeTruthy();
    await user.tab();
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("announces an open search with no matches and dismisses it", async () => {
    const user = userEvent.setup();
    render(<DocsShell navigation={navigation} searchIndex={searchIndex}>Content</DocsShell>);
    const input = screen.getByRole("combobox", { name: "Search documentation" });
    await user.type(input, "nonexistent term");
    expect(input.getAttribute("aria-expanded")).toBe("true");
    expect(input.getAttribute("aria-controls")).toBe(screen.getByRole("status").id);
    expect(screen.getByText("No documentation found.")).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("status")).toBeNull();
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

    await user.click(toggle);
    const mobileNavigation = screen.getAllByRole("navigation", { name: "Documentation" })[1];
    await user.click(within(mobileNavigation).getByRole("link", { name: "Public HTTP API" }));
    expect(toggle.getAttribute("aria-expanded")).toBe("false");

    await user.click(toggle);
    await user.keyboard("{Escape}");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });
});
