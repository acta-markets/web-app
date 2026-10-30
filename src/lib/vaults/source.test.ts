import { describe, expect, it, vi } from "vitest";
import type { VaultDepositorEvent } from "./types";

const api = vi.hoisted(() => ({ history: vi.fn() }));
vi.mock("./api", () => ({ fetchVaultDepositorHistory: api.history }));
vi.mock("./sample", () => ({ VAULTS_SAMPLE_MODE: false, loadSampleData: vi.fn() }));

const { loadVaultDepositorHistory } = await import("./source");

const at = (time: number) => ({ event_time: String(time) }) as VaultDepositorEvent;

describe("loadVaultDepositorHistory", () => {
  it("pages newest first and stops at the page that reaches the generation start", async () => {
    api.history
      .mockResolvedValueOnce({ events: [at(300), at(250)], next_cursor: "a" })
      .mockResolvedValueOnce({ events: [at(200), at(90)], next_cursor: "b" })
      .mockResolvedValueOnce({ events: [at(50)], next_cursor: null });
    const events = await loadVaultDepositorHistory("v", "w", 100n);
    expect(events.map((e) => e.event_time)).toEqual(["300", "250", "200", "90"]);
    expect(api.history).toHaveBeenCalledTimes(2);
  });
});
