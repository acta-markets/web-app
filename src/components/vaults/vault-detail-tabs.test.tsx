import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { VaultDetailTabs } from "./vault-detail-tabs";

afterEach(cleanup);

const history = { value: "history", label: "History", content: <p>history body</p> };
const positions = { value: "positions", label: "Positions", content: <p>positions body</p> };

it("opens a tab that loads after the first render unless the user already chose", () => {
  const view = render(<VaultDetailTabs tabs={[history]} />);
  view.rerender(<VaultDetailTabs tabs={[positions, history]} />);
  expect(screen.getByText("positions body")).toBeTruthy();
  fireEvent.click(screen.getByRole("tab", { name: "History" }));
  expect(screen.getByText("history body")).toBeTruthy();
  view.rerender(<VaultDetailTabs tabs={[history]} />);
  view.rerender(<VaultDetailTabs tabs={[positions, history]} />);
  expect(screen.getByText("history body")).toBeTruthy();
});
