import { afterEach, describe, expect, it } from "vitest";
import { clearSession, readSessionId, writeSession } from "./session-store";

const DEVNET = "wss://devnet-api.acta.markets";
const BETA = "wss://beta-api.acta.markets";
const NOW = 1_800_000_000;

afterEach(() => window.localStorage.clear());

describe("a wallet's stored session", () => {
  it("is kept per wallet, so switching wallets and back needs no new signature", () => {
    writeSession(DEVNET, "WalletA", "session-a", NOW + 3600);
    writeSession(DEVNET, "WalletB", "session-b", NOW + 3600);
    expect(readSessionId(DEVNET, "WalletA", NOW)).toBe("session-a");
    expect(readSessionId(DEVNET, "WalletB", NOW)).toBe("session-b");
  });

  it("is never offered to another backend", () => {
    writeSession(DEVNET, "WalletA", "session-a", NOW + 3600);
    expect(readSessionId(BETA, "WalletA", NOW)).toBeNull();
  });

  it("is not used once it has run out", () => {
    writeSession(DEVNET, "WalletA", "session-a", NOW + 10);
    expect(readSessionId(DEVNET, "WalletA", NOW + 9)).toBe("session-a");
    expect(readSessionId(DEVNET, "WalletA", NOW + 10)).toBeNull();
  });

  it("is gone once cleared, and only that wallet's", () => {
    writeSession(DEVNET, "WalletA", "session-a", NOW + 3600);
    writeSession(DEVNET, "WalletB", "session-b", NOW + 3600);
    clearSession(DEVNET, "WalletA");
    expect(readSessionId(DEVNET, "WalletA", NOW)).toBeNull();
    expect(readSessionId(DEVNET, "WalletB", NOW)).toBe("session-b");
  });

  it("refuses to store nonsense", () => {
    writeSession(DEVNET, "WalletA", "", NOW + 3600);
    writeSession(DEVNET, "WalletA", "session", Number.NaN);
    writeSession("", "WalletA", "session", NOW + 3600);
    expect(readSessionId(DEVNET, "WalletA", NOW)).toBeNull();
  });
});

describe("a session kept the old way, one wallet at a time", () => {
  const legacy = (walletAddress: string, expiresAt: number) =>
    window.localStorage.setItem("acta_rfq_ws_session", JSON.stringify({ walletAddress, sessionId: "old", expiresAt }));

  it("is still resumed by the wallet it belongs to, and by no other", () => {
    legacy("WalletA", NOW + 3600);
    expect(readSessionId(DEVNET, "WalletA", NOW)).toBe("old");
    expect(readSessionId(DEVNET, "WalletB", NOW)).toBeNull();
  });

  it("is removed once that wallet has a session of the new kind, or clears it", () => {
    legacy("WalletA", NOW + 3600);
    writeSession(DEVNET, "WalletA", "new", NOW + 3600);
    expect(window.localStorage.getItem("acta_rfq_ws_session")).toBeNull();
    legacy("WalletA", NOW + 3600);
    clearSession(DEVNET, "WalletA");
    expect(readSessionId(DEVNET, "WalletA", NOW)).toBeNull();
  });

  it("is left alone by another wallet's sign-in", () => {
    legacy("WalletA", NOW + 3600);
    writeSession(DEVNET, "WalletB", "b", NOW + 3600);
    expect(readSessionId(DEVNET, "WalletA", NOW)).toBe("old");
  });
});
