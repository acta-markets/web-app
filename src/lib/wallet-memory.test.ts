import { afterEach, describe, expect, it } from "vitest";
import { clearLastWallet, lastUsedFirst, pickAccount, readLastWallet, writeLastWallet } from "./wallet-memory";

afterEach(() => window.localStorage.clear());

describe("the last wallet", () => {
  it("is remembered by name and address, and nothing else", () => {
    expect(readLastWallet()).toBeNull();
    writeLastWallet({ name: "Phantom", address: "WalletA", ...({ secret: "x" } as object) });
    expect(readLastWallet()).toEqual({ name: "Phantom", address: "WalletA" });
    expect(window.localStorage.getItem("acta_last_wallet")).toBe('{"v":1,"d":{"name":"Phantom","address":"WalletA"}}');
  });

  it("is forgotten on request", () => {
    writeLastWallet({ name: "Phantom", address: "WalletA" });
    clearLastWallet();
    expect(readLastWallet()).toBeNull();
  });

  it("still reads a wallet remembered before values carried a version", () => {
    window.localStorage.setItem("acta_last_wallet", '{"name":"Phantom","address":"WalletA"}');
    expect(readLastWallet()).toEqual({ name: "Phantom", address: "WalletA" });
  });

  it.each(["", "not json", "null", "[]", '{"name":"Phantom"}', '{"name":"","address":"A"}', '{"name":1,"address":"A"}', '{"v":2,"d":{"name":"Phantom","address":"A"}}'])("ignores a stored value it cannot use: %s", (raw) => {
    window.localStorage.setItem("acta_last_wallet", raw);
    expect(readLastWallet()).toBeNull();
  });
});

describe("coming back", () => {
  const accounts = [{ address: "First" }, { address: "Second" }];

  it("uses the account used last time when the wallet still offers it", () => {
    expect(pickAccount(accounts, "Second")).toEqual({ address: "Second" });
  });

  it("falls back to the wallet's first account, and to none when it offers none", () => {
    expect(pickAccount(accounts, "Gone")).toEqual({ address: "First" });
    expect(pickAccount(accounts, null)).toEqual({ address: "First" });
    expect(pickAccount([], "Second")).toBeNull();
  });

  it("lists the wallet used last time first and keeps the rest in order", () => {
    const wallets = [{ name: "Backpack" }, { name: "Phantom" }, { name: "Solflare" }];
    expect(lastUsedFirst(wallets, "Phantom").map((w) => w.name)).toEqual(["Phantom", "Backpack", "Solflare"]);
    expect(lastUsedFirst(wallets, null).map((w) => w.name)).toEqual(["Backpack", "Phantom", "Solflare"]);
    expect(lastUsedFirst(wallets, "Ledger").map((w) => w.name)).toEqual(["Backpack", "Phantom", "Solflare"]);
  });
});
