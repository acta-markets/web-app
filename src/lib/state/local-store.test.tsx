import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createLocalStore, createLocalStoreFamily, useLocalStore } from "./local-store";

type Prefs = { tab: "open" | "history" };
const parse = (data: unknown): Prefs | undefined =>
  data && typeof data === "object" && ((data as Prefs).tab === "open" || (data as Prefs).tab === "history") ? { tab: (data as Prefs).tab } : undefined;
const make = (version = 1) => createLocalStore<Prefs>({ key: "test_prefs", version, fallback: { tab: "open" }, parse });

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("a remembered value", () => {
  it("is the fallback until something is written, then what was written", () => {
    const store = make();
    expect(store.read()).toEqual({ tab: "open" });
    store.write({ tab: "history" });
    expect(store.read()).toEqual({ tab: "history" });
    expect(window.localStorage.getItem("test_prefs")).toBe('{"v":1,"d":{"tab":"history"}}');
  });

  it("is ignored when it was saved under another version", () => {
    make(1).write({ tab: "history" });
    expect(make(2).read()).toEqual({ tab: "open" });
  });

  it.each(["not json", "null", "[]", '{"v":1}', '{"v":1,"d":{"tab":"nonsense"}}', '{"v":1,"d":null}'])("is ignored when it cannot be used: %s", (raw) => {
    window.localStorage.setItem("test_prefs", raw);
    expect(make().read()).toEqual({ tab: "open" });
  });

  it("reads a value written before the helper existed, when told how", () => {
    window.localStorage.setItem("old_flag", "1");
    const store = createLocalStore<boolean>({ key: "old_flag", version: 1, fallback: false, parse: (d) => (typeof d === "boolean" ? d : undefined), legacy: (raw) => (raw === "1" ? true : undefined) });
    expect(store.read()).toBe(true);
  });

  it("is forgotten on clear", () => {
    const store = make();
    store.write({ tab: "history" });
    store.clear();
    expect(store.read()).toEqual({ tab: "open" });
    expect(window.localStorage.getItem("test_prefs")).toBeNull();
  });

  it("gives the same object for the same stored value, so a subscriber does not loop", () => {
    const store = make();
    store.write({ tab: "history" });
    expect(store.read()).toBe(store.read());
  });

  it("can live for the tab only", () => {
    const store = createLocalStore<string>({ key: "draft", version: 1, fallback: "", parse: (d) => (typeof d === "string" ? d : undefined), area: "session" });
    store.write("12.5");
    expect(window.sessionStorage.getItem("draft")).toBe('{"v":1,"d":"12.5"}');
    expect(window.localStorage.getItem("draft")).toBeNull();
  });

  it("behaves as if nothing were stored when storage refuses", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const store = make();
    expect(store.read()).toEqual({ tab: "open" });
    // the choice still takes effect while the page is open; it is only not there next time
    expect(() => store.write({ tab: "history" })).not.toThrow();
    expect(store.read()).toEqual({ tab: "history" });
    store.clear();
    expect(store.read()).toEqual({ tab: "open" });
  });

  it("keeps one value per suffix in a family", () => {
    const family = createLocalStoreFamily<Prefs>({ prefix: "prefs", version: 1, fallback: { tab: "open" }, parse });
    family("devnet:A").write({ tab: "history" });
    expect(family("devnet:A").read()).toEqual({ tab: "history" });
    expect(family("devnet:B").read()).toEqual({ tab: "open" });
    expect(family("devnet:A")).toBe(family("devnet:A"));
  });
});

describe("a component reading a remembered value", () => {
  function Tab({ store }: { store: ReturnType<typeof make> }) {
    return <p>tab:{useLocalStore(store).tab}</p>;
  }

  it("shows the stored value and follows a write", () => {
    const store = make();
    store.write({ tab: "history" });
    render(<Tab store={store} />);
    expect(screen.getByText("tab:history")).toBeTruthy();
    act(() => store.write({ tab: "open" }));
    expect(screen.getByText("tab:open")).toBeTruthy();
  });

  it("follows a change made in another tab", () => {
    const store = make();
    render(<Tab store={store} />);
    expect(screen.getByText("tab:open")).toBeTruthy();
    act(() => {
      window.localStorage.setItem("test_prefs", '{"v":1,"d":{"tab":"history"}}');
      window.dispatchEvent(new StorageEvent("storage", { key: "test_prefs" }));
    });
    expect(screen.getByText("tab:history")).toBeTruthy();
  });
});
