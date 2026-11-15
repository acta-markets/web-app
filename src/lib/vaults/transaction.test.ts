// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { address, type Instruction } from "@solana/kit";
import type { VersionedTransaction } from "@solana/web3.js";
import { sendWalletTransactions } from "./transaction";

const FEE_PAYER = "11111111111111111111111111111112";
const ix = (byte: number): Instruction => ({
  programAddress: address("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"),
  data: new Uint8Array([byte]),
});

function fakeRpc(simulationErr: unknown = null) {
  let sent = 0;
  const call = <T>(value: T) => ({ send: async () => value });
  return {
    getLatestBlockhash: vi.fn(() =>
      call({ value: { blockhash: "11111111111111111111111111111111", lastValidBlockHeight: 100n } }),
    ),
    simulateTransaction: vi.fn(() => call({ value: { err: simulationErr, logs: ["log"] } })),
    sendTransaction: vi.fn(() => call(`sig${sent++}`)),
    getSignatureStatuses: vi.fn((signatures: string[]) => call({ value: signatures.map(() => ({ confirmationStatus: "confirmed", err: null })) })),
    getBlockHeight: vi.fn(() => call(1n)),
  };
}

describe("sendWalletTransactions", () => {
  it("simulates, asks the wallet once and sends every transaction", async () => {
    const rpc = fakeRpc();
    const signAll = vi.fn(async (txs: VersionedTransaction[]) => txs);
    const signatures = await sendWalletTransactions({
      rpc: rpc as never,
      feePayer: FEE_PAYER,
      transactions: [[ix(1)], [ix(2)], [ix(3)]],
      signAllTransactions: signAll,
    });
    expect(signAll).toHaveBeenCalledTimes(1);
    expect(signAll.mock.calls[0][0]).toHaveLength(3);
    expect(rpc.getLatestBlockhash).toHaveBeenCalledTimes(1);
    expect(rpc.simulateTransaction).toHaveBeenCalledTimes(3);
    expect(signatures).toEqual(["sig0", "sig1", "sig2"]);
  });

  it("fails before the wallet prompt when a simulation fails", async () => {
    const rpc = fakeRpc({ InstructionError: [0, { Custom: 1 }] });
    const signAll = vi.fn(async (txs: VersionedTransaction[]) => txs);
    await expect(
      sendWalletTransactions({
        rpc: rpc as never,
        feePayer: FEE_PAYER,
        transactions: [[ix(1)], [ix(2)]],
        signAllTransactions: signAll,
      }),
    ).rejects.toThrow("simulation failed");
    expect(signAll).not.toHaveBeenCalled();
    expect(rpc.sendTransaction).not.toHaveBeenCalled();
  });

  it.each(["message", "count", "binding"])("rejects changed %s before broadcast", async change => {
    const rpc = fakeRpc();
    let connected = true;
    await expect(sendWalletTransactions({
      rpc: rpc as never, feePayer: FEE_PAYER, transactions: [[ix(1)]],
      assertBinding: () => { if (!connected) throw new Error("Connection changed"); },
      signAllTransactions: async txs => {
        if (change === "message") txs[0].message.recentBlockhash = "11111111111111111111111111111112";
        if (change === "binding") connected = false;
        return change === "count" ? [] : txs;
      },
    })).rejects.toThrow();
    expect(rpc.sendTransaction).not.toHaveBeenCalled();
  });

  it("tries a dropped simulation request again instead of failing the batch", async () => {
    const rpc = fakeRpc();
    rpc.simulateTransaction.mockImplementationOnce(() => ({ send: async () => { throw new Error("fetch failed"); } }) as never);
    const signAll = vi.fn(async (txs: VersionedTransaction[]) => txs);
    const signatures = await sendWalletTransactions({
      rpc: rpc as never,
      feePayer: FEE_PAYER,
      transactions: [[ix(1)], [ix(2)]],
      signAllTransactions: signAll,
    });
    expect(rpc.simulateTransaction).toHaveBeenCalledTimes(3);
    expect(signatures).toEqual(["sig0", "sig1"]);
  });

  it("keeps a large batch to a few requests at a time and confirms it with one status request", async () => {
    const rpc = fakeRpc();
    let running = 0;
    let peak = 0;
    rpc.simulateTransaction.mockImplementation(() => ({
      send: async () => {
        running++;
        peak = Math.max(peak, running);
        await new Promise((resolve) => setTimeout(resolve, 2));
        running--;
        return { value: { err: null, logs: [] } };
      },
    }) as never);
    const transactions = Array.from({ length: 30 }, (_, i) => [ix(i)]);
    const signatures = await sendWalletTransactions({
      rpc: rpc as never,
      feePayer: FEE_PAYER,
      transactions,
      signAllTransactions: async (txs) => txs,
    });
    expect(signatures).toHaveLength(30);
    expect(peak).toBeLessThanOrEqual(4);
    expect(rpc.getSignatureStatuses).toHaveBeenCalledTimes(1);
    expect(rpc.getSignatureStatuses.mock.calls[0][0]).toHaveLength(30);
  });

  it("does nothing for an empty step", async () => {
    const rpc = fakeRpc();
    const signAll = vi.fn();
    await expect(
      sendWalletTransactions({ rpc: rpc as never, feePayer: FEE_PAYER, transactions: [], signAllTransactions: signAll }),
    ).resolves.toEqual([]);
    expect(signAll).not.toHaveBeenCalled();
    expect(rpc.getLatestBlockhash).not.toHaveBeenCalled();
  });
});
