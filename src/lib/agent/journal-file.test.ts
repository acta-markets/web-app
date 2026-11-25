// @vitest-environment node
import { mkdtemp, readdir, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fileJournal } from "../../../packages/mcp/src/journal-file";
import { AgentError } from "./errors";
import { spentSince, type JournalEntry } from "./journal";
import { DEFAULT_LIMITS, reserveSpend, type Spend } from "./limits";

// The journal on disk, as two servers on one wallet see it: each AI tool starts its own server,
// and they share the folder. Two `fileJournal` objects on one folder stand in for two processes:
// they share nothing in memory, only the files.

const NOW = 2_000_000;
const WALLET = "wallet";
const limits = { ...DEFAULT_LIMITS, maxTradeUsd: 2_500, dailyUsd: 10_000 };
const spend = (usd: number): Spend => ({ wallet: WALLET, asset: "BTC", usd, nowSec: NOW, what: "trade" });
const line = (id: string, usd: number): JournalEntry => ({ orderId: id, rfqId: "r", state: "accepted", at: NOW, wallet: WALLET, asset: "BTC", side: "sell", notionalUsd: usd });
const outcome = (promise: Promise<unknown>) => promise.then(() => "in", (error) => (error instanceof AgentError ? error.code : `threw: ${error}`));

let folder: string;
beforeEach(async () => {
  folder = await mkdtemp(path.join(os.tmpdir(), "acta-journal-"));
});
afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

describe("the journal's lock", () => {
  it("two servers on one wallet cannot both spend the same room", async () => {
    const a = fileJournal(folder, "devnet");
    const b = fileJournal(folder, "devnet");
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => outcome(reserveSpend({ limits, journal: i % 2 ? a : b }, spend(2_000), line(`o${i}`, 2_000)))),
    );
    expect(results.filter((r) => r === "in")).toHaveLength(5);
    expect(results.filter((r) => r === "over_daily_limit")).toHaveLength(5);
    expect(spentSince(await a.read(), WALLET, NOW - 86_400)).toBe(10_000);
  });

  it("leaves no lock behind, whether the holder finished or threw", async () => {
    const journal = fileJournal(folder, "devnet");
    await journal.lock(async () => undefined);
    await journal.lock(async () => Promise.reject(new Error("inside"))).catch(() => undefined);
    expect((await readdir(folder)).filter((name) => name.endsWith(".lock"))).toEqual([]);
  });

  it("breaks a lock left by a server that died", async () => {
    const stale = path.join(folder, "journal-devnet.lock");
    await writeFile(stale, "");
    const longAgo = new Date(Date.now() - 60_000);
    await utimes(stale, longAgo, longAgo);
    expect(await outcome(reserveSpend({ limits, journal: fileJournal(folder, "devnet") }, spend(100), line("a", 100)))).toBe("in");
  });

  it("refuses the spend when another server holds the lock and does not let go", async () => {
    await writeFile(path.join(folder, "journal-devnet.lock"), "");
    const journal = fileJournal(folder, "devnet", { lockWaitMs: 80 });
    expect(await outcome(reserveSpend({ limits, journal }, spend(100), line("a", 100)))).toBe("busy");
    expect(await journal.read()).toEqual([]);
  });
});
