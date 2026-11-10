import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DataRoomShell } from "@/components/data-room/shell";
import { DataRoomDocView } from "@/components/data-room/doc-view";
import { DEMO_TREE, getDemoDoc } from "@/lib/data-room/mock";
import type { DataRoomConfig } from "@/lib/data-room/types";

vi.mock("next/navigation", () => ({
  usePathname: () => "/data-room",
}));

const demoConfig: DataRoomConfig = {
  configured: false,
  demo: true,
  folderId: null,
  title: "Data Room",
  error: null,
};

describe("DataRoomShell", () => {
  it("renders the demo tree and demo banner", () => {
    render(
      <DataRoomShell tree={DEMO_TREE} config={demoConfig}>
        <p>Content area</p>
      </DataRoomShell>,
    );

    expect(screen.getAllByText(/Demo mode/).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /Company overview/ }).getAttribute("href")).toBe(
      "/data-room/doc/demo-overview",
    );
    expect(screen.getByText("Content area")).toBeTruthy();
  });

  it("searches the tree by name", async () => {
    const user = userEvent.setup();
    render(<DataRoomShell tree={DEMO_TREE} config={demoConfig}>Content</DataRoomShell>);

    await user.type(screen.getByRole("textbox", { name: "Search the data room" }), "metrics");

    expect(
      screen.getByRole("link", { name: /Key metrics \(Q3\)/ }).getAttribute("href"),
    ).toBe("/data-room/doc/demo-metrics");
  });
});

describe("DataRoomDocView", () => {
  it("renders a demo document with breadcrumbs and content", () => {
    const doc = getDemoDoc("demo-overview");
    expect(doc).not.toBeNull();
    render(<DataRoomDocView doc={doc!} />);

    expect(screen.getByRole("heading", { name: "Company overview" })).toBeTruthy();
    expect(screen.getByText("Corporate")).toBeTruthy();
    expect(screen.getByText(/This is demo content/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Back to documents/ })).toBeTruthy();
  });
});
