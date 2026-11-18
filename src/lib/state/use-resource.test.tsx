import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import type { AsyncStorage, PersistedQuery } from "@tanstack/query-persist-client-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** IndexedDB's stand-in: the same storage contract, held in a Map the test can look into. */
const disk = vi.hoisted(() => ({ entries: new Map<string, unknown>() }));

vi.mock("./query-client", async (original) => {
  const actual = await original<typeof import("./query-client")>();
  const storage: AsyncStorage<PersistedQuery> = {
    getItem: async (key) => disk.entries.get(key) as PersistedQuery | undefined,
    setItem: async (key, value) => void disk.entries.set(key, value),
    removeItem: async (key) => void disk.entries.delete(key),
    entries: async () => [...disk.entries] as Array<[string, PersistedQuery]>,
  };
  let client = actual.createAppQueryClient();
  const persister = actual.createAppPersister(storage);
  return { ...actual, getQueryClient: () => client, getPersister: () => persister, __newTab: () => (client = actual.createAppQueryClient()) };
});

import { forgetWallet, publicKey, restoreWallet, walletKey } from "./keys";
import * as queryClient from "./query-client";
import { useResource, type ResourceOptions } from "./use-resource";

/** A reload: memory is gone, the disk is not. */
const newTab = () => (queryClient as unknown as { __newTab: () => void }).__newTab();

function Show({ name = "a", ...options }: Partial<ResourceOptions<string>> & { name?: string }) {
  const r = useResource<string>({ key: publicKey("thing"), load: async () => "fresh", initial: "none", ...options });
  return (
    <p>
      {name}:{r.loading ? "loading" : r.data}
      {r.error ? ` error:${r.error.message}` : ""}
      {r.lastKnown ? " last-known" : ""}
    </p>
  );
}

beforeEach(() => {
  disk.entries.clear();
  newTab();
});
afterEach(cleanup);

describe("a read through the shared cache", () => {
  it("loads, then shows its data", async () => {
    render(<Show />);
    expect(screen.getByText("a:loading")).toBeTruthy();
    await screen.findByText("a:fresh");
  });

  it("is one request for every component asking for the same thing", async () => {
    const load = vi.fn(async () => "fresh");
    render(
      <>
        <Show name="a" load={load} />
        <Show name="b" load={load} />
      </>,
    );
    await screen.findByText("a:fresh");
    await screen.findByText("b:fresh");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("is still there when the page comes back, with no loading state", async () => {
    const first = render(<Show />);
    await screen.findByText("a:fresh");
    first.unmount();
    render(<Show load={() => new Promise(() => {})} />);
    expect(screen.getByText("a:fresh")).toBeTruthy();
  });

  it("asks for nothing while it is off", () => {
    const load = vi.fn(async () => "fresh");
    function Off() {
      const r = useResource<string>({ key: null, load, initial: "none" });
      return <p>{r.loading ? "loading" : r.data}</p>;
    }
    render(<Off />);
    expect(screen.getByText("none")).toBeTruthy();
    expect(load).not.toHaveBeenCalled();
  });

  it("keeps the last data and reports the error when a refresh fails", async () => {
    let fail = false;
    const load = vi.fn(async () => {
      if (fail) throw new Error("offline");
      return "fresh";
    });
    let refresh = () => {};
    function Page() {
      const r = useResource<string>({ key: publicKey("thing"), load, initial: "none" });
      refresh = r.refresh;
      return <p>{r.data}{r.error ? ` error:${r.error.message}` : ""}</p>;
    }
    render(<Page />);
    await screen.findByText("fresh");
    fail = true;
    act(() => refresh());
    await screen.findByText("fresh error:offline");
  });

  it("reports a first read that fails, without pretending to still be loading", async () => {
    render(<Show load={async () => Promise.reject(new Error("down"))} />);
    await screen.findByText("a:none error:down");
  });
});

describe("a read saved to the device", () => {
  it("is not saved unless it asks to be", async () => {
    render(<Show />);
    await screen.findByText("a:fresh");
    await waitFor(() => expect(disk.entries.size).toBe(0));
  });

  it("is shown on the next visit as last-known, then replaced by a fresh read", async () => {
    const first = render(<Show persist />);
    await screen.findByText("a:fresh");
    await waitFor(() => expect(disk.entries.size).toBe(1));
    first.unmount();
    newTab();

    let release: (value: string) => void = () => {};
    render(<Show persist staleMs={0} load={() => new Promise<string>((resolve) => (release = resolve))} />);
    // from the disk, before the network has answered
    await screen.findByText(/^a:fresh/);
    await act(async () => release("newer"));
    await screen.findByText("a:newer");
  });

  it("brings back an empty answer too, as an answer and not as still loading", async () => {
    // "no season is running" is saved as null, and must come back as that
    function Season({ load }: { load: () => Promise<string | null> }) {
      const r = useResource<string | null>({ key: publicKey("season"), load, initial: null, persist: true });
      return <p>{r.loading ? "loading" : r.data === null ? "no season" : r.data}</p>;
    }
    const first = render(<Season load={async () => null} />);
    await screen.findByText("no season");
    await waitFor(() => expect(disk.entries.size).toBe(1));
    first.unmount();
    newTab();
    render(<Season load={() => new Promise(() => {})} />);
    await screen.findByText("no season");
  });

  it("is not shown once older than its limit", async () => {
    const first = render(<Show persist />);
    await screen.findByText("a:fresh");
    await waitFor(() => expect(disk.entries.size).toBe(1));
    first.unmount();
    newTab();
    const [key, stored] = [...disk.entries][0] as [string, PersistedQuery];
    disk.entries.set(key, { ...stored, state: { ...stored.state, dataUpdatedAt: Date.now() - 2 * 60 * 60 * 1000 } });
    render(<Show persist maxShowMs={60 * 60 * 1000} load={() => new Promise(() => {})} />);
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.getByText("a:loading")).toBeTruthy();
  });
});

describe("one wallet's reads", () => {
  function Mine({ wallet, load }: { wallet: string; load: () => Promise<string> }) {
    const r = useResource<string>({ key: walletKey(wallet, "positions"), load, initial: "none", persist: true });
    return <p>{wallet}:{r.loading ? "loading" : r.data}</p>;
  }

  it("are forgotten together, in memory and on the device, and nobody else's are touched", async () => {
    render(
      <>
        <Mine wallet="WalletA" load={async () => "a-positions"} />
        <Mine wallet="WalletB" load={async () => "b-positions"} />
        <Show persist />
      </>,
    );
    await screen.findByText("WalletA:a-positions");
    await screen.findByText("WalletB:b-positions");
    await screen.findByText("a:fresh");
    await waitFor(() => expect(disk.entries.size).toBe(3));
    cleanup();
    await forgetWallet("WalletA");
    expect(disk.entries.size).toBe(2);
    expect(queryClient.getQueryClient().getQueryData(walletKey("WalletA", "positions"))).toBeUndefined();
    expect(queryClient.getQueryClient().getQueryData(walletKey("WalletB", "positions"))).toBe("b-positions");
    expect(queryClient.getQueryClient().getQueryData(publicKey("thing"))).toBe("fresh");
  });

  it("can be brought back before anything is allowed to fetch them", async () => {
    const first = render(<Mine wallet="WalletA" load={async () => "a-positions"} />);
    await screen.findByText("WalletA:a-positions");
    await waitFor(() => expect(disk.entries.size).toBe(1));
    first.unmount();
    newTab();
    expect(queryClient.getQueryClient().getQueryData(walletKey("WalletA", "positions"))).toBeUndefined();
    await restoreWallet("WalletA");
    expect(queryClient.getQueryClient().getQueryData(walletKey("WalletA", "positions"))).toBe("a-positions");
  });

  it("never treats the public scope as a wallet", async () => {
    render(<Show persist />);
    await screen.findByText("a:fresh");
    await waitFor(() => expect(disk.entries.size).toBe(1));
    await forgetWallet("public");
    await forgetWallet("");
    expect(disk.entries.size).toBe(1);
  });
});
