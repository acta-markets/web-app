import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { makeVault } from "@/lib/vaults/sample";
import { VaultTerms } from "./vault-terms";

afterEach(cleanup);

it("shows Unlimited for u64::MAX even when the API returns remaining capacity", () => {
  const vault = makeVault();
  render(<VaultTerms vault={{ ...vault, capacity: {
    ...vault.capacity, cap_limit: "18446744073709551615", remaining: "18446744073609551615",
  } }} symbol="SOL" />);
  expect(screen.getByText("Unlimited")).toBeTruthy();
  expect(screen.queryByText(/18\.45B/)).toBeNull();
});

it("renders a zero cap without division by zero", () => {
  const vault = makeVault();
  render(<VaultTerms vault={{ ...vault, capacity: {
    ...vault.capacity, cap_limit: "0", remaining: "0",
  } }} symbol="SOL" />);
  expect(screen.getByText("0 SOL left")).toBeTruthy();
});
